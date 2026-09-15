import { useMemo, useState } from 'react'
import { exportCsvFiles } from '../data/repository'
import { expectedBalance } from '../data/seed'
import { money, round2 } from '../domain/money'
import { can, PERMISSION_LABELS, type Permission } from '../domain/permissions'
import { COMPANY, useStore } from '../state/store'
import { Confirm, Stat } from '../components/ui'

const PERMISSION_ORDER = Object.keys(PERMISSION_LABELS) as Permission[]

export default function DashboardPage({ onNavigate }: { onNavigate: (s: 'customers' | 'inventory' | 'new-invoice' | 'invoices') => void }) {
  const { data, session, resetData, notify } = useStore()
  const [confirmReset, setConfirmReset] = useState(false)

  const open = data.invoices.filter((i) => i.status === 'OPEN')
  const outstanding = round2(open.reduce((s, i) => s + i.total, 0))
  const lowStock = data.parts.filter((p) => p.qtyOnHand < 5)

  // §2 — balance must equal the sum of OPEN invoice totals plus late fees.
  // Anything listed here is data the legacy app corrupted, or a bug in this one.
  const mismatches = useMemo(
    () =>
      data.customers
        .map((c) => ({ customer: c, expected: expectedBalance(c.id, data.invoices) }))
        .filter((m) => Math.abs(m.customer.balance - m.expected) > 0.005),
    [data.customers, data.invoices],
  )

  function downloadCsvBundle() {
    const files = exportCsvFiles(data)
    for (const [name, body] of Object.entries(files)) {
      const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    }
    notify('success', `Exported ${Object.keys(files).length} CSV files.`)
  }

  return (
    <>
      <div className="page-head">
        <h1>{COMPANY.name}</h1>
        <p>{COMPANY.address} · {COMPANY.phone}</p>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <Stat k="Customers" v={String(data.customers.length)} sub={`${data.customers.filter((c) => c.balance > 1000).length} over $1,000`} />
        <Stat k="Parts" v={String(data.parts.length)} sub={`${lowStock.length} low stock (< 5)`} />
        <Stat k="Invoices" v={String(data.invoices.length)} sub={`${open.length} open`} />
        <Stat k="Outstanding" v={money(outstanding)} sub="Sum of open invoice totals" />
      </div>

      {mismatches.length > 0 && (
        <div className="notice warn">
          <strong>Balance integrity check (§2):</strong> {mismatches.length} account(s) do not match the sum of their
          open invoices plus late fees.
          <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
            {mismatches.map((m) => (
              <li key={m.customer.id}>
                {m.customer.id} {m.customer.name} — balance {money(m.customer.balance)}, expected {money(m.expected)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h2>Counter work</h2>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn primary lg" onClick={() => onNavigate('new-invoice')} disabled={!can(session!.role, 'invoice.create')}>
              New Invoice
            </button>
            <button className="btn lg" onClick={() => onNavigate('invoices')}>
              Invoice History
            </button>
            <button className="btn lg" onClick={() => onNavigate('customers')}>
              Customers
            </button>
            <button className="btn lg" onClick={() => onNavigate('inventory')}>
              Inventory
            </button>
          </div>

          {lowStock.length > 0 && (
            <>
              <h3 style={{ marginTop: 18, marginBottom: 6 }}>Low stock</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Description</th>
                      <th className="num">On hand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map((p) => (
                      <tr key={p.partNo} className="flag-danger">
                        <td className="mono">{p.partNo}</td>
                        <td>{p.description}</td>
                        <td className="num">{p.qtyOnHand}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h2>Your permissions — {session!.role}</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {PERMISSION_ORDER.map((p) => (
                  <tr key={p}>
                    <td style={{ whiteSpace: 'normal' }}>{PERMISSION_LABELS[p]}</td>
                    <td className="num">
                      {can(session!.role, p) ? (
                        <span className="chip paid">ALLOWED</span>
                      ) : (
                        <span className="chip neutral">NO</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ marginTop: 18, marginBottom: 8 }}>Data</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            Stored in this browser's local storage. Export writes the legacy CSV layout with proper quoting.
          </p>
          <div className="row">
            <button className="btn" onClick={downloadCsvBundle}>
              Export CSV files
            </button>
            <button className="btn danger" onClick={() => setConfirmReset(true)}>
              Reset to seed data
            </button>
          </div>
        </div>
      </div>

      {confirmReset && (
        <Confirm
          title="Reset all data?"
          body="Every customer, part, invoice, user and audit row created in this browser is discarded and the seeded state is restored. You will be signed out."
          confirmLabel="Reset"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false)
            resetData()
          }}
        />
      )}
    </>
  )
}
