<script setup>
/**
 * ProvenancePopover — происхождение значения: формула из контракта
 * (contracts/metrics.v1.json), подставленные числа, цепочка данных, источник,
 * и «Перепроверить» — живой пересчёт референс-реализацией против хранимого.
 *
 * Принцип «пусто лучше выдумки»: рендерятся только поля, реально пришедшие из
 * контракта/БД; ничего не сочиняется. Вызов:
 *   provRef.value.open(event, {
 *     metricId, value, inputs, extras,
 *     source: { file_name, uploaded_at, notes, equipment_type, protocol },
 *     points,            // точки цикла, если загружены (для пересчёта из потока)
 *     storedKey,         // ключ величины в пересчитанном summary (stream-verify)
 *   })
 */
import { ref, computed } from 'vue'
import Popover from 'primevue/popover'
import {
  getMetric, CONTRACT_VERSION, explainMetric, verifyMetric,
  computeStreamSummary, fmtNum,
} from '@/utils/metricsEngine'

const popRef = ref(null)
const payload = ref(null)
const verifyResult = ref(null)

const metric = computed(() => (payload.value ? getMetric(payload.value.metricId) : null))

const explainText = computed(() => {
  if (!metric.value) return null
  const p = payload.value
  return explainMetric(p.metricId, p.inputs, p.value, p.extras)
})

// Происхождение сессии по её же меткам (notes-тег ставится импортёрами).
const sourceKind = computed(() => {
  const s = payload.value?.source
  if (!s) return null
  const notes = s.notes || ''
  if (notes.startsWith('REF_IMPORT')) return 'Импорт из сводной книги Excel (данные коллег)'
  if (notes.startsWith('NAVANI_IMPORT')) return 'Импорт нативного файла прибора (navani)'
  if (s.file_name) return 'Загрузка файла через интерфейс (парсер BADB)'
  return null
})

// Пересчёт возможен: скалярно из входов ИЛИ из потока точек (если загружены).
const canVerify = computed(() => {
  const p = payload.value
  if (!p || !metric.value) return false
  if (!metric.value.stored) return false               // на-лету: само отображение и есть расчёт
  return !!p.inputs || (Array.isArray(p.points) && p.points.length > 0 && !!p.storedKey)
})

function runVerify() {
  const p = payload.value
  if (!p) return
  if (Array.isArray(p.points) && p.points.length > 0 && p.storedKey) {
    // stream-verify: пересчёт summary из загруженных точек канонической
    // агрегацией. Допуск 0.5%: точки могут быть прорежены при выдаче API
    // (каждая n-я), что слегка занижает per-step максимумы.
    const s = computeStreamSummary(p.points)
    const recomputed = s[p.storedKey]
    const stored = p.value == null ? null : Number(p.value)
    if (recomputed == null && stored != null) {
      // в точках нет нужного поля (например, energy_wh у старых загрузок) —
      // честное «нет данных», а не ложное расхождение
      verifyResult.value = { status: 'no-data' }
      return
    }
    if (recomputed == null || stored == null) {
      verifyResult.value = { status: recomputed == null && stored == null ? 'ok' : 'mismatch', recomputed, stored, diff: null }
      return
    }
    const diff = recomputed - stored
    const ok = Math.abs(diff) <= Math.max(0.011, 0.005 * Math.abs(recomputed))
    verifyResult.value = { status: ok ? 'ok' : 'mismatch', recomputed, stored, diff, approx: true }
    return
  }
  verifyResult.value = verifyMetric(p.metricId, p.inputs, p.value)
}

function open(event, data) {
  payload.value = data
  verifyResult.value = null
  popRef.value?.hide()
  // toggle на новом event — Popover позиционируется по цели клика
  requestAnimationFrame(() => popRef.value?.show(event))
}

defineExpose({ open })
</script>

<template>
  <Popover ref="popRef" class="prov-popover">
    <div v-if="metric && payload" class="prov-body">
      <div class="prov-head">
        <strong>{{ metric.label_ru }}</strong>
        <span v-if="payload.value != null" class="prov-value">
          {{ fmtNum(payload.value) }} {{ metric.unit }}
        </span>
      </div>

      <div class="prov-formula">
        <code>{{ metric.formula }}</code>
        <small>{{ metric.formula_text_ru }}</small>
      </div>

      <div v-if="explainText && payload.inputs" class="prov-substituted">
        <span class="prov-sec">Подстановка</span>
        <code>{{ explainText }}</code>
      </div>

      <div v-if="metric.lineage?.length" class="prov-lineage">
        <span class="prov-sec">Цепочка данных</span>
        <ol>
          <li v-for="(step, i) in metric.lineage" :key="i">{{ step }}</li>
        </ol>
      </div>

      <div v-if="payload.source" class="prov-source">
        <span class="prov-sec">Источник</span>
        <div v-if="sourceKind" class="prov-source-kind">{{ sourceKind }}</div>
        <div v-if="payload.source.file_name" class="prov-kv"><span>Файл</span><b :title="payload.source.file_name">{{ payload.source.file_name }}</b></div>
        <div v-if="payload.source.equipment_type" class="prov-kv"><span>Прибор</span><b>{{ payload.source.equipment_type }}</b></div>
        <div v-if="payload.source.protocol" class="prov-kv"><span>Протокол</span><b>{{ payload.source.protocol }}</b></div>
        <div v-if="payload.source.uploaded_at" class="prov-kv"><span>Записано в систему</span><b>{{ String(payload.source.uploaded_at).slice(0, 16).replace('T', ' ') }}</b></div>
      </div>

      <div class="prov-verify">
        <button v-if="canVerify" class="prov-verify-btn" @click="runVerify">
          <i class="pi pi-sync"></i> Перепроверить
        </button>
        <div v-else-if="metric.stored" class="prov-verify-hint">
          Для пересчёта из точек откройте цикл (клик по строке таблицы)
        </div>
        <div v-if="verifyResult" class="prov-verify-result" :class="`is-${verifyResult.status}`">
          <template v-if="verifyResult.status === 'ok'">
            ✓ совпадает: пересчитано {{ fmtNum(verifyResult.recomputed) }}, в базе {{ fmtNum(verifyResult.stored) }}
            <template v-if="verifyResult.approx"> (по загруженным точкам)</template>
          </template>
          <template v-else-if="verifyResult.status === 'mismatch'">
            ✗ расхождение: пересчитано {{ fmtNum(verifyResult.recomputed) }}, в базе {{ fmtNum(verifyResult.stored) }}
            <template v-if="verifyResult.diff != null"> (Δ {{ fmtNum(verifyResult.diff) }})</template>
          </template>
          <template v-else-if="verifyResult.status === 'no-data'">
            в загруженных точках нет данных для этой величины (например, energy_wh
            у ранних загрузок) — пересчёт недоступен
          </template>
          <template v-else>пересчёт недоступен для этой метрики</template>
        </div>
      </div>

      <div class="prov-foot">
        контракт метрик v{{ CONTRACT_VERSION }} · contracts/metrics.v1.json
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.prov-body { max-width: 360px; font-size: 12px; color: #1f2a3d; display: flex; flex-direction: column; gap: 9px; }
.prov-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.prov-head strong { color: #003274; font-size: 13px; }
.prov-value { font-weight: 700; color: #003274; white-space: nowrap; font-variant-numeric: tabular-nums; }
.prov-sec {
  display: block; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; color: rgba(0, 50, 116, 0.5); margin-bottom: 3px;
}
.prov-formula code, .prov-substituted code {
  display: block; background: rgba(0, 50, 116, 0.05); border-radius: 6px;
  padding: 5px 8px; font-size: 11.5px; color: #00264f; overflow-x: auto; white-space: nowrap;
}
.prov-formula small { display: block; margin-top: 4px; color: #5b6b80; line-height: 1.45; }
.prov-lineage ol { margin: 0; padding-left: 16px; color: #44546a; }
.prov-lineage li { margin: 1px 0; }
.prov-source-kind { color: #00264f; font-weight: 600; margin-bottom: 3px; }
.prov-kv { display: flex; gap: 6px; align-items: baseline; min-width: 0; }
.prov-kv span { color: rgba(0, 50, 116, 0.55); font-size: 11px; flex-shrink: 0; }
.prov-kv b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prov-verify-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid rgba(0, 50, 116, 0.25); background: white; color: #003274;
  border-radius: 6px; padding: 4px 10px; font-size: 12px; font-family: inherit; cursor: pointer;
}
.prov-verify-btn:hover { background: rgba(0, 50, 116, 0.06); }
.prov-verify-hint { color: #8a93a3; font-size: 11px; }
.prov-verify-result { margin-top: 5px; padding: 5px 8px; border-radius: 6px; font-weight: 600; }
.prov-verify-result.is-ok { background: rgba(82, 201, 166, 0.15); color: #0f7a5a; }
.prov-verify-result.is-mismatch { background: rgba(231, 76, 60, 0.12); color: #b03a2e; }
.prov-foot { font-size: 10px; color: rgba(0, 50, 116, 0.4); border-top: 1px solid rgba(0, 50, 116, 0.08); padding-top: 6px; }
</style>
