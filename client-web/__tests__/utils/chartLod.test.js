import { describe, it, expect } from 'vitest'
import { minMaxDecimate, lowerBoundX, lodSlice, applyViewportLod, ensureSortedByX, LOD_POINT_CAP } from '@/utils/chartLod'

// Синтетика: 10 000 точек, гладкая кривая + один острый выброс в i=7777
function makeSeries(n = 10000) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1)
    let y = Math.sin(x * 8) + 0.1 * Math.sin(x * 211)
    if (i === 7777) y += 5            // острый пик — тест анти-алиасинга
    pts.push({ x, y })
  }
  return pts
}

describe('minMaxDecimate', () => {
  it('укладывается в cap и сохраняет первую/последнюю точки', () => {
    const full = makeSeries()
    const out = minMaxDecimate(full, 500)
    expect(out.length).toBeLessThanOrEqual(502)
    expect(out[0]).toBe(full[0])
    expect(out[out.length - 1]).toBe(full[full.length - 1])
  })

  it('НЕ теряет острый выброс (анти-алиасинг — отличие от каждой-N-й)', () => {
    const full = makeSeries()
    const spike = full[7777]
    const out = minMaxDecimate(full, 500)
    expect(out).toContain(spike)
    // старая каждая-N-я децимация выброс теряла: 7777 % 20 !== 0
    expect(7777 % Math.ceil(full.length / 500)).not.toBe(0)
  })

  it('сохраняет порядок по x', () => {
    const out = minMaxDecimate(makeSeries(), 300)
    for (let i = 1; i < out.length; i++) expect(out[i].x).toBeGreaterThanOrEqual(out[i - 1].x)
  })

  it('короткий массив возвращается как есть', () => {
    const short = makeSeries(100)
    expect(minMaxDecimate(short, 500)).toBe(short)
  })
})

describe('lowerBoundX / lodSlice', () => {
  const full = makeSeries()

  it('lowerBoundX находит границу', () => {
    expect(lowerBoundX(full, -1)).toBe(0)
    expect(lowerBoundX(full, 2)).toBe(full.length)
    const i = lowerBoundX(full, 0.5)
    expect(full[i].x).toBeGreaterThanOrEqual(0.5)
    expect(full[i - 1].x).toBeLessThan(0.5)
  })

  it('зум 10× даёт ~10× больше реальных деталей в окне', () => {
    const overview = lodSlice(full, 0, 1, 500)
    const zoomed = lodSlice(full, 0.45, 0.55, 500)
    const inWindow = (p) => p.x >= 0.44 && p.x <= 0.56
    const overviewDetail = overview.filter(inWindow).length
    const zoomedDetail = zoomed.filter(inWindow).length
    expect(zoomedDetail).toBeGreaterThan(overviewDetail * 5)   // новые детали появились
    expect(zoomed.length).toBeLessThanOrEqual(502)             // и всё ещё ~cap точек
  })

  it('точка запаса с каждой стороны окна (линия не рвётся на краю)', () => {
    const out = lodSlice(full, 0.5, 0.6, 500)
    expect(out[0].x).toBeLessThan(0.5)
    expect(out[out.length - 1].x).toBeGreaterThan(0.6)
  })
})

describe('ensureSortedByX', () => {
  it('сортированный → сам массив; несортированный → null (LOD пропускает)', () => {
    const ok = [{ x: 1, y: 0 }, { x: 2, y: 0 }]
    const bad = [{ x: 2, y: 0 }, { x: 1, y: 0 }]
    expect(ensureSortedByX(ok)).toBe(ok)
    expect(ensureSortedByX(bad)).toBeNull()
  })
})

describe('useFrameCoalesced', () => {
  it('N синхронных обновлений за кадр → одно распространение (последнее значение)', async () => {
    const { ref, nextTick } = await import('vue')
    const { useFrameCoalesced } = await import('@/utils/chartLod')
    const src = ref(1)
    const out = useFrameCoalesced(src)
    expect(out.value).toBe(1)            //начальное — синхронно
    src.value = 2; await nextTick()
    src.value = 3; await nextTick()
    src.value = 4; await nextTick()
    expect(out.value).toBe(1)            // до кадра — не дёргался
    await new Promise(requestAnimationFrame)
    expect(out.value).toBe(4)            // один прыжок к последнему
  })
})

describe('applyViewportLod (fake chart)', () => {
  it('подменяет data датасетов срезом окна и перерисовывает без анимации', () => {
    const full = makeSeries()
    let updated = null
    const chart = {
      scales: { x: { min: 0.45, max: 0.55 } },
      data: { datasets: [{ data: [] }, { data: [{ x: 0, y: 0 }] }] },
      update: (mode) => { updated = mode },
    }
    applyViewportLod(chart, [full, null], 500)
    expect(updated).toBe('none')
    const d0 = chart.data.datasets[0].data
    expect(d0.length).toBeGreaterThan(100)
    expect(d0.every(p => p.x >= 0.44 && p.x <= 0.56)).toBe(true)
    // null в fullSeries → датасет не тронут
    expect(chart.data.datasets[1].data).toEqual([{ x: 0, y: 0 }])
  })

  it('кривое окно (min>=max) — no-op', () => {
    const chart = { scales: { x: { min: 5, max: 5 } }, data: { datasets: [{ data: [1] }] }, update: () => { throw new Error('не должен') } }
    applyViewportLod(chart, [makeSeries()], 500)
  })
})
