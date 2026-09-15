/** Round to the cent, half away from zero.
 *
 *  A percentage of a price rarely lands exactly on a float: 749.9 × 0.05 is
 *  37.494999999999997, not 37.495, so a plain Math.round gives 37.49 where a
 *  cash register gives 37.50. The relative nudge below (1e-12 of the value —
 *  many orders of magnitude smaller than a cent, far larger than the
 *  representation error) closes that gap without moving any genuine amount. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  const nudge = Math.abs(n) * 1e-12 || Number.EPSILON
  const scaled = (Math.abs(n) + nudge) * 100
  return (Math.sign(n) * Math.round(scaled)) / 100
}

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Always two decimals — the legacy `Utils.Money` printed "$140.3". */
export function money(n: number): string {
  return fmt.format(round2(n))
}

export function amount(n: number): string {
  return round2(n).toFixed(2)
}

/** Parse user input. Culture-invariant, like the legacy `Utils.ToDbl`. */
export function toNumber(s: string, fallback = 0): number {
  const n = Number(String(s).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : fallback
}

export function toInt(s: string, fallback = 0): number {
  const n = parseInt(String(s).trim(), 10)
  return Number.isFinite(n) ? n : fallback
}
