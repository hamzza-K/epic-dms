import { useMemo, useState } from 'react'
import { money, toNumber } from '../domain/money'
import { can } from '../domain/permissions'
import { addCustomer, deleteCustomer, updateCustomer, type CustomerDraft } from '../domain/masterData'
import type { Customer } from '../domain/types'
import { useStore } from '../state/store'
import { Checkbox, Confirm, CustomerTypeField, Empty, SearchBar, TextField } from '../components/ui'

const BLANK: CustomerDraft = {
  name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  type: 'RETAIL',
  creditLimit: 2500,
  taxExempt: false,
}

function toDraft(c: Customer): CustomerDraft {
  const { id: _id, balance: _balance, createdDate: _createdDate, ...rest } = c
  return rest
}

export default function CustomersPage() {
  const { data, session, apply } = useStore()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CustomerDraft>(BLANK)
  const [creditLimitText, setCreditLimitText] = useState('2500')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const canEdit = can(session!.role, 'customer.edit')
  const canDelete = can(session!.role, 'customer.delete')

  // §2 — search matches name, phone or city.
  const rows = useMemo(() => {
    const q = search.trim().toUpperCase()
    if (!q) return data.customers
    return data.customers.filter(
      (c) =>
        c.name.toUpperCase().includes(q) ||
        c.phone.toUpperCase().includes(q) ||
        c.city.toUpperCase().includes(q),
    )
  }, [data.customers, search])

  const selected = selectedId ? data.customers.find((c) => c.id === selectedId) ?? null : null

  function select(c: Customer) {
    setSelectedId(c.id)
    setDraft(toDraft(c))
    setCreditLimitText(String(c.creditLimit))
  }

  function clearForm() {
    setSelectedId(null)
    setDraft(BLANK)
    setCreditLimitText('2500')
  }

  const patch = (p: Partial<CustomerDraft>) => setDraft((d) => ({ ...d, ...p }))
  const withLimit = (): CustomerDraft => ({ ...draft, creditLimit: toNumber(creditLimitText, 0) })

  return (
    <>
      <div className="page-head">
        <h1>Customers</h1>
        <p>The account book — who buys from us, on what terms, and what they owe.</p>
      </div>

      <div className="card">
        <SearchBar value={search} onChange={setSearch} placeholder="Search name, phone or city…" />
        <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>City</th>
                <th>St</th>
                <th>Type</th>
                <th className="num">Credit limit</th>
                <th className="num">Balance</th>
                <th>Tax</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className={`clickable${c.id === selectedId ? ' selected' : ''}${c.balance > 1000 ? ' flag-danger' : ''}`}
                  onClick={() => select(c)}
                >
                  <td className="mono">{c.id}</td>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.city}</td>
                  <td>{c.state}</td>
                  <td>{c.type}</td>
                  <td className="num">{money(c.creditLimit)}</td>
                  <td className="num">{money(c.balance)}</td>
                  <td>{c.taxExempt ? <span className="chip exempt">EXEMPT</span> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>No customers match “{search}”.</Empty>}
        </div>
        <p className="hint" style={{ marginBottom: 0, marginTop: 10 }}>
          Rows marked red owe more than $1,000.
        </p>
      </div>

      <div className="card">
        <h2>{selected ? `Edit ${selected.id}` : 'New customer'}</h2>
        {!canEdit && <div className="notice info">Your role may view customers but not change them.</div>}

        <div className="grid grid-2">
          <div>
            <TextField label="ID" value={selected?.id ?? '(assigned on save)'} readOnly />
            <TextField label="Name" value={draft.name} onChange={(v) => patch({ name: v })} />
            <TextField label="Phone" value={draft.phone} onChange={(v) => patch({ phone: v })} />
            <TextField label="Email" value={draft.email} onChange={(v) => patch({ email: v })} />
          </div>
          <div>
            <TextField label="Address" value={draft.address} onChange={(v) => patch({ address: v })} />
            <TextField label="City" value={draft.city} onChange={(v) => patch({ city: v })} />
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <TextField label="State" value={draft.state} onChange={(v) => patch({ state: v.toUpperCase().slice(0, 2) })} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Zip" value={draft.zip} onChange={(v) => patch({ zip: v })} />
              </div>
            </div>
            <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <CustomerTypeField value={draft.type} onChange={(v) => patch({ type: v })} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Credit limit" value={creditLimitText} onChange={setCreditLimitText} />
              </div>
            </div>
            <Checkbox label="Tax exempt (agricultural certificate on file)" checked={draft.taxExempt} onChange={(v) => patch({ taxExempt: v })} />
          </div>
        </div>

        <p className="hint">
          Balance is derived from invoice activity and is not editable here — see §2. Current balance:{' '}
          <strong>{money(selected?.balance ?? 0)}</strong>
        </p>

        <div className="row" style={{ marginTop: 8 }}>
          <button
            className="btn primary"
            disabled={!canEdit || !!selected}
            onClick={() => {
              if (apply(addCustomer(data, session!, withLimit()), 'Customer added.')) clearForm()
            }}
          >
            Add new
          </button>
          <button
            className="btn"
            disabled={!canEdit || !selected}
            onClick={() => selected && apply(updateCustomer(data, session!, selected.id, withLimit()), 'Customer updated.')}
          >
            Update
          </button>
          <button className="btn danger" disabled={!canDelete || !selected} onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
          <button className="btn" onClick={clearForm}>
            Clear form
          </button>
        </div>
      </div>

      {confirmDelete && selected && (
        <Confirm
          title={`Delete ${selected.id}?`}
          body={`${selected.name} will be removed. The ID is retired and never reissued, so invoice history stays attached to the right account.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            if (apply(deleteCustomer(data, session!, selected.id), `${selected.id} deleted.`)) clearForm()
          }}
        />
      )}
    </>
  )
}
