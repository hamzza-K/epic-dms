// BUSINESS_RULES.md §10 — one permission matrix, consulted from every screen.
// The legacy app scattered `if (Globals.CurrentUserRole == "CLERK")` checks
// across four forms and disagreed with itself; this table is the single source.

import type { Role } from './types'

export type Permission =
  | 'view'
  | 'customer.edit'
  | 'customer.delete'
  | 'part.edit'
  | 'stock.receive'
  | 'invoice.create'
  | 'invoice.creditOverride'
  | 'invoice.markPaid'
  | 'invoice.delete'
  | 'user.manage'

const MATRIX: Record<Permission, Role[]> = {
  view: ['CLERK', 'MANAGER', 'ADMIN'],
  'customer.edit': ['CLERK', 'MANAGER', 'ADMIN'],
  'customer.delete': ['MANAGER', 'ADMIN'],
  'part.edit': ['MANAGER', 'ADMIN'],
  'stock.receive': ['CLERK', 'MANAGER', 'ADMIN'],
  'invoice.create': ['CLERK', 'MANAGER', 'ADMIN'],
  'invoice.creditOverride': ['MANAGER', 'ADMIN'],
  'invoice.markPaid': ['CLERK', 'MANAGER', 'ADMIN'],
  'invoice.delete': ['ADMIN'],
  'user.manage': ['ADMIN'],
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  view: 'View customers / inventory / invoices',
  'customer.edit': 'Add / edit customers',
  'customer.delete': 'Delete customers',
  'part.edit': 'Add / edit / delete parts (incl. prices)',
  'stock.receive': 'Receive stock',
  'invoice.create': 'Create invoices',
  'invoice.creditOverride': 'Override a credit-limit block',
  'invoice.markPaid': 'Mark invoices paid',
  'invoice.delete': 'Delete invoices',
  'user.manage': 'Manage user accounts',
}

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false
  return MATRIX[permission].includes(role)
}
