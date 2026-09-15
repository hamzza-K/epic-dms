import type { ChangeEvent, ReactNode } from 'react'
import { CUSTOMER_TYPES, ROLES, type CustomerType, type Role } from '../domain/types'

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function TextField({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
  placeholder?: string
  type?: 'text' | 'number' | 'password'
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
      />
    </Field>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  onChange: (v: T) => void
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  )
}

export const CustomerTypeField = (p: { value: CustomerType; onChange: (v: CustomerType) => void }) => (
  <SelectField label="Type" value={p.value} options={CUSTOMER_TYPES} onChange={p.onChange} />
)

export const RoleField = (p: { value: Role; onChange: (v: Role) => void }) => (
  <SelectField label="Role" value={p.value} options={ROLES} onChange={p.onChange} />
)

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function SearchBar({
  value,
  onChange,
  placeholder,
  right,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  right?: ReactNode
}) {
  return (
    <div className="row" style={{ marginBottom: 12 }}>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ maxWidth: 340 }}
      />
      {value && (
        <button className="btn" onClick={() => onChange('')}>
          Show all
        </button>
      )}
      <div className="spacer" style={{ flex: 1 }} />
      {right}
    </div>
  )
}

export function Modal({
  title,
  children,
  onClose,
  actions,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  actions?: ReactNode
}) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal">
        <h2>{title}</h2>
        {children}
        <div className="modal-actions">{actions ?? <button className="btn" onClick={onClose}>Close</button>}</div>
      </div>
    </div>
  )
}

export function Confirm({
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
}: {
  title: string
  body: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className={danger ? 'btn danger' : 'btn primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {typeof body === 'string' ? <p style={{ margin: 0 }}>{body}</p> : body}
    </Modal>
  )
}

export function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="card stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
