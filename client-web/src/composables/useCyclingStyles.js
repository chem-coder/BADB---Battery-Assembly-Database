/**
 * useCyclingStyles — per-user style library for the cycling charts.
 *
 * Data model:
 *
 *   library = {
 *     activePresetId: 'default',
 *     presets: [
 *       {
 *         id: 'default',  name: 'Мои по умолчанию', readonly: false,
 *         charts: { capacity: {...}, voltage: {...}, dqdv: {...}, hysteresis: {...} },
 *       },
 *       { id: 'publication-bw', name: 'Публикация (ч/б)', readonly: true, charts: {...} },
 *       { id: 'colorblind',     name: 'Colorblind-safe',  readonly: true, charts: {...} },
 *     ],
 *   }
 *
 * Per-chart style:
 *   { palette: 'badb' | 'okabe-ito' | 'greyscale', borderWidth: 1.8,
 *     pointStyle: 'circle' | false | ..., pointRadius: 3 }
 *
 * Color is resolved per session from the selected palette via
 * colorForSession(chartId, sessionIndex) — this preserves visual
 * distinction between batteries (foundational for multi-session plots)
 * while letting the user swap the full palette with one dropdown.
 *
 * State persists to localStorage under `badb-cycling-style-library-${userId}`.
 * A module-level singleton is returned so every component that calls
 * useCyclingStyles() sees the same reactive object.
 */
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'

// ── Palettes ─────────────────────────────────────────────────────────
// BADB default = the 8-color palette already used across the app.
// Okabe-Ito = colorblind-safe, published reference.
// Greyscale = 5 shades for print-first publications.
export const PALETTES = {
  badb: {
    label: 'BADB',
    colors: [
      '#003274', '#E67E22', '#52C9A6', '#8E44AD',
      '#D3A754', '#16A085', '#E74C3C', '#2C3E50',
    ],
  },
  'okabe-ito': {
    label: 'Colorblind-safe (Okabe–Ito)',
    colors: [
      '#000000', '#E69F00', '#56B4E9', '#009E73',
      '#F0E442', '#0072B2', '#D55E00', '#CC79A7',
    ],
  },
  greyscale: {
    label: 'Ч/Б (print)',
    colors: ['#000000', '#4D4D4D', '#808080', '#A6A6A6', '#BFBFBF'],
  },
}

// ── Chart vocabulary ─────────────────────────────────────────────────
export const CHART_IDS = ['capacity', 'voltage', 'dqdv', 'hysteresis']

export const CHART_LABELS = {
  capacity: 'Ёмкость + КЭ',
  voltage: 'Профиль напряжения',
  dqdv: 'dQ/dV',
  hysteresis: 'Гистерезис V̄',
}

export const POINT_STYLE_OPTIONS = [
  { key: 'none',      label: '∅', value: false   },
  { key: 'circle',    label: '●', value: 'circle' },
  { key: 'rect',      label: '■', value: 'rect' },
  { key: 'triangle',  label: '▲', value: 'triangle' },
  { key: 'cross',     label: '✕', value: 'cross' },
  { key: 'rectRot',   label: '◆', value: 'rectRot' },
  { key: 'star',      label: '★', value: 'star' },
]

// ── Built-in presets ─────────────────────────────────────────────────
function makeDefaultChartStyle(overrides = {}) {
  return {
    palette: 'badb',
    borderWidth: 1.8,
    pointStyle: 'circle',
    pointRadius: 3,
    ...overrides,
  }
}

function buildPreset(id, name, readonly, fn) {
  return {
    id,
    name,
    readonly,
    charts: {
      capacity:   fn('capacity'),
      voltage:    fn('voltage'),
      dqdv:       fn('dqdv'),
      hysteresis: fn('hysteresis'),
    },
  }
}

const BUILTIN_PRESETS = [
  // User-editable default — always present.
  buildPreset('default', 'Мои по умолчанию', false, (chartId) => makeDefaultChartStyle({
    // dQ/dV is noisy, hide point markers by default
    pointStyle: chartId === 'dqdv' ? false : 'circle',
    pointRadius: chartId === 'dqdv' ? 0 : 3,
    // voltage profile has dense points, slimmer default
    borderWidth: chartId === 'voltage' ? 1.6 : (chartId === 'dqdv' ? 1.2 : 1.8),
  })),
  // Read-only: print / publication style
  buildPreset('publication-bw', 'Публикация (ч/б)', true, (chartId) => makeDefaultChartStyle({
    palette: 'greyscale',
    borderWidth: chartId === 'dqdv' ? 1.0 : 1.2,
    pointStyle: chartId === 'voltage' || chartId === 'dqdv' ? false : 'circle',
    pointRadius: chartId === 'voltage' || chartId === 'dqdv' ? 0 : 2,
  })),
  // Read-only: colorblind-safe
  buildPreset('colorblind', 'Colorblind-safe', true, (chartId) => makeDefaultChartStyle({
    palette: 'okabe-ito',
    pointStyle: chartId === 'dqdv' ? false : 'circle',
    pointRadius: chartId === 'dqdv' ? 0 : 3,
  })),
]

function makeDefaultLibrary() {
  // Deep-clone built-ins so later mutations don't leak into the module scope.
  return {
    activePresetId: 'default',
    presets: BUILTIN_PRESETS.map(p => JSON.parse(JSON.stringify(p))),
  }
}

// ── Storage ──────────────────────────────────────────────────────────
let singleton = null

function storageKey(userId) {
  return `badb-cycling-style-library-${userId || 'anon'}`
}

function loadFromStorage(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return makeDefaultLibrary()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.presets)) {
      return makeDefaultLibrary()
    }
    // Ensure built-ins are always present (re-inject if storage is older).
    const merged = makeDefaultLibrary()
    const savedUser = parsed.presets.filter(p => !BUILTIN_PRESETS.find(b => b.id === p.id))
    merged.presets = [
      ...merged.presets,
      ...savedUser.map(p => ({ ...p, readonly: false })),
    ]
    if (parsed.activePresetId && merged.presets.find(p => p.id === parsed.activePresetId)) {
      merged.activePresetId = parsed.activePresetId
    }
    // Restore saved overrides on the user-editable "default" preset.
    const savedDefault = parsed.presets.find(p => p.id === 'default')
    if (savedDefault && savedDefault.charts) {
      const target = merged.presets.find(p => p.id === 'default')
      for (const chartId of CHART_IDS) {
        if (savedDefault.charts[chartId]) {
          target.charts[chartId] = { ...target.charts[chartId], ...savedDefault.charts[chartId] }
        }
      }
    }
    return merged
  } catch {
    return makeDefaultLibrary()
  }
}

function saveToStorage(userId, library) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(library))
  } catch {
    /* quota / private mode — ignore */
  }
}

// ── Composable ───────────────────────────────────────────────────────
export function useCyclingStyles() {
  if (singleton) return singleton

  const auth = useAuthStore()
  const userId = auth?.user?.user_id ?? auth?.user?.userId ?? 'anon'
  const library = ref(loadFromStorage(userId))

  watch(library, (v) => saveToStorage(userId, v), { deep: true })

  const activePreset = computed(() => {
    return library.value.presets.find(p => p.id === library.value.activePresetId)
        || library.value.presets[0]
  })

  function getChartStyle(chartId) {
    const preset = activePreset.value
    if (!preset) return makeDefaultChartStyle()
    return { ...makeDefaultChartStyle(), ...(preset.charts?.[chartId] || {}) }
  }

  // Returns true on success, false if the active preset is read-only.
  function setChartStyle(chartId, partial) {
    const preset = activePreset.value
    if (!preset || preset.readonly) return false
    const idx = library.value.presets.findIndex(p => p.id === preset.id)
    if (idx < 0) return false
    const next = JSON.parse(JSON.stringify(library.value))
    next.presets[idx].charts[chartId] = {
      ...next.presets[idx].charts[chartId],
      ...partial,
    }
    library.value = next
    return true
  }

  function resetChartStyle(chartId) {
    const preset = activePreset.value
    if (!preset || preset.readonly) return false
    const builtin = BUILTIN_PRESETS.find(p => p.id === preset.id)
    const fallback = builtin
      ? JSON.parse(JSON.stringify(builtin.charts[chartId]))
      : makeDefaultChartStyle()
    const next = JSON.parse(JSON.stringify(library.value))
    const idx = next.presets.findIndex(p => p.id === preset.id)
    next.presets[idx].charts[chartId] = fallback
    library.value = next
    return true
  }

  function applyPreset(id) {
    if (!library.value.presets.find(p => p.id === id)) return false
    library.value = { ...library.value, activePresetId: id }
    return true
  }

  function savePresetAs(name) {
    const trimmed = (name || '').trim()
    if (!trimmed) return null
    const base = activePreset.value
    const id = `user-${Date.now()}`
    const next = JSON.parse(JSON.stringify(library.value))
    next.presets.push({
      id,
      name: trimmed,
      readonly: false,
      charts: JSON.parse(JSON.stringify(base?.charts || {})),
    })
    next.activePresetId = id
    library.value = next
    return id
  }

  function renamePreset(id, name) {
    const trimmed = (name || '').trim()
    if (!trimmed) return false
    const idx = library.value.presets.findIndex(p => p.id === id)
    if (idx < 0 || library.value.presets[idx].readonly) return false
    const next = JSON.parse(JSON.stringify(library.value))
    next.presets[idx].name = trimmed
    library.value = next
    return true
  }

  function deletePreset(id) {
    const preset = library.value.presets.find(p => p.id === id)
    if (!preset || preset.readonly) return false
    if (id === 'default') return false
    const next = JSON.parse(JSON.stringify(library.value))
    next.presets = next.presets.filter(p => p.id !== id)
    if (next.activePresetId === id) next.activePresetId = 'default'
    library.value = next
    return true
  }

  // Resolves the color for a session on a given chart, rotating through
  // the chart's palette so every session gets a stable distinguishable hue.
  function colorForSession(chartId, sessionIndex) {
    const style = getChartStyle(chartId)
    const palette = PALETTES[style.palette] || PALETTES.badb
    const colors = palette.colors
    const i = Number.isFinite(sessionIndex) ? Math.abs(sessionIndex) : 0
    return colors[i % colors.length]
  }

  singleton = {
    library,
    activePreset,
    getChartStyle,
    setChartStyle,
    resetChartStyle,
    applyPreset,
    savePresetAs,
    renamePreset,
    deletePreset,
    colorForSession,
    PALETTES,
    CHART_IDS,
    CHART_LABELS,
    POINT_STYLE_OPTIONS,
  }
  return singleton
}
