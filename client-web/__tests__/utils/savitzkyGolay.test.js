import { describe, it, expect } from 'vitest'
import { savgolCoeffs, savgolFilter, dqdvSavGol, dvdqSavGol, findPeaks, SAVGOL_PRESETS } from '@/utils/savitzkyGolay'

// ── scipy cross-check ────────────────────────────────────────────────────
// Reference vectors generated with scipy 1.17.1:
//   rng = np.random.default_rng(42)
//   y = np.cumsum(rng.standard_normal(40)) + 0.05*np.arange(40)**1.5
//   savgol_filter(y, w, p[, deriv, delta])  (mode='interp', scipy default)
const INPUT = [0.304717079754, -0.685267026486, 0.156605525558, 1.215556506847, -0.595286302942, -1.73844881543, -1.434778483802, -1.559855040108, -1.371298306587, -2.005713084059, -0.895176279112, 0.125620460929, 0.445968492877, 1.838357059814, 2.581418243756, 2.007703119787, 2.671716394214, 2.01747357516, 3.209660713099, 3.482312180069, 3.62863177516, 3.28727075546, 4.857564950236, 5.058784384171, 4.994025692878, 5.01311675971, 5.924151312934, 6.675675780282, 7.481706292205, 8.312912594577, 10.86190958768, 10.869690971104, 10.778380278834, 10.392169118186, 11.442238395211, 13.011732087119, 13.34464500904, 12.957599213129, 12.592393922027, 13.708346201087]
const SG_W7_P3 = [-0.089674829241, 0.191139608795, 0.231130630881, 0.041227912665, -0.316601557792, -1.093001926962, -1.626319675905, -1.714619359879, -1.655081165278, -1.426853469442, -0.994275389195, -0.225629116094, 0.950494780813, 1.613319540497, 2.200626446333, 2.37280776949, 2.361189205713, 2.545739215797, 3.037020775271, 3.155314785381, 3.62224195765, 3.959237739113, 4.426495238762, 4.776982424629, 5.133754401498, 5.29170082673, 5.823124591821, 6.449099694979, 7.661716263562, 8.927767643427, 10.084455163049, 10.676044369536, 10.822998908231, 10.919050278705, 11.677789118736, 12.529103887026, 13.006255675139, 12.9433743528, 12.993756927364, 13.52742913718]
const SG_W11_P5 = [0.106124005634, -0.128898168114, 0.133602712698, 0.174371256486, -0.217410684756, -0.909676223345, -1.603499419389, -1.909184626921, -1.598934940137, -1.407238676476, -1.06918028771, -0.130470980093, 0.816605440978, 1.792463363308, 2.141555168934, 2.328942841046, 2.418204481613, 2.625582149688, 2.87510775355, 3.216605221247, 3.556950163707, 4.09604034623, 4.368341982635, 4.763234526852, 5.087170523759, 5.469821278691, 5.622574938784, 6.454528160337, 7.657830013549, 9.040307657008, 10.077044257749, 10.594804262247, 10.801741641189, 11.066515232685, 11.642787531392, 12.740891120636, 13.31142144221, 13.068342097064, 12.572521483622, 13.702094285631]
const SG_W7_P3_D1 = [0.404869371227, 0.158581117453, -0.076777460673, -0.301206363151, -1.026643258014, -0.797735062812, 0.116006213192, -0.030266969222, -0.12188866236, 0.393513899508, 0.677037916568, 0.985632271061, 0.968156346361, 0.680492003497, 0.465581001408, -0.172869561866, 0.025761584175, 0.424447935887, 0.479855085807, 0.243206604949, 0.127731521677, 0.54621322331, 0.63710905635, 0.289861013996, -0.022747406603, 0.414872618966, 0.759969058409, 0.723535968445, 1.178352805502, 1.469276871718, 1.140505752019, 0.187832463899, -0.365826453177, 0.505556929575, 1.10293812618, 0.961567856401, 0.00382864199, -0.067920330279, 0.230356435799, 0.898658940222]
const SG_W7_P3_D1_DX = [1.619477484907, 0.634324469813, -0.307109842691, -1.204825452603, -4.106573032055, -3.190940251249, 0.464024852768, -0.121067876888, -0.48755464944, 1.574055598033, 2.70815166627, 3.942529084242, 3.872625385443, 2.721968013989, 1.862324005633, -0.691478247463, 0.103046336698, 1.697791743546, 1.919420343228, 0.972826419796, 0.510926086708, 2.18485289324, 2.548436225401, 1.159444055984, -0.090989626413, 1.659490475863, 3.039876233636, 2.894143873779, 4.713411222006, 5.877107486871, 4.562023008077, 0.751329855597, -1.463305812708, 2.0222277183, 4.41175250472, 3.846271425603, 0.015314567959, -0.271681321114, 0.921425743196, 3.59463576089]

function maxAbsDiff(a, b) {
  expect(a.length).toBe(b.length)
  let m = 0
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]))
  return m
}

describe('savgolFilter vs scipy', () => {
  it('matches scipy savgol_filter(y, 7, 3) including interp edges', () => {
    expect(maxAbsDiff(savgolFilter(INPUT, 7, 3), SG_W7_P3)).toBeLessThan(1e-9)
  })
  it('matches scipy savgol_filter(y, 11, 5)', () => {
    expect(maxAbsDiff(savgolFilter(INPUT, 11, 5), SG_W11_P5)).toBeLessThan(1e-9)
  })
  it('matches scipy deriv=1', () => {
    expect(maxAbsDiff(savgolFilter(INPUT, 7, 3, { deriv: 1 }), SG_W7_P3_D1)).toBeLessThan(1e-9)
  })
  it('matches scipy deriv=1 with delta=0.25', () => {
    expect(maxAbsDiff(savgolFilter(INPUT, 7, 3, { deriv: 1, delta: 0.25 }), SG_W7_P3_D1_DX)).toBeLessThan(1e-9)
  })
})

describe('savgol analytic properties', () => {
  it('reproduces a polynomial of degree ≤ polyorder exactly (body + edges)', () => {
    const y = Array.from({ length: 51 }, (_, i) => 2 * i ** 3 - i ** 2 + 3)
    const out = savgolFilter(y, 11, 3)
    expect(maxAbsDiff(out, y)).toBeLessThan(1e-6)
  })
  it('derivative of a cubic matches the analytic derivative', () => {
    const dx = 0.1
    const y = Array.from({ length: 51 }, (_, i) => { const x = i * dx; return x ** 3 })
    const dy = savgolFilter(y, 9, 3, { deriv: 1, delta: dx })
    const expected = Array.from({ length: 51 }, (_, i) => 3 * (i * dx) ** 2)
    expect(maxAbsDiff(dy, expected)).toBeLessThan(1e-9)
  })
  it('coefficients sum to 1 for deriv=0 and 0 for deriv=1 (DC response)', () => {
    const c0 = savgolCoeffs(9, 3, 0)
    const c1 = savgolCoeffs(9, 3, 1)
    expect(Math.abs(c0.reduce((a, b) => a + b) - 1)).toBeLessThan(1e-12)
    expect(Math.abs(c1.reduce((a, b) => a + b))).toBeLessThan(1e-12)
  })
  it('window clamps to data length instead of throwing', () => {
    const y = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = savgolFilter(y, 1001, 5)
    expect(out.length).toBe(8)
    expect(out.every(Number.isFinite)).toBe(true)
  })
})

describe('dqdvSavGol pipeline (navani-style)', () => {
  // Synthetic half-cycle: Q(V) = two sigmoid steps → dQ/dV has two peaks at
  // the plateau voltages. Mimics a two-phase intercalation curve.
  function syntheticPairs(n = 800) {
    const pairs = []
    for (let i = 0; i < n; i++) {
      const v = 3.0 + (1.2 * i) / (n - 1)            // 3.0 → 4.2 V
      const q = 1 / (1 + Math.exp(-(v - 3.4) / 0.02))
              + 0.8 / (1 + Math.exp(-(v - 3.9) / 0.03))
      pairs.push({ v, q })
    }
    return pairs
  }

  it('finds both plateau peaks at the right voltages', () => {
    const out = dqdvSavGol(syntheticPairs(), { preset: 'standard', gridN: 4000 })
    expect(out.length).toBeGreaterThan(1000)
    expect(out.every(p => Number.isFinite(p.y))).toBe(true)
    // local maxima
    const peaks = []
    for (let i = 2; i < out.length - 2; i++) {
      if (out[i].y > out[i - 1].y && out[i].y > out[i + 1].y && out[i].y > 1) peaks.push(out[i])
    }
    const near = (x) => peaks.some(p => Math.abs(p.x - x) < 0.05)
    expect(near(3.4)).toBe(true)
    expect(near(3.9)).toBe(true)
  })

  it('collapses voltage plateaus instead of blowing up (duplicate V averaging)', () => {
    // 200 points at EXACTLY 3.7 V with growing Q (CV hold) + a ramp
    const pairs = []
    for (let i = 0; i < 100; i++) pairs.push({ v: 3.0 + i * 0.007, q: i * 0.01 })
    for (let i = 0; i < 200; i++) pairs.push({ v: 3.7, q: 1 + i * 0.005 })
    for (let i = 0; i < 100; i++) pairs.push({ v: 3.7 + i * 0.005, q: 2 + i * 0.01 })
    const out = dqdvSavGol(pairs, { preset: 'standard' })
    expect(out.length).toBeGreaterThan(0)
    expect(out.every(p => Number.isFinite(p.y) && p.y < 1e6)).toBe(true)
  })

  it('returns [] for sparse input', () => {
    expect(dqdvSavGol([{ v: 3, q: 0 }, { v: 4, q: 1 }])).toEqual([])
    expect(dqdvSavGol([])).toEqual([])
    expect(dqdvSavGol(null)).toEqual([])
  })

  it('stronger preset → smoother (lower peak, same area direction)', () => {
    const pairs = syntheticPairs()
    const std = dqdvSavGol(pairs, { preset: 'standard' })
    const strong = dqdvSavGol(pairs, { preset: 'strong' })
    const max = (arr) => Math.max(...arr.map(p => p.y))
    expect(max(strong)).toBeLessThan(max(std))
  })

  it('exports the three presets', () => {
    expect(Object.keys(SAVGOL_PRESETS)).toEqual(['light', 'standard', 'strong'])
  })
})

describe('dvdqSavGol (DVA, оси наоборот)', () => {
  // Same two-plateau curve: dV/dQ MINIMA sit on the plateaus, the PEAK sits
  // between them (where V climbs steeply per unit Q — phase transition gap).
  function pairs(n = 800) {
    const out = []
    for (let i = 0; i < n; i++) {
      const v = 3.0 + (1.2 * i) / (n - 1)
      const q = 1 / (1 + Math.exp(-(v - 3.4) / 0.02))
              + 0.8 / (1 + Math.exp(-(v - 3.9) / 0.03))
      out.push({ v, q })
    }
    return out
  }

  it('produces a finite curve on a capacity grid', () => {
    const out = dvdqSavGol(pairs(), { preset: 'standard' })
    expect(out.length).toBeGreaterThan(500)
    expect(out.every(p => Number.isFinite(p.y))).toBe(true)
    // x is capacity: spans ~[0, 1.8]
    expect(out[0].x).toBeGreaterThanOrEqual(0)
    expect(out[out.length - 1].x).toBeLessThanOrEqual(1.9)
  })

  it('has its main peak BETWEEN the plateaus (по Q), где dQ/dV минимален', () => {
    const out = dvdqSavGol(pairs(), { preset: 'standard' })
    // interior only (edges of DVA blow up at Q→0 and Q→Qmax by nature)
    const interior = out.filter(p => p.x > 0.2 && p.x < 1.6)
    const peak = interior.reduce((a, b) => (b.y > a.y ? b : a))
    // first plateau ends near Q≈1.0 — the inter-plateau gap is right there
    expect(peak.x).toBeGreaterThan(0.85)
    expect(peak.x).toBeLessThan(1.15)
  })

  it('returns [] for sparse/empty input', () => {
    expect(dvdqSavGol([])).toEqual([])
    expect(dvdqSavGol(null)).toEqual([])
  })
})

describe('findPeaks', () => {
  it('находит ровно 2 пика двухфазной кривой на правильных напряжениях', () => {
    const curve = dqdvSavGol(
      Array.from({ length: 800 }, (_, i) => {
        const v = 3.0 + (1.2 * i) / 799
        return { v, q: 1 / (1 + Math.exp(-(v - 3.4) / 0.02)) + 0.8 / (1 + Math.exp(-(v - 3.9) / 0.03)) }
      }),
      { preset: 'standard' },
    )
    const peaks = findPeaks(curve)
    expect(peaks.length).toBe(2)
    expect(Math.abs(peaks[0].x - 3.4)).toBeLessThan(0.05)
    expect(Math.abs(peaks[1].x - 3.9)).toBeLessThan(0.05)
  })

  it('игнорирует мелкую рябь (prominence filter)', () => {
    // one big peak + tiny noise bumps
    const pts = Array.from({ length: 400 }, (_, i) => {
      const x = i / 399
      return { x, y: Math.exp(-((x - 0.5) ** 2) / 0.002) + 0.01 * Math.sin(40 * x) }
    })
    const peaks = findPeaks(pts)
    expect(peaks.length).toBe(1)
    expect(Math.abs(peaks[0].x - 0.5)).toBeLessThan(0.02)
  })

  it('соблюдает maxPeaks и минимальную дистанцию', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => {
      const x = i / 999
      return { x, y: 1 + Math.sin(20 * Math.PI * x) }   // 10 одинаковых пиков
    })
    const peaks = findPeaks(pts, { maxPeaks: 3, minSepFrac: 0.04 })
    expect(peaks.length).toBe(3)
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i].x - peaks[i - 1].x).toBeGreaterThanOrEqual(0.04)
    }
  })

  it('пустой вход → пусто', () => {
    expect(findPeaks([])).toEqual([])
    expect(findPeaks(null)).toEqual([])
  })
})
