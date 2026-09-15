// Same seed data the legacy DataManager.SeedData() wrote on first run, typed.
// Dates converted to ISO so they sort and parse the same on every machine.

import { round2 } from '../domain/money'
import type { AppData, Customer, Invoice, Part, User } from '../domain/types'

export const DATA_VERSION = 1

const customers: Customer[] = [
  { id: 'C-1001', name: 'Hendricks Farm Supply', phone: '555-201-4432', email: 'orders@hendricksfarm.com', address: '1240 County Rd 9', city: 'Cedar Falls', state: 'IA', zip: '50613', balance: 0, createdDate: '2019-01-14', type: 'WHOLESALE', creditLimit: 10000, taxExempt: true },
  { id: 'C-1002', name: 'Miller & Sons Excavating', phone: '555-847-2210', email: 'jmiller@millersons.com', address: '88 Quarry Rd', city: 'Waterloo', state: 'IA', zip: '50701', balance: 140.28, createdDate: '2020-03-02', type: 'FLEET', creditLimit: 7500, taxExempt: false },
  { id: 'C-1003', name: 'Bluestem Landscaping LLC', phone: '555-310-9987', email: 'kate@bluestemlandscape.com', address: '410 Prairie View Dr', city: 'Ames', state: 'IA', zip: '50010', balance: 0, createdDate: '2021-07-22', type: 'RETAIL', creditLimit: 2500, taxExempt: false },
  { id: 'C-1004', name: 'Tri-County Rental Center', phone: '555-664-0031', email: 'service@tricountyrental.com', address: '2205 Industrial Pkwy', city: 'Marshalltown', state: 'IA', zip: '50158', balance: 280.64, createdDate: '2018-11-09', type: 'WHOLESALE', creditLimit: 5000, taxExempt: false },
  { id: 'C-1005', name: 'Vandermeer Dairy', phone: '555-772-5540', email: 'hans@vandermeerdairy.com', address: '3316 320th St', city: 'Pella', state: 'IA', zip: '50219', balance: 0, createdDate: '2022-05-30', type: 'FLEET', creditLimit: 5000, taxExempt: true },
  { id: 'C-1006', name: 'Ridgeline Construction', phone: '555-458-8812', email: 'po@ridgelineconst.com', address: '77 Summit Ave', city: 'Des Moines', state: 'IA', zip: '50309', balance: 88.99, createdDate: '2023-02-17', type: 'RETAIL', creditLimit: 2500, taxExempt: false },
  { id: 'C-1007', name: 'Oak Grove Golf Course', phone: '555-233-7645', email: 'maint@oakgrovegolf.com', address: '1500 Fairway Ln', city: 'Ankeny', state: 'IA', zip: '50023', balance: 0, createdDate: '2020-08-04', type: 'FLEET', creditLimit: 4000, taxExempt: false },
  { id: 'C-1008', name: "Sandy's Small Engine Repair", phone: '555-909-1123', email: 'sandy@sandysrepair.com', address: '214 Main St', city: 'Grinnell', state: 'IA', zip: '50112', balance: 0, createdDate: '2024-04-01', type: 'RETAIL', creditLimit: 500, taxExempt: false },
]

const parts: Part[] = [
  { partNo: 'P-1001', description: 'Oil Filter - Heavy Duty', category: 'FILTERS', qtyOnHand: 42, cost: 8.5, price: 19.95, vendor: 'NAPA' },
  { partNo: 'P-1002', description: 'Air Filter - Round', category: 'FILTERS', qtyOnHand: 17, cost: 12.25, price: 28.5, vendor: 'NAPA' },
  { partNo: 'P-1003', description: 'Hydraulic Fluid 5 Gal', category: 'FLUIDS', qtyOnHand: 23, cost: 38, price: 74.99, vendor: 'Shell' },
  { partNo: 'P-1004', description: 'Engine Oil 15W40 Case', category: 'FLUIDS', qtyOnHand: 54, cost: 41, price: 89.99, vendor: 'Shell' },
  { partNo: 'P-1005', description: 'Drive Belt 48in', category: 'BELTS', qtyOnHand: 6, cost: 15.75, price: 34.95, vendor: 'Gates' },
  { partNo: 'P-1006', description: 'Alternator 12V 95A', category: 'ELECTRICAL', qtyOnHand: 4, cost: 118, price: 249, vendor: 'Denso' },
  { partNo: 'P-1007', description: 'Battery 950CCA', category: 'ELECTRICAL', qtyOnHand: 10, cost: 89.5, price: 189.95, vendor: 'Interstate' },
  { partNo: 'P-1008', description: 'Spark Plug Set (8pc)', category: 'IGNITION', qtyOnHand: 30, cost: 22, price: 49.95, vendor: 'NGK' },
  { partNo: 'P-1009', description: 'Brake Pad Kit - Front', category: 'BRAKES', qtyOnHand: 14, cost: 34.25, price: 79.95, vendor: 'Bendix' },
  { partNo: 'P-1010', description: 'Grease Cartridge 14oz', category: 'FLUIDS', qtyOnHand: 91, cost: 3.1, price: 7.49, vendor: 'Lucas' },
  { partNo: 'P-1011', description: 'Work Light LED 24W', category: 'ACCESSORIES', qtyOnHand: 5, cost: 19.8, price: 44.95, vendor: 'Grote' },
  { partNo: 'P-1012', description: 'Tire 26x12-12 Turf', category: 'TIRES', qtyOnHand: 3, cost: 92, price: 179, vendor: 'Carlisle' },
  { partNo: 'P-1013', description: 'Diesel Exhaust Fluid 2.5 Gal', category: 'FLUIDS', qtyOnHand: 28, cost: 12.5, price: 13.99, vendor: 'PeakBlue' },
]

const invoices: Invoice[] = [
  {
    invoiceNo: 'INV-1001',
    customerId: 'C-1002',
    date: '2026-06-12',
    subtotal: 129.89,
    discount: 0,
    surcharge: 0,
    tax: 10.39,
    total: 140.28,
    status: 'OPEN',
    lines: [
      { partNo: 'P-1001', description: 'Oil Filter - Heavy Duty', qty: 2, unitPrice: 19.95, lineTotal: 39.9 },
      { partNo: 'P-1004', description: 'Engine Oil 15W40 Case', qty: 1, unitPrice: 89.99, lineTotal: 89.99 },
    ],
  },
  {
    invoiceNo: 'INV-1002',
    customerId: 'C-1004',
    date: '2026-07-03',
    subtotal: 259.85,
    discount: 0,
    surcharge: 0,
    tax: 20.79,
    total: 280.64,
    status: 'OPEN',
    lines: [
      { partNo: 'P-1007', description: 'Battery 950CCA', qty: 1, unitPrice: 189.95, lineTotal: 189.95 },
      { partNo: 'P-1005', description: 'Drive Belt 48in', qty: 2, unitPrice: 34.95, lineTotal: 69.9 },
    ],
  },
  {
    invoiceNo: 'INV-1003',
    customerId: 'C-1006',
    date: '2026-07-18',
    subtotal: 82.4,
    discount: 0,
    surcharge: 0,
    tax: 6.59,
    total: 88.99,
    status: 'OPEN',
    lines: [
      { partNo: 'P-1010', description: 'Grease Cartridge 14oz', qty: 5, unitPrice: 7.49, lineTotal: 37.45 },
      { partNo: 'P-1011', description: 'Work Light LED 24W', qty: 1, unitPrice: 44.95, lineTotal: 44.95 },
    ],
  },
]

// Same accounts as the legacy seed. RICK is deactivated and — unlike the legacy
// login screen — genuinely cannot log in (§10).
const users: User[] = [
  { username: 'ADMIN', password: 'admin', fullName: 'System Administrator', role: 'ADMIN', active: true },
  { username: 'MARGE', password: 'marge2006', fullName: 'Marge Kowalski', role: 'MANAGER', active: true },
  { username: 'COUNTER1', password: 'counter1', fullName: 'Denny Pratt', role: 'CLERK', active: true },
  { username: 'COUNTER2', password: '1234', fullName: 'Lisa Trinh', role: 'CLERK', active: true },
  { username: 'RICK', password: 'rick2009', fullName: 'Rick Kowalski', role: 'ADMIN', active: false },
]

function highestSeq(ids: string[], prefix: string, floor: number): number {
  return ids.reduce((max, id) => {
    const n = parseInt(id.replace(prefix, ''), 10)
    return Number.isFinite(n) && n > max ? n : max
  }, floor)
}

export function createSeedData(): AppData {
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
  return {
    version: DATA_VERSION,
    customers: clone(customers),
    parts: clone(parts),
    invoices: clone(invoices),
    users: clone(users),
    audit: [],
    seq: {
      customer: highestSeq(customers.map((c) => c.id), 'C-', 1000),
      invoice: highestSeq(invoices.map((i) => i.invoiceNo), 'INV-', 1000),
      audit: 0,
    },
  }
}

/** §2 — a customer's balance is the sum of their OPEN invoice totals plus late
 *  fees charged. Used by the integrity check on the dashboard. */
export function expectedBalance(customerId: string, invoices: Invoice[]): number {
  return round2(
    invoices
      .filter((i) => i.customerId === customerId)
      .reduce(
        (sum, i) => sum + (i.status === 'OPEN' ? i.total : 0) + (i.lateFee ?? 0),
        0,
      ),
  )
}
