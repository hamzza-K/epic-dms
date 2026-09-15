// Typed domain model. Replaces the legacy `ArrayList` of `string[]` records
// (DataManager.cs) where column position was the only schema.

export type CustomerType = 'RETAIL' | 'WHOLESALE' | 'FLEET'
export type Role = 'CLERK' | 'MANAGER' | 'ADMIN'
export type InvoiceStatus = 'OPEN' | 'PAID'

export const CUSTOMER_TYPES: CustomerType[] = ['RETAIL', 'WHOLESALE', 'FLEET']
export const ROLES: Role[] = ['CLERK', 'MANAGER', 'ADMIN']
export const CATEGORIES = [
  'FILTERS',
  'FLUIDS',
  'BELTS',
  'ELECTRICAL',
  'IGNITION',
  'BRAKES',
  'TIRES',
  'ACCESSORIES',
] as const

export interface Customer {
  id: string
  name: string
  phone: string
  email: string
  address: string
  city: string
  state: string
  zip: string
  /** What the account currently owes. Derived from invoice activity — never typed in. */
  balance: number
  createdDate: string
  type: CustomerType
  creditLimit: number
  taxExempt: boolean
}

export interface Part {
  partNo: string
  description: string
  category: string
  qtyOnHand: number
  /** What we pay. Floor for FLEET pricing (BUSINESS_RULES §5). */
  cost: number
  /** List price — what RETAIL pays. */
  price: number
  vendor: string
}

export interface InvoiceLine {
  partNo: string
  description: string
  qty: number
  /** Price locked in at save time for the customer on the invoice (§5). */
  unitPrice: number
  lineTotal: number
}

export interface Invoice {
  invoiceNo: string
  customerId: string
  /** ISO yyyy-mm-dd. */
  date: string
  subtotal: number
  discount: number
  surcharge: number
  tax: number
  total: number
  status: InvoiceStatus
  lines: InvoiceLine[]
  paidDate?: string
  /** Late fee charged when this invoice was marked paid (§9). */
  lateFee?: number
}

export interface User {
  username: string
  password: string
  fullName: string
  role: Role
  active: boolean
}

export type AuditAction =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT'
  | 'CUSTOMER_ADD'
  | 'CUSTOMER_UPDATE'
  | 'CUSTOMER_DELETE'
  | 'PART_ADD'
  | 'PART_UPDATE'
  | 'PART_DELETE'
  | 'STOCK_RECEIVE'
  | 'STOCK_CONSUME'
  | 'STOCK_RESTORE'
  | 'BALANCE_CHANGE'
  | 'INVOICE_SAVE'
  | 'INVOICE_PAID'
  | 'INVOICE_DELETE'
  | 'LATE_FEE'
  | 'CREDIT_OVERRIDE'
  | 'CREDIT_BLOCKED'
  | 'USER_ADD'
  | 'USER_UPDATE'
  | 'USER_DELETE'
  | 'PERMISSION_DENIED'

export interface AuditEntry {
  id: number
  /** ISO timestamp. */
  at: string
  user: string
  action: AuditAction
  detail: string
}

/** Whole application state — the thing that gets persisted. */
export interface AppData {
  version: number
  customers: Customer[]
  parts: Part[]
  invoices: Invoice[]
  users: User[]
  audit: AuditEntry[]
  /** Monotonic counters so IDs are never reused, even after a delete (§2, §4). */
  seq: { customer: number; invoice: number; audit: number }
}

export interface Session {
  username: string
  fullName: string
  role: Role
}
