import { useMemo, useState } from 'react'
import type { AuditAction } from '../domain/types'
import { useStore } from '../state/store'
import { Empty, SearchBar } from '../components/ui'

const GROUPS: { label: string; actions: AuditAction[] }[] = [
  { label: 'All', actions: [] },
  { label: 'Auth', actions: ['AUTH_LOGIN', 'AUTH_LOGIN_FAILED', 'AUTH_LOGOUT', 'PERMISSION_DENIED'] },
  { label: 'Stock', actions: ['STOCK_RECEIVE', 'STOCK_CONSUME', 'STOCK_RESTORE'] },
  { label: 'Money', actions: ['BALANCE_CHANGE', 'LATE_FEE', 'CREDIT_OVERRIDE', 'CREDIT_BLOCKED'] },
  { label: 'Invoices', actions: ['INVOICE_SAVE', 'INVOICE_PAID', 'INVOICE_DELETE'] },
  { label: 'Master data', actions: ['CUSTOMER_ADD', 'CUSTOMER_UPDATE', 'CUSTOMER_DELETE', 'PART_ADD', 'PART_UPDATE', 'PART_DELETE', 'USER_ADD', 'USER_UPDATE', 'USER_DELETE'] },
]

export default function AuditPage() {
  const { data } = useStore()
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('All')

  const rows = useMemo(() => {
    const actions = GROUPS.find((g) => g.label === group)?.actions ?? []
    const q = search.trim().toUpperCase()
    return [...data.audit]
      .reverse()
      .filter((a) => (actions.length === 0 || actions.includes(a.action)))
      .filter((a) => !q || a.action.includes(q) || a.detail.toUpperCase().includes(q) || a.user.toUpperCase().includes(q))
  }, [data.audit, group, search])

  return (
    <>
      <div className="page-head">
        <h1>Audit Log</h1>
        <p>Append-only record of who changed stock, prices, balances and invoice status, plus auth events.</p>
      </div>

      <div className="card">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search action, user or detail…"
          right={
            <div className="row">
              {GROUPS.map((g) => (
                <button
                  key={g.label}
                  className="btn"
                  style={group === g.label ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                  onClick={() => setGroup(g.label)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          }
        />

        <div className="table-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className={a.action === 'CREDIT_OVERRIDE' || a.action === 'PERMISSION_DENIED' ? 'flag-warn' : undefined}>
                  <td className="num mono">{a.id}</td>
                  <td className="mono">{a.at.replace('T', ' ').slice(0, 19)}</td>
                  <td className="mono">{a.user}</td>
                  <td>{a.action}</td>
                  <td style={{ whiteSpace: 'normal' }}>{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>Nothing logged yet for this filter.</Empty>}
        </div>
      </div>
    </>
  )
}
