/**
 * chartPerf — встроенный перф-HUD графиков циклирования.
 *
 * Отвечает на вопрос «а что именно лагает?» цифрами ИЗ БРАУЗЕРА пользователя,
 * а не синтетикой: на каждой карточке (при включённом ⏱) бейдж
 * «сборка X мс · отрисовка Y мс · N тчк».
 *
 *  - сборка   — время computed, строящего датасеты (главный поток);
 *  - отрисовка — beforeRender→afterRender Chart.js (краска канваса);
 *  - тчк      — суммарно точек во всех датасетах после LOD.
 *
 * Включение: кнопка «⏱» на странице циклирования; состояние в localStorage,
 * так что можно включить, воспроизвести лаг и прислать цифры.
 */
import { reactive, ref } from 'vue'

const LS_KEY = 'badb-chart-perf'

export const perfEnabled = ref(
  typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY) === '1'
)

export function togglePerf() {
  perfEnabled.value = !perfEnabled.value
  try { localStorage.setItem(LS_KEY, perfEnabled.value ? '1' : '0') } catch { /* private mode */ }
}

// id графика → { build, paint, points }
export const chartPerf = reactive({})

export function notePerf(id, patch) {
  chartPerf[id] = { ...(chartPerf[id] || {}), ...patch }
}

/** Обёртка таймера сборки: вызывать внутри computed построения датасетов. */
export function timeBuild(id, fn) {
  if (!perfEnabled.value) return fn()
  const t0 = performance.now()
  const out = fn()
  const points = (out?.datasets || []).reduce((n, d) => n + (d.data?.length || 0), 0)
  notePerf(id, { build: +(performance.now() - t0).toFixed(1), points })
  return out
}

/** Chart.js-плагин: меряет чистое время краски канваса. */
export function makePaintPlugin(id) {
  return {
    id: `perf_${id}`,
    beforeRender(chart) { chart.$perfT0 = performance.now() },
    afterRender(chart) {
      if (!perfEnabled.value || chart.$perfT0 == null) return
      notePerf(id, { paint: +(performance.now() - chart.$perfT0).toFixed(1) })
    },
  }
}
