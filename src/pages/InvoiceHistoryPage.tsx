import { useMemo, useState } from 'react'
import { amount, money } from '../domain/money'
import { can } from '../domain/permissions'
import { deleteInvoice, markInvoicePaid, reprintText } from '../domain/invoiceService'
import { monthsLate } from '../domain/pricing'
import type { Invoice } from '../domain/types'
import { COMPANY, useStore } from '../state/store'
import { Confirm, Empty, Modal, SearchBar } from '../components/ui'

export default function InvoiceHistoryPage() {
  const { data, session, commit, notify } = useStore()
  const [search, setSearch] = useState('')
  const [selectedNo, setSelectedNo] = useState<string | null>(null)
  const [reprint, setReprint] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmPaid, setConfirmPaid] = useState(false)

  const mayDelete = can(session!.role, 'invoice.delete')
  const mayMarkPaid = can(session!.role, 'invoice.markPaid')

  const nameOf = (customerId: string) => data.customers.find((c) => c.id === customerId)?.name ?? customerId

  const rows = useMemo(() => {
    const q = search.trim().toUpperCase()
    const sorted = [...data.invoices].sort((a, b) => b.invoiceNo.localeCompare(a.invoiceNo, undefined, { numeric: true }))
    if (!q) return sorted
    return sorted.filter(
      (i) => i.invoiceNo.includes(q) || nameOf(i.customerId).toUpperCase().includes(q) || i.status.includes(q),
    )
  }, [data.invoices, data.customers, search])

  const selected: Invoice | null = selectedNo ? data.invoices.find((i) => i.invoiceNo === selectedNo) ?? null : null
  const lateMonths = selected && selected.status === 'OPEN' ? monthsLate(selected.date, new Date()) : 0

  return (
    <>
      <div className="page-head">
        <h1>Invoice History</h1>
        <p>Net 30 terms. Open invoices past 30 days pick up a 1.5% late fee per full month when they are paid.</p>
      </div>

      <div className="card">
        <SearchBar value={search} onChange={setSearch} placeholder="Search invoice no, customer or status…" />
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Invoice no</th>
                <th>Customer</th>
                <th>Date</th>
                <th className="num">Subtotal</th>
                <th className="num">Discount</th>
                <th className="num">Surcharge</th>
                <th className="num">Tax</th>
                <th className="num">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr
                  key={i.invoiceNo}
                  className={`clickable${i.invoiceNo === selectedNo ? ' selected' : ''}${i.status === 'OPEN' && monthsLate(i.date, new Date()) > 0 ? ' flag-danger' : ''}`}
                  onClick={() => setSelectedNo(i.invoiceNo)}
                >
                  <td className="mono">{i.invoiceNo}</td>
                  <td>{nameOf(i.customerId)}</td>
                  <td>{i.date}</td>
                  <td className="num">{amount(i.subtotal)}</td>
                  <td className="num">{i.discount ? `-${amount(i.discount)}` : '—'}</td>
                  <td className="num">{i.surcharge ? amount(i.surcharge) : '—'}</td>
                  <td className="num">{i.tax ? amount(i.tax) : 'exempt'}</td>
                  <td className="num">{money(i.total)}</td>
                  <td>
                    <span className={`chip ${i.status === 'OPEN' ? 'open' : 'paid'}`}>{i.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>No invoices match “{search}”.</Empty>}
        </div>
      </div>

      <div className="card">
        <h2>{selected ? `${selected.invoiceNo} — ${nameOf(selected.customerId)}` : 'Lines'}</h2>
        {!selected ? (
          <Empty>Select an invoice above.</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Part no</th>
                    <th>Description</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit price</th>
                    <th className="num">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((l, idx) => (
                    <tr key={`${l.partNo}-${idx}`}>
                      <td className="mono">{l.partNo}</td>
                      <td>{l.description}</td>
                      <td className="num">{l.qty}</td>
                      <td className="num">{amount(l.unitPrice)}</td>
                      <td className="num">{amount(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected.status === 'OPEN' && lateMonths > 0 && (
              <div className="notice warn" style={{ marginTop: 12 }}>
                {lateMonths} full month(s) past net-30 terms. Marking it paid now charges a{' '}
                {money(selected.total * 0.015 * lateMonths)} late fee to the account.
              </div>
            )}
            {selected.lateFee ? (
              <div className="notice info" style={{ marginTop: 12 }}>
                A {money(selected.lateFee)} late fee was charged when this invoice was paid
                {selected.paidDate ? ` on ${selected.paidDate}` : ''}.
              </div>
            ) : null}

            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn"
                onClick={() => setReprint(reprintText(selected, nameOf(selected.customerId), COMPANY))}
              >
                Reprint…
              </button>
              <button
                className="btn primary"
                disabled={!mayMarkPaid || selected.status === 'PAID'}
                onClick={() => setConfirmPaid(true)}
              >
                Mark paid
              </button>
              <button className="btn danger" disabled={!mayDelete} onClick={() => setConfirmDelete(true)}>
                Delete invoice
              </button>
              {!mayDelete && <span className="hint">Only an administrator may delete invoices.</span>}
            </div>
          </>
        )}
      </div>

      {reprint && (
        <Modal title="Reprint" onClose={() => setReprint(null)}>
          <pre className="reprint">{reprint}</pre>
          <p className="hint" style={{ marginBottom: 0 }}>
            A reprint shows the amounts that were saved on the invoice — it never recomputes them.
          </p>
        </Modal>
      )}

      {confirmPaid && selected && (
        <Confirm
          title={`Mark ${selected.invoiceNo} paid?`}
          body={
            lateMonths > 0
              ? `${money(selected.total)} comes off the account and a ${money(selected.total * 0.015 * lateMonths)} late fee goes on. Marking paid happens once per invoice.`
              : `${money(selected.total)} comes off the account. Marking paid happens once per invoice.`
          }
          confirmLabel="Mark paid"
          onCancel={() => setConfirmPaid(false)}
          onConfirm={() => {
            setConfirmPaid(false)
            const result = markInvoicePaid(data, session!, selected.invoiceNo)
            if (!result.ok) {
              notify('error', result.message)
              return
            }
            commit(result.data)
            notify(
              result.lateFee > 0 ? 'warn' : 'success',
              result.lateFee > 0
                ? `${selected.invoiceNo} paid — ${money(result.lateFee)} late fee added (${result.monthsLate} month(s) late).`
                : `${selected.invoiceNo} paid.`,
            )
          }}
        />
      )}

      {confirmDelete && selected && (
        <Confirm
          title={`Delete ${selected.invoiceNo}?`}
          body={
            selected.status === 'OPEN'
              ? `Its lines go away, the ${money(selected.total)} comes off the account and the stock it consumed goes back on the shelf. The invoice number is retired, not reused.`
              : `Its lines go away and any late fee it charged is reversed. The invoice number is retired, not reused.`
          }
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            const result = deleteInvoice(data, session!, selected.invoiceNo)
            if (!result.ok) {
              notify('error', result.message)
              return
            }
            commit(result.data)
            setSelectedNo(null)
            notify('success', `${selected.invoiceNo} deleted and fully reversed.`)
          }}
        />
      )}
    </>
  )
}
