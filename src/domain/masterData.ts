// Customer, part and user maintenance — BUSINESS_RULES.md §2, §3, §10.

import { can } from './permissions'
import { logAudit, type SimpleOutcome } from './invoiceService'
import type { AppData, Customer, Part, Session, User } from './types'

export type CustomerDraft = Omit<Customer, 'id' | 'balance' | 'createdDate'>

export function addCustomer(data: AppData, session: Session, draft: CustomerDraft): SimpleOutcome {
  if (!can(session.role, 'customer.edit')) return { ok: false, message: 'You are not allowed to add customers.' }
  if (!draft.name.trim()) return { ok: false, message: 'Name is required.' }
  if (draft.creditLimit < 0) return { ok: false, message: 'Credit limit cannot be negative.' }

  // §2 — IDs come from a monotonic counter, so a deleted customer's ID is never
  // handed to somebody else. The legacy `max(existing) + 1` reused it.
  const id = `C-${data.seq.customer + 1}`
  const customer: Customer = {
    ...draft,
    id,
    balance: 0,
    createdDate: new Date().toISOString().slice(0, 10),
  }

  return {
    ok: true,
    data: logAudit(
      { ...data, customers: [...data.customers, customer], seq: { ...data.seq, customer: data.seq.customer + 1 } },
      session,
      'CUSTOMER_ADD',
      `${id} ${customer.name} (${customer.type}, limit ${customer.creditLimit}, exempt ${customer.taxExempt ? 'Y' : 'N'})`,
    ),
  }
}

export function updateCustomer(data: AppData, session: Session, id: string, draft: CustomerDraft): SimpleOutcome {
  if (!can(session.role, 'customer.edit')) return { ok: false, message: 'You are not allowed to edit customers.' }
  const existing = data.customers.find((c) => c.id === id)
  if (!existing) return { ok: false, message: `Customer ${id} not found.` }
  if (!draft.name.trim()) return { ok: false, message: 'Name is required.' }
  if (draft.creditLimit < 0) return { ok: false, message: 'Credit limit cannot be negative.' }

  const changes = (Object.keys(draft) as (keyof CustomerDraft)[])
    .filter((k) => draft[k] !== existing[k])
    .map((k) => `${k}: ${String(existing[k])} → ${String(draft[k])}`)

  return {
    ok: true,
    data: logAudit(
      // Balance is deliberately not editable — it is derived from invoice activity (§2).
      { ...data, customers: data.customers.map((c) => (c.id === id ? { ...c, ...draft } : c)) },
      session,
      'CUSTOMER_UPDATE',
      changes.length ? `${id}: ${changes.join('; ')}` : `${id}: no changes`,
    ),
  }
}

export function deleteCustomer(data: AppData, session: Session, id: string): SimpleOutcome {
  if (!can(session.role, 'customer.delete')) return { ok: false, message: 'Only a manager or administrator may delete customers.' }
  const customer = data.customers.find((c) => c.id === id)
  if (!customer) return { ok: false, message: `Customer ${id} not found.` }

  const open = data.invoices.filter((i) => i.customerId === id && i.status === 'OPEN')
  if (open.length > 0) {
    return { ok: false, message: `${customer.name} has ${open.length} open invoice(s). Settle them first.` }
  }
  if (customer.balance !== 0) {
    return { ok: false, message: `${customer.name} still has a balance. Clear it before deleting the account.` }
  }

  return {
    ok: true,
    data: logAudit(
      { ...data, customers: data.customers.filter((c) => c.id !== id) },
      session,
      'CUSTOMER_DELETE',
      `${id} ${customer.name} deleted (ID retired, never reused)`,
    ),
  }
}

// -------------------------------------------------------------------- parts

export function addPart(data: AppData, session: Session, draft: Part): SimpleOutcome {
  if (!can(session.role, 'part.edit')) return { ok: false, message: 'Only a manager or administrator may add parts.' }
  const partNo = draft.partNo.trim().toUpperCase()
  if (!partNo) return { ok: false, message: 'Part number is required.' }
  // §3 — one part number, one record.
  if (data.parts.some((p) => p.partNo === partNo)) return { ok: false, message: `Part ${partNo} already exists.` }
  if (draft.qtyOnHand < 0) return { ok: false, message: 'Quantity on hand cannot be negative.' }
  if (draft.cost < 0 || draft.price < 0) return { ok: false, message: 'Cost and price cannot be negative.' }

  const part: Part = { ...draft, partNo, category: draft.category.trim().toUpperCase() }
  return {
    ok: true,
    data: logAudit({ ...data, parts: [...data.parts, part] }, session, 'PART_ADD', `${partNo} ${part.description} (qty ${part.qtyOnHand}, cost ${part.cost}, price ${part.price})`),
  }
}

export function updatePart(data: AppData, session: Session, partNo: string, draft: Part): SimpleOutcome {
  if (!can(session.role, 'part.edit')) return { ok: false, message: 'Only a manager or administrator may change parts or prices.' }
  const existing = data.parts.find((p) => p.partNo === partNo)
  if (!existing) return { ok: false, message: `Part ${partNo} not found.` }
  if (draft.qtyOnHand < 0) return { ok: false, message: 'Quantity on hand cannot be negative.' }
  if (draft.cost < 0 || draft.price < 0) return { ok: false, message: 'Cost and price cannot be negative.' }

  const updated: Part = { ...draft, partNo, category: draft.category.trim().toUpperCase() }
  const changes = (Object.keys(updated) as (keyof Part)[])
    .filter((k) => updated[k] !== existing[k])
    .map((k) => `${k}: ${String(existing[k])} → ${String(updated[k])}`)

  return {
    ok: true,
    data: logAudit(
      { ...data, parts: data.parts.map((p) => (p.partNo === partNo ? updated : p)) },
      session,
      'PART_UPDATE',
      changes.length ? `${partNo}: ${changes.join('; ')}` : `${partNo}: no changes`,
    ),
  }
}

export function deletePart(data: AppData, session: Session, partNo: string): SimpleOutcome {
  if (!can(session.role, 'part.edit')) return { ok: false, message: 'Only a manager or administrator may delete parts.' }
  const part = data.parts.find((p) => p.partNo === partNo)
  if (!part) return { ok: false, message: `Part ${partNo} not found.` }

  const openUse = data.invoices.filter((i) => i.status === 'OPEN' && i.lines.some((l) => l.partNo === partNo))
  if (openUse.length > 0) {
    return { ok: false, message: `${partNo} is on ${openUse.length} open invoice(s). Settle or delete those first.` }
  }

  return {
    ok: true,
    data: logAudit({ ...data, parts: data.parts.filter((p) => p.partNo !== partNo) }, session, 'PART_DELETE', `${partNo} ${part.description} deleted`),
  }
}

// -------------------------------------------------------------------- users

export type UserDraft = User

export function addUser(data: AppData, session: Session, draft: UserDraft): SimpleOutcome {
  if (!can(session.role, 'user.manage')) return { ok: false, message: 'Only an administrator may manage user accounts.' }
  const username = draft.username.trim().toUpperCase()
  if (!username || !draft.password.trim()) return { ok: false, message: 'Username and password are required.' }
  if (data.users.some((u) => u.username === username)) return { ok: false, message: `User ${username} already exists.` }
  if (draft.password.length < 8) return { ok: false, message: 'Password must be at least 8 characters.' }

  return {
    ok: true,
    data: logAudit(
      { ...data, users: [...data.users, { ...draft, username }] },
      session,
      'USER_ADD',
      `${username} (${draft.role}, active ${draft.active ? 'Y' : 'N'})`,
    ),
  }
}

export function updateUser(
  data: AppData,
  session: Session,
  username: string,
  draft: { fullName: string; role: User['role']; active: boolean; password?: string },
): SimpleOutcome {
  if (!can(session.role, 'user.manage')) return { ok: false, message: 'Only an administrator may manage user accounts.' }
  const existing = data.users.find((u) => u.username === username)
  if (!existing) return { ok: false, message: `User ${username} not found.` }
  if (draft.password !== undefined && draft.password.length > 0 && draft.password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' }
  }
  if (username === session.username && (!draft.active || draft.role !== 'ADMIN')) {
    return { ok: false, message: 'You cannot deactivate or demote the account you are signed in with.' }
  }

  const changes: string[] = []
  if (draft.fullName !== existing.fullName) changes.push(`fullName: ${existing.fullName} → ${draft.fullName}`)
  if (draft.role !== existing.role) changes.push(`role: ${existing.role} → ${draft.role}`)
  if (draft.active !== existing.active) changes.push(`active: ${existing.active ? 'Y' : 'N'} → ${draft.active ? 'Y' : 'N'}`)
  if (draft.password) changes.push('password reset')

  return {
    ok: true,
    data: logAudit(
      {
        ...data,
        users: data.users.map((u) =>
          u.username === username
            ? { ...u, fullName: draft.fullName, role: draft.role, active: draft.active, password: draft.password || u.password }
            : u,
        ),
      },
      session,
      'USER_UPDATE',
      `${username}: ${changes.length ? changes.join('; ') : 'no changes'}`,
    ),
  }
}

export function deleteUser(data: AppData, session: Session, username: string): SimpleOutcome {
  if (!can(session.role, 'user.manage')) return { ok: false, message: 'Only an administrator may manage user accounts.' }
  if (username === session.username) return { ok: false, message: 'You cannot delete the account you are signed in with.' }
  const user = data.users.find((u) => u.username === username)
  if (!user) return { ok: false, message: `User ${username} not found.` }
  if (user.role === 'ADMIN' && data.users.filter((u) => u.role === 'ADMIN' && u.active).length <= 1) {
    return { ok: false, message: 'There must be at least one active administrator.' }
  }

  return {
    ok: true,
    data: logAudit({ ...data, users: data.users.filter((u) => u.username !== username) }, session, 'USER_DELETE', `${username} (${user.role}) deleted`),
  }
}
