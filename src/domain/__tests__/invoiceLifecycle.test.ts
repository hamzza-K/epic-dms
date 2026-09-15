import { beforeEach, describe, expect, it } from 'vitest'
import { createSeedData, expectedBalance } from '../../data/seed'
import { authenticate } from '../auth'
import { deleteInvoice, markInvoicePaid, receiveStock, saveInvoice } from '../invoiceService'
import { can } from '../permissions'
import type { AppData, Role, Session } from '../types'

const session = (role: Role, username: string = role): Session => ({ username, fullName: username, role })
const ADMIN = session('ADMIN')
const CLERK = session('CLERK', 'COUNTER1')
const MANAGER = session('MANAGER', 'MARGE')

let data: AppData
beforeEach(() => {
  data = createSeedData()
})

const partQty = (d: AppData, partNo: string) => d.parts.find((p) => p.partNo === partNo)!.qtyOnHand
const balance = (d: AppData, id: string) => d.customers.find((c) => c.id === id)!.balance
const invoice = (d: AppData, no: string) => d.invoices.find((i) => i.invoiceNo === no)!

describe('§4.1 saving an invoice', () => {
  it('assigns the next number, cuts stock and bills the FULL total', () => {
    const result = saveInvoice(data, CLERK, {
      customerId: 'C-1003', // RETAIL, balance 0, limit 2500
      draft: [{ partNo: 'P-1003', qty: 4 }, { partNo: 'P-1007', qty: 2 }],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.invoiceNo).toBe('INV-1004')
    expect(result.total).toBe(739.61)

    const saved = invoice(result.data, 'INV-1004')
    expect(saved.status).toBe('OPEN')
    expect(saved.surcharge).toBe(19.95)

    expect(partQty(result.data, 'P-1003')).toBe(23 - 4)
    expect(partQty(result.data, 'P-1007')).toBe(10 - 2)

    // The legacy save added `subtotal - discount + tax`, quietly dropping the
    // surcharge from the customer's balance.
    expect(balance(result.data, 'C-1003')).toBe(739.61)
    expect(expectedBalance('C-1003', result.data.invoices)).toBe(739.61)
  })

  it('never reissues an invoice number after a delete', () => {
    const first = saveInvoice(data, ADMIN, { customerId: 'C-1003', draft: [{ partNo: 'P-1001', qty: 1 }] })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const removed = deleteInvoice(first.data, ADMIN, 'INV-1004')
    expect(removed.ok).toBe(true)
    if (!removed.ok) return

    const second = saveInvoice(removed.data, ADMIN, { customerId: 'C-1003', draft: [{ partNo: 'P-1001', qty: 1 }] })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.invoiceNo).toBe('INV-1005')
  })

  it('refuses to sell stock that is not on the shelf', () => {
    const result = saveInvoice(data, CLERK, { customerId: 'C-1003', draft: [{ partNo: 'P-1012', qty: 4 }] }) // 3 on hand
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('stock')
  })

  it('counts repeated lines for the same part against one on-hand figure', () => {
    const result = saveInvoice(data, CLERK, {
      customerId: 'C-1003',
      draft: [{ partNo: 'P-1012', qty: 2 }, { partNo: 'P-1012', qty: 2 }], // 3 on hand
    })
    expect(result.ok).toBe(false)
  })

  it('rejects zero and fractional quantities', () => {
    expect(saveInvoice(data, CLERK, { customerId: 'C-1003', draft: [{ partNo: 'P-1001', qty: 0 }] }).ok).toBe(false)
    expect(saveInvoice(data, CLERK, { customerId: 'C-1003', draft: [{ partNo: 'P-1001', qty: 1.5 }] }).ok).toBe(false)
  })

  it('changes nothing at all when it refuses', () => {
    const before = JSON.stringify(data)
    saveInvoice(data, CLERK, { customerId: 'C-1012', draft: [{ partNo: 'P-1001', qty: 1 }] })
    saveInvoice(data, CLERK, { customerId: 'C-1003', draft: [{ partNo: 'P-1012', qty: 99 }] })
    expect(JSON.stringify(data)).toBe(before)
  })

  it('is a pure function — calling it twice with the same input does not double-post', () => {
    const input = { customerId: 'C-1003' as const, draft: [{ partNo: 'P-1001', qty: 2 }] }
    const a = saveInvoice(data, CLERK, input)
    const b = saveInvoice(data, CLERK, input)
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    // Each derives from the untouched original, so neither sees the other's stock cut.
    expect(a.invoiceNo).toBe(b.invoiceNo)
    expect(partQty(a.data, 'P-1001')).toBe(40)
    expect(partQty(data, 'P-1001')).toBe(42)
  })
})

describe('§8 credit limits', () => {
  it('blocks a clerk when the sale would breach the limit', () => {
    // C-1008 Sandy's: balance 0, limit 500. One tire at list is 179, four is 716.
    const result = saveInvoice(data, CLERK, { customerId: 'C-1008', draft: [{ partNo: 'P-1012', qty: 3 }] })
    expect(result.ok).toBe(false)
    if (result.ok || result.reason !== 'credit') throw new Error('expected a credit block')
    expect(result.canOverride).toBe(false)
  })

  it('lets a manager override, and records the override', () => {
    const blocked = saveInvoice(data, MANAGER, { customerId: 'C-1008', draft: [{ partNo: 'P-1012', qty: 3 }] })
    expect(blocked.ok).toBe(false)
    if (blocked.ok || blocked.reason !== 'credit') throw new Error('expected a credit block')
    expect(blocked.canOverride).toBe(true)

    const forced = saveInvoice(data, MANAGER, {
      customerId: 'C-1008',
      draft: [{ partNo: 'P-1012', qty: 3 }],
      overrideCredit: true,
    })
    expect(forced.ok).toBe(true)
    if (!forced.ok) return
    expect(forced.overridden).toBe(true)
    expect(forced.data.audit.some((a) => a.action === 'CREDIT_OVERRIDE' && a.user === 'MARGE')).toBe(true)
  })

  it('ignores a clerk who claims an override', () => {
    const result = saveInvoice(data, CLERK, {
      customerId: 'C-1008',
      draft: [{ partNo: 'P-1012', qty: 3 }],
      overrideCredit: true,
    })
    expect(result.ok).toBe(false)
  })
})

describe('§4.2 marking an invoice paid', () => {
  it('clears the balance and cannot be applied twice', () => {
    const first = markInvoicePaid(data, CLERK, 'INV-1003') // C-1006, total 88.99, balance 88.99
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(invoice(first.data, 'INV-1003').status).toBe('PAID')

    const second = markInvoicePaid(first.data, CLERK, 'INV-1003')
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.message).toContain('already paid')
  })

  it('charges a traceable late fee when payment is past terms', () => {
    // The seeded invoices are dated mid-2026 and today is well past them.
    const result = markInvoicePaid(data, CLERK, 'INV-1001')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lateFee).toBeGreaterThan(0)
    expect(invoice(result.data, 'INV-1001').lateFee).toBe(result.lateFee)
    expect(result.data.audit.some((a) => a.action === 'LATE_FEE')).toBe(true)
    expect(balance(result.data, 'C-1002')).toBe(Number((140.28 - 140.28 + result.lateFee).toFixed(2)))
  })
})

describe('§4.3 deleting an invoice', () => {
  it('undoes the stock, the balance and the lines together', () => {
    const saved = saveInvoice(data, ADMIN, { customerId: 'C-1003', draft: [{ partNo: 'P-1003', qty: 4 }] })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    const result = deleteInvoice(saved.data, ADMIN, saved.invoiceNo)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.invoices.some((i) => i.invoiceNo === saved.invoiceNo)).toBe(false)
    expect(partQty(result.data, 'P-1003')).toBe(23) // returned to the shelf
    expect(balance(result.data, 'C-1003')).toBe(0)
  })

  it('reverses only the late fee for an already-paid invoice', () => {
    const paid = markInvoicePaid(data, ADMIN, 'INV-1003')
    expect(paid.ok).toBe(true)
    if (!paid.ok) return
    const balanceAfterPaying = balance(paid.data, 'C-1006')

    const result = deleteInvoice(paid.data, ADMIN, 'INV-1003')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Stock was consumed when the invoice was created, not when it was paid, so
    // a PAID invoice does not hand stock back on delete.
    expect(partQty(result.data, 'P-1010')).toBe(91)
    expect(balance(result.data, 'C-1006')).toBe(Number((balanceAfterPaying - (paid.data.invoices.find((i) => i.invoiceNo === 'INV-1003')!.lateFee ?? 0)).toFixed(2)))
  })

  it('is refused for anyone who is not an administrator', () => {
    expect(deleteInvoice(data, CLERK, 'INV-1001').ok).toBe(false)
    expect(deleteInvoice(data, MANAGER, 'INV-1001').ok).toBe(false)
    expect(deleteInvoice(data, ADMIN, 'INV-1001').ok).toBe(true)
  })
})

describe('§3 receiving stock', () => {
  it('adds to the on-hand count and logs it', () => {
    const result = receiveStock(data, CLERK, 'P-1012', 12)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(partQty(result.data, 'P-1012')).toBe(15)
    expect(result.data.audit.some((a) => a.action === 'STOCK_RECEIVE')).toBe(true)
  })

  it('rejects junk quantities', () => {
    expect(receiveStock(data, CLERK, 'P-1012', 0).ok).toBe(false)
    expect(receiveStock(data, CLERK, 'P-1012', -5).ok).toBe(false)
    expect(receiveStock(data, CLERK, 'P-1012', 2.5).ok).toBe(false)
  })
})

describe('§10 authentication and permissions', () => {
  it('accepts a seeded account', () => {
    const result = authenticate(data, 'marge', 'marge2006')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.session.role).toBe('MANAGER')
  })

  it('treats passwords as case-sensitive', () => {
    expect(authenticate(data, 'MARGE', 'MARGE2006').ok).toBe(false)
  })

  it('refuses a deactivated account', () => {
    const result = authenticate(data, 'RICK', 'rick2009')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('deactivated')
  })

  it('has no vendor backdoor', () => {
    expect(authenticate(data, 'SUPPORT', 'apex!').ok).toBe(false)
  })

  it('matches the permission matrix in §10', () => {
    expect(can('CLERK', 'customer.delete')).toBe(false)
    expect(can('CLERK', 'part.edit')).toBe(false)
    expect(can('CLERK', 'stock.receive')).toBe(true)
    expect(can('CLERK', 'invoice.markPaid')).toBe(true)
    expect(can('MANAGER', 'customer.delete')).toBe(true)
    expect(can('MANAGER', 'invoice.creditOverride')).toBe(true)
    expect(can('MANAGER', 'invoice.delete')).toBe(false)
    expect(can('MANAGER', 'user.manage')).toBe(false)
    expect(can('ADMIN', 'invoice.delete')).toBe(true)
    expect(can('ADMIN', 'user.manage')).toBe(true)
  })
})

describe('§2 balance integrity', () => {
  it('holds across a full create → pay → create cycle', () => {
    let d = data
    const first = saveInvoice(d, ADMIN, { customerId: 'C-1003', draft: [{ partNo: 'P-1001', qty: 3 }] })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    d = first.data

    const paid = markInvoicePaid(d, ADMIN, first.invoiceNo)
    expect(paid.ok).toBe(true)
    if (!paid.ok) return
    d = paid.data

    const second = saveInvoice(d, ADMIN, { customerId: 'C-1003', draft: [{ partNo: 'P-1002', qty: 2 }] })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    d = second.data

    expect(balance(d, 'C-1003')).toBe(expectedBalance('C-1003', d.invoices))
  })
})
