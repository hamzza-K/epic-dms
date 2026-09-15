// Persistence. The legacy app wrote five comma-joined CSV files and swallowed
// every exception; a stray comma in a customer name silently shifted every
// column after it. Here the store of record is a single validated JSON document
// in localStorage, and CSV is an export format with proper quoting.

import { createSeedData, DATA_VERSION } from './seed'
import type { AppData } from '../domain/types'

const STORAGE_KEY = 'apex-dms:data:v1'

export interface LoadResult {
  data: AppData
  /** Set when stored data was unusable and the seed was used instead. */
  warning?: string
}

/** Refuse bad data rather than carrying on with half of it. */
function validate(value: unknown): AppData {
  if (typeof value !== 'object' || value === null) throw new Error('not an object')
  const d = value as Partial<AppData>
  const arrays: (keyof AppData)[] = ['customers', 'parts', 'invoices', 'users', 'audit']
  for (const key of arrays) {
    if (!Array.isArray(d[key])) throw new Error(`missing or malformed "${String(key)}"`)
  }
  if (!d.seq || typeof d.seq.customer !== 'number' || typeof d.seq.invoice !== 'number') {
    throw new Error('missing id sequence')
  }
  if (d.version !== DATA_VERSION) throw new Error(`unsupported data version ${String(d.version)}`)
  if (typeof d.seq.audit !== 'number') d.seq.audit = d.audit!.length
  return d as AppData
}

export function load(): LoadResult {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return { data: createSeedData(), warning: 'Browser storage is unavailable — changes will not persist.' }
  }

  if (!raw) return { data: createSeedData() }

  try {
    return { data: validate(JSON.parse(raw)) }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return {
      data: createSeedData(),
      warning: `Stored data could not be read (${reason}). Started from seed data instead; the damaged copy is kept under "${STORAGE_KEY}.broken".`,
    }
  }
}

export function save(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Quota or private mode. Nothing useful to do here — the UI already shows
    // a storage warning when load() could not reach localStorage.
  }
}

export function quarantine(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) localStorage.setItem(`${STORAGE_KEY}.broken`, raw)
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function reset(): AppData {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  return createSeedData()
}

// ---------------------------------------------------------------- CSV export
// Column order matches the legacy files so the nightly export job on APEXSRV02
// keeps working — but values are RFC-4180 quoted instead of having their commas
// stripped out (legacy `Utils.Clean`).

function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n')
}

export function exportCsvFiles(data: AppData): Record<string, string> {
  return {
    'customers.csv': toCsv(
      ['ID', 'Name', 'Phone', 'Email', 'Address', 'City', 'State', 'Zip', 'Balance', 'CreatedDate', 'Type', 'CreditLimit', 'TaxExempt'],
      data.customers.map((c) => [c.id, c.name, c.phone, c.email, c.address, c.city, c.state, c.zip, c.balance.toFixed(2), c.createdDate, c.type, c.creditLimit, c.taxExempt ? 'Y' : 'N']),
    ),
    'inventory.csv': toCsv(
      ['PartNo', 'Description', 'Category', 'QtyOnHand', 'Cost', 'Price', 'Vendor'],
      data.parts.map((p) => [p.partNo, p.description, p.category, p.qtyOnHand, p.cost, p.price, p.vendor]),
    ),
    // The first seven columns are the legacy layout, in the legacy order, so the
    // nightly export job on APEXSRV02 keeps parsing by position. Discount,
    // surcharge and late fee are appended after them.
    'invoices.csv': toCsv(
      ['InvoiceNo', 'CustomerID', 'Date', 'Subtotal', 'Tax', 'Total', 'Status', 'Discount', 'Surcharge', 'LateFee'],
      data.invoices.map((i) => [i.invoiceNo, i.customerId, i.date, i.subtotal.toFixed(2), i.tax.toFixed(2), i.total.toFixed(2), i.status, i.discount.toFixed(2), i.surcharge.toFixed(2), (i.lateFee ?? 0).toFixed(2)]),
    ),
    'invoicelines.csv': toCsv(
      ['InvoiceNo', 'PartNo', 'Description', 'Qty', 'Price', 'LineTotal'],
      data.invoices.flatMap((i) => i.lines.map((l) => [i.invoiceNo, l.partNo, l.description, l.qty, l.unitPrice.toFixed(2), l.lineTotal.toFixed(2)])),
    ),
    'users.csv': toCsv(
      ['Username', 'FullName', 'Role', 'Active'],
      data.users.map((u) => [u.username, u.fullName, u.role, u.active ? 'Y' : 'N']),
    ),
    'audit.csv': toCsv(
      ['Id', 'Timestamp', 'User', 'Action', 'Detail'],
      data.audit.map((a) => [a.id, a.at, a.user, a.action, a.detail]),
    ),
  }
}
