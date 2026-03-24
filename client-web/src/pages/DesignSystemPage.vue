<script setup>
import { ref, computed } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
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

const tableData = [
  { id: 1, name: 'Катодная лента К-01',  type: 'cathode', status: 'draft' },
  { id: 2, name: 'Анодная лента А-03',   type: 'anode',   status: 'processing' },
  { id: 3, name: 'Катодная лента К-07',  type: 'cathode', status: 'accepted' },
  { id: 4, name: 'Анодная лента А-12',   type: 'anode',   status: 'rejected' },
  { id: 5, name: 'Катодная лента К-15',  type: 'cathode', status: 'active' },
]

const roleLabels = { cathode: 'Катод', anode: 'Анод' }
</script>

<template>
  <div class="design-system-page">
    <PageHeader title="Дизайн код" icon="pi pi-palette" />

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
          <span class="ds-label">table-card</span>
          <div class="glass-card table-card ds-card-demo">
            <div class="ds-card-demo-title">Табличная карточка</div>
            <p class="ds-card-demo-text">Плотный padding, обёртка для DataTable.</p>
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
      <h3 class="ds-section-title" style="padding: 1.5rem 1.5rem 0">Таблица</h3>
      <DataTable :value="tableData" rowHover class="tvel-table">
        <Column field="id" header="№" style="width: 60px" />
        <Column field="name" header="Название">
          <template #body="{ data }">
            <strong>{{ data.name }}</strong>
          </template>
        </Column>
        <Column field="type" header="Тип" style="width: 120px">
          <template #body="{ data }">
            <span :class="['type-badge', `type-badge--${data.type}`]">{{ roleLabels[data.type] }}</span>
          </template>
        </Column>
        <Column field="status" header="Статус" style="width: 130px">
          <template #body="{ data }">
            <StatusBadge :status="data.status" />
          </template>
        </Column>
        <Column header="" style="width: 60px; text-align: right">
          <template #body>
            <Button icon="pi pi-ellipsis-v" text rounded size="small" severity="secondary" />
          </template>
        </Column>
      </DataTable>
    </section>
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

/* Type badges (legacy — used in table) */
.type-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}
.type-badge--cathode {
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
}
.type-badge--anode {
  background: rgba(82, 201, 166, 0.12);
  color: #2a9d78;
}

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
  overflow: hidden;
  padding: 0;
}

.ds-section-table {
  padding: 0;
}

/* DataTable styling — match TapesPage */
.table-card :deep(.p-datatable-table-container),
.table-card :deep(.p-datatable) {
  background: transparent;
}

.table-card :deep(.p-datatable-thead > tr > th) {
  background: rgba(0, 50, 116, 0.055);
  color: #003274;
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid rgba(180, 210, 255, 0.35);
}

.table-card :deep(.p-datatable-tbody > tr) {
  background: transparent;
  border-bottom: 1px solid rgba(180, 210, 255, 0.18);
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
