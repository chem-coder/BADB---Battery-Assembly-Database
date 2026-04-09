<script setup>
/**
 * DashboardPipeline — Multi-track Kanban pipeline for production stages.
 * Track 1: Tape production (8 stages from Dalia's workflow)
 * Track 2: Electrode cutting
 * Track 3: Battery assembly
 * Extensible: add more tracks via TRACKS config.
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  tapes: { type: Array, default: () => [] },
  electrodeBatches: { type: Array, default: () => [] },
  batteries: { type: Array, default: () => [] },
})

const router = useRouter()
const activeTrack = ref('tapes')

// ── Track definitions ─────────────────────────────────────────────────
const TRACKS = [
  {
    key: 'tapes',
    label: 'Ленты',
    icon: 'pi pi-bars',
    stages: [
      { code: 'recipe_materials', label: 'Экземпляры', color: '#6B7280' },
      { code: 'drying_am', label: 'Сушка АМ', color: '#D3A754' },
      { code: 'weighing', label: 'Замес', color: '#025EA1' },
      { code: 'mixing', label: 'Перемешивание', color: '#6CACE4' },
      { code: 'coating', label: 'Нанесение', color: '#52C9A6' },
      { code: 'drying_tape', label: 'Сушка ленты', color: '#D3A754' },
      { code: 'calendering', label: 'Каландрирование', color: '#E74C3C' },
      { code: 'drying_pressed_tape', label: 'Сушка после', color: '#D3A754' },
      { code: 'finished', label: 'Завершено', color: '#1d7a5f' },
    ],
  },
  {
    key: 'electrodes',
    label: 'Электроды',
    icon: 'pi pi-clone',
    stages: [
      { code: 'pending', label: 'Ожидание', color: '#6B7280' },
      { code: 'cutting', label: 'Нарезка', color: '#025EA1' },
      { code: 'weighing', label: 'Взвешивание', color: '#6CACE4' },
      { code: 'drying', label: 'Сушка', color: '#D3A754' },
      { code: 'ready', label: 'Готовы', color: '#1d7a5f' },
    ],
  },
  {
    key: 'batteries',
    label: 'Аккумуляторы',
    icon: 'pi pi-box',
    stages: [
      { code: 'draft', label: 'Черновик', color: '#6B7280' },
      { code: 'assembled', label: 'Собраны', color: '#025EA1' },
      { code: 'testing', label: 'Тестирование', color: '#D3A754' },
      { code: 'completed', label: 'Завершены', color: '#1d7a5f' },
      { code: 'failed', label: 'Брак', color: '#E74C3C' },
    ],
  },
]

const currentTrack = computed(() => TRACKS.find(t => t.key === activeTrack.value))

const columns = computed(() => {
  const track = currentTrack.value
  if (!track) return []

  if (track.key === 'tapes') {
    return groupTapes(track.stages)
  }
  if (track.key === 'electrodes') {
    return groupElectrodes(track.stages)
  }
  if (track.key === 'batteries') {
    return groupBatteries(track.stages)
  }
  return []
})

function groupTapes(stages) {
  const grouped = {}
  for (const s of stages) grouped[s.code] = []

  for (const t of props.tapes) {
    const code = t.workflow_complete ? 'finished' : (t.workflow_status_code || 'recipe_materials')
    if (grouped[code]) grouped[code].push(t)
    else grouped['recipe_materials'].push(t)
  }

  return stages.map(s => ({
    ...s,
    items: (grouped[s.code] || []).map(t => ({
      id: t.tape_id,
      name: t.name || `Лента #${t.tape_id}`,
      badge: t.project_name,
      meta: t.role === 'cathode' ? 'К' : t.role === 'anode' ? 'А' : '',
      sub: t.created_by_name || '',
      date: t.created_at,
      link: `/tapes?select=${t.tape_id}`,
    })),
  }))
}

function groupElectrodes(stages) {
  const grouped = {}
  for (const s of stages) grouped[s.code] = []

  for (const b of props.electrodeBatches) {
    // Simple heuristic: if has electrode_count > 0 and drying → ready
    const code = b.electrode_count > 0 && b.drying_start ? 'ready'
      : b.electrode_count > 0 ? 'weighing'
      : b.drying_start ? 'drying'
      : 'cutting'
    if (grouped[code]) grouped[code].push(b)
    else grouped['pending'].push(b)
  }

  return stages.map(s => ({
    ...s,
    items: (grouped[s.code] || []).map(b => {
      const role = b.tape_role === 'cathode' ? 'К' : b.tape_role === 'anode' ? 'А' : ''
      const dims = b.shape === 'circle' && b.diameter_mm ? ` · \u2300${b.diameter_mm}` : ''
      return {
        id: b.cut_batch_id,
        name: b.tape_name ? `${b.tape_name} \u2192 #${b.cut_batch_id}` : `Партия #${b.cut_batch_id}`,
        badge: b.project_name,
        meta: `${role}${role ? ' · ' : ''}${b.electrode_count || 0} шт.${dims}`,
        sub: b.created_by_name || '',
        date: b.created_at,
        link: `/electrodes/${b.cut_batch_id}`,
      }
    }),
  }))
}

function groupBatteries(stages) {
  const grouped = {}
  for (const s of stages) grouped[s.code] = []

  for (const bt of props.batteries) {
    const code = bt.status || 'draft'
    if (grouped[code]) grouped[code].push(bt)
    else grouped['draft'].push(bt)
  }

  const FF_LABELS = { coin: 'Монета', pouch: 'Пакет', cylindrical: 'Цилиндр' }

  return stages.map(s => ({
    ...s,
    items: (grouped[s.code] || []).map(bt => ({
      id: bt.battery_id,
      name: `Акк. #${bt.battery_id}`,
      badge: bt.project_name,
      meta: FF_LABELS[bt.form_factor] || bt.form_factor || '',
      sub: bt.created_by_name || '',
      date: bt.created_at,
      link: `/assembly/${bt.battery_id}`,
    })),
  }))
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 86400000) return 'сегодня'
  if (diff < 172800000) return 'вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function goTo(link) {
  router.push(link)
}
</script>

<template>
  <div class="pipeline-container">
    <!-- Track switcher -->
    <div class="track-switcher">
      <button
        v-for="track in TRACKS"
        :key="track.key"
        :class="['track-btn', activeTrack === track.key ? 'active' : '']"
        @click="activeTrack = track.key"
      >
        <i :class="track.icon"></i>
        {{ track.label }}
      </button>
    </div>

    <!-- Kanban columns -->
    <div class="pipeline-scroll">
      <div v-for="col in columns" :key="col.code" class="pipeline-column">
        <div class="column-header" :style="{ borderTopColor: col.color }">
          <span class="column-label">{{ col.label }}</span>
          <span class="column-count" :style="{ background: col.color + '18', color: col.color }">{{ col.items.length }}</span>
        </div>
        <div class="column-body">
          <div
            v-for="item in col.items"
            :key="item.id"
            class="pipe-card glass-card"
            @click="goTo(item.link)"
          >
            <div class="pipe-card-name">{{ item.name }}</div>
            <div class="pipe-card-meta">
              <span v-if="item.badge" class="pipe-badge">{{ item.badge }}</span>
              <span v-if="item.meta" class="pipe-role">{{ item.meta }}</span>
            </div>
            <div class="pipe-card-footer">
              <span class="pipe-operator">{{ item.sub }}</span>
              <span class="pipe-date">{{ formatTime(item.date) }}</span>
            </div>
          </div>
          <div v-if="col.items.length === 0" class="column-empty">—</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pipeline-container { width: 100%; }

/* Track switcher */
.track-switcher {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  background: rgba(0, 50, 116, 0.04);
  padding: 3px;
  border-radius: 8px;
  width: fit-content;
}
.track-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0.35rem 0.75rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #6B7280;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.track-btn:hover { color: #003274; }
.track-btn.active {
  background: rgba(255, 255, 255, 0.85);
  color: #003274;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 50, 116, 0.08);
}
.track-btn i { font-size: 12px; }

/* Kanban */
.pipeline-scroll {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  min-height: 250px;
}
.pipeline-scroll::-webkit-scrollbar { height: 6px; }
.pipeline-scroll::-webkit-scrollbar-track { background: transparent; }
.pipeline-scroll::-webkit-scrollbar-thumb { background: rgba(0, 50, 116, 0.15); border-radius: 3px; }

.pipeline-column {
  flex: 0 0 170px;
  display: flex;
  flex-direction: column;
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.65rem;
  font-size: 12px;
  font-weight: 700;
  color: #333;
  border-top: 3px solid;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8px 8px 0 0;
  backdrop-filter: blur(8px);
}
.column-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.column-count {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.column-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.4rem;
  background: rgba(0, 50, 116, 0.02);
  border-radius: 0 0 8px 8px;
  min-height: 80px;
}

.pipe-card {
  padding: 0.55rem 0.65rem;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
}
.pipe-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(0, 50, 116, 0.12);
}

.pipe-card-name {
  font-size: 12px;
  font-weight: 600;
  color: #003274;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pipe-card-meta {
  display: flex;
  gap: 3px;
  margin-bottom: 3px;
}
.pipe-badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 6px;
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}
.pipe-role {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 6px;
  background: rgba(82, 201, 166, 0.15);
  color: #1d7a5f;
  font-weight: 700;
}

.pipe-card-footer {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #6B7280;
}
.pipe-operator { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80px; }

.column-empty {
  text-align: center;
  color: #D1D7DE;
  font-size: 14px;
  padding: 1.5rem 0;
}

@media (max-width: 768px) {
  .pipeline-column { flex: 0 0 150px; }
}
</style>
