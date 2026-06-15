/**
 * Смоук на монтирование CyclingCharts ПОСЛЕ разбивки на компоненты.
 * Компиляция не ловит обращение шаблона к удалённой функции (упадёт только в
 * рантайме) — этот тест монтирует оркестратор с реалистичными props и
 * проверяет, что все 4 дочерних графика, таблицы и панель формул рендерятся.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-chartjs', () => ({
  Line: { name: 'LineStub', props: ['data', 'options', 'plugins'], template: '<canvas class="line-stub" />' },
  Scatter: { name: 'ScatterStub', props: ['data', 'options', 'plugins'], template: '<canvas class="scatter-stub" />' },
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { user_id: 'test-user' } }),
}))
vi.mock('primevue/popover', () => ({
  default: { name: 'PopoverStub', template: '<div class="popover-stub"><slot /></div>', methods: { show() {}, hide() {}, toggle() {} } },
}))

import CyclingCharts from '@/components/CyclingCharts.vue'
import CapacityChart from '@/components/cycling/CapacityChart.vue'
import VoltageProfileChart from '@/components/cycling/VoltageProfileChart.vue'
import DqdvChart from '@/components/cycling/DqdvChart.vue'
import HysteresisChart from '@/components/cycling/HysteresisChart.vue'

const POINTS = Array.from({ length: 30 }, (_, i) => ({
  cycle_number: 1,
  step_number: i < 15 ? 1 : 2,
  step_type: i < 15 ? 'charge' : 'discharge',
  time_s: i * 100,
  voltage_v: 3.2 + 0.05 * (i % 15),
  current_a: i < 15 ? 0.001 : -0.001,
  capacity_ah: 0.0001 * (i % 15),
  energy_wh: null,
}))

const SESSION = {
  session_id: 1,
  battery_id: 5,
  file_name: 'Cell 66.txt',
  color: '#003274',
  active_mass_mg: 12.4,
  summary: [
    {
      cycle_number: 1,
      charge_capacity_ah: 0.0014, discharge_capacity_ah: 0.0013,
      coulombic_efficiency: 92.86, energy_efficiency: 88.1,
      charge_energy_wh: 0.005, discharge_energy_wh: 0.0044,
      avg_charge_voltage_v: 3.7, avg_discharge_voltage_v: 3.5,
    },
    {
      cycle_number: 2,
      charge_capacity_ah: 0.00138, discharge_capacity_ah: 0.00128,
      coulombic_efficiency: 92.75, energy_efficiency: 87.9,
      charge_energy_wh: 0.0049, discharge_energy_wh: 0.0043,
      avg_charge_voltage_v: 3.71, avg_discharge_voltage_v: 3.49,
    },
  ],
  cycleDataMap: { 1: POINTS },
  loadingCycles: [],
}

function mountCharts(extraProps = {}) {
  return mount(CyclingCharts, {
    props: {
      sessions: [SESSION],
      selectedCycles: [1],
      stepFilter: 'both',
      showHysteresis: true,
      showTables: true,
      capacityUnit: 'Ah',
      capacityView: 'absolute',
      dqdvMethod: 'savgol',
      dqdvPreset: 'standard',
      dqdvView: 'dqdv',
      dqdvPeaks: true,
      cycleGradient: false,
      ghostTrace: false,
      publicationMode: false,
      smoothingWindow: 5,
      maxSelected: 20,
      ...extraProps,
    },
  })
}

describe('CyclingCharts (оркестратор после разбивки)', () => {
  it('монтируется без рантайм-ошибок и рендерит все 4 дочерних графика', () => {
    const w = mountCharts()
    expect(w.find('.cycling-charts').exists()).toBe(true)
    expect(w.findComponent(CapacityChart).exists()).toBe(true)
    expect(w.findComponent(VoltageProfileChart).exists()).toBe(true)
    expect(w.findComponent(DqdvChart).exists()).toBe(true)
    expect(w.findComponent(HysteresisChart).exists()).toBe(true)
  })

  it('таблица циклов рендерит значения через shared-форматтеры', () => {
    const w = mountCharts()
    const html = w.html()
    expect(html).toContain('92.86')      // CE из formatPct
    expect(html).toContain('3.700')      // V̄ из formatVolt
    expect(html).toContain('0.00140')    // Chg из formatCap (Ah → 5 знаков)
  })

  it('панель формул берёт записи из контракта', async () => {
    const w = mountCharts()
    await w.find('.formulas-head').trigger('click')
    const html = w.html()
    expect(html).toContain('Кулоновская эффективность')
    expect(html).toContain('contracts/metrics.v1.json')
  })

  it('toggle-cycle и style-click всплывают от детей наружу', () => {
    const w = mountCharts()
    w.findComponent(CapacityChart).vm.$emit('toggle-cycle', 2)
    w.findComponent(DqdvChart).vm.$emit('style-click', new MouseEvent('click'))
    expect(w.emitted('toggle-cycle')).toBeTruthy()
    expect(w.emitted('toggle-cycle')[0]).toEqual([2])
    expect(w.emitted('style-click')).toBeTruthy()
    expect(w.emitted('style-click')[0][0]).toBe('dqdv')
  })

  it('пустой выбор циклов → плейсхолдер вместо V/dQdV, без падений', () => {
    const w = mountCharts({ selectedCycles: [] })
    expect(w.findComponent(VoltageProfileChart).exists()).toBe(false)
    expect(w.find('.chart-placeholder').exists()).toBe(true)
  })

  // Регресс: «каждый N-й» не должен морить короткую сессию при наложении на
  // длинную. Раньше выбор шёл по ОБЪЕДИНЕНИЮ номеров — every-10th от union
  // 1..10+101..130 давал [1,101,111,121,130], короткая (1..10) теряла всё
  // кроме цикла 1. Диапазоны намеренно непересекающиеся: цикл 10 принадлежит
  // ТОЛЬКО короткой сессии, поэтому его наличие однозначно доказывает
  // per-session сэмплирование.
  it('per-session: «каждый N-й» сохраняет короткую сессию при overlay с длинной', async () => {
    const mkSummary = (start, n) => Array.from({ length: n }, (_, i) => ({
      cycle_number: start + i,
      charge_capacity_ah: 0.0014, discharge_capacity_ah: 0.0013,
      coulombic_efficiency: 92, energy_efficiency: 88,
      charge_energy_wh: 0.005, discharge_energy_wh: 0.0044,
      avg_charge_voltage_v: 3.7, avg_discharge_voltage_v: 3.5,
    }))
    const shortS = { ...SESSION, session_id: 1, battery_id: 1, file_name: 'ELITECH 10c.txt', summary: mkSummary(1, 10), cycleDataMap: {} }
    const longS = { ...SESSION, session_id: 2, battery_id: 42, file_name: 'NCA 30c.txt', summary: mkSummary(101, 30), cycleDataMap: {} }
    const w = mountCharts({ sessions: [shortS, longS], selectedCycles: [1], maxSelected: 10000 })

    const input = w.find('input.filter-input')
    await input.setValue(10)
    await input.trigger('change')

    const ev = w.emitted('replace-cycles')
    expect(ev).toBeTruthy()
    const picked = ev[ev.length - 1][0]
    // короткая сессия (1..10) представлена не только циклом 1
    expect(picked.filter(c => c >= 1 && c <= 10).length).toBeGreaterThan(1)
    // её последний цикл (10) — уникален для короткой сессии — попал в выборку
    expect(picked).toContain(10)
  })
})
