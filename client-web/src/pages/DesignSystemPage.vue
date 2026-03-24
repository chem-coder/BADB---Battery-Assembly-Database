<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import AutoComplete from 'primevue/autocomplete'
import MultiSelect from 'primevue/multiselect'
import DatePicker from 'primevue/datepicker'
import Paginator from 'primevue/paginator'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'

// --- Static data ---

const coloursMain = [
  { name: 'Основной', hex: '#003274' },
  { name: 'Синий',    hex: '#025EA1' },
  { name: 'Голубой',  hex: '#6CACE4' },
  { name: 'Мятный',   hex: '#52C9A6' },
  { name: 'Текст',    hex: '#333333' },
  { name: 'Серый',    hex: '#6B7280' },
]

const coloursExtra = [
  { name: 'Красный',  hex: '#E74C3C', light: '#FBE4E2' },
  { name: 'Терракот', hex: '#CE7D4E', light: '#F8ECE4' },
  { name: 'Охра',     hex: '#D3A754', light: '#F8F2E5' },
  { name: 'Хвойный',  hex: '#649263', light: '#E8EFE8' },
  { name: 'Синий',    hex: '#025EA1', light: '#D9E7F1' },
  { name: 'Основной', hex: '#003274', light: '#D9E0EA' },
  { name: 'Слива',    hex: '#6E3359', light: '#E9E0E6' },
]

const typography = [
  { label: 'Заголовок страницы', spec: 'Rosatom 22px 700 #003274', style: { fontFamily: 'Rosatom', fontSize: '22px', fontWeight: 700, color: '#003274' } },
  { label: 'Заголовок карточки', spec: 'Rosatom 15px 700 #003274', style: { fontFamily: 'Rosatom', fontSize: '15px', fontWeight: 700, color: '#003274' } },
  { label: 'Метка поля',         spec: '13px 600 #4B5563',          style: { fontSize: '13px', fontWeight: 600, color: '#4B5563' } },
  { label: 'Основной текст',     spec: '14px 400 #333333',          style: { fontSize: '14px', fontWeight: 400, color: '#333333' } },
  { label: 'Мелкий текст',       spec: '12px 400 #6B7280',          style: { fontSize: '12px', fontWeight: 400, color: '#6B7280' } },
  { label: 'Метка секции',       spec: '11px 700 uppercase 0.05em rgba(0,50,116,0.5)', style: { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(0,50,116,0.5)' } },
]

const selectOptions = [
  { label: 'Вариант 1', value: 1 },
  { label: 'Вариант 2', value: 2 },
  { label: 'Вариант 3', value: 3 },
  { label: 'Вариант 4', value: 4 },
  { label: 'Вариант 5', value: 5 },
  { label: 'Вариант 6', value: 6 },
  { label: 'Вариант 7', value: 7 },
]

// AutoComplete — search-in-field select
const autoCompleteValue = ref(null)
const autoCompleteRef = ref(null)
const autoCompleteSuggestions = ref([])
const searchSelect = (event) => {
  const query = (event.query || '').toLowerCase()
  autoCompleteSuggestions.value = selectOptions.filter(o => o.label.toLowerCase().includes(query))
}
const onItemSelect = () => {
  // Blur the input after selection (Enter or click)
  setTimeout(() => autoCompleteRef.value?.$el?.querySelector('input')?.blur(), 50)
}
const clearAutoComplete = () => {
  autoCompleteValue.value = null
}

// MultiSelect — native PrimeVue component (built-in toggle, filter, select all)
const multiValue = ref([])


const paginatorFirst = ref(0)

// --- Table toolbar state ---
const tableName = ref('Таблица')
const isEditingTableName = ref(false)
const tableVisibleRows = ref(10)
const tableColumnCount = 9 // №, Название, Тип, Статус, Параметр 1–5

function startEditTableName() {
  isEditingTableName.value = true
  nextTick(() => {
    const input = document.querySelector('.ds-table-name-input')
    if (input) { input.focus(); input.select() }
  })
}
function finishEditTableName() {
  isEditingTableName.value = false
  if (!tableName.value.trim()) tableName.value = 'Таблица'
}
function exportTableCSV() {
  const headers = ['№','Название','Тип','Статус','Параметр 1','Параметр 2','Параметр 3','Параметр 4','Параметр 5']
  const rows = filteredTableData.value.map((r, i) =>
    [i + 1, r.name, r.type, r.status, r.param1, r.param2, r.param3, r.param4, r.param5].join(';')
  )
  const csv = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = (tableName.value || 'table') + '.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

function clampVisibleRows() {
  let v = tableVisibleRows.value
  if (!v || v < 5) v = 5
  if (v > 100) v = 100
  tableVisibleRows.value = Math.round(v / 5) * 5 || 5
}

// Table viewport always max 10 rows; scroll if page has more
const TABLE_MAX_VIEW = 10
const tableScrollHeight = computed(() => (45 + TABLE_MAX_VIEW * 53) + 'px')

// --- Row selection & context menu ---
const selectedRows = ref(new Set())
const ctxMenuVisible = ref(false)
const ctxMenuPos = ref({ x: 0, y: 0 })
let lastClickedIdx = null

function onRowClick(event, data, index) {
  if (event.shiftKey && lastClickedIdx !== null) {
    // Shift+Click — range select
    const from = Math.min(lastClickedIdx, index)
    const to = Math.max(lastClickedIdx, index)
    for (let i = from; i <= to; i++) {
      selectedRows.value.add(filteredTableData.value[i].id)
    }
  } else if (event.ctrlKey || event.metaKey) {
    // Ctrl/Cmd+Click — toggle single
    if (selectedRows.value.has(data.id)) selectedRows.value.delete(data.id)
    else selectedRows.value.add(data.id)
  } else {
    selectedRows.value = new Set([data.id])
  }
  lastClickedIdx = index
  // trigger reactivity
  selectedRows.value = new Set(selectedRows.value)
}

function onRowContextMenu(event, data, index) {
  event.preventDefault()
  if (!selectedRows.value.has(data.id)) {
    selectedRows.value = new Set([data.id])
    lastClickedIdx = index
  }
  ctxMenuPos.value = { x: event.clientX, y: event.clientY }
  ctxMenuVisible.value = true
}

function deleteSelectedRows() {
  tableData.value = tableData.value.filter(r => !selectedRows.value.has(r.id))
  selectedRows.value = new Set()
  ctxMenuVisible.value = false
}

// Badge names matching global.css badge-1..badge-8
const badgeNames = ['Название_1','Название_2','Название_3','Название_4','Название_5','Название_6','Название_7','Название_8']

const tableData = ref([
  { id: 1,  name: 'Образец А-01',  type: badgeNames[0], typeBadge: 1, status: badgeNames[2], statusBadge: 3, param1: 12.5,  param2: 'Категория А', param3: 0.82, param4: 'Партия 01', param5: 150 },
  { id: 2,  name: 'Образец Б-03',  type: badgeNames[1], typeBadge: 2, status: badgeNames[3], statusBadge: 4, param1: 8.2,   param2: 'Категория Б', param3: 1.15, param4: 'Партия 02', param5: 230 },
  { id: 3,  name: 'Образец В-07',  type: badgeNames[2], typeBadge: 3, status: badgeNames[4], statusBadge: 5, param1: 15.0,  param2: 'Категория А', param3: 0.97, param4: 'Партия 01', param5: 180 },
  { id: 4,  name: 'Образец Г-12',  type: badgeNames[3], typeBadge: 4, status: badgeNames[5], statusBadge: 6, param1: 3.7,   param2: 'Категория В', param3: 2.30, param4: 'Партия 03', param5: 95  },
  { id: 5,  name: 'Образец Д-15',  type: badgeNames[4], typeBadge: 5, status: badgeNames[6], statusBadge: 7, param1: 22.1,  param2: 'Категория Б', param3: 0.64, param4: 'Партия 02', param5: 310 },
  { id: 6,  name: 'Образец Е-22',  type: badgeNames[5], typeBadge: 6, status: badgeNames[7], statusBadge: 8, param1: 6.4,   param2: 'Категория А', param3: 1.78, param4: 'Партия 01', param5: 120 },
  { id: 7,  name: 'Образец Ж-08',  type: badgeNames[6], typeBadge: 7, status: badgeNames[0], statusBadge: 1, param1: 18.9,  param2: 'Категория В', param3: 0.45, param4: 'Партия 03', param5: 275 },
  { id: 8,  name: 'Образец З-30',  type: badgeNames[7], typeBadge: 8, status: badgeNames[1], statusBadge: 2, param1: 11.3,  param2: 'Категория Б', param3: 3.10, param4: 'Партия 02', param5: 190 },
  { id: 9,  name: 'Образец И-04',  type: badgeNames[0], typeBadge: 1, status: badgeNames[4], statusBadge: 5, param1: 9.8,   param2: 'Категория А', param3: 1.42, param4: 'Партия 01', param5: 205 },
  { id: 10, name: 'Образец К-19',  type: badgeNames[1], typeBadge: 2, status: badgeNames[6], statusBadge: 7, param1: 14.2,  param2: 'Категория В', param3: 0.88, param4: 'Партия 03', param5: 160 },
  { id: 11, name: 'Образец Л-25',  type: badgeNames[2], typeBadge: 3, status: badgeNames[0], statusBadge: 1, param1: 7.6,   param2: 'Категория Б', param3: 2.05, param4: 'Партия 02', param5: 140 },
  { id: 12, name: 'Образец М-11',  type: badgeNames[3], typeBadge: 4, status: badgeNames[2], statusBadge: 3, param1: 20.5,  param2: 'Категория А', param3: 0.71, param4: 'Партия 01', param5: 330 },
])

// --- Unsaved changes tracking (must be after tableData declaration) ---
const originalTableData = ref(JSON.stringify(tableData.value))
const hasChanges = computed(() => JSON.stringify(tableData.value) !== originalTableData.value)
const saveState = ref('idle') // 'idle' | 'saved'
let saveTimer = null

const showIndicator = computed(() => hasChanges.value || saveState.value === 'saved')

function discardChanges() {
  tableData.value = JSON.parse(originalTableData.value)
  selectedRows.value = new Set()
  saveState.value = 'idle'
}
function saveChanges() {
  originalTableData.value = JSON.stringify(tableData.value)
  selectedRows.value = new Set()
  saveState.value = 'saved'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
}

// --- Column filter (multi-column, Excel-like) ---
const filterOverlay = ref(null)
const filterField = ref('')
const filterOptions = ref([])
const filterSelected = ref([])
const filterSearch = ref('')

// Persistent filters per field { field: Set(selected values) }
const activeFilters = ref({})

const fieldLabels = { name: 'Название', type: 'Тип', status: 'Статус', param1: 'Параметр 1', param2: 'Параметр 2', param3: 'Параметр 3', param4: 'Параметр 4', param5: 'Параметр 5' }
const filterFieldLabel = computed(() => fieldLabels[filterField.value] || filterField.value)

function hasActiveFilter(field) {
  const f = activeFilters.value[field]
  if (!f) return false
  const allValues = [...new Set(tableData.value.map(r => String(r[field])))]
  return f.size < allValues.length
}

function onHeaderFilter(event, field) {
  // toggle: if same field open — close
  if (filterOverlay.value?.style.display === 'block' && filterField.value === field) {
    filterOverlay.value.style.display = 'none'
    return
  }
  filterField.value = field
  filterSearch.value = ''
  const allValues = [...new Set(tableData.value.map(r => String(r[field])))].sort()
  filterOptions.value = allValues
  // restore previous selection for this field, or select all
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
  // if all selected — remove filter for this field
  const allValues = [...new Set(tableData.value.map(r => String(r[filterField.value])))]
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

const filteredTableData = computed(() => {
  const filters = activeFilters.value
  const fields = Object.keys(filters)
  if (fields.length === 0) return tableData.value
  return tableData.value.filter(r =>
    fields.every(f => filters[f].has(String(r[f])))
  )
})

// --- Pagination ---
const tableFirst = ref(0)
const paginatedTableData = computed(() => {
  const start = tableFirst.value
  return filteredTableData.value.slice(start, start + tableVisibleRows.value)
})
const showPaginator = computed(() => filteredTableData.value.length > tableVisibleRows.value)

// Reset to first page when filters or page size change
watch([() => filteredTableData.value.length, tableVisibleRows], () => {
  tableFirst.value = 0
})
function onPageChange(event) {
  tableFirst.value = event.first
}

// close overlays on outside click
function onDocClick(e) {
  if (filterOverlay.value && !filterOverlay.value.contains(e.target)) {
    filterOverlay.value.style.display = 'none'
  }
  ctxMenuVisible.value = false
}

const tableRef = ref(null)

function autoFitColumn(th) {
  const table = tableRef.value?.$el
  if (!table || !th) return
  const colIndex = Array.from(th.parentElement.children).indexOf(th)
  // Measure header text width
  const headerSpan = th.querySelector('.col-filter-header') || th.querySelector('.p-datatable-column-header-content')
  let maxW = headerSpan ? headerSpan.scrollWidth + 24 : 60
  // Measure all body cells in this column
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
  const resizer = e.target
  const th = resizer.closest('th')
  if (th) autoFitColumn(th)
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  // Attach dblclick to column resizers
  nextTick(() => {
    const table = tableRef.value?.$el
    if (table) {
      table.addEventListener('dblclick', (e) => {
        if (e.target.classList.contains('p-datatable-column-resizer') ||
            e.target.closest('.p-datatable-column-resizer')) {
          onResizerDblClick(e)
        }
      })
    }
  })
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  clearTimeout(saveTimer)
})
</script>

<template>
  <div class="design-system-page">
    <PageHeader title="Дизайн код" icon="pi pi-palette">
      <template #actions>
        <Transition name="ds-indicator-fade">
          <div v-if="showIndicator" class="ds-indicator"
               :class="saveState === 'saved' ? 'ds-indicator--saved' : 'ds-indicator--unsaved'">
            <span class="ds-indicator-label">
              <i v-if="saveState === 'saved'" class="pi pi-check ds-check-anim"></i>
              {{ saveState === 'saved' ? 'Изменения сохранены' : 'Изменения не сохранены' }}
            </span>
            <div v-if="saveState !== 'saved'" class="ds-indicator-actions">
              <Button label="Сохранить" size="small" @click="saveChanges" />
              <Button label="Отмена" size="small" severity="secondary" outlined @click="discardChanges" />
            </div>
          </div>
        </Transition>
      </template>
    </PageHeader>

    <!-- Section 1 — Colour palette -->
    <section class="glass-card ds-section">
      <h3 class="ds-section-title">Цветовая палитра</h3>
      <div class="ds-label" style="margin-bottom: 0.5rem">Основные</div>
      <div class="ds-row" style="margin-bottom: 1rem">
        <div v-for="c in coloursMain" :key="c.hex" class="ds-swatch">
          <div class="ds-swatch-block" :style="{ background: c.hex }"></div>
          <div class="ds-swatch-hex">{{ c.hex }}</div>
          <div class="ds-swatch-name">{{ c.name }}</div>
        </div>
      </div>
      <div class="ds-label" style="margin-bottom: 0.5rem">Дополнительные</div>
      <div class="ds-row">
        <div v-for="c in coloursExtra" :key="c.hex" class="ds-swatch-pair">
          <div class="ds-swatch">
            <div class="ds-swatch-block" :style="{ background: c.hex }"></div>
            <div class="ds-swatch-hex">{{ c.hex }}</div>
            <div class="ds-swatch-name">{{ c.name }}</div>
          </div>
          <div class="ds-swatch">
            <div class="ds-swatch-block" :style="{ background: c.light }"></div>
            <div class="ds-swatch-hex">{{ c.light }}</div>
            <div class="ds-swatch-name">{{ c.name }} light</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 2 — Typography -->
    <section class="glass-card ds-section">
      <h3 class="ds-section-title">Типографика</h3>
      <div v-for="t in typography" :key="t.label" class="ds-type-row">
        <span :style="t.style">{{ t.label }}</span>
        <span class="ds-type-spec">{{ t.spec }}</span>
      </div>
    </section>

    <!-- Section 3 — Input fields -->
    <section class="glass-card ds-section">
      <h3 class="ds-section-title">Поля ввода</h3>

      <!-- Text input -->
      <div class="ds-label">InputText</div>
      <div class="ds-row" style="margin-bottom: 1rem">
        <div class="ds-col">
          <span class="ds-label">Default</span>
          <InputText placeholder="Текст" />
        </div>
        <div class="ds-col">
          <span class="ds-label">Focus</span>
          <InputText placeholder="Текст" class="p-focus" />
        </div>
        <div class="ds-col">
          <span class="ds-label">Invalid</span>
          <InputText placeholder="Текст" invalid />
        </div>
        <div class="ds-col">
          <span class="ds-label">Disabled</span>
          <InputText placeholder="Текст" disabled />
        </div>
      </div>

      <!-- Password -->
      <div class="ds-label">Password</div>
      <div class="ds-row" style="margin-bottom: 1rem">
        <div class="ds-col">
          <span class="ds-label">Default</span>
          <Password placeholder="Пароль" toggleMask :feedback="false" />
        </div>
        <div class="ds-col">
          <span class="ds-label">Disabled</span>
          <Password placeholder="Пароль" toggleMask :feedback="false" disabled />
        </div>
      </div>

      <!-- Number input -->
      <div class="ds-label">InputNumber</div>
      <div class="ds-row" style="margin-bottom: 1rem">
        <div class="ds-col">
          <span class="ds-label">Default</span>
          <InputNumber placeholder="0" />
        </div>
        <div class="ds-col">
          <span class="ds-label">Invalid</span>
          <InputNumber placeholder="0" invalid />
        </div>
        <div class="ds-col">
          <span class="ds-label">Disabled</span>
          <InputNumber placeholder="0" disabled />
        </div>
      </div>

      <!-- Textarea -->
      <div class="ds-label">Textarea</div>
      <div class="ds-row">
        <div class="ds-col">
          <span class="ds-label">Default</span>
          <Textarea placeholder="Многострочный текст" :rows="3" />
        </div>
        <div class="ds-col">
          <span class="ds-label">Invalid</span>
          <Textarea placeholder="Многострочный текст" :rows="3" invalid />
        </div>
        <div class="ds-col">
          <span class="ds-label">Disabled</span>
          <Textarea placeholder="Многострочный текст" :rows="3" disabled />
        </div>
      </div>
    </section>

    <!-- Section 4 — Select / Dropdown -->
    <section class="glass-card ds-section">
      <h3 class="ds-section-title">Выпадающие списки</h3>
      <div class="ds-row">
        <div class="ds-col">
          <span class="ds-label">Select (поиск в поле)</span>
          <div class="select-ac-wrap">
            <AutoComplete ref="autoCompleteRef" v-model="autoCompleteValue"
                          :suggestions="autoCompleteSuggestions" @complete="searchSelect"
                          @item-select="onItemSelect" optionLabel="label"
                          dropdown completeOnFocus
                          :scrollHeight="'200px'"
                          placeholder="Выберите значение" style="min-width: 220px" />
            <button v-if="autoCompleteValue" type="button" class="select-clear-btn"
                    @click="clearAutoComplete" title="Очистить">
              <i class="pi pi-times"></i>
            </button>
          </div>
        </div>
        <div class="ds-col">
          <span class="ds-label">MultiSelect (поиск в поле)</span>
          <MultiSelect v-model="multiValue"
                       :options="selectOptions" optionLabel="label"
                       filter :showToggleAll="true"
                       :scrollHeight="'200px'"
                       placeholder="Выберите несколько"
                       :maxSelectedLabels="0"
                       selectedItemsLabel="Выбрано: {0}"
                       style="min-width: 260px; max-width: 400px" />
        </div>
        <div class="ds-col">
          <span class="ds-label">DatePicker</span>
          <DatePicker placeholder="дд.мм.гггг" dateFormat="dd.mm.yy"
                      :firstDayOfWeek="1" />
        </div>
      </div>
    </section>

    <!-- Section 5 — Buttons -->
    <section class="glass-card ds-section">
      <h3 class="ds-section-title">Кнопки</h3>
      <div class="ds-row">
        <div class="ds-col">
          <span class="ds-label">Основная</span>
          <Button label="Сохранить" />
        </div>
        <div class="ds-col">
          <span class="ds-label">Вторичная</span>
          <Button label="Отмена" severity="secondary" />
        </div>
        <div class="ds-col">
          <span class="ds-label">Опасная</span>
          <Button label="Удалить" severity="danger" text />
        </div>
        <div class="ds-col">
          <span class="ds-label">Ghost</span>
          <Button label="Подробнее" text />
        </div>
        <div class="ds-col">
          <span class="ds-label">С иконкой</span>
          <Button label="Добавить" icon="pi pi-plus" />
        </div>
        <div class="ds-col">
          <span class="ds-label">Только иконка</span>
          <Button icon="pi pi-pencil" text />
        </div>
        <div class="ds-col">
          <span class="ds-label">Загрузка</span>
          <Button label="Сохранение..." :loading="true" />
        </div>
        <div class="ds-col">
          <span class="ds-label">Отключена</span>
          <Button label="Недоступно" :disabled="true" />
        </div>
      </div>
    </section>

    <!-- Section 6 — Badges (10 universal variants) -->
    <section class="glass-card ds-section">
      <h3 class="ds-section-title">Бейджи</h3>
      <div class="ds-label" style="margin-bottom: 0.5rem">Статус-бейджи</div>
      <div class="ds-row" style="margin-bottom: 1rem; flex-wrap: wrap; gap: 8px">
        <span v-for="n in 8" :key="'s'+n" :class="['badge', `badge-${n}`]">Название_{{ n }}</span>
      </div>
      <div class="ds-label" style="margin-bottom: 0.5rem">Тип-бейджи</div>
      <div class="ds-row" style="flex-wrap: wrap; gap: 8px">
        <span v-for="n in 8" :key="'t'+n" :class="['badge badge-outline', `badge-${n}`]">Название_{{ n }}</span>
      </div>
    </section>

    <!-- Section 7 — Paginator -->
    <section class="glass-card ds-section">
      <h3 class="ds-section-title">Пагинатор</h3>
      <Paginator
        v-model:first="paginatorFirst"
        :rows="10"
        :totalRecords="47"
        :rowsPerPageOptions="[10, 100]"
      />
    </section>

    <!-- Section 8 — Cards -->
    <section class="glass-card ds-section">
      <h3 class="ds-section-title">Карточки</h3>
      <div class="ds-row">
        <div class="ds-col" style="flex: 1; min-width: 200px">
          <span class="ds-label">glass-card</span>
          <div class="glass-card ds-card-demo">
            <div class="ds-card-demo-title">Стеклянная карточка</div>
            <p class="ds-card-demo-text">Стандартная frosted-glass карточка. Используется для основного контента.</p>
          </div>
        </div>
        <div class="ds-col" style="flex: 1; min-width: 200px">
          <span class="ds-label">kpi-card</span>
          <div class="glass-card kpi-card ds-card-demo">
            <div class="ds-card-demo-title">KPI-карточка</div>
            <p class="ds-card-demo-text">Компактная, используется на дашборде.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 9 — Table (DataTable) -->
    <section class="glass-card table-card ds-section-table">
      <!-- Table toolbar — icon buttons like "Только иконка" in Buttons section -->
      <div class="ds-table-toolbar">
        <template v-if="isEditingTableName">
          <input v-model="tableName" class="ds-table-name-input"
            @blur="finishEditTableName" @keyup.enter="finishEditTableName" />
        </template>
        <template v-else>
          <span class="ds-table-name">{{ tableName }}</span>
        </template>
        <Button icon="pi pi-pencil" text size="small" severity="secondary"
          v-tooltip.bottom="'Переименовать'" @click="startEditTableName" class="ds-toolbar-btn" />
        <Button icon="pi pi-download" text size="small" severity="secondary"
          v-tooltip.bottom="'Скачать CSV'" @click="exportTableCSV" class="ds-toolbar-btn" />
        <span class="ds-table-rows-sep"></span>
        <span class="ds-table-rows-label">Строк в окне (5–100)</span>
        <input type="number" v-model.number="tableVisibleRows" min="5" max="100" step="5"
          class="ds-table-rows-native"
          @keyup.enter="$event.target.blur()"
          @blur="clampVisibleRows" />
        <span class="ds-table-rows-sep"></span>
        <span class="ds-table-rows-label">{{ filteredTableData.length }} строк × {{ tableColumnCount }} столбцов</span>
      </div>

      <DataTable
        ref="tableRef"
        :value="paginatedTableData"
        rowHover
        sortMode="single"
        removableSort
        scrollable
        :scrollHeight="tableScrollHeight"
        resizableColumns
        columnResizeMode="fit"
        reorderableColumns
        :rowClass="(data) => selectedRows.has(data.id) ? 'ds-row-selected' : ''"
        @rowClick="({ originalEvent, data, index }) => onRowClick(originalEvent, data, index)"
        @rowContextmenu="({ originalEvent, data, index }) => onRowContextMenu(originalEvent, data, index)"
        class="tvel-table"
      >
        <!-- № — frozen, без сортировки -->
        <Column header="№" frozen style="min-width: 50px; width: 50px">
          <template #body="{ index }">
            <span style="color: #6B7280">{{ index + 1 }}</span>
          </template>
        </Column>

        <!-- Название -->
        <Column field="name" sortable style="min-width: 100px">
          <template #header>
            <span class="col-filter-header" :class="{ 'col-filter-active': hasActiveFilter('name') }"
              @click.stop="onHeaderFilter($event, 'name')">Название</span>
          </template>
          <template #body="{ data }">
            {{ data.name }}
          </template>
        </Column>

        <!-- Тип — outline badge -->
        <Column field="type" sortable style="min-width: 80px">
          <template #header>
            <span class="col-filter-header" :class="{ 'col-filter-active': hasActiveFilter('type') }"
              @click.stop="onHeaderFilter($event, 'type')">Тип</span>
          </template>
          <template #body="{ data }">
            <span :class="['badge badge-outline', `badge-${data.typeBadge}`]">{{ data.type }}</span>
          </template>
        </Column>

        <!-- Статус — filled badge -->
        <Column field="status" sortable style="min-width: 80px">
          <template #header>
            <span class="col-filter-header" :class="{ 'col-filter-active': hasActiveFilter('status') }"
              @click.stop="onHeaderFilter($event, 'status')">Статус</span>
          </template>
          <template #body="{ data }">
            <span :class="['badge', `badge-${data.statusBadge}`]">{{ data.status }}</span>
          </template>
        </Column>

        <!-- Параметр 1 -->
        <Column field="param1" sortable style="min-width: 70px">
          <template #header>
            <span class="col-filter-header" :class="{ 'col-filter-active': hasActiveFilter('param1') }"
              @click.stop="onHeaderFilter($event, 'param1')">Параметр 1</span>
          </template>
        </Column>

        <!-- Параметр 2 -->
        <Column field="param2" sortable style="min-width: 80px">
          <template #header>
            <span class="col-filter-header" :class="{ 'col-filter-active': hasActiveFilter('param2') }"
              @click.stop="onHeaderFilter($event, 'param2')">Параметр 2</span>
          </template>
        </Column>

        <!-- Параметр 3 -->
        <Column field="param3" sortable style="min-width: 70px">
          <template #header>
            <span class="col-filter-header" :class="{ 'col-filter-active': hasActiveFilter('param3') }"
              @click.stop="onHeaderFilter($event, 'param3')">Параметр 3</span>
          </template>
        </Column>

        <!-- Параметр 4 -->
        <Column field="param4" sortable style="min-width: 80px">
          <template #header>
            <span class="col-filter-header" :class="{ 'col-filter-active': hasActiveFilter('param4') }"
              @click.stop="onHeaderFilter($event, 'param4')">Параметр 4</span>
          </template>
        </Column>

        <!-- Параметр 5 -->
        <Column field="param5" sortable style="min-width: 70px">
          <template #header>
            <span class="col-filter-header" :class="{ 'col-filter-active': hasActiveFilter('param5') }"
              @click.stop="onHeaderFilter($event, 'param5')">Параметр 5</span>
          </template>
        </Column>

      </DataTable>
      <Paginator v-if="showPaginator"
        :first="tableFirst"
        :rows="tableVisibleRows"
        :totalRecords="filteredTableData.length"
        @page="onPageChange"
        :template="'FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink'"
      />
    </section>

    <!-- Spacer for scroll testing -->
    <section class="glass-card ds-section" style="min-height: 800px;">
      <h3 class="ds-section-title">Тестовый блок</h3>
      <p style="color: #6B7280; font-size: 14px;">Блок для проверки прокрутки страницы под таблицей.</p>
    </section>

    <!-- Excel-like column filter overlay -->
    <div ref="filterOverlay" class="col-filter-overlay" style="display: none" @click.stop>
      <div class="col-filter-title">{{ filterFieldLabel }}</div>
      <div class="col-filter-search">
        <InputText v-model="filterSearch" placeholder="Поиск..." size="small" class="col-filter-search-input" />
      </div>
      <label class="col-filter-option col-filter-select-all" @click.prevent="toggleSelectAll">
        <Checkbox :modelValue="isAllSelected" :binary="true" @click.stop="toggleSelectAll" />
        <span>Выбрать все</span>
      </label>
      <div class="col-filter-divider"></div>
      <div class="col-filter-options">
        <label v-for="opt in filteredFilterOptions" :key="opt" class="col-filter-option">
          <Checkbox :modelValue="filterSelected.includes(opt)" :binary="true"
            @update:modelValue="toggleFilterOption(opt)" />
          <span>{{ opt }}</span>
        </label>
      </div>
      <div class="col-filter-actions">
        <Button label="Применить" size="small" @click="applyFilter" />
        <Button label="Сбросить" size="small" severity="secondary" text @click="resetFilter" />
      </div>
    </div>

    <!-- Row context menu -->
    <div v-if="ctxMenuVisible" class="ds-ctx-menu"
      :style="{ left: ctxMenuPos.x + 'px', top: ctxMenuPos.y + 'px' }" @click.stop>
      <button class="ds-ctx-menu-item ds-ctx-menu-danger" @click="deleteSelectedRows">
        <i class="pi pi-trash"></i>
        Удалить{{ selectedRows.size > 1 ? ` (${selectedRows.size})` : '' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.design-system-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
/* Override PageHeader margin — gap handles spacing here */
.design-system-page :deep(.page-header) {
  margin-bottom: 3px !important;
}

.ds-section {
  padding: 1.5rem;
}

.ds-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
  margin: 0 0 1.25rem 0;
}

.ds-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-start;
}

.ds-col {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.ds-label {
  font-size: 11px;
  color: #9CA3AF;
}

/* Colour swatches */
.ds-swatch {
  width: 64px;
  text-align: center;
}
.ds-swatch-block {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  margin-bottom: 0.4rem;
}
.ds-swatch-hex  { font-size: 11px; font-weight: 600; color: #333; }
.ds-swatch-name { font-size: 10px; color: #9CA3AF; }

/* Typography examples */
.ds-type-row {
  display: flex;
  align-items: baseline;
  gap: 1.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(180, 210, 255, 0.2);
}
.ds-type-row:last-child {
  border-bottom: none;
}
.ds-type-spec { font-size: 11px; color: #9CA3AF; white-space: nowrap; }

/* Colour swatch pairs */
.ds-swatch-pair {
  display: flex;
  gap: 4px;
}

/* Card demos */
.ds-card-demo {
  padding: 1.25rem;
}
.ds-card-demo-title {
  font-size: 15px;
  font-weight: 700;
  color: #003274;
  margin-bottom: 0.5rem;
}
.ds-card-demo-text {
  font-size: 13px;
  color: #6B7280;
  margin: 0;
}

/* table-card */
.table-card {
  overflow: clip;
  padding: 0;
}

.ds-section-table {
  padding: 0;
}

/* ── Table toolbar — sticky below PageHeader ── */
.ds-table-toolbar {
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
.ds-table-name {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
}
.ds-table-name-input {
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

/* ── Toolbar icon buttons — square with rounded corners ── */
.ds-toolbar-btn {
  border-radius: 6px !important;
  width: 2rem;
  height: 2rem;
  padding: 0 !important;
}

/* ── Table toolbar extras ── */
.ds-table-rows-sep {
  width: 1px;
  height: 20px;
  background: rgba(0, 50, 116, 0.12);
  margin: 0 0.25rem;
  flex-shrink: 0;
}
.ds-table-rows-label {
  font-size: 12px;
  font-weight: 400;
  color: #6B7280;
  white-space: nowrap;
}
.ds-table-rows-native {
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
.ds-table-rows-native::-webkit-inner-spin-button,
.ds-table-rows-native::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.ds-table-rows-native:focus {
  border-color: rgba(0, 50, 116, 0.35);
}

/* ── Save/unsaved indicator — single block with state transitions ── */
.ds-indicator {
  position: absolute;
  right: 1.5rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  border-radius: 8px;
  padding: 8px 10px;
  transition: background 0.4s ease;
}
/* Unsaved state — Охра (badge-2) */
.ds-indicator--unsaved {
  background: rgba(211, 167, 84, 0.12);
}
/* Saved state — Зелёный (badge-4 / Название_4) */
.ds-indicator--saved {
  background: rgba(82, 201, 166, 0.12);
}
.ds-indicator-label {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: color 0.4s ease;
}
.ds-indicator--unsaved .ds-indicator-label {
  color: #D3A754;
}
.ds-indicator--saved .ds-indicator-label {
  color: #2E9E7E;
}
.ds-indicator-actions {
  display: flex;
  gap: 0;
}
.ds-indicator-actions :deep(.p-button) {
  flex: 1;
  font-size: 12px;
  height: 28px;
  border-radius: 0;
  border: 1px solid rgba(0, 50, 116, 0.25) !important;
}
.ds-indicator-actions :deep(.p-button:first-child) {
  border-radius: 5px 0 0 5px;
}
.ds-indicator-actions :deep(.p-button:last-child) {
  border-radius: 0 5px 5px 0;
}
/* Checkmark animation */
.ds-check-anim {
  animation: ds-check-pop 0.4s ease-out;
}
@keyframes ds-check-pop {
  0%   { transform: scale(0); opacity: 0; }
  50%  { transform: scale(1.4); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
/* Fade in/out for the whole indicator */
.ds-indicator-fade-enter-active { transition: opacity 0.25s ease; }
.ds-indicator-fade-leave-active { transition: opacity 0.5s ease; }
.ds-indicator-fade-enter-from,
.ds-indicator-fade-leave-to { opacity: 0; }

/* ── Row context menu ── */
.ds-ctx-menu {
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
.ds-ctx-menu-item {
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
.ds-ctx-menu-item:hover {
  background: rgba(0, 50, 116, 0.06);
}
.ds-ctx-menu-item i {
  font-size: 13px;
  width: 16px;
  text-align: center;
}
.ds-ctx-menu-danger {
  color: #E74C3C;
}
.ds-ctx-menu-danger:hover {
  background: rgba(231, 76, 60, 0.08);
}

/* ── Selected row highlight ── */
.table-card :deep(.ds-row-selected) {
  background: rgba(0, 50, 116, 0.07) !important;
}
.table-card :deep(.ds-row-selected > td.p-datatable-frozen-column) {
  background: rgba(230, 238, 250, 0.98) !important;
}

/* DataTable styling — match TapesPage */
.table-card :deep(.p-datatable-table-container),
.table-card :deep(.p-datatable) {
  background: transparent;
}
/* Horizontal scroll — scrollbar below data rows */
.table-card :deep(.p-datatable-table-container) {
  overflow-x: auto;
  padding-bottom: 2px;
}
/* Gap between toolbar and thead */
.table-card :deep(.p-datatable-thead > tr:first-child > th) {
  border-top: 4px solid transparent;
}
/* Empty message — keep height stable */
.table-card :deep(.p-datatable-emptymessage td) {
  text-align: center;
  color: #9CA3AF;
  font-size: 13px;
  padding: 2rem;
}

.table-card :deep(.p-datatable-thead > tr > th) {
  background: rgba(0, 50, 116, 0.12) !important;
  color: #003274 !important;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.02em;
  border-bottom: 1px solid rgba(0, 50, 116, 0.18) !important;
  border-right: 1px solid rgba(0, 50, 116, 0.15) !important;
}
.table-card :deep(.p-datatable-thead > tr > th:last-child) {
  border-right: none;
}
/* Sort icon */
.table-card :deep(.p-datatable-thead .p-datatable-sort-icon) {
  color: rgba(0, 50, 116, 0.4);
}
.table-card :deep(.p-datatable-tbody > tr > td) {
  border-right: 1px solid rgba(0, 50, 116, 0.08);
}
.table-card :deep(.p-datatable-tbody > tr > td:last-child) {
  border-right: none;
}

/* Clickable filter header — badge-6 style */
.col-filter-header {
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: background 0.15s;
  color: #003274;
}
.col-filter-header:hover {
  background: rgba(0, 50, 116, 0.10);
}
.col-filter-header.col-filter-active {
  background: rgba(0, 50, 116, 0.18);
}

.table-card :deep(.p-datatable-tbody > tr) {
  background: transparent;
  border-bottom: 1px solid rgba(180, 210, 255, 0.18);
}

/* Frozen columns need opaque background so scrolling content doesn't show through */
.table-card :deep(.p-datatable-frozen-column) {
  background: #f8fcff !important;
}
.table-card :deep(.p-datatable-thead > tr > th.p-datatable-frozen-column) {
  background: #e8edf5 !important;
}
.table-card :deep(.p-datatable-tbody > tr:hover > td.p-datatable-frozen-column) {
  background: rgba(240, 246, 255, 0.98) !important;
}

.table-card :deep(.p-datatable-tbody > tr:last-child) {
  border-bottom: none;
}

.table-card :deep(.p-datatable-tbody > tr:hover) {
  background: rgba(0, 50, 116, 0.04) !important;
}

/* Paginator styling — match TapesPage */
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

/* kpi-card */
.kpi-card {
  padding: 1rem 1.25rem;
}
.kpi-card .ds-card-demo-title {
  margin-bottom: 0.2rem;
}

/* Column filter overlay (Excel-like) */
.col-filter-overlay {
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
.col-filter-title {
  font-size: 12px;
  font-weight: 700;
  color: #003274;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.col-filter-search {
  margin-bottom: 0.5rem;
}
.col-filter-search-input {
  width: 100%;
  height: 2rem !important;
  font-size: 13px !important;
}
.col-filter-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 0.75rem;
  max-height: 200px;
  overflow-y: auto;
}
.col-filter-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
}
.col-filter-select-all {
  font-weight: 600;
  margin-bottom: 4px;
}
.col-filter-divider {
  height: 1px;
  background: rgba(180, 210, 255, 0.3);
  margin-bottom: 6px;
}
.col-filter-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

/* ── Select (AutoComplete) — chip style for selected value + clear button ── */
.select-ac-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.select-ac-wrap :deep(.p-autocomplete-input) {
  padding-right: 2rem;
}
/* Selected value gets subtle background highlight */
.select-ac-wrap :deep(.p-autocomplete-input:not(:placeholder-shown)) {
  background: rgba(0, 50, 116, 0.04) !important;
}
/* Clear button */
.select-clear-btn {
  position: absolute;
  right: 36px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: #9CA3AF;
  font-size: 11px;
  padding: 4px;
  border-radius: 50%;
  transition: color 0.15s, background 0.15s;
  z-index: 2;
}
.select-clear-btn:hover {
  color: #333;
  background: rgba(0, 0, 0, 0.06);
}

/* ── Native MultiSelect — match height to Select/DatePicker ── */
:deep(.p-multiselect) {
  min-height: 40px;
  height: 40px;
  box-sizing: border-box;
}
:deep(.p-multiselect-dropdown) {
  height: 100%;
  align-self: stretch;
}
</style>
