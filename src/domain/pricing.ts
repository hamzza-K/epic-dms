// Pricing, discounts, surcharge, tax and late fees — BUSINESS_RULES.md §5–§9.
// Pure functions, no UI, no I/O. This is the only place these numbers live.

import { round2 } from './money'
import type { Customer, CustomerType, InvoiceLine, Part } from './types'

/** §7 — there is exactly one tax rate in the system. */
export const TAX_RATE = 0.08
/** §5.2 — state environmental charge on ELECTRICAL parts, per unit. */
export const CORE_CHARGE = 10
/** §6.2 — charged when any FLUIDS line is on the ticket. */
export const FUEL_SURCHARGE_RATE = 0.03
/** §5.3 — FLEET price never drops below cost + 10%. */
export const FLEET_COST_FLOOR_MULTIPLIER = 1.1
/** §9 — net 30 terms, then 1.5% of the total per full 30-day month late. */
export const PAYMENT_TERMS_DAYS = 30
export const LATE_FEE_RATE_PER_MONTH = 0.015

export const CORE_CHARGE_CATEGORY = 'ELECTRICAL'
export const SURCHARGE_CATEGORY = 'FLUIDS'

/** §5 — unit price for one line, given the part and the customer's type. */
export function unitPriceFor(part: Part, customerType: CustomerType): number {
  let price = part.price

  if (part.category === CORE_CHARGE_CATEGORY) {
    price += CORE_CHARGE
  }

  if (customerType === 'WHOLESALE') {
    price *= 0.88
  } else if (customerType === 'FLEET') {
    price *= 0.8
    const floor = part.cost * FLEET_COST_FLOOR_MULTIPLIER
    if (price < floor) price = floor
  }

  return round2(price)
}

export function priceLine(part: Part, qty: number, customerType: CustomerType): InvoiceLine {
  const unitPrice = unitPriceFor(part, customerType)
  return {
    partNo: part.partNo,
    description: part.description,
    qty,
    unitPrice,
    lineTotal: round2(qty * unitPrice),
  }
}

/** §6 — volume discount on the subtotal. WHOLESALE gets none. */
export function volumeDiscount(subtotal: number, customerType: CustomerType): number {
  if (customerType === 'WHOLESALE') return 0
  if (subtotal > 1000) return round2(subtotal * 0.1)
  if (subtotal > 500) return round2(subtotal * 0.05)
  return 0
}

export interface InvoiceTotals {
  subtotal: number
  discount: number
  surcharge: number
  tax: number
  total: number
}

export interface PricingContext {
  type: CustomerType
  taxExempt: boolean
}

export function contextFor(customer: Customer): PricingContext {
  return { type: customer.type, taxExempt: customer.taxExempt }
}

/** §6 — totals, in order of operations, rounded to the cent at each step. */
export function computeTotals(
  lines: InvoiceLine[],
  ctx: PricingContext,
  hasSurchargeCategory: boolean,
): InvoiceTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0))
  const discount = volumeDiscount(subtotal, ctx.type)
  const surcharge = hasSurchargeCategory ? round2((subtotal - discount) * FUEL_SURCHARGE_RATE) : 0
  const tax = ctx.taxExempt ? 0 : round2((subtotal - discount + surcharge) * TAX_RATE)
  const total = round2(subtotal - discount + surcharge + tax)
  return { subtotal, discount, surcharge, tax, total }
}

/** Does this set of lines trigger the fuel surcharge? */
export function hasFluids(lines: InvoiceLine[], parts: Part[]): boolean {
  return lines.some((l) => {
    const part = parts.find((p) => p.partNo === l.partNo)
    return part?.category === SURCHARGE_CATEGORY
  })
}

/** §9 — whole 30-day months past the invoice date, 0 when within terms. */
export function monthsLate(invoiceDate: string, paidOn: Date): number {
  const start = new Date(`${invoiceDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return 0
  const days = Math.floor((paidOn.getTime() - start.getTime()) / 86_400_000)
  if (days <= PAYMENT_TERMS_DAYS) return 0
  return Math.floor(days / PAYMENT_TERMS_DAYS)
}

/** §9 — 1.5% of the invoice total per full 30-day month late. */
export function lateFeeFor(invoiceTotal: number, invoiceDate: string, paidOn: Date): number {
  const months = monthsLate(invoiceDate, paidOn)
  if (months === 0) return 0
  return round2(invoiceTotal * LATE_FEE_RATE_PER_MONTH * months)
}
