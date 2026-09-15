import { describe, expect, it } from 'vitest'
import { createSeedData } from '../../data/seed'
import { computeTotals, hasFluids, lateFeeFor, monthsLate, unitPriceFor, volumeDiscount } from '../pricing'
import { priceDraft } from '../invoiceService'
import type { CustomerType, Part } from '../types'

const data = createSeedData()
const part = (no: string): Part => data.parts.find((p) => p.partNo === no)!

const HYDRAULIC = part('P-1003') // FLUIDS, list 74.99, cost 38
const BATTERY = part('P-1007') // ELECTRICAL, list 189.95, cost 89.50
const TIRE = part('P-1012') // TIRES, list 179, cost 92

describe('§5 unit pricing', () => {
  it('RETAIL pays list', () => {
    expect(unitPriceFor(HYDRAULIC, 'RETAIL')).toBe(74.99)
  })

  it('adds a $10/unit core charge on ELECTRICAL', () => {
    expect(unitPriceFor(BATTERY, 'RETAIL')).toBe(199.95)
  })

  it('takes 12% off list for WHOLESALE', () => {
    expect(unitPriceFor(HYDRAULIC, 'WHOLESALE')).toBe(65.99) // 74.99 * 0.88 = 65.9912
  })

  it('applies the core charge before the customer-type discount', () => {
    // (189.95 + 10) * 0.88 = 175.956 → 175.96, not 189.95 * 0.88 + 10 = 177.16
    expect(unitPriceFor(BATTERY, 'WHOLESALE')).toBe(175.96)
  })

  it('takes 20% off list for FLEET', () => {
    expect(unitPriceFor(HYDRAULIC, 'FLEET')).toBe(59.99) // 74.99 * 0.80 = 59.992
  })

  it('never lets FLEET drop below cost + 10%', () => {
    // 179 * 0.80 = 143.20, floor is 92 * 1.10 = 101.20 → discount wins
    expect(unitPriceFor(TIRE, 'FLEET')).toBe(143.2)

    const thinMargin: Part = { ...TIRE, price: 100, cost: 95 }
    // 100 * 0.80 = 80, floor 95 * 1.10 = 104.50 → floor wins
    expect(unitPriceFor(thinMargin, 'FLEET')).toBe(104.5)
  })
})

describe('§6.1 volume discount', () => {
  it('gives nothing at or below $500', () => {
    expect(volumeDiscount(500, 'RETAIL')).toBe(0)
    expect(volumeDiscount(500.01, 'RETAIL')).toBeGreaterThan(0)
  })

  it('gives 5% over $500', () => {
    expect(volumeDiscount(699.86, 'RETAIL')).toBe(34.99)
  })

  // The legacy code tested `> 500` first, so the 10% tier was dead code.
  it('gives 10% over $1,000', () => {
    expect(volumeDiscount(1200, 'RETAIL')).toBe(120)
    expect(volumeDiscount(1000.01, 'RETAIL')).toBeCloseTo(100, 2)
  })

  it('gives WHOLESALE no volume discount at any subtotal', () => {
    expect(volumeDiscount(699.86, 'WHOLESALE')).toBe(0)
    expect(volumeDiscount(5000, 'WHOLESALE')).toBe(0)
  })
})

describe('§6 worked example from BUSINESS_RULES.md', () => {
  const draft = [
    { partNo: 'P-1003', qty: 4 }, // Hydraulic Fluid 5 Gal, FLUIDS
    { partNo: 'P-1007', qty: 2 }, // Battery 950CCA, ELECTRICAL
  ]

  function run(type: CustomerType, taxExempt: boolean) {
    const lines = priceDraft(draft, data.parts, type)
    return { lines, totals: computeTotals(lines, { type, taxExempt }, hasFluids(lines, data.parts)) }
  }

  it('matches the documented RETAIL total to the cent', () => {
    const { lines, totals } = run('RETAIL', false)
    expect(lines[0].lineTotal).toBe(299.96)
    expect(lines[1].lineTotal).toBe(399.9)
    expect(totals).toEqual({
      subtotal: 699.86,
      discount: 34.99,
      surcharge: 19.95,
      tax: 54.79,
      total: 739.61,
    })
  })

  it('gives the same order no volume discount for WHOLESALE', () => {
    const { lines, totals } = run('WHOLESALE', false)
    // 74.99 * 0.88 = 65.99 × 4 = 263.96; (189.95 + 10) * 0.88 = 175.96 × 2 = 351.92
    expect(lines.map((l) => l.lineTotal)).toEqual([263.96, 351.92])
    expect(totals.subtotal).toBe(615.88)
    expect(totals.discount).toBe(0)
    expect(totals.surcharge).toBe(18.48) // 3% of 615.88
    expect(totals.tax).toBe(50.75) // 8% of 634.36
    expect(totals.total).toBe(685.11)
  })

  it('charges no tax for a tax-exempt customer', () => {
    const { totals } = run('RETAIL', true)
    expect(totals.tax).toBe(0)
    expect(totals.total).toBe(684.82) // 699.86 - 34.99 + 19.95
  })
})

describe('§6.2 fuel surcharge', () => {
  it('is charged only when a FLUIDS line is present', () => {
    const withFluid = priceDraft([{ partNo: 'P-1003', qty: 1 }], data.parts, 'RETAIL')
    const withoutFluid = priceDraft([{ partNo: 'P-1012', qty: 1 }], data.parts, 'RETAIL')
    expect(hasFluids(withFluid, data.parts)).toBe(true)
    expect(hasFluids(withoutFluid, data.parts)).toBe(false)
    expect(computeTotals(withoutFluid, { type: 'RETAIL', taxExempt: false }, false).surcharge).toBe(0)
  })

  it('is charged on the subtotal after the discount, and tax comes after it', () => {
    const lines = priceDraft([{ partNo: 'P-1003', qty: 10 }], data.parts, 'RETAIL')
    const t = computeTotals(lines, { type: 'RETAIL', taxExempt: false }, true)
    expect(t.subtotal).toBe(749.9)
    expect(t.discount).toBe(37.5) // 5%, rounded from 37.495
    expect(t.surcharge).toBe(21.37) // 3% of 712.40
    expect(t.tax).toBe(58.7) // 8% of 733.77
    expect(t.total).toBe(792.47)
  })
})

describe('§9 late fees', () => {
  const invoiceDate = '2026-01-01'

  it('charges nothing inside net-30 terms', () => {
    expect(monthsLate(invoiceDate, new Date('2026-01-31T00:00:00'))).toBe(0)
    expect(lateFeeFor(1000, invoiceDate, new Date('2026-01-31T00:00:00'))).toBe(0)
  })

  it('charges 1.5% per full 30-day month once past terms', () => {
    expect(lateFeeFor(1000, invoiceDate, new Date('2026-02-05T00:00:00'))).toBe(15) // 35 days → 1 month
    expect(lateFeeFor(1000, invoiceDate, new Date('2026-03-05T00:00:00'))).toBe(30) // 63 days → 2 months
    expect(lateFeeFor(739.61, invoiceDate, new Date('2026-02-05T00:00:00'))).toBe(11.09)
  })

  it('ignores an unparseable invoice date rather than guessing', () => {
    expect(lateFeeFor(1000, 'not-a-date', new Date('2027-01-01T00:00:00'))).toBe(0)
  })
})
