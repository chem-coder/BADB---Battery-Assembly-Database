<script setup>
/**
 * CrudTable — universal CRUD table component.
 * Extracted 1-to-1 from DesignSystemPage Section 9.
 *
 * Features (all from Design System):
 *   ✓ Sticky toolbar with blur (table name, rename, CSV export, rows input, column count)
 *   ✓ Column filters (Excel-like overlay: search, select all, per-value checkboxes)
 *   ✓ Row selection (click, Shift+click range, Ctrl+click toggle)
 *   ✓ Custom context menu (glass-card style, "Удалить" only)
 *   ✓ Sortable & resizable & reorderable columns
 *   ✓ Frozen first column (№)
 *   ✓ Pagination (separate Paginator)
 *   ✓ Auto-fit column on resizer double-click
 *   ✓ All DS table CSS — zero page-level overrides needed
 *
 * Props:
 *   columns       — array of { field, header, sortable?, filterable?, frozen?, width?, minWidth?, slot? }
 *   data          — reactive data array
 *   idField       — row ID field name (e.g. 'tape_id')
 *   tableName     — default table name
 *   loading       — show loading state
 *   showAdd       — show "Добавить" button in toolbar
 *   rowClickable  — enable row click navigation
 *
 * Events:
 *   @delete(items)   — user confirmed delete via context menu
 *   @add()           — "Добавить" clicked
 *   @row-click(data) — row clicked (only if rowClickable)
 *   @export({format, items}) — export selected rows (format: 'excel'|'csv'|'json')
 *
 * Slots:
 *   #col-{field}="{ data }"  — custom cell renderer for a column
 *   #toolbar-end              — extra toolbar content after column count (before spacer)
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Paginator from 'primevue/paginator'
import { useAuthStore } from '@/stores/auth'
import { useUserPref } from '@/composables/useUserPref'

const props = defineProps({
  columns:      { type: Array, required: true },
  data:         { type: Array, required: true },
  idField:      { type: String, default: 'id' },
  tableName:    { type: String, default: 'Таблица' },
  loading:      { type: Boolean, default: false },
  showAdd:      { type: Boolean, default: false },
  rowClickable: { type: Boolean, default: false },
  exportBadge:  { type: Number, default: 0 },  // extra selected count shown on export menu items
  // When true, the right-click context menu shows a «Дублировать» item
  // for single-row selections. Parent handles @duplicate(item) by
  // opening its create dialog prefilled with a copy. Mirrors the export
  // flow (right-click → action) rather than a dedicated table column.
  showDuplicate: { type: Boolean, default: false },
  // Stable identifier for this table — used as the namespace for
  // per-user column-visibility persistence in localStorage. If empty,
  // toggling still works but nothing is persisted.
  tableKey:     { type: String, default: '' },
})

const emit = defineEmits(['delete', 'add', 'row-click', 'export', 'header-click', 'duplicate'])

// ── Toolbar state ──────────────────────────────────────────────────────
const localTableName = ref(props.tableName)

// "Строк в окне" — fixed Select with 5 / 25 / Все (all). `-1` is the
// sentinel for "all rows visible, no pagination". Per-user, namespaced
// by tableKey so each list remembers its own choice. Default = 5.
const VISIBLE_ROWS_OPTIONS = [
  { value: 5,  label: '5' },
  { value: 25, label: '25' },
  { value: -1, label: 'Все' },
]
const visibleRows = useUserPref(
  `crud:visible-rows:${props.tableKey || 'default'}`,
  5,
)

// `effectiveVisibleRows` returns the actual number of rows to display.
// When `visibleRows === -1` ("Все"), it falls back to the filtered
// row count so pagination math sees a single page covering everything.
const effectiveVisibleRows = computed(() => {
  if (visibleRows.value === -1) return Math.max(filteredData.value.length, 1)
  return visibleRows.value
})

// ── Column visibility (per-user, persisted to localStorage) ────────────
// Persistence key is namespaced by tableKey prop + current user id so
// each user's per-table layout is remembered across sessions. Columns
// marked { required: true } cannot be hidden (e.g. constructor checkbox,
// row-id, frozen primary identifier).
const authStore = useAuthStore()

function storageKey() {
  if (!props.tableKey) return ''
  const uid = authStore.user?.userId || 'guest'
  return `badb:cols-hidden:${props.tableKey}:${uid}`
}

function loadHidden() {
  const key = storageKey()
  if (!key) return new Set()
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

const hiddenColumns = ref(loadHidden())

watch(hiddenColumns, (next) => {
  const key = storageKey()
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify([...next]))
  } catch {
    // localStorage quota exceeded / disabled — silent, the UI still works
    // this session, it just won't survive a reload.
  }
}, { deep: true })

// Whenever auth changes (login as someone else) — reload the saved set.
watch(() => authStore.user?.userId, () => {
  hiddenColumns.value = loadHidden()
})

const visibleColumns = computed(() =>
  props.columns.filter(c => !hiddenColumns.value.has(c.field))
)

function toggleColumn(field, required) {
  if (required) return
  const next = new Set(hiddenColumns.value)
  if (next.has(field)) next.delete(field)
  else next.add(field)
  hiddenColumns.value = next
}

function resetColumns() {
  hiddenColumns.value = new Set()
}

const columnsMenuVisible = ref(false)
const columnsBtnRef = ref(null)
function toggleColumnsMenu() { columnsMenuVisible.value = !columnsMenuVisible.value }

// Total column count = № + visible user columns
const columnCount = computed(() => 1 + visibleColumns.value.length)

// Table viewport — always max 10 visible rows, scroll if more
const TABLE_MAX_VIEW = 10
const tableScrollHeight = computed(() => (45 + TABLE_MAX_VIEW * 53) + 'px')

// ── Row selection & context menu ───────────────────────────────────────
const selectedRows = ref(new Set())
const ctxMenuVisible = ref(false)
const ctxMenuPos = ref({ x: 0, y: 0 })
let lastClickedIdx = null

function getRowId(data) {
  return data[props.idField]
}

function onRowClick(event, data, index) {
  // index from PrimeVue is relative to paginatedData; convert to filteredData index
  const absIndex = tableFirst.value + index
  if (event.shiftKey && lastClickedIdx !== null) {
    const from = Math.min(lastClickedIdx, absIndex)
    const to = Math.max(lastClickedIdx, absIndex)
    for (let i = from; i <= to; i++) {
      selectedRows.value.add(getRowId(filteredData.value[i]))
    }
  } else if (event.ctrlKey || event.metaKey) {
    const id = getRowId(data)
    if (selectedRows.value.has(id)) selectedRows.value.delete(id)
    else selectedRows.value.add(id)
  } else {
    // When rowClickable, regular click emits row-click without persisting selection
    if (props.rowClickable) {
      selectedRows.value = new Set()
    } else {
      selectedRows.value = new Set([getRowId(data)])
    }
  }
  lastClickedIdx = absIndex
  selectedRows.value = new Set(selectedRows.value) // trigger reactivity

  if (props.rowClickable && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
    emit('row-click', data)
  }
}

function onRowContextMenu(event, data, index) {
  event.preventDefault()
  const absIndex = tableFirst.value + index
  const id = getRowId(data)
  if (!selectedRows.value.has(id)) {
    selectedRows.value = new Set([id])
    lastClickedIdx = absIndex
  }
  ctxMenuPos.value = { x: event.clientX, y: event.clientY }
  ctxMenuVisible.value = true
}

function deleteSelectedRows() {
  const items = props.data.filter(r => selectedRows.value.has(getRowId(r)))
  emit('delete', items)
  selectedRows.value = new Set()
  ctxMenuVisible.value = false
}

// exportBadge = total items that will be exported (calculated by parent, includes overlaps)
const exportCount = computed(() => props.exportBadge || selectedRows.value.size)

function emitExport(format) {
  const items = props.data.filter(r => selectedRows.value.has(getRowId(r)))
  emit('export', { format, items })
  ctxMenuVisible.value = false
}

// Duplicate the single selected row. Only offered when exactly one row
// is selected (duplicating a multi-selection has no clear meaning — the
// create dialog seeds from one source record).
function emitDuplicate() {
  if (selectedRows.value.size !== 1) return
  const id = [...selectedRows.value][0]
  const item = props.data.find(r => getRowId(r) === id)
  if (item) emit('duplicate', item)
  ctxMenuVisible.value = false
}

// Expose clearSelection for parent use after successful delete
function clearSelection() {
  selectedRows.value = new Set()
}
// defineExpose moved to end of script (after filteredData is declared)

// ── Column filters (Excel-like, from DS) ──────────────────────────────
const filterOverlay = ref(null)
const filterField = ref('')
const filterOptions = ref([])
const filterSelected = ref([])
const filterSearch = ref('')
const activeFilters = ref({})

const filterFieldLabel = computed(() => {
  const col = props.columns.find(c => c.field === filterField.value)
  return col ? col.header : filterField.value
})

function hasActiveFilter(field) {
  const f = activeFilters.value[field]
  if (!f) return false
  const allValues = [...new Set(props.data.map(r => String(r[field] ?? '')))]
  return f.size < allValues.length
}

function onHeaderFilter(event, field) {
  if (filterOverlay.value?.style.display === 'block' && filterField.value === field) {
    filterOverlay.value.style.display = 'none'
    return
  }
  filterField.value = field
  filterSearch.value = ''
  const allValues = [...new Set(props.data.map(r => String(r[field] ?? '')))].sort()
  filterOptions.value = allValues
  const prev = activeFilters.value[field]
  filterSelected.value = prev ? [...prev] : [...allValues]
  nextTick(() => {
    filterOverlay.value.style.display = 'block'
    const rect = event.target.getBoundingClientRect()
    filterOverlay.value.style.left = rect.left + 'px'
    filterOverlay.value.style.top = (rect.bottom + 4) + 'px'
  })
}

function toggleFilterOption(val) {
  const idx = filterSelected.value.indexOf(val)
  if (idx >= 0) filterSelected.value.splice(idx, 1)
  else filterSelected.value.push(val)
}

function toggleSelectAll() {
  if (filterSelected.value.length === filterOptions.value.length) {
    filterSelected.value = []
  } else {
    filterSelected.value = [...filterOptions.value]
  }
}

const filteredFilterOptions = computed(() => {
  if (!filterSearch.value) return filterOptions.value
  const q = filterSearch.value.toLowerCase()
  return filterOptions.value.filter(o => o.toLowerCase().includes(q))
})
const isAllSelected = computed(() => filterSelected.value.length === filterOptions.value.length)

function applyFilter() {
  activeFilters.value[filterField.value] = new Set(filterSelected.value)
  const allValues = [...new Set(props.data.map(r => String(r[filterField.value] ?? '')))]
  if (filterSelected.value.length === allValues.length) {
    delete activeFilters.value[filterField.value]
  }
  if (filterOverlay.value) filterOverlay.value.style.display = 'none'
}

function resetFilter() {
  delete activeFilters.value[filterField.value]
  filterSelected.value = [...filterOptions.value]
  if (filterOverlay.value) filterOverlay.value.style.display = 'none'
}

// ── Filtered & paginated data ─────────────────────────────────────────
const filteredData = computed(() => {
  const filters = activeFilters.value
  const fields = Object.keys(filters)
  if (fields.length === 0) return props.data
  return props.data.filter(r =>
    fields.every(f => filters[f].has(String(r[f] ?? '')))
  )
})

const tableFirst = ref(0)
const paginatedData = computed(() => {
  // "Все" (visibleRows = -1): return everything, ignore pagination.
  if (visibleRows.value === -1) return filteredData.value
  const start = tableFirst.value
  return filteredData.value.slice(start, start + visibleRows.value)
})
const showPaginator = computed(() => {
  if (visibleRows.value === -1) return false
  return filteredData.value.length > visibleRows.value
})

watch([() => filteredData.value.length, visibleRows], () => {
  tableFirst.value = 0
})
function onPageChange(event) {
  tableFirst.value = event.first
}

// ── Export (Excel / CSV / JSON) ───────────────────────────────────────
const exportMenuVisible = ref(false)
const exportBtnRef = ref(null)

function toggleExportMenu() {
  exportMenuVisible.value = !exportMenuVisible.value
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function getExportData() {
  return filteredData.value.map((r, i) => {
    const row = { '№': i + 1 }
    visibleColumns.value.forEach(c => { row[c.header] = r[c.field] ?? '' })
    return row
  })
}

function exportCSV() {
  const cols = visibleColumns.value
  const headers = ['№', ...cols.map(c => c.header)]
  const rows = filteredData.value.map((r, i) =>
    [i + 1, ...cols.map(c => String(r[c.field] ?? '').replace(/;/g, ','))].join(';')
  )
  const csv = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n')
  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    (localTableName.value || 'table') + '.csv'
  )
  exportMenuVisible.value = false
}

function exportJSON() {
  const data = filteredData.value.map(r => {
    const row = {}
    visibleColumns.value.forEach(c => { row[c.field] = r[c.field] ?? null })
    return row
  })
  const json = JSON.stringify(data, null, 2)
  downloadBlob(
    new Blob([json], { type: 'application/json;charset=utf-8' }),
    (localTableName.value || 'table') + '.json'
  )
  exportMenuVisible.value = false
}

function exportExcel() {
  // HTML-table format — Excel opens natively without any library
  const cols = visibleColumns.value
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const headers = ['№', ...cols.map(c => c.header)]
  const headerRow = headers.map(h => `<th>${esc(h)}</th>`).join('')
  const bodyRows = filteredData.value.map((r, i) => {
    const cells = [i + 1, ...cols.map(c => r[c.field] ?? '')]
    return '<tr>' + cells.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>'
  }).join('\n')

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/>
<style>th{background:#e8edf5;font-weight:bold;border:1px solid #ccc;padding:4px 8px}
td{border:1px solid #ddd;padding:4px 8px}</style></head>
<body><table>${'<tr>' + headerRow + '</tr>'}\n${bodyRows}</table></body></html>`

  downloadBlob(
    new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' }),
    (localTableName.value || 'table') + '.xls'
  )
  exportMenuVisible.value = false
}

// ── Auto-fit column on double-click resizer ───────────────────────────
const tableRef = ref(null)
const tableCardRef = ref(null)

function autoFitColumn(th) {
  const table = tableRef.value?.$el
  if (!table || !th) return
  const colIndex = Array.from(th.parentElement.children).indexOf(th)
  const headerSpan = th.querySelector('.ct-col-filter-header') || th.querySelector('.p-datatable-column-header-content')
  let maxW = headerSpan ? headerSpan.scrollWidth + 24 : 60
  const rows = table.querySelectorAll('.p-datatable-tbody > tr')
  rows.forEach(row => {
    const td = row.children[colIndex]
    if (td) {
      const content = td.querySelector('.badge') || td.firstElementChild || td
      maxW = Math.max(maxW, content.scrollWidth + 24)
    }
  })
  th.style.width = maxW + 'px'
  th.style.minWidth = maxW + 'px'
}

function onResizerDblClick(e) {
  const th = e.target.closest('th')
  if (th) autoFitColumn(th)
}

// ── Lifecycle ─────────────────────────────────────────────────────────
function onDocClick(e) {
  if (filterOverlay.value && !filterOverlay.value.contains(e.target)) {
    filterOverlay.value.style.display = 'none'
  }
  ctxMenuVisible.value = false
  // Close export menu on outside click
  if (exportBtnRef.value && !exportBtnRef.value.contains(e.target)) {
    exportMenuVisible.value = false
  }
  // Close columns menu on outside click
  if (columnsBtnRef.value && !columnsBtnRef.value.contains(e.target)) {
    columnsMenuVisible.value = false
  }
}

let _dblClickHandler = null
onMounted(() => {
  document.addEventListener('click', onDocClick)
  nextTick(() => {
    const table = tableRef.value?.$el
    if (table) {
      _dblClickHandler = (e) => {
        const isResizer = e.target.classList.contains('p-datatable-column-resizer')
          || e.target.classList.contains('p-column-resizer')
          || e.target.closest('.p-datatable-column-resizer')
          || e.target.closest('.p-column-resizer')
        if (isResizer) onResizerDblClick(e)
      }
      table.addEventListener('dblclick', _dblClickHandler)
    }
  })
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  const table = tableRef.value?.$el
  if (table && _dblClickHandler) table.removeEventListener('dblclick', _dblClickHandler)
})

defineExpose({ clearSelection, selectedRows, filteredData })
</script>

<template>
  <div ref="tableCardRef" class="glass-card ct-table-card">

    <!-- Toolbar — sticky with blur. Layout:
         [name] [Строк в окне: 5|25|Все] [row/col counts] [Колонки] [Выгрузить]
         ──────── ct-spacer ────────
         [toolbar-end slot] [Добавить]
         Add button sticks to the FAR RIGHT of the toolbar via the
         ct-spacer flex push. -->
    <div class="ct-toolbar">
      <span class="ct-table-name">{{ localTableName }}</span>
      <span class="ct-sep"></span>
      <span class="ct-meta">Строк в окне</span>
      <select v-model.number="visibleRows" class="ct-rows-select">
        <option v-for="opt in VISIBLE_ROWS_OPTIONS" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <span class="ct-sep"></span>
      <span class="ct-meta">{{ filteredData.length }} строк × {{ columnCount }} столбцов</span>

      <!-- Column visibility — per-user, persisted to localStorage -->
      <div class="ct-export-wrap" ref="columnsBtnRef">
        <Button icon="pi pi-sliders-v" text size="small" severity="secondary"
          v-tooltip.bottom="'Колонки'" @click.stop="toggleColumnsMenu" class="ct-toolbar-btn" />
        <div v-if="columnsMenuVisible" class="ct-columns-menu" @click.stop>
          <div class="ct-columns-menu-head">
            <span>Видимые колонки</span>
            <button
              v-if="hiddenColumns.size > 0"
              type="button"
              class="ct-columns-reset"
              @click="resetColumns"
            >сбросить</button>
          </div>
          <label
            v-for="c in columns"
            :key="c.field"
            class="ct-columns-item"
            :class="{ 'ct-columns-item--locked': c.required }"
          >
            <Checkbox
              :model-value="!hiddenColumns.has(c.field)"
              :binary="true"
              :disabled="c.required"
              @update:model-value="toggleColumn(c.field, c.required)"
            />
            <span>{{ c.header || c.field }}</span>
            <i v-if="c.required" class="pi pi-lock" v-tooltip.right="'Обязательная колонка'" />
          </label>
        </div>
      </div>
      <div class="ct-export-wrap" ref="exportBtnRef">
        <Button icon="pi pi-download" text size="small" severity="secondary"
          v-tooltip.bottom="'Выгрузить'" @click.stop="toggleExportMenu" class="ct-toolbar-btn" />
        <div v-if="exportMenuVisible" class="ct-export-menu" @click.stop>
          <button class="ct-export-item" @click="exportExcel">
            <i class="pi pi-file-excel"></i> Excel (.xls)
          </button>
          <button class="ct-export-item" @click="exportCSV">
            <i class="pi pi-file"></i> CSV
          </button>
          <button class="ct-export-item" @click="exportJSON">
            <i class="pi pi-code"></i> JSON
          </button>
        </div>
      </div>
      <span class="ct-spacer" />
      <slot name="toolbar-end" />
      <Button v-if="showAdd" label="Добавить" icon="pi pi-plus" size="small" @click="emit('add')" />
    </div>

    <!-- DataTable -->
    <DataTable
      ref="tableRef"
      :value="paginatedData"
      :loading="loading"
      rowHover
      sortMode="single"
      removableSort
      scrollable
      :scrollHeight="tableScrollHeight"
      resizableColumns
      columnResizeMode="expand"
      reorderableColumns
      :rowClass="(data) => selectedRows.has(getRowId(data)) ? 'ct-row-selected' : ''"
      @rowClick="({ originalEvent, data, index }) => onRowClick(originalEvent, data, index)"
      @rowContextmenu="({ originalEvent, data, index }) => onRowContextMenu(originalEvent, data, index)"
      class="tvel-table"
      :style="rowClickable ? 'cursor: pointer' : ''"
    >
      <!-- № — frozen, no sort -->
      <Column header="№" frozen style="min-width: 50px; width: 50px">
        <template #body="{ index }">
          <span class="ct-row-num">{{ tableFirst + index + 1 }}</span>
        </template>
      </Column>

      <!-- Dynamic columns -->
      <Column
        v-for="col in visibleColumns"
        :key="col.field"
        :field="col.field"
        :sortable="col.sortable !== false"
        :frozen="col.frozen || false"
        :style="{ minWidth: col.minWidth || col.width || '80px', width: col.width || undefined }"
      >
        <template #header>
          <!-- Page-supplied custom header takes priority — used by
               constructor-checkbox columns to render a master toggle
               with reactive count + tooltip explaining the bulk
               selection click. Slot prop `col` is the column config
               so the page can read `col.tooltip` etc. if needed. -->
          <slot :name="`header-${col.field}`" :col="col">
            <span v-if="col.filterable !== false"
              class="ct-col-filter-header"
              :class="{ 'ct-col-filter-active': hasActiveFilter(col.field) }"
              :title="col.tooltip || null"
              @click.stop="onHeaderFilter($event, col.field)">{{ col.header }}</span>
            <span v-else
              :title="col.tooltip || null"
              @click.stop="emit('header-click', col.field)"
              style="cursor:pointer">{{ col.header }}</span>
          </slot>
        </template>
        <template #body="slotProps">
          <!-- Use named slot if page provides one, otherwise render field value -->
          <slot :name="`col-${col.field}`" v-bind="slotProps">
            {{ slotProps.data[col.field] ?? '' }}
          </slot>
        </template>
      </Column>
    </DataTable>

    <!-- Paginator -->
    <Paginator v-if="showPaginator"
      :first="tableFirst"
      :rows="effectiveVisibleRows"
      :totalRecords="filteredData.length"
      @page="onPageChange"
      :template="'FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink'"
    />

  </div>

  <!-- Teleport overlays to body — they must escape overflow:clip of .ct-table-card -->

  <!-- Excel-like column filter overlay (pixel-exact from DS) -->
  <Teleport to="body">
    <div ref="filterOverlay" class="ct-filter-overlay" style="display: none" @click.stop>
      <div class="ct-filter-title">{{ filterFieldLabel }}</div>
      <div class="ct-filter-search">
        <InputText v-model="filterSearch" placeholder="Поиск..." size="small" class="ct-filter-search-input" />
      </div>
      <label class="ct-filter-option ct-filter-select-all" @click.prevent="toggleSelectAll">
        <Checkbox :modelValue="isAllSelected" :binary="true" @click.stop="toggleSelectAll" />
        <span>Выбрать все</span>
      </label>
      <div class="ct-filter-divider"></div>
      <div class="ct-filter-options">
        <label v-for="opt in filteredFilterOptions" :key="opt" class="ct-filter-option">
          <Checkbox :modelValue="filterSelected.includes(opt)" :binary="true"
            @update:modelValue="toggleFilterOption(opt)" />
          <span>{{ opt }}</span>
        </label>
      </div>
      <div class="ct-filter-actions">
        <Button label="Применить" size="small" @click="applyFilter" />
        <Button label="Сбросить" size="small" severity="secondary" text @click="resetFilter" />
      </div>
    </div>
  </Teleport>

  <!-- Context menu (glass-card, only "Удалить") -->
  <Teleport to="body">
    <div v-if="ctxMenuVisible" class="ct-ctx-menu"
      :style="{ left: ctxMenuPos.x + 'px', top: ctxMenuPos.y + 'px' }" @click.stop>
      <button class="ct-ctx-menu-item" @click="emitExport('excel')">
        <i class="pi pi-file-excel"></i>
        Экспорт Excel{{ exportCount > 1 ? ` (${exportCount})` : '' }}
      </button>
      <button class="ct-ctx-menu-item" @click="emitExport('csv')">
        <i class="pi pi-file"></i>
        Экспорт CSV{{ exportCount > 1 ? ` (${exportCount})` : '' }}
      </button>
      <button class="ct-ctx-menu-item" @click="emitExport('json')">
        <i class="pi pi-code"></i>
        Экспорт JSON{{ exportCount > 1 ? ` (${exportCount})` : '' }}
      </button>
      <div v-if="showDuplicate && selectedRows.size === 1" class="ct-ctx-menu-separator"></div>
      <button
        v-if="showDuplicate && selectedRows.size === 1"
        class="ct-ctx-menu-item"
        @click="emitDuplicate"
      >
        <i class="pi pi-copy"></i>
        Дублировать
      </button>
      <div class="ct-ctx-menu-separator"></div>
      <button class="ct-ctx-menu-item ct-ctx-menu-danger" @click="deleteSelectedRows">
        <i class="pi pi-trash"></i>
        Удалить{{ selectedRows.size > 1 ? ` (${selectedRows.size})` : '' }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
/* ══════════════════════════════════════════════════════════════════════
   ALL styles below are pixel-exact copies from DesignSystemPage.
   Class prefix: ct- (CrudTable) to avoid collisions.
   ══════════════════════════════════════════════════════════════════════ */

/* ── Card wrapper ── */
.ct-table-card {
  overflow: clip;
  padding: 0;
}

/* ── Toolbar — sticky below PageHeader ── */
.ct-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem 0.75rem;
  position: sticky;
  top: 0;
  z-index: 15;
  background: rgba(248, 252, 255, 0.95);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(180, 210, 255, 0.2);
}
.ct-table-name {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
}
.ct-table-name-input {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #003274;
  border: 1px solid rgba(0, 50, 116, 0.25);
  border-radius: 4px;
  padding: 2px 6px;
  outline: none;
  background: transparent;
  width: 160px;
}
.ct-toolbar-btn {
  border-radius: 6px !important;
  width: 2rem;
  height: 2rem;
  padding: 0 !important;
}
.ct-sep {
  width: 1px;
  height: 20px;
  background: rgba(0, 50, 116, 0.12);
  margin: 0 0.25rem;
  flex-shrink: 0;
}
.ct-meta {
  font-size: 12px;
  font-weight: 400;
  color: #6B7280;
  white-space: nowrap;
}
/* "Строк в окне" — native <select> styled to match the toolbar meta
   (12px / #6B7280 / brand-blue 1px tinted border). Native HTML keeps
   the markup minimal: no PrimeVue PT overrides fighting global Aura
   !important rules, no extra import, and the native chevron renders
   exactly once per browser. DS prescribes AutoComplete for general
   selects, but for a tiny 3-option toolbar picker the native element
   is the correct minimalist fit. */
.ct-rows-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  width: 64px;
  height: 24px;
  padding: 2px 18px 2px 6px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  color: #6B7280;
  background: transparent;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 4px;
  outline: none;
  cursor: pointer;
  /* Brand-blue chevron rendered via inline SVG so the colour matches
     other toolbar icons without depending on a system font. */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23003274' stroke-opacity='0.50' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  background-size: 8px 5px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ct-rows-select:hover:not(:focus) {
  border-color: rgba(0, 50, 116, 0.30);
}
.ct-rows-select:focus {
  border-color: rgba(0, 50, 116, 0.45);
  box-shadow: 0 0 0 2px rgba(0, 50, 116, 0.10);
}
.ct-spacer {
  flex: 1;
}

/* ── Export dropdown ── */
.ct-export-wrap {
  position: relative;
}
.ct-export-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  background: rgba(248, 252, 255, 0.97);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(180, 210, 255, 0.4);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 50, 116, 0.12);
  padding: 0.3rem;
  min-width: 140px;
}
.ct-export-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0.45rem 0.75rem;
  border: none;
  background: transparent;
  font-size: 13px;
  color: #003274;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s;
  text-align: left;
  white-space: nowrap;
}
.ct-export-item:hover {
  background: rgba(0, 50, 116, 0.06);
}
.ct-export-item i {
  font-size: 14px;
  width: 18px;
  text-align: center;
  color: rgba(0, 50, 116, 0.5);
}

/* ── Columns visibility menu ── */
.ct-columns-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  background: white;
  border: 1px solid rgba(0, 50, 116, 0.14);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 50, 116, 0.14);
  padding: 8px;
  min-width: 240px;
  max-height: 60vh;
  overflow-y: auto;
}
.ct-columns-menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
  margin-bottom: 4px;
}
.ct-columns-reset {
  font-size: 11px;
  font-weight: 600;
  color: #025EA1;
  background: transparent;
  border: none;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}
.ct-columns-reset:hover {
  background: rgba(2, 94, 161, 0.08);
}
.ct-columns-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #003274;
}
.ct-columns-item:hover {
  background: rgba(0, 50, 116, 0.04);
}
.ct-columns-item--locked {
  cursor: not-allowed;
  color: #9CA3AF;
}
.ct-columns-item--locked:hover {
  background: transparent;
}
.ct-columns-item .pi-lock {
  margin-left: auto;
  font-size: 10px;
  color: rgba(0, 50, 116, 0.35);
}

/* ── DataTable — transparent base ── */
.ct-table-card :deep(.p-datatable-table-container),
.ct-table-card :deep(.p-datatable) {
  background: transparent;
}
.ct-table-card :deep(.p-datatable-table-container) {
  overflow-x: auto;
  /* Padding-bottom + border on the wrapper used to render a thin secondary
     line below the last row, giving a "double frame" with the outer
     .glass-card border. Drop the padding and any inner bottom borders so
     only the card's own edge is visible. */
  padding-bottom: 0;
  border: none;
}
/* Kill bottom-frame artefacts from DataTable's scroll container, table
   element and last row so the table sits flush against the card edge. */
.ct-table-card :deep(.p-datatable-table),
.ct-table-card :deep(.p-datatable-tbody),
.ct-table-card :deep(.p-datatable-tbody > tr:last-child > td) {
  border-bottom: 0 !important;
}

/* Gap between toolbar and thead */
.ct-table-card :deep(.p-datatable-thead > tr:first-child > th) {
  border-top: 4px solid transparent;
}

/* Empty message */
.ct-table-card :deep(.p-datatable-emptymessage td) {
  text-align: center;
  color: #9CA3AF;
  font-size: 13px;
  padding: 2rem;
}

/* Header row */
.ct-table-card :deep(.p-datatable-thead > tr > th) {
  background: rgba(0, 50, 116, 0.12) !important;
  color: #003274 !important;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.02em;
  border-bottom: 1px solid rgba(0, 50, 116, 0.18) !important;
  border-right: 1px solid rgba(0, 50, 116, 0.15) !important;
}
.ct-table-card :deep(.p-datatable-thead > tr > th:last-child) {
  border-right: none !important;
}
/* Sort icon */
.ct-table-card :deep(.p-datatable-thead .p-datatable-sort-icon) {
  color: rgba(0, 50, 116, 0.4);
}
/* Hide multi-sort badge */
.ct-table-card :deep(.p-sortable-column-badge) {
  display: none !important;
}

/* Body rows */
.ct-table-card :deep(.p-datatable-tbody > tr) {
  background: transparent;
  border-bottom: 1px solid rgba(180, 210, 255, 0.18);
  transition: background 0.12s;
}
.ct-table-card :deep(.p-datatable-tbody > tr:last-child) {
  border-bottom: none;
}
.ct-table-card :deep(.p-datatable-tbody > tr:hover) {
  background: rgba(0, 50, 116, 0.04) !important;
}
.ct-table-card :deep(.p-datatable-tbody > tr > td) {
  border-right: 1px solid rgba(0, 50, 116, 0.08);
}
.ct-table-card :deep(.p-datatable-tbody > tr > td:last-child) {
  border-right: none;
}

/* Frozen columns — opaque bg */
.ct-table-card :deep(.p-datatable-frozen-column) {
  background: #f8fcff !important;
}
.ct-table-card :deep(.p-datatable-thead > tr > th.p-datatable-frozen-column) {
  background: #e8edf5 !important;
}
.ct-table-card :deep(.p-datatable-tbody > tr:hover > td.p-datatable-frozen-column) {
  background: rgba(240, 246, 255, 0.98) !important;
}

/* Selected row highlight */
.ct-table-card :deep(.ct-row-selected) {
  background: rgba(0, 50, 116, 0.07) !important;
}
.ct-table-card :deep(.ct-row-selected > td.p-datatable-frozen-column) {
  background: rgba(230, 238, 250, 0.98) !important;
}

/* Row number */
.ct-row-num {
  font-size: 12px;
  color: rgba(0, 50, 116, 0.4);
  font-variant-numeric: tabular-nums;
}

/* ── Clickable filter header — badge-6 style ── */
.ct-col-filter-header {
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: background 0.15s;
  color: #003274;
}
.ct-col-filter-header:hover {
  background: rgba(0, 50, 116, 0.10);
}
.ct-col-filter-header.ct-col-filter-active {
  background: rgba(0, 50, 116, 0.18);
}

/* ── Paginator ── */
:deep(.p-paginator) {
  background: transparent;
  border-top: 1px solid rgba(180, 210, 255, 0.25);
}
:deep(.p-paginator .p-paginator-page.p-paginator-page-selected) {
  background: rgba(0, 50, 116, 0.10);
  color: #003274;
  border: 1px solid rgba(0, 50, 116, 0.15);
  font-weight: 600;
}
:deep(.p-paginator .p-paginator-page),
:deep(.p-paginator .p-paginator-first),
:deep(.p-paginator .p-paginator-prev),
:deep(.p-paginator .p-paginator-next),
:deep(.p-paginator .p-paginator-last) {
  min-width: 32px;
  height: 32px;
  border-radius: 6px;
}
:deep(.p-paginator .p-select) {
  height: 32px;
  font-size: 12px;
}

</style>

<!-- Unscoped styles for Teleport-ed overlays (rendered outside component DOM) -->
<style>
/* ── Column filter overlay (Excel-like) ── */
.ct-filter-overlay {
  position: fixed;
  z-index: 1000;
  background: rgba(248, 252, 255, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(180, 210, 255, 0.4);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 50, 116, 0.12);
  padding: 0.75rem;
  min-width: 180px;
}
.ct-filter-title {
  font-size: 12px;
  font-weight: 700;
  color: #003274;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.ct-filter-search {
  margin-bottom: 0.5rem;
}
.ct-filter-search-input {
  width: 100%;
  height: 2rem !important;
  font-size: 13px !important;
}
.ct-filter-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 0.75rem;
  max-height: 200px;
  overflow-y: auto;
}
.ct-filter-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
}
.ct-filter-select-all {
  font-weight: 600;
  margin-bottom: 4px;
}
.ct-filter-divider {
  height: 1px;
  background: rgba(180, 210, 255, 0.3);
  margin-bottom: 6px;
}
.ct-filter-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

/* ── Context menu (glass-card) ── */
.ct-ctx-menu {
  position: fixed;
  z-index: 1000;
  background: rgba(248, 252, 255, 0.97);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(180, 210, 255, 0.4);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 50, 116, 0.12);
  padding: 0.3rem;
  min-width: 140px;
}
.ct-ctx-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0.45rem 0.75rem;
  border: none;
  background: transparent;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s;
  text-align: left;
}
.ct-ctx-menu-item:hover {
  background: rgba(0, 50, 116, 0.06);
}
.ct-ctx-menu-separator {
  height: 1px;
  margin: 4px 0;
  background: rgba(0, 50, 116, 0.1);
}
.ct-ctx-menu-item i {
  font-size: 13px;
  width: 16px;
  text-align: center;
}
.ct-ctx-menu-danger {
  color: #b00020;
}
.ct-ctx-menu-danger:hover {
  background: rgba(231, 76, 60, 0.08);
}
</style>
