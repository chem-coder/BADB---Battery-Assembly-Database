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

const props = defineProps({
  columns:      { type: Array, required: true },
  data:         { type: Array, required: true },
  idField:      { type: String, default: 'id' },
  tableName:    { type: String, default: 'Таблица' },
  loading:      { type: Boolean, default: false },
  showAdd:      { type: Boolean, default: false },
  rowClickable: { type: Boolean, default: false },
  showRename:   { type: Boolean, default: true },
  exportEnd:    { type: Boolean, default: false },
  exportBadge:  { type: Number, default: 0 },  // extra selected count shown on export menu items
})

const emit = defineEmits(['delete', 'add', 'row-click', 'export', 'header-click'])

// ── Toolbar state ──────────────────────────────────────────────────────
const localTableName = ref(props.tableName)
const isEditingTableName = ref(false)
const visibleRows = ref(10)

function startEditTableName() {
  isEditingTableName.value = true
  nextTick(() => {
    const input = tableCardRef.value?.querySelector('.ct-table-name-input')
    if (input) { input.focus(); input.select() }
  })
}
function finishEditTableName() {
  isEditingTableName.value = false
  if (!localTableName.value.trim()) localTableName.value = props.tableName
}
function clampVisibleRows() {
  let v = visibleRows.value
  if (!v || v < 5) v = 5
  if (v > 100) v = 100
  visibleRows.value = Math.round(v / 5) * 5 || 5
}

// Total column count = № + user columns
const columnCount = computed(() => 1 + props.columns.length)

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
  const start = tableFirst.value
  return filteredData.value.slice(start, start + visibleRows.value)
})
const showPaginator = computed(() => filteredData.value.length > visibleRows.value)

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
    props.columns.forEach(c => { row[c.header] = r[c.field] ?? '' })
    return row
  })
}

function exportCSV() {
  const headers = ['№', ...props.columns.map(c => c.header)]
  const rows = filteredData.value.map((r, i) =>
    [i + 1, ...props.columns.map(c => String(r[c.field] ?? '').replace(/;/g, ','))].join(';')
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
    props.columns.forEach(c => { row[c.field] = r[c.field] ?? null })
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
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const headers = ['№', ...props.columns.map(c => c.header)]
  const headerRow = headers.map(h => `<th>${esc(h)}</th>`).join('')
  const bodyRows = filteredData.value.map((r, i) => {
    const cells = [i + 1, ...props.columns.map(c => r[c.field] ?? '')]
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

    <!-- Toolbar — sticky with blur (pixel-exact from DS) -->
    <div class="ct-toolbar">
      <template v-if="isEditingTableName">
        <input v-model="localTableName" class="ct-table-name-input"
          @blur="finishEditTableName" @keyup.enter="finishEditTableName" />
      </template>
      <template v-else>
        <span class="ct-table-name">{{ localTableName }}</span>
      </template>
      <Button v-if="showRename" icon="pi pi-pencil" text size="small" severity="secondary"
        v-tooltip.bottom="'Переименовать'" @click="startEditTableName" class="ct-toolbar-btn" />
      <div v-if="!exportEnd" class="ct-export-wrap" ref="exportBtnRef">
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
      <span class="ct-sep"></span>
      <span class="ct-meta">Строк в окне (5–100)</span>
      <input type="number" v-model.number="visibleRows" min="5" max="100" step="5"
        class="ct-rows-input"
        @keyup.enter="$event.target.blur()"
        @blur="clampVisibleRows" />
      <span class="ct-sep"></span>
      <span class="ct-meta">{{ filteredData.length }} строк × {{ columnCount }} столбцов</span>
      <slot name="toolbar-end"></slot>
      <div v-if="exportEnd" class="ct-export-wrap" ref="exportBtnRef">
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
      <span v-if="showAdd" class="ct-spacer"></span>
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
        v-for="col in columns"
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
      :rows="visibleRows"
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
.ct-rows-input {
  width: 48px;
  text-align: center;
  font-size: 12px;
  font-weight: 400;
  color: #6B7280;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 4px;
  padding: 2px 4px;
  background: transparent;
  outline: none;
  -moz-appearance: textfield;
}
.ct-rows-input::-webkit-inner-spin-button,
.ct-rows-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.ct-rows-input:focus {
  border-color: rgba(0, 50, 116, 0.35);
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

/* ── DataTable — transparent base ── */
.ct-table-card :deep(.p-datatable-table-container),
.ct-table-card :deep(.p-datatable) {
  background: transparent;
}
.ct-table-card :deep(.p-datatable-table-container) {
  overflow-x: auto;
  padding-bottom: 2px;
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
