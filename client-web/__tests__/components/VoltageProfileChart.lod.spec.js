/**
 * LOD-проводка в VoltageProfileChart: плотный цикл (5000 точек) на старте
 * ужимается до ~LOD_POINT_CAP (обзорный уровень), полные серии доступны
 * зум-обработчикам, обработчики подключены к зум-плагину.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-chartjs', () => ({
  Line: { name: 'LineStub', props: ['data', 'options'], template: '<canvas />' },
  Scatter: { name: 'ScatterStub', props: ['data', 'options'], template: '<canvas />' },
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { user_id: 'test-user' } }),
}))

import VoltageProfileChart from '@/components/cycling/VoltageProfileChart.vue'
import { LOD_POINT_CAP } from '@/utils/chartLod'

const DENSE_POINTS = Array.from({ length: 5000 }, (_, i) => ({
  cycle_number: 1,
  step_number: 1,
  step_type: i < 2500 ? 'charge' : 'discharge',
  time_s: i * 10,
  voltage_v: 3.0 + Math.sin(i / 50) * 0.5,
  capacity_ah: (i % 2500) * 1e-6,
}))

const SESSION = {
  session_id: 1, battery_id: 7, color: '#003274',
  summary: [{ cycle_number: 1 }],
  cycleDataMap: { 1: DENSE_POINTS },
}

describe('VoltageProfileChart — LOD', () => {
  const w = mount(VoltageProfileChart, {
    props: {
      sessions: [SESSION], selectedCycles: [1], stepFilter: 'both',
      capacityUnit: 'Ah', capacityView: 'absolute',
    },
  })
  const stub = w.findComponent({ name: 'ScatterStub' })

  it('обзорный уровень: 2500-точечные полуциклы ужаты до ~cap, без потери концов', () => {
    const datasets = stub.props('data').datasets
    expect(datasets.length).toBe(2)   // заряд + разряд
    for (const ds of datasets) {
      expect(ds.data.length).toBeLessThanOrEqual(LOD_POINT_CAP + 2)
      expect(ds.data.length).toBeGreaterThan(100)
      expect(ds.normalized).toBe(true)   // сортированы → подсказка Chart.js
    }
  })

  it('LOD-обработчики подключены к зум-плагину', () => {
    const zoomOpts = stub.props('options').plugins.zoom
    expect(typeof zoomOpts.zoom.onZoomComplete).toBe('function')
    expect(typeof zoomOpts.pan.onPanComplete).toBe('function')
  })
})

describe('VoltageProfileChart — по-сессионное прореживание циклов', () => {
  it('короткая сессия (10 циклов) при выборе 1..500 рисует СВОИ 10, а не только Ц1', () => {
    const mkCycle = (c) => Array.from({ length: 40 }, (_, i) => ({
      cycle_number: c, step_number: 1,
      step_type: i < 20 ? 'charge' : 'discharge',
      time_s: i * 10, voltage_v: 3 + 0.01 * i, capacity_ah: (i % 20) * 1e-5,
    }))
    const cycleDataMap = Object.fromEntries(Array.from({ length: 10 }, (_, k) => [k + 1, mkCycle(k + 1)]))
    const session = { session_id: 9, battery_id: 3, color: '#003274', summary: [], cycleDataMap }
    const selected = Array.from({ length: 500 }, (_, i) => i + 1)   // 1..500
    const w = mount(VoltageProfileChart, {
      props: { sessions: [session], selectedCycles: selected, stepFilter: 'discharge', capacityUnit: 'Ah' },
    })
    const labels = w.findComponent({ name: 'ScatterStub' }).props('data').datasets.map(d => d.label)
    // глобальная сетка 1..500 дала бы только Ц1; по-сессионная — все 10
    expect(labels.some(l => l.startsWith('Ц10_'))).toBe(true)
    expect(labels.length).toBe(10)
    // заголовок честен про прореживание выбора
    const title = w.findComponent({ name: 'ScatterStub' }).props('options').plugins.title.text
    expect(title).toContain('из 500')
  })
})
