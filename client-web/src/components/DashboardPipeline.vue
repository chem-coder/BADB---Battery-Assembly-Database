<script setup>
/**
 * DashboardPipeline — Multi-track Kanban pipeline for production stages.
 *
 * Features:
 *  - Track switcher (tapes / electrodes / batteries)
 *  - Progress bar per track
 *  - Sortable columns (newest/oldest first)
 *  - "Stale" indicator (>7 days in same stage)
 *  - Collapse/limit cards per column
 *  - Search within pipeline
 *  - Drag-and-drop (batteries only — tapes/electrodes status is derived)
 *  - Track statistics (completed count + average time)
 *  - Compact view toggle
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'

const props = defineProps({
  tapes: { type: Array, default: () => [] },
  electrodeBatches: { type: Array, default: () => [] },
  batteries: { type: Array, default: () => [] },
})

const emit = defineEmits(['refresh'])
const router = useRouter()

// ── State ──
const activeTrack = ref('tapes')
const searchQuery = ref('')
const sortNewest = ref(true)
const compactView = ref(false)
const CARDS_LIMIT = 8
const expandedCols = ref({})

// ── Track definitions ──
const TRACKS = [
  {
    key: 'tapes',
    label: 'Ленты',
    icon: 'pi pi-bars',
    draggable: false,
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
    draggable: false,
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
    draggable: true,
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
const isDraggable = computed(() => currentTrack.value?.draggable || false)

// ── Columns computed ──
const columns = computed(() => {
  const track = currentTrack.value
  if (!track) return []
  let cols
  if (track.key === 'tapes') cols = groupTapes(track.stages)
  else if (track.key === 'electrodes') cols = groupElectrodes(track.stages)
  else if (track.key === 'batteries') cols = groupBatteries(track.stages)
  else cols = []

  // Apply search filter
  const q = searchQuery.value.toLowerCase().trim()
  if (q) {
    cols = cols.map(col => ({
      ...col,
      items: col.items.filter(item => item.name.toLowerCase().includes(q) || (item.badge || '').toLowerCase().includes(q)),
    }))
  }

  // Sort
  cols = cols.map(col => ({
    ...col,
    items: [...col.items].sort((a, b) => {
      const da = new Date(a.date || 0), db = new Date(b.date || 0)
      return sortNewest.value ? db - da : da - db
    }),
  }))

  return cols
})

// ── Statistics ──
const trackStats = computed(() => {
  const track = currentTrack.value
  if (!track) return { total: 0, finished: 0, avgDays: null }
  const cols = columns.value
  const total = cols.reduce((s, c) => s + c.items.length, 0)
  const finishedCodes = ['finished', 'ready', 'completed']
  const finished = cols.filter(c => finishedCodes.includes(c.code)).reduce((s, c) => s + c.items.length, 0)

  // Average age of items (days since creation)
  let allDates = []
  for (const col of cols) {
    for (const item of col.items) {
      if (item.date) allDates.push(new Date(item.date))
    }
  }
  let avgDays = null
  if (allDates.length) {
    const now = Date.now()
    const totalDays = allDates.reduce((s, d) => s + (now - d) / 86400000, 0)
    avgDays = Math.round(totalDays / allDates.length)
  }

  return { total, finished, avgDays }
})

// ── Progress bar ──
const progressSegments = computed(() => {
  const cols = columns.value
  const total = cols.reduce((s, c) => s + c.items.length, 0)
  if (!total) return []
  return cols.map(col => ({
    code: col.code,
    color: col.color,
    pct: (col.items.length / total) * 100,
    count: col.items.length,
    label: col.label,
  })).filter(s => s.pct > 0)
})

// ── Grouping functions ──
const STALE_DAYS = 7

function isStale(dateStr) {
  if (!dateStr) return false
  return (Date.now() - new Date(dateStr)) > STALE_DAYS * 86400000
}

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
      stale: isStale(t.created_at) && !t.workflow_complete,
      rawStatus: t.workflow_status_code,
    })),
  }))
}

function groupElectrodes(stages) {
  const grouped = {}
  for (const s of stages) grouped[s.code] = []
  for (const b of props.electrodeBatches) {
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
        stale: isStale(b.created_at) && s.code !== 'ready',
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
      stale: isStale(bt.created_at) && s.code !== 'completed' && s.code !== 'failed',
      _batteryId: bt.battery_id,
    })),
  }))
}

// ── Collapse/expand ──
function isExpanded(colCode) {
  return !!expandedCols.value[colCode]
}

function toggleExpand(colCode) {
  expandedCols.value[colCode] = !expandedCols.value[colCode]
}

function visibleItems(col) {
  if (isExpanded(col.code) || col.items.length <= CARDS_LIMIT) return col.items
  return col.items.slice(0, CARDS_LIMIT)
}

function hiddenCount(col) {
  if (isExpanded(col.code) || col.items.length <= CARDS_LIMIT) return 0
  return col.items.length - CARDS_LIMIT
}

// ── Drag and drop (batteries only) ──
const dragItem = ref(null)
const dropTarget = ref(null)

function onDragStart(e, item, colCode) {
  if (!isDraggable.value) return
  dragItem.value = { ...item, fromCol: colCode }
  e.dataTransfer.effectAllowed = 'move'
  e.target.style.opacity = '0.4'
}

function onDragEnd(e) {
  if (e.target) e.target.style.opacity = ''
  dragItem.value = null
  dropTarget.value = null
}

function onDragOver(e, colCode) {
  if (!dragItem.value || dragItem.value.fromCol === colCode) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dropTarget.value = colCode
}

function onDragLeave(e, colCode) {
  if (dropTarget.value === colCode) dropTarget.value = null
}

async function onDrop(e, colCode) {
  e.preventDefault()
  dropTarget.value = null
  if (!dragItem.value || dragItem.value.fromCol === colCode) return

  const batteryId = dragItem.value._batteryId
  if (!batteryId) return

  try {
    await api.patch(`/api/batteries/${batteryId}`, { status: colCode })
    emit('refresh')
  } catch {
    // silent — card stays in original column until refresh
  }
  dragItem.value = null
}

// ── Helpers ──
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const diff = Date.now() - d
  if (diff < 86400000) return 'сегодня'
  if (diff < 172800000) return 'вчера'
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} дн`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function goTo(link) { router.push(link) }
</script>

<template>
  <div class="pipeline-container">
    <!-- Track switcher + controls -->
    <div class="pipeline-header">
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

      <div class="pipeline-controls">
        <div class="pipe-search">
          <i class="pi pi-search"></i>
          <input v-model="searchQuery" placeholder="Поиск..." />
        </div>
        <button class="pipe-ctrl-btn" @click="sortNewest = !sortNewest" :title="sortNewest ? 'Новые сверху' : 'Старые сверху'">
          <i :class="sortNewest ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up'"></i>
        </button>
        <button :class="['pipe-ctrl-btn', compactView ? 'pipe-ctrl-btn--active' : '']" @click="compactView = !compactView" title="Компактный вид">
          <i class="pi pi-list"></i>
        </button>
      </div>
    </div>

    <!-- Statistics bar -->
    <div class="stats-bar">
      <span class="stats-text">
        {{ trackStats.finished }} из {{ trackStats.total }} завершено
      </span>
      <span v-if="trackStats.avgDays !== null" class="stats-text stats-text--dim">
        ср. возраст: {{ trackStats.avgDays }} дн
      </span>
      <span v-if="isDraggable" class="stats-hint">
        <i class="pi pi-arrows-alt"></i> Перетаскивайте карточки
      </span>
    </div>

    <!-- Progress bar -->
    <div class="progress-bar" v-if="progressSegments.length">
      <div
        v-for="seg in progressSegments"
        :key="seg.code"
        class="progress-segment"
        :style="{ width: seg.pct + '%', background: seg.color }"
        :title="`${seg.label}: ${seg.count}`"
      ></div>
    </div>

    <!-- Kanban columns -->
    <div class="pipeline-scroll">
      <div
        v-for="col in columns"
        :key="col.code"
        :class="['pipeline-column', dropTarget === col.code ? 'pipeline-column--drop' : '']"
        @dragover="onDragOver($event, col.code)"
        @dragleave="onDragLeave($event, col.code)"
        @drop="onDrop($event, col.code)"
      >
        <div class="column-header" :style="{ borderTopColor: col.color }">
          <span class="column-label">{{ col.label }}</span>
          <span class="column-count" :style="{ background: col.color + '18', color: col.color }">{{ col.items.length }}</span>
        </div>
        <div class="column-body">
          <!-- Compact view -->
          <template v-if="compactView">
            <div
              v-for="item in visibleItems(col)"
              :key="item.id"
              :class="['compact-row', item.stale ? 'compact-row--stale' : '']"
              @click="goTo(item.link)"
              :draggable="isDraggable"
              @dragstart="onDragStart($event, item, col.code)"
              @dragend="onDragEnd"
            >
              <span class="compact-name">{{ item.name }}</span>
              <span v-if="item.badge" class="compact-badge">{{ item.badge }}</span>
              <span class="compact-date">{{ formatTime(item.date) }}</span>
            </div>
          </template>

          <!-- Card view -->
          <template v-else>
            <div
              v-for="item in visibleItems(col)"
              :key="item.id"
              :class="['pipe-card glass-card', item.stale ? 'pipe-card--stale' : '']"
              @click="goTo(item.link)"
              :draggable="isDraggable"
              @dragstart="onDragStart($event, item, col.code)"
              @dragend="onDragEnd"
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
          </template>

          <!-- Show more -->
          <button v-if="hiddenCount(col) > 0" class="show-more-btn" @click="toggleExpand(col.code)">
            {{ isExpanded(col.code) ? 'Свернуть' : `Ещё ${hiddenCount(col)}` }}
          </button>

          <div v-if="col.items.length === 0" class="column-empty">—</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pipeline-container { width: 100%; }

/* ── Header ── */
.pipeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}

.track-switcher {
  display: flex;
  gap: 0.25rem;
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

.pipeline-controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.pipe-search {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.85);
}
.pipe-search i { font-size: 11px; color: #9CA3AF; }
.pipe-search input {
  border: none;
  background: transparent;
  font-size: 12px;
  width: 90px;
  outline: none;
  font-family: inherit;
  color: #333;
}
.pipe-search input::placeholder { color: #9CA3AF; }

.pipe-ctrl-btn {
  width: 28px;
  height: 28px;
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.85);
  color: #6B7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: all 0.15s;
}
.pipe-ctrl-btn:hover { color: #003274; background: rgba(255, 255, 255, 0.98); }
.pipe-ctrl-btn--active { background: rgba(0, 50, 116, 0.08); color: #003274; border-color: rgba(0, 50, 116, 0.2); }

/* ── Stats bar ── */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.4rem;
  padding: 0 0.15rem;
}
.stats-text { font-size: 11px; font-weight: 600; color: rgba(0, 50, 116, 0.5); }
.stats-text--dim { font-weight: 400; color: rgba(0, 50, 116, 0.3); }
.stats-hint {
  font-size: 10px;
  color: rgba(82, 201, 166, 0.7);
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 3px;
}

/* ── Progress bar ── */
.progress-bar {
  display: flex;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 0.75rem;
  background: rgba(0, 50, 116, 0.04);
}
.progress-segment {
  height: 100%;
  transition: width 0.3s;
  min-width: 2px;
}

/* ── Kanban ── */
.pipeline-scroll {
  display: flex;
  gap: 0.65rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  min-height: 200px;
}
.pipeline-scroll::-webkit-scrollbar { height: 5px; }
.pipeline-scroll::-webkit-scrollbar-track { background: transparent; }
.pipeline-scroll::-webkit-scrollbar-thumb { background: rgba(0, 50, 116, 0.12); border-radius: 3px; }

.pipeline-column {
  flex: 0 0 168px;
  display: flex;
  flex-direction: column;
  transition: background 0.2s;
  border-radius: 8px;
}
.pipeline-column--drop {
  background: rgba(82, 201, 166, 0.08);
  box-shadow: inset 0 0 0 2px rgba(82, 201, 166, 0.3);
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.6rem;
  font-size: 11px;
  font-weight: 700;
  color: #333;
  border-top: 3px solid;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8px 8px 0 0;
  backdrop-filter: blur(8px);
}
.column-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.column-count {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  flex-shrink: 0;
}

.column-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.35rem;
  background: rgba(0, 50, 116, 0.02);
  border-radius: 0 0 8px 8px;
  min-height: 60px;
}

/* ── Card view ── */
.pipe-card {
  padding: 0.5rem 0.6rem;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
  border-left: 3px solid transparent;
}
.pipe-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(0, 50, 116, 0.12);
}
.pipe-card--stale {
  border-left-color: #E74C3C;
}
.pipe-card[draggable="true"] { cursor: grab; }
.pipe-card[draggable="true"]:active { cursor: grabbing; }

.pipe-card-name {
  font-size: 12px;
  font-weight: 600;
  color: #003274;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pipe-card-meta {
  display: flex;
  gap: 3px;
  margin-bottom: 2px;
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
.pipe-operator { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70px; }

/* ── Compact view ── */
.compact-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: background 0.12s;
  border-left: 2px solid transparent;
}
.compact-row:hover { background: rgba(0, 50, 116, 0.04); }
.compact-row--stale { border-left-color: #E74C3C; }
.compact-row[draggable="true"] { cursor: grab; }

.compact-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #003274;
  font-weight: 500;
}
.compact-badge {
  font-size: 9px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(0, 50, 116, 0.06);
  color: #6B7280;
  flex-shrink: 0;
}
.compact-date {
  font-size: 10px;
  color: #9CA3AF;
  flex-shrink: 0;
}

/* ── Show more ── */
.show-more-btn {
  border: none;
  background: rgba(0, 50, 116, 0.04);
  color: rgba(0, 50, 116, 0.4);
  font-size: 11px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
  font-family: inherit;
}
.show-more-btn:hover { background: rgba(0, 50, 116, 0.08); color: #003274; }

.column-empty {
  text-align: center;
  color: #D1D7DE;
  font-size: 14px;
  padding: 1rem 0;
}

@media (max-width: 768px) {
  .pipeline-header { flex-direction: column; align-items: stretch; }
  .pipeline-column { flex: 0 0 145px; }
  .pipe-search input { width: 60px; }
}
</style>
