/**
 * savitzkyGolay.js — Savitzky–Golay filtering + navani-style dQ/dV pipeline.
 *
 * Mirrors navani's dqdv_single_cycle (be-smith/navani, src/navani/echem.py):
 *   1. average capacity over duplicate voltages, sort ascending   (groupby V → mean)
 *   2. uniform voltage grid over [Vmin, Vmax]                     (np.linspace, 1e4)
 *   3. linear interpolation of Q onto the grid                    (splrep k=1, s=0)
 *   4. Savitzky–Golay smooth of Q          — window₁, polyorder 5 (savgol_filter 101)
 *   5. derivative dQ/dV on the grid                               (spline der=1)
 *   6. Savitzky–Golay smooth of dQ/dV      — window₂, polyorder 5 (savgol_filter 1001)
 *
 * Differences from navani (deliberate, validated numerically):
 *   - Step 5 uses an SG derivative (deriv=1) instead of a FITPACK smoothing
 *     spline (s=1e-5): the standard uniform-grid equivalent. The heavy step-6
 *     smoothing dominates the result either way.
 *   - Window sizes are expressed as FRACTIONS of the grid so the smoothing
 *     strength in volt-space does not depend on grid resolution (navani's
 *     defaults 101/10⁴ and 1001/10⁴ → 1% and 10%).
 *
 * Pure functions, no DOM/Chart.js — unit-testable in isolation.
 */

// Solve A·x = b (small dense system) by Gaussian elimination with partial
// pivoting. Used once per (window, polyorder, deriv) config — not hot.
function solveLinear(A, b) {
  const n = A.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    }
    if (M[piv][col] === 0) throw new Error('savgol: singular normal matrix')
    if (piv !== col) [M[col], M[piv]] = [M[piv], M[col]]
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c]
    x[r] = s / M[r][r]
  }
  return x
}

// Least-squares polynomial fit over integer offsets [-h..h] (or any offsets):
// returns the polynomial coefficients a₀..a_p of the best fit through (t, y).
function polyfit(t, y, degree) {
  const n = degree + 1
  // Normal equations: (Tᵀ T) a = Tᵀ y, where T[i][k] = t[i]^k
  const TT = Array.from({ length: n }, () => new Array(n).fill(0))
  const Ty = new Array(n).fill(0)
  for (let i = 0; i < t.length; i++) {
    let pk = 1
    const powers = []
    for (let k = 0; k < n; k++) { powers.push(pk); pk *= t[i] }
    for (let r = 0; r < n; r++) {
      Ty[r] += powers[r] * y[i]
      for (let c = 0; c < n; c++) TT[r][c] += powers[r] * powers[c]
    }
  }
  return solveLinear(TT, Ty)
}

// factorial for derivative scaling (deriv ≤ polyorder ≤ ~7 in practice)
function fact(k) { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f }

/**
 * Centered SG convolution coefficients: y_out[i] = Σ_j c[j+h]·y[i+j], j∈[-h..h].
 * Equivalent to fitting a degree-`polyorder` polynomial over the window and
 * taking the `deriv`-th derivative at the window center (scipy savgol_coeffs).
 */
export function savgolCoeffs(window, polyorder, deriv = 0, delta = 1) {
  if (window % 2 !== 1 || window < 3) throw new Error('savgol: window must be odd ≥ 3')
  if (polyorder >= window) throw new Error('savgol: polyorder must be < window')
  if (deriv > polyorder) return new Array(window).fill(0)
  const h = (window - 1) / 2
  const n = polyorder + 1
  // coeffs c_j = e_dᵀ (TᵀT)⁻¹ Tᵀ — solve once with unit responses:
  // For each offset j, the contribution of y_j to the fitted a_d is
  // [(TᵀT)⁻¹ Tᵀ]_{d,j}. Build by solving (TᵀT) x = Tᵀ e_j per column is O(w·n³);
  // cheaper: solve (TᵀT) X = I once → X (n×n), then c = (X · Tᵀ) row d.
  const TT = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let j = -h; j <= h; j++) {
    let pk = 1
    const powers = []
    for (let k = 0; k < n; k++) { powers.push(pk); pk *= j }
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) TT[r][c] += powers[r] * powers[c]
    }
  }
  // Solve (TᵀT) xᵣ = eᵣ for the row we need (r = deriv)
  const e = new Array(n).fill(0)
  e[deriv] = 1
  // (TᵀT) is symmetric — row of inverse = solution of TT·x = e_deriv
  const row = solveLinear(TT, e)
  // c_j = Σ_k row[k] · j^k, scaled by deriv!/delta^deriv
  const scale = fact(deriv) / Math.pow(delta, deriv)
  const coeffs = new Array(window)
  for (let j = -h; j <= h; j++) {
    let pk = 1, s = 0
    for (let k = 0; k < n; k++) { s += row[k] * pk; pk *= j }
    coeffs[j + h] = s * scale
  }
  return coeffs
}

/**
 * scipy-like savgol_filter with mode='interp': the body is FIR convolution;
 * the first/last half-windows are evaluated from a polynomial fitted to the
 * first/last `window` points (exactly scipy's edge treatment).
 */
export function savgolFilter(y, window, polyorder, { deriv = 0, delta = 1 } = {}) {
  const N = y.length
  if (N === 0) return []
  // Clamp the window to the data length (keep odd)
  let w = Math.min(window, N % 2 === 1 ? N : N - 1)
  if (w % 2 === 0) w -= 1
  if (w < 3 || polyorder >= w) {
    // Degenerate: nothing to smooth — return a copy (deriv 0) or zeros
    return deriv === 0 ? [...y] : new Array(N).fill(0)
  }
  const h = (w - 1) / 2
  const c = savgolCoeffs(w, polyorder, deriv, delta)
  const out = new Array(N)
  for (let i = h; i < N - h; i++) {
    let s = 0
    for (let j = -h; j <= h; j++) s += c[j + h] * y[i + j]
    out[i] = s
  }
  // Edges, scipy mode='interp': fit a polynomial to the first/last w samples
  // and evaluate it (or its deriv-th derivative) at the edge positions.
  const scale = fact(deriv) / Math.pow(delta, deriv)
  if (h > 0) {
    const tHead = Array.from({ length: w }, (_, i) => i)
    const aHead = polyfit(tHead, y.slice(0, w), polyorder)
    for (let i = 0; i < h; i++) out[i] = evalPolyDeriv(aHead, i, deriv) * scale
    const tTail = Array.from({ length: w }, (_, i) => i)
    const aTail = polyfit(tTail, y.slice(N - w), polyorder)
    for (let i = N - h; i < N; i++) out[i] = evalPolyDeriv(aTail, i - (N - w), deriv) * scale
  }
  return out
}

// Evaluate the d-th derivative of polynomial a₀+a₁t+… at t, WITHOUT the d!
// scaling (caller applies deriv!/deltaᵈ to match savgolCoeffs convention…
// actually: dᵗʰ derivative = Σ_{k≥d} a_k · k!/(k−d)! · t^{k−d}; we return
// Σ_{k≥d} a_k · C(k,d) · t^{k−d} so that caller's ·d! completes k!/(k−d)!).
function evalPolyDeriv(a, t, d) {
  let s = 0
  for (let k = d; k < a.length; k++) {
    // C(k, d) = k! / (d! (k−d)!)
    let comb = 1
    for (let i = 0; i < d; i++) comb = comb * (k - i) / (i + 1)
    s += a[k] * comb * Math.pow(t, k - d)
  }
  return s
}

// ── navani-style dQ/dV ──────────────────────────────────────────────────

// Window fractions of the grid (navani's defaults were 1%/10% — but 10% was
// validated to crush sharp CC peaks ~5× on real ELITECH data; see calibration
// against session 1 cycle 2: ground-truth peak ≈1.0 Ah/V @3.87–3.92 V, the
// 1%/2% preset reproduces 0.977 @3.90 V).
export const SAVGOL_PRESETS = {
  light:    { f1: 0.005, f2: 0.01 },
  standard: { f1: 0.01,  f2: 0.02 },
  strong:   { f1: 0.01,  f2: 0.05 },
}

function oddWindow(n, lo, hi) {
  let w = Math.round(n)
  if (w % 2 === 0) w += 1
  return Math.max(lo, Math.min(hi, w))
}

/**
 * Generic smoothed-derivative pipeline on a uniform grid of the chosen
 * abscissa (navani's dqdv pipeline, generalised so dV/dQ reuses it):
 *   dedup-mean over duplicate x → uniform grid → linear interp of y →
 *   SG smooth (w₁) → SG derivative → SG smooth (w₂) → |dy/dx|.
 */
function sgGridDerivative(xy, { preset = 'standard', gridN = 4000, polyorder = 5 } = {}) {
  if (!xy || xy.length < 16) return []         // too sparse for spline-grade analysis
  const { f1, f2 } = SAVGOL_PRESETS[preset] || SAVGOL_PRESETS.standard

  // 1. average y over duplicate x (navani: groupby(x).mean()). Plateaus in x
  //    (e.g. CV hold at one voltage) collapse to a single point — this is what
  //    keeps the grid derivative finite without an explicit |dx| guard.
  const byX = new Map()
  for (const p of xy) {
    if (p.x == null || p.y == null || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    const key = Math.round(p.x * 1e9)          // fine bucketing ≈ float equality
    const e = byX.get(key)
    if (e) { e.sum += p.y; e.n += 1 } else byX.set(key, { x: p.x, sum: p.y, n: 1 })
  }
  const uniq = [...byX.values()]
    .map(e => ({ x: e.x, y: e.sum / e.n }))
    .sort((a, b) => a.x - b.x)
  if (uniq.length < 16) return []

  const xMin = uniq[0].x
  const xMax = uniq[uniq.length - 1].x
  if (!(xMax > xMin)) return []

  // 2.+3. uniform grid + linear interpolation (navani: linspace 1e4 + splrep k=1)
  const N = Math.max(512, Math.min(gridN, 20000))
  const step = (xMax - xMin) / (N - 1)
  const ys = new Array(N)
  let seg = 0
  for (let i = 0; i < N; i++) {
    const x = xMin + i * step
    while (seg < uniq.length - 2 && uniq[seg + 1].x < x) seg++
    const a = uniq[seg], b = uniq[seg + 1]
    const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x)
    ys[i] = a.y + t * (b.y - a.y)
  }

  // 4. SG smooth (navani: savgol_filter(y, 101, 5) @ 10k grid)
  const w1 = oddWindow(N * f1, polyorder + 2, N - 2)
  const smoothY = savgolFilter(ys, w1, polyorder)

  // 5. derivative on the grid (navani: smoothing-spline der=1 → SG deriv here)
  const dy = savgolFilter(smoothY, w1, polyorder, { deriv: 1, delta: step })

  // 6. final SG smooth of the derivative (navani: savgol_filter(dqdv, 1001, 5))
  const w2 = oddWindow(N * f2, polyorder + 2, N - 2)
  const smooth = savgolFilter(dy, w2, polyorder)

  const out = new Array(N)
  for (let i = 0; i < N; i++) {
    const y = Math.abs(smooth[i])
    out[i] = { x: xMin + i * step, y: Number.isFinite(y) ? y : 0 }
  }
  return out
}

/**
 * dqdvSavGol(pairs) → [{x: voltage, y: |dQ/dV|}] — navani-style.
 * pairs: [{ v, q }] for ONE half-cycle (single step type; step-boundary pairs
 * already excluded by the caller).
 */
export function dqdvSavGol(pairs, opts = {}) {
  if (!pairs) return []
  return sgGridDerivative(pairs.map(p => ({ x: p.v, y: p.q })), opts)
}

/**
 * dvdqSavGol(pairs) → [{x: capacity, y: |dV/dQ|}] — differential voltage
 * analysis (DVA). Same pipeline with the axes swapped: uniform CAPACITY grid,
 * V interpolated onto it, derivative dV/dQ. Peak positions in Q localise
 * degradation modes (LAM vs LLI) — the standard companion to dQ/dV.
 */
export function dvdqSavGol(pairs, opts = {}) {
  if (!pairs) return []
  return sgGridDerivative(pairs.map(p => ({ x: p.q, y: p.v })), opts)
}

/**
 * findPeaks(points, opts) → [{x, y}] — local maxima of a smoothed curve,
 * prominence-filtered (like scipy.signal.find_peaks): a peak's prominence is
 * its height above the higher of the two valleys separating it from taller
 * neighbours. Used to auto-annotate dQ/dV phase-transition peaks.
 */
export function findPeaks(points, {
  minProminenceFrac = 0.12,   // of the global max
  maxPeaks = 4,
  minSepFrac = 0.04,          // of the x-range
} = {}) {
  const n = points?.length || 0
  if (n < 5) return []
  const ys = points.map(p => p.y)
  const globalMax = Math.max(...ys)
  if (!(globalMax > 0)) return []

  const candidates = []
  for (let i = 1; i < n - 1; i++) {
    if (ys[i] > ys[i - 1] && ys[i] >= ys[i + 1]) {
      // prominence: walk out each side to the nearest strictly-higher sample,
      // tracking the deepest valley crossed
      let leftValley = ys[i]
      for (let j = i - 1; j >= 0; j--) {
        if (ys[j] > ys[i]) break
        leftValley = Math.min(leftValley, ys[j])
        if (j === 0) leftValley = Math.min(leftValley, ys[0])
      }
      let rightValley = ys[i]
      for (let j = i + 1; j < n; j++) {
        if (ys[j] > ys[i]) break
        rightValley = Math.min(rightValley, ys[j])
        if (j === n - 1) rightValley = Math.min(rightValley, ys[n - 1])
      }
      const prominence = ys[i] - Math.max(leftValley, rightValley)
      if (prominence >= minProminenceFrac * globalMax) {
        candidates.push({ i, x: points[i].x, y: ys[i] })
      }
    }
  }
  // greedy: tallest first, enforce minimum x separation, cap count
  candidates.sort((a, b) => b.y - a.y)
  const xRange = points[n - 1].x - points[0].x
  const minSep = Math.abs(xRange) * minSepFrac
  const kept = []
  for (const c of candidates) {
    if (kept.length >= maxPeaks) break
    if (kept.every(k => Math.abs(k.x - c.x) >= minSep)) kept.push(c)
  }
  return kept.sort((a, b) => a.x - b.x).map(({ x, y }) => ({ x, y }))
}
