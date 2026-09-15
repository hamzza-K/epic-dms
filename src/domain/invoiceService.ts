// The invoice lifecycle — BUSINESS_RULES.md §4, §8, §9.
//
// Every operation is a pure function from AppData to a new AppData, so it is
// all-or-nothing: either the invoice, the stock movements, the balance change
// and the audit rows all land together, or nothing changes. The legacy code
// mutated stock, then the balance, then appended the invoice, with early
// returns in between.

import { money, round2 } from './money'
import { can, type Permission } from './permissions'
import { computeTotals, contextFor, hasFluids, lateFeeFor, monthsLate, priceLine } from './pricing'
import type { AppData, AuditAction, Invoice, InvoiceLine, Part, Session } from './types'

export interface DraftLine {
  partNo: string
  qty: number
}

export type SaveOutcome =
  | { ok: true; data: AppData; invoiceNo: string; total: number; overridden: boolean }
  | { ok: false; reason: 'validation' | 'permission' | 'stock'; message: string }
  | {
      ok: false
      reason: 'credit'
      message: string
      /** True when the signed-in user may push it through anyway (§8). */
      canOverride: boolean
    }

interface AuditDraft {
  action: AuditAction
  detail: string
}

/** Append audit rows and bump the counter. Append-only: nothing rewrites these. */
function withAudit(data: AppData, session: Session, entries: AuditDraft[]): AppData {
  const at = new Date().toISOString()
  let id = data.seq.audit
  const rows = entries.map((e) => ({ id: ++id, at, user: session.username, ...e }))
  return {
    ...data,
    audit: [...data.audit, ...rows],
    seq: { ...data.seq, audit: id },
  }
}

export function logAudit(data: AppData, session: Session, action: AuditAction, detail: string): AppData {
  return withAudit(data, session, [{ action, detail }])
}

function deny(data: AppData, session: Session, permission: Permission, what: string): AppData {
  return logAudit(data, session, 'PERMISSION_DENIED', `${permission} refused for role ${session.role}: ${what}`)
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Price a draft against the customer currently on the invoice (§5). */
export function priceDraft(draft: DraftLine[], parts: Part[], customerType: 'RETAIL' | 'WHOLESALE' | 'FLEET'): InvoiceLine[] {
  return draft.flatMap((d) => {
    const part = parts.find((p) => p.partNo === d.partNo)
    return part ? [priceLine(part, d.qty, customerType)] : []
  })
}

// ------------------------------------------------------------------- §4.1 save

export function saveInvoice(
  data: AppData,
  session: Session,
  input: { customerId: string; draft: DraftLine[]; overrideCredit?: boolean },
): SaveOutcome {
  if (!can(session.role, 'invoice.create')) {
    return { ok: false, reason: 'permission', message: 'You are not allowed to create invoices.' }
  }

  const customer = data.customers.find((c) => c.id === input.customerId)
  if (!customer) return { ok: false, reason: 'validation', message: 'Pick a customer first.' }
  if (input.draft.length === 0) return { ok: false, reason: 'validation', message: 'Invoice has no lines.' }
  if (input.draft.some((d) => !Number.isInteger(d.qty) || d.qty <= 0)) {
    return { ok: false, reason: 'validation', message: 'Every line needs a whole quantity of 1 or more.' }
  }

  // §3 — you can't sell what isn't on the shelf. Checked against the sum of all
  // lines for a part, so two lines for the same part can't each pass on their own.
  const wanted = new Map<string, number>()
  for (const d of input.draft) wanted.set(d.partNo, (wanted.get(d.partNo) ?? 0) + d.qty)
  for (const [partNo, qty] of wanted) {
    const part = data.parts.find((p) => p.partNo === partNo)
    if (!part) return { ok: false, reason: 'validation', message: `Part ${partNo} no longer exists.` }
    if (qty > part.qtyOnHand) {
      return {
        ok: false,
        reason: 'stock',
        message: `Only ${part.qtyOnHand} of ${part.partNo} on hand — ${qty} requested.`,
      }
    }
  }

  const lines = priceDraft(input.draft, data.parts, customer.type)
  const totals = computeTotals(lines, contextFor(customer), hasFluids(lines, data.parts))

  // §8 — credit limit. A clerk is blocked; a manager or admin may override,
  // and the override is recorded either way.
  const overLimit = customer.creditLimit > 0 && round2(customer.balance + totals.total) > customer.creditLimit
  const mayOverride = can(session.role, 'invoice.creditOverride')
  if (overLimit && !(input.overrideCredit && mayOverride)) {
    return {
      ok: false,
      reason: 'credit',
      message:
        `${customer.name} would be at ${money(customer.balance + totals.total)} against a ` +
        `${money(customer.creditLimit)} credit limit.` +
        (mayOverride ? '' : ' Get a manager to ring this up.'),
      canOverride: mayOverride,
    }
  }

  const invoiceNo = `INV-${data.seq.invoice + 1}`
  const invoice: Invoice = {
    invoiceNo,
    customerId: customer.id,
    date: today(),
    ...totals,
    status: 'OPEN',
    lines,
  }

  const audit: AuditDraft[] = []
  if (overLimit) {
    audit.push({
      action: 'CREDIT_OVERRIDE',
      detail: `${invoiceNo}: ${session.role} overrode credit block on ${customer.id} (${money(customer.balance)} + ${money(totals.total)} vs limit ${money(customer.creditLimit)})`,
    })
  }

  const parts = data.parts.map((p) => {
    const qty = wanted.get(p.partNo)
    if (!qty) return p
    audit.push({ action: 'STOCK_CONSUME', detail: `${invoiceNo}: ${p.partNo} ${p.qtyOnHand} → ${p.qtyOnHand - qty}` })
    return { ...p, qtyOnHand: p.qtyOnHand - qty }
  })

  // §4.1 — the FULL total goes on the account, surcharge and tax included.
  const newBalance = round2(customer.balance + totals.total)
  audit.push({
    action: 'BALANCE_CHANGE',
    detail: `${customer.id}: ${money(customer.balance)} → ${money(newBalance)} (invoice ${invoiceNo})`,
  })
  audit.push({
    action: 'INVOICE_SAVE',
    detail: `${invoiceNo} for ${customer.id}, ${lines.length} line(s), total ${money(totals.total)}`,
  })

  const next = withAudit(
    {
      ...data,
      parts,
      customers: data.customers.map((c) => (c.id === customer.id ? { ...c, balance: newBalance } : c)),
      invoices: [...data.invoices, invoice],
      seq: { ...data.seq, invoice: data.seq.invoice + 1 },
    },
    session,
    audit,
  )

  return { ok: true, data: next, invoiceNo, total: totals.total, overridden: overLimit }
}

// --------------------------------------------------------------- §4.2 mark paid

export type MarkPaidOutcome =
  | { ok: true; data: AppData; lateFee: number; monthsLate: number }
  | { ok: false; message: string }

export function markInvoicePaid(data: AppData, session: Session, invoiceNo: string): MarkPaidOutcome {
  if (!can(session.role, 'invoice.markPaid')) {
    return { ok: false, message: 'You are not allowed to mark invoices paid.' }
  }

  const invoice = data.invoices.find((i) => i.invoiceNo === invoiceNo)
  if (!invoice) return { ok: false, message: `Invoice ${invoiceNo} not found.` }
  // §4.2 — marking paid is a one-time event. The legacy screen would subtract
  // the total again on every click.
  if (invoice.status === 'PAID') return { ok: false, message: `${invoiceNo} is already paid.` }

  const now = new Date()
  const fee = lateFeeFor(invoice.total, invoice.date, now)
  const months = monthsLate(invoice.date, now)

  const customer = data.customers.find((c) => c.id === invoice.customerId)
  const audit: AuditDraft[] = [
    { action: 'INVOICE_PAID', detail: `${invoiceNo} marked PAID (total ${money(invoice.total)})` },
  ]

  let customers = data.customers
  if (customer) {
    const newBalance = round2(customer.balance - invoice.total + fee)
    customers = customers.map((c) => (c.id === customer.id ? { ...c, balance: newBalance } : c))
    audit.push({
      action: 'BALANCE_CHANGE',
      detail: `${customer.id}: ${money(customer.balance)} → ${money(newBalance)} (paid ${invoiceNo})`,
    })
  }
  if (fee > 0) {
    audit.push({
      action: 'LATE_FEE',
      detail: `${invoiceNo}: ${money(fee)} late fee — ${months} month(s) past net-30 terms on a ${money(invoice.total)} invoice`,
    })
  }

  const next = withAudit(
    {
      ...data,
      customers,
      invoices: data.invoices.map((i) =>
        i.invoiceNo === invoiceNo
          ? { ...i, status: 'PAID' as const, paidDate: today(), lateFee: fee > 0 ? fee : undefined }
          : i,
      ),
    },
    session,
    audit,
  )

  return { ok: true, data: next, lateFee: fee, monthsLate: months }
}

// ------------------------------------------------------------------ §4.3 delete

export type DeleteOutcome = { ok: true; data: AppData } | { ok: false; message: string }

export function deleteInvoice(data: AppData, session: Session, invoiceNo: string): DeleteOutcome {
  if (!can(session.role, 'invoice.delete')) {
    return { ok: false, message: 'Only an administrator may delete invoices.' }
  }

  const invoice = data.invoices.find((i) => i.invoiceNo === invoiceNo)
  if (!invoice) return { ok: false, message: `Invoice ${invoiceNo} not found.` }

  const audit: AuditDraft[] = []

  // §4.3 — undo everything the invoice did. OPEN invoices gave stock away and
  // added to the balance; PAID ones only left a late fee behind.
  let parts = data.parts
  if (invoice.status === 'OPEN') {
    const back = new Map<string, number>()
    for (const l of invoice.lines) back.set(l.partNo, (back.get(l.partNo) ?? 0) + l.qty)
    parts = parts.map((p) => {
      const qty = back.get(p.partNo)
      if (!qty) return p
      audit.push({ action: 'STOCK_RESTORE', detail: `${invoiceNo} deleted: ${p.partNo} ${p.qtyOnHand} → ${p.qtyOnHand + qty}` })
      return { ...p, qtyOnHand: p.qtyOnHand + qty }
    })
  }

  const reversal = (invoice.status === 'OPEN' ? invoice.total : 0) + (invoice.lateFee ?? 0)
  let customers = data.customers
  const customer = customers.find((c) => c.id === invoice.customerId)
  if (customer && reversal !== 0) {
    const newBalance = round2(customer.balance - reversal)
    customers = customers.map((c) => (c.id === customer.id ? { ...c, balance: newBalance } : c))
    audit.push({
      action: 'BALANCE_CHANGE',
      detail: `${customer.id}: ${money(customer.balance)} → ${money(newBalance)} (${invoiceNo} deleted)`,
    })
  }

  audit.push({
    action: 'INVOICE_DELETE',
    detail: `${invoiceNo} (${invoice.status}, ${money(invoice.total)}) deleted with its ${invoice.lines.length} line(s)`,
  })

  // The invoice number is NOT returned to the pool — seq.invoice stays put (§4.1).
  return {
    ok: true,
    data: withAudit({ ...data, parts, customers, invoices: data.invoices.filter((i) => i.invoiceNo !== invoiceNo) }, session, audit),
  }
}

// ----------------------------------------------------------------- §4.4 reprint

/** A reprint is a copy: it shows the amounts that were saved, never recomputed. */
export function reprintText(invoice: Invoice, customerName: string, company: { name: string; address: string; phone: string }): string {
  const rule = '-'.repeat(52)
  const row = (label: string, value: string) => `${label.padEnd(38)}${value.padStart(14)}`
  const out: string[] = [
    company.name,
    company.address,
    company.phone,
    rule,
    `INVOICE ${invoice.invoiceNo}`.padEnd(38) + invoice.date.padStart(14),
    `BILL TO: ${customerName}`,
    `STATUS:  ${invoice.status}`,
    rule,
  ]
  for (const l of invoice.lines) {
    out.push(`${l.qty} x ${l.description}`)
    out.push(row(`   ${l.partNo} @ ${l.unitPrice.toFixed(2)}`, l.lineTotal.toFixed(2)))
  }
  out.push(rule)
  out.push(row('SUBTOTAL', invoice.subtotal.toFixed(2)))
  if (invoice.discount > 0) out.push(row('VOLUME DISCOUNT', `-${invoice.discount.toFixed(2)}`))
  if (invoice.surcharge > 0) out.push(row('FUEL SURCHARGE', invoice.surcharge.toFixed(2)))
  out.push(row(invoice.tax === 0 ? 'SALES TAX (EXEMPT)' : 'SALES TAX (8%)', invoice.tax.toFixed(2)))
  out.push(row('TOTAL', invoice.total.toFixed(2)))
  if (invoice.lateFee) out.push(row('LATE FEE CHARGED', invoice.lateFee.toFixed(2)))
  out.push('', 'Terms: net 30.', 'Thank you for your business!')
  return out.join('\n')
}

// ----------------------------------------------------------- inventory / stock

export type SimpleOutcome = { ok: true; data: AppData } | { ok: false; message: string }

export function receiveStock(data: AppData, session: Session, partNo: string, qty: number): SimpleOutcome {
  if (!can(session.role, 'stock.receive')) {
    return { ok: false, message: 'You are not allowed to receive stock.' }
  }
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, message: 'Received quantity must be a whole number of 1 or more.' }
  const part = data.parts.find((p) => p.partNo === partNo)
  if (!part) return { ok: false, message: `Part ${partNo} not found.` }

  return {
    ok: true,
    data: withAudit(
      { ...data, parts: data.parts.map((p) => (p.partNo === partNo ? { ...p, qtyOnHand: p.qtyOnHand + qty } : p)) },
      session,
      [{ action: 'STOCK_RECEIVE', detail: `${partNo}: ${part.qtyOnHand} → ${part.qtyOnHand + qty} (received ${qty})` }],
    ),
  }
}

export function denyAndLog(data: AppData, session: Session, permission: Permission, what: string): AppData {
  return deny(data, session, permission, what)
}
