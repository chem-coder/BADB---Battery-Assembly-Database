/**
 * Pure SOH / capacity-retention math for the protocol comparison chart.
 *
 * Extracted from CyclingSohChart.vue so it can be unit-tested and reused.
 * Verified against the colleague Excel (max |Δ SOH| = 0.0000 % over 16 712
 * points across 7 protocols and both sheet layouts).
 *
 *   SOH(n) = DChg.Cap(n) / DChg.Cap(baseline) × 100 %
 *
 * baseline = discharge capacity at the first valid cycle strictly after the
 * (optional) formation exclusion. "Valid" = finite and > 0.
 */

/**
 * Per-cell series for the active metric.
 * @param {Array<{cycle_number:number, discharge_capacity_ah:number}>} rows
 * @param {{formationExclude?:number, metric?:'soh'|'capacity'}} opts
 * @returns {Array<{x:number, y:number}>}  empty if no valid data / baseline
 */
export function cellSohSeries(rows, { formationExclude = 0, metric = 'soh' } = {}) {
  const filtered = (rows || [])
    .filter(r => Number(r.cycle_number) > formationExclude)
    .sort((a, b) => Number(a.cycle_number) - Number(b.cycle_number))
  const pts = []
  let baseline = null
  for (const r of filtered) {
    const c = Number(r.discharge_capacity_ah)
    if (Number.isFinite(c) && c > 0) {
      if (baseline === null) baseline = c
      pts.push({ cyc: Number(r.cycle_number), cap: c })
    }
  }
  if (metric === 'soh') {
    if (!baseline) return []
    return pts.map(p => ({ x: p.cyc, y: (p.cap / baseline) * 100 }))
  }
  return pts.map(p => ({ x: p.cyc, y: p.cap }))
}

/**
 * Mean ± σ across multiple cell series, indexed by cycle number.
 *
 * Cycles where fewer than `minCoverage` cells contribute are dropped. This
 * matters because cells in a protocol have different lifetimes: at high
 * cycles only the longest-lived cells remain, so an untrimmed mean is
 * survivorship-biased upward and its σ collapses. Trimming keeps the mean
 * honest — it simply ends where the cohort thins out.
 *
 * @param {Array<Array<{x:number,y:number}>>} seriesList
 * @param {{minCoverage?:number}} opts
 * @returns {{mean:Array<{x,y,n}>, upper:Array<{x,y}>, lower:Array<{x,y}>, maxN:number, minN:number, droppedTail:number}}
 */
export function protocolMeanStd(seriesList, { minCoverage = 1 } = {}) {
  const byCycle = new Map()
  for (const series of seriesList) {
    for (const p of series) {
      if (!byCycle.has(p.x)) byCycle.set(p.x, [])
      byCycle.get(p.x).push(p.y)
    }
  }
  const cycles = [...byCycle.keys()].sort((a, b) => a - b)
  const mean = [], upper = [], lower = []
  let maxN = 0, minN = Infinity, dropped = 0
  for (const cyc of cycles) {
    const vals = byCycle.get(cyc)
    if (vals.length < minCoverage) { dropped++; continue }
    const m = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = vals.length > 1
      ? Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1))
      : 0
    mean.push({ x: cyc, y: m, n: vals.length })
    upper.push({ x: cyc, y: m + sd })
    lower.push({ x: cyc, y: m - sd })
    if (vals.length > maxN) maxN = vals.length
    if (vals.length < minN) minN = vals.length
  }
  return { mean, upper, lower, maxN, minN: minN === Infinity ? 0 : minN, droppedTail: dropped }
}

/**
 * First cycle whose value drops below `threshold` (for SOH EOL readout).
 * @returns {number|null} cycle number, or null if never crossed
 */
export function cyclesToThreshold(meanSeries, threshold) {
  for (const p of meanSeries) {
    if (p.y < threshold) return p.x
  }
  return null
}
