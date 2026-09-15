import { useMemo, useState } from 'react'
import { amount, money, toInt } from '../domain/money'
import { can } from '../domain/permissions'
import { priceDraft, saveInvoice, type DraftLine } from '../domain/invoiceService'
import { computeTotals, contextFor, hasFluids, TAX_RATE } from '../domain/pricing'
import { useStore } from '../state/store'
import { Confirm, Empty } from '../components/ui'

export default function NewInvoicePage({ onSaved }: { onSaved: () => void }) {
  const { data, session, commit, notify } = useStore()
  const [customerId, setCustomerId] = useState('')
  const [partNo, setPartNo] = useState('')
  const [qtyText, setQtyText] = useState('1')
  const [draft, setDraft] = useState<DraftLine[]>([])
  const [creditPrompt, setCreditPrompt] = useState<string | null>(null)

  const mayCreate = can(session!.role, 'invoice.create')
  const customer = data.customers.find((c) => c.id === customerId) ?? null

  // §5 — prices are locked to the customer on the invoice. Changing the customer
  // re-prices every line, because the lines are derived from the draft, not stored.
  const lines = useMemo(
    () => (customer ? priceDraft(draft, data.parts, customer.type) : []),
    [customer, draft, data.parts],
  )

  const totals = useMemo(
    () =>
      customer
        ? computeTotals(lines, contextFor(customer), hasFluids(lines, data.parts))
        : { subtotal: 0, discount: 0, surcharge: 0, tax: 0, total: 0 },
    [customer, lines, data.parts],
  )

  const projectedBalance = (customer?.balance ?? 0) + totals.total
  const overLimit = !!customer && customer.creditLimit > 0 && projectedBalance > customer.creditLimit

  function addLine() {
    const part = data.parts.find((p) => p.partNo === partNo)
    if (!part) {
      notify('error', 'Pick a part first.')
      return
    }
    const qty = toInt(qtyText, 0)
    if (qty <= 0) {
      notify('error', 'Quantity must be a whole number of 1 or more.')
      return
    }
    const already = draft.filter((d) => d.partNo === partNo).reduce((s, d) => s + d.qty, 0)
    if (already + qty > part.qtyOnHand) {
      notify('error', `Only ${part.qtyOnHand} of ${part.partNo} on hand${already ? ` (${already} already on this ticket)` : ''}.`)
      return
    }
    setDraft((d) => [...d, { partNo, qty }])
    setQtyText('1')
  }

  function save(overrideCredit = false) {
    if (!customer) {
      notify('error', 'Pick a customer first.')
      return
    }
    const result = saveInvoice(data, session!, { customerId: customer.id, draft, overrideCredit })

    if (result.ok) {
      commit(result.data)
      notify(
        result.overridden ? 'warn' : 'success',
        `Invoice ${result.invoiceNo} saved — ${money(result.total)}${result.overridden ? ' (credit override recorded)' : ''}.`,
      )
      setDraft([])
      setCustomerId('')
      setCreditPrompt(null)
      onSaved()
      return
    }

    if (result.reason === 'credit' && result.canOverride) {
      setCreditPrompt(result.message)
      return
    }
    notify('error', result.message)
    setCreditPrompt(null)
  }

  return (
    <>
      <div className="page-head">
        <h1>New Invoice</h1>
        <p>Pick a customer, add lines, save. Saving reduces stock and puts the total on the account.</p>
      </div>

      {!mayCreate && <div className="notice error">Your role may not create invoices.</div>}

      <div className="card">
        <div className="grid grid-2">
          <label className="field">
            <span>Customer</span>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— select —</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} | {c.name} ({c.type})
                </option>
              ))}
            </select>
          </label>

          {customer && (
            <div>
              <div className="row" style={{ gap: 14, fontSize: 13 }}>
                <span>
                  <strong>Type:</strong> {customer.type}
                </span>
                <span>
                  <strong>Balance:</strong> {money(customer.balance)}
                </span>
                <span>
                  <strong>Credit limit:</strong> {money(customer.creditLimit)}
                </span>
                {customer.taxExempt && <span className="chip exempt">TAX EXEMPT</span>}
              </div>
              {draft.length > 0 && (
                <p className="hint" style={{ marginBottom: 0 }}>
                  Lines are priced for {customer.type}; switching customer re-prices them.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="row" style={{ alignItems: 'flex-end', gap: 12, marginTop: 4 }}>
          <div style={{ flex: 3, minWidth: 260 }}>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Part</span>
              <select value={partNo} onChange={(e) => setPartNo(e.target.value)} disabled={!customer}>
                <option value="">— select —</option>
                {data.parts.map((p) => (
                  <option key={p.partNo} value={p.partNo} disabled={p.qtyOnHand <= 0}>
                    {p.partNo} | {p.description} | {money(p.price)} | {p.qtyOnHand} on hand
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ width: 90 }}>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Qty</span>
              <input value={qtyText} onChange={(e) => setQtyText(e.target.value)} disabled={!customer} />
            </label>
          </div>
          <button className="btn" onClick={addLine} disabled={!customer || !partNo}>
            Add line
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' }}>
        <div className="card card-tight">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Part no</th>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Line total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.partNo}-${i}`}>
                    <td className="mono">{l.partNo}</td>
                    <td>{l.description}</td>
                    <td className="num">{l.qty}</td>
                    <td className="num">{amount(l.unitPrice)}</td>
                    <td className="num">{amount(l.lineTotal)}</td>
                    <td className="num">
                      <button className="btn danger" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lines.length === 0 && <Empty>{customer ? 'No lines yet.' : 'Pick a customer to start a ticket.'}</Empty>}
          </div>
        </div>

        <div className="card">
          <h2>Totals</h2>
          <div className="totals">
            <div>
              <span>Subtotal</span>
              <span>{amount(totals.subtotal)}</span>
            </div>
            <div>
              <span>Volume discount{customer?.type === 'WHOLESALE' ? ' (n/a — wholesale)' : ''}</span>
              <span>{totals.discount ? `-${amount(totals.discount)}` : '0.00'}</span>
            </div>
            <div>
              <span>Fuel surcharge (3%)</span>
              <span>{amount(totals.surcharge)}</span>
            </div>
            <div>
              <span>{customer?.taxExempt ? 'Sales tax (exempt)' : `Sales tax (${(TAX_RATE * 100).toFixed(0)}%)`}</span>
              <span>{amount(totals.tax)}</span>
            </div>
            <div className="grand">
              <span>Total</span>
              <span>{money(totals.total)}</span>
            </div>
          </div>

          {customer && (
            <div className={`notice ${overLimit ? 'error' : 'info'}`} style={{ marginTop: 14, marginBottom: 0 }}>
              Account would be at {money(projectedBalance)} of a {money(customer.creditLimit)} limit.
              {overLimit && (can(session!.role, 'invoice.creditOverride') ? ' A manager override will be recorded.' : ' This sale will be blocked.')}
            </div>
          )}

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary lg" disabled={!mayCreate || !customer || lines.length === 0} onClick={() => save(false)}>
              Save invoice
            </button>
            <button
              className="btn"
              onClick={() => {
                setDraft([])
                setCustomerId('')
                setPartNo('')
                setQtyText('1')
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {creditPrompt && (
        <Confirm
          title="Over credit limit"
          body={
            <>
              <p style={{ marginTop: 0 }}>{creditPrompt}</p>
              <p style={{ marginBottom: 0 }}>
                Ringing this up anyway records a credit override against your account in the audit log.
              </p>
            </>
          }
          confirmLabel="Override and save"
          danger
          onCancel={() => setCreditPrompt(null)}
          onConfirm={() => save(true)}
        />
      )}
    </>
  )
}
