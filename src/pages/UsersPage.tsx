import { useState } from 'react'
import { can } from '../domain/permissions'
import { addUser, deleteUser, updateUser } from '../domain/masterData'
import type { Role, User } from '../domain/types'
import { useStore } from '../state/store'
import { Checkbox, Confirm, Empty, RoleField, TextField } from '../components/ui'

interface UserForm {
  username: string
  password: string
  fullName: string
  role: Role
  active: boolean
}

const BLANK: UserForm = { username: '', password: '', fullName: '', role: 'CLERK', active: true }

export default function UsersPage() {
  const { data, session, apply } = useStore()
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [form, setForm] = useState<UserForm>(BLANK)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const mayManage = can(session!.role, 'user.manage')
  if (!mayManage) {
    return <div className="notice error">Only an administrator may manage user accounts.</div>
  }

  const selected = selectedName ? data.users.find((u) => u.username === selectedName) ?? null : null
  const patch = (p: Partial<UserForm>) => setForm((f) => ({ ...f, ...p }))

  function select(u: User) {
    setSelectedName(u.username)
    // Passwords are never read back into the form — set a new one to change it.
    setForm({ username: u.username, password: '', fullName: u.fullName, role: u.role, active: u.active })
  }

  function clearForm() {
    setSelectedName(null)
    setForm(BLANK)
  }

  return (
    <>
      <div className="page-head">
        <h1>Users</h1>
        <p>Accounts, roles and activation. Deactivated accounts cannot sign in.</p>
      </div>

      <div className="card card-tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Full name</th>
                <th>Role</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr
                  key={u.username}
                  className={`clickable${u.username === selectedName ? ' selected' : ''}${u.active ? '' : ' dim'}`}
                  onClick={() => select(u)}
                >
                  <td className="mono">
                    {u.username}
                    {u.username === session!.username && <span className="chip neutral" style={{ marginLeft: 6 }}>YOU</span>}
                  </td>
                  <td>{u.fullName}</td>
                  <td>{u.role}</td>
                  <td>{u.active ? <span className="chip paid">YES</span> : <span className="chip neutral">NO</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.users.length === 0 && <Empty>No users.</Empty>}
        </div>
      </div>

      <div className="card">
        <h2>{selected ? `Edit ${selected.username}` : 'New user'}</h2>

        <div className="grid grid-2">
          <div>
            <TextField
              label="Username"
              value={form.username}
              readOnly={!!selected}
              onChange={(v) => patch({ username: v.toUpperCase() })}
            />
            <TextField
              label={selected ? 'New password (leave blank to keep)' : 'Password'}
              type="password"
              value={form.password}
              onChange={(v) => patch({ password: v })}
            />
          </div>
          <div>
            <TextField label="Full name" value={form.fullName} onChange={(v) => patch({ fullName: v })} />
            <RoleField value={form.role} onChange={(v) => patch({ role: v })} />
            <Checkbox label="Active (may sign in)" checked={form.active} onChange={(v) => patch({ active: v })} />
          </div>
        </div>

        <p className="hint">
          Passwords are write-only — they are not shown in the grid, not read back into this form, and not included in
          the CSV export. Minimum 8 characters for new or changed passwords.
        </p>

        <div className="row" style={{ marginTop: 8 }}>
          <button
            className="btn primary"
            disabled={!!selected}
            onClick={() => {
              if (apply(addUser(data, session!, { ...form }), `User ${form.username} added.`)) clearForm()
            }}
          >
            Add
          </button>
          <button
            className="btn"
            disabled={!selected}
            onClick={() =>
              selected &&
              apply(
                updateUser(data, session!, selected.username, {
                  fullName: form.fullName,
                  role: form.role,
                  active: form.active,
                  password: form.password || undefined,
                }),
                'User updated.',
              )
            }
          >
            Update
          </button>
          <button className="btn danger" disabled={!selected} onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
          <button className="btn" onClick={clearForm}>
            Clear form
          </button>
        </div>
      </div>

      {confirmDelete && selected && (
        <Confirm
          title={`Delete ${selected.username}?`}
          body="Deactivating the account instead keeps the audit trail readable. Delete only when the account was created in error."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            if (apply(deleteUser(data, session!, selected.username), `${selected.username} deleted.`)) clearForm()
          }}
        />
      )}
    </>
  )
}
