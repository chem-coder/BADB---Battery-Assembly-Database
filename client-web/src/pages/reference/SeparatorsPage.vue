<script setup>
/**
 * SeparatorsPage — "Сепараторы" (separator reference).
 *
 * Migrated to row-open + foundation pattern per V2 parity. See:
 *   - docs/current/separators.md
 *   - docs/instructions/frontend_parity_handoff.md §"Electrolytes And Separators"
 *   - public/js/separators.js (vanilla reference)
 *
 * Mirrors the Electrolytes pattern with:
 *   - 12 separator fields (incl. structure_id FK to separator_structure);
 *   - typed delete `DELETE SEPARATOR <id>` with delete-check;
 *   - print URL using `sep_id` parameter (asymmetric to other surfaces);
 *   - files block delegated to <RecordFiles>.
 */
import { ref, watch, onMounted } from 'vue';
import api from '@/services/api';
import { usePrintHandlers } from '@/composables/usePrintHandlers';

import RowOpenPage from '@/components/parity/RowOpenPage.vue';
import OpenedRecordHeader from '@/components/parity/OpenedRecordHeader.vue';
import EditableTitle from '@/components/parity/EditableTitle.vue';
import TypedDeleteConfirm from '@/components/parity/TypedDeleteConfirm.vue';
import RecordFiles from '@/components/parity/RecordFiles.vue';
import { useRowOpenForm } from '@/composables/useRowOpenForm';

import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import DatePicker from 'primevue/datepicker';

// ── Constants ────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'available', label: 'доступен' },
  { value: 'used',      label: 'использован' },
  { value: 'scrap',     label: 'брак' },
];

const AIR_PERM_UNITS = [
  { value: '',          label: '— ед. изм. —' },
  { value: 'Gurley_s',  label: 'Gurley, с' },
  { value: 'cm3/cm2/s', label: 'см³/(см²·с)' },
];

// ── List + structures ────────────────────────────────────────────────
const separators = ref([]);
const structures = ref([]);
const loading = ref(false);

async function loadList() {
  loading.value = true;
  try {
    const { data } = await api.get('/api/separators');
    separators.value = data;
  } finally {
    loading.value = false;
  }
}

async function loadStructures() {
  const { data } = await api.get('/api/structures');
  structures.value = data || [];
}

onMounted(() => {
  loadList();
  loadStructures();
});

const structureOptions = ref([]);
watch(structures, (list) => {
  structureOptions.value = list.map((s) => ({ value: s.sep_str_id, label: s.name }));
});

// ── Form ─────────────────────────────────────────────────────────────
function emptyForm() {
  return {
    name: '',
    supplier: '',
    brand: '',
    batch: '',
    structure_id: null,
    air_perm: '',
    air_perm_units: '',
    thickness_um: '',
    porosity: '',
    comments: '',
    status: 'available',
    depleted_at: null,
  };
}

function asNumberOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function asDateOrNull(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

async function loadOne(id) {
  const item = separators.value.find((s) => s.separator_id === id);
  if (!item) throw new Error(`Сепаратор #${id} не найден`);
  return {
    item,
    form: {
      name: item.name || '',
      supplier: item.supplier || '',
      brand: item.brand || '',
      batch: item.batch || '',
      structure_id: item.structure_id ?? null,
      air_perm: item.air_perm ?? '',
      air_perm_units: item.air_perm_units || '',
      thickness_um: item.thickness_um ?? '',
      porosity: item.porosity ?? '',
      comments: item.comments || '',
      status: item.status || 'available',
      depleted_at: item.depleted_at ? new Date(item.depleted_at) : null,
    },
  };
}

async function saveOne(form, mode, currentId) {
  const payload = {
    name: form.name.trim(),
    supplier: form.supplier || null,
    brand: form.brand || null,
    batch: form.batch || null,
    structure_id: form.structure_id,
    air_perm: asNumberOrNull(form.air_perm),
    air_perm_units: form.air_perm_units || null,
    thickness_um: asNumberOrNull(form.thickness_um),
    porosity: asNumberOrNull(form.porosity),
    comments: form.comments || null,
    status: form.status,
    depleted_at: asDateOrNull(form.depleted_at),
  };

  let response;
  if (mode === 'create') {
    response = await api.post('/api/separators', payload);
  } else {
    response = await api.put(`/api/separators/${currentId}`, payload);
  }
  return response.data;
}

function validate(form) {
  if (!form.name?.trim()) return 'Заполните название сепаратора';
  if (!form.structure_id) return 'Выберите структуру сепаратора';
  return true;
}

// ── Foundation hook ──────────────────────────────────────────────────
const ctx = useRowOpenForm({
  entityType: 'separators',
  idField: 'separator_id',
  emptyForm,
  validate,
  loadOne,
  saveOne,
  list: { ref: separators, load: loadList },
  deletePhrase: (id) => `DELETE SEPARATOR ${id}`,
  hasDeleteCheck: true,
  deleteMessages: {
    success: 'Сепаратор удалён',
  },
});

// ── Filters ──────────────────────────────────────────────────────────
const filters = ref([
  { field: 'text', type: 'text', placeholder: 'Название, поставщик, бренд...', label: 'Поиск' },
  {
    field: 'status',
    type: 'select',
    label: 'Статус',
    emptyOption: 'Все статусы',
    options: STATUS_OPTIONS,
  },
]);

// Add structure filter once structures load.
watch(structureOptions, (opts) => {
  const f = {
    field: 'structure_id',
    type: 'select',
    label: 'Структура',
    emptyOption: 'Все структуры',
    options: opts.map((o) => ({ value: String(o.value), label: o.label })),
  };
  const idx = filters.value.findIndex((x) => x.field === 'structure_id');
  if (idx >= 0) filters.value.splice(idx, 1, f);
  else filters.value.push(f);
});

function textHaystack(row) {
  return [
    row.name,
    row.supplier,
    row.brand,
    row.batch,
    row.structure_name,
    row.comments,
  ].filter(Boolean).join(' ');
}

// ── Columns ──────────────────────────────────────────────────────────
const columns = [
  { field: 'name', header: 'Название' },
  { field: 'structure_name', header: 'Структура', width: '160px' },
  { field: 'supplier', header: 'Поставщик', width: '140px' },
  { field: 'brand', header: 'Бренд', width: '120px' },
  { field: 'thickness_um', header: 'Толщина, мкм', width: '120px' },
  { field: 'status', header: 'Статус', width: '120px' },
];

function statusLabel(s) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label || s || '—';
}

function formatMeta(item) {
  if (!item) return '';
  const parts = [`ID: ${item.separator_id}`];
  if (item.structure_name) parts.push(`структура: ${item.structure_name}`);
  if (item.status) parts.push(`статус: ${statusLabel(item.status)}`);
  return parts.join(' · ');
}

// ── List-row actions ─────────────────────────────────────────────────
const { onRowPrint, onHeaderPrint } = usePrintHandlers('separators', ctx);
</script>

<template>
  <RowOpenPage
    title="Сепараторы"
    icon="pi pi-th-large"
    add-placeholder="+ Добавить сепаратор"
    :list="separators"
    :columns="columns"
    :filters="filters"
    :row-actions="['print', 'duplicate']"
    :current-id="ctx.currentId.value"
    :mode="ctx.mode.value"
    id-field="separator_id"
    :loading="loading"
    :text-haystack="textHaystack"
    @create="(name) => ctx.openCreate(name)"
    @row-click="ctx.openEdit"
    @row-print="onRowPrint"
    @row-duplicate="ctx.openDuplicate"
  >
    <template #col-name="{ data }">
      <strong>{{ data.name }}</strong>
    </template>
    <template #col-structure_name="{ data }">
      <span class="meta-text">{{ data.structure_name || '—' }}</span>
    </template>
    <template #col-supplier="{ data }">
      <span class="meta-text">{{ data.supplier || '' }}</span>
    </template>
    <template #col-brand="{ data }">
      <span class="meta-text">{{ data.brand || '' }}</span>
    </template>
    <template #col-thickness_um="{ data }">
      <span class="meta-text">{{ data.thickness_um != null ? data.thickness_um : '' }}</span>
    </template>
    <template #col-status="{ data }">
      <span :class="['status-pill', `status-pill--${data.status || 'unknown'}`]">
        {{ statusLabel(data.status) }}
      </span>
    </template>

    <template #opened-record>
      <OpenedRecordHeader
        :meta="formatMeta(ctx.currentItem.value)"
        :dirty="ctx.isDirty.value"
        :status="ctx.status.value"
        :show-print="ctx.mode.value === 'edit'"
        :show-delete="ctx.mode.value === 'edit'"
        @save="ctx.save"
        @print="onHeaderPrint"
        @exit="ctx.exit"
        @delete="ctx.deleteRecord"
      >
        <template #title>
          <EditableTitle
            v-model="ctx.form.value.name"
            placeholder="Новый сепаратор"
            class="separator-title"
          />
        </template>
      </OpenedRecordHeader>

      <div class="separator-form">
        <div class="form-grid">
          <label for="sep-structure">Структура</label>
          <Select
            id="sep-structure"
            v-model="ctx.form.value.structure_id"
            :options="structureOptions"
            option-label="label"
            option-value="value"
            placeholder="— выбрать структуру —"
            class="w-full"
          />

          <label for="sep-supplier">Поставщик</label>
          <InputText
            id="sep-supplier"
            v-model="ctx.form.value.supplier"
            placeholder="Поставщик"
            class="w-full"
          />

          <label for="sep-brand">Бренд</label>
          <InputText
            id="sep-brand"
            v-model="ctx.form.value.brand"
            placeholder="Торговая марка"
            class="w-full"
          />

          <label for="sep-batch">Партия</label>
          <InputText
            id="sep-batch"
            v-model="ctx.form.value.batch"
            placeholder="Номер партии"
            class="w-full"
          />

          <label for="sep-thickness">Толщина, мкм</label>
          <InputText
            id="sep-thickness"
            v-model="ctx.form.value.thickness_um"
            type="number"
            class="w-full"
          />

          <label for="sep-porosity">Пористость, %</label>
          <InputText
            id="sep-porosity"
            v-model="ctx.form.value.porosity"
            type="number"
            class="w-full"
          />

          <label for="sep-perm">Воздухопроницаемость</label>
          <div class="perm-row">
            <InputText
              id="sep-perm"
              v-model="ctx.form.value.air_perm"
              type="number"
              class="w-full"
            />
            <Select
              v-model="ctx.form.value.air_perm_units"
              :options="AIR_PERM_UNITS"
              option-label="label"
              option-value="value"
              placeholder="— ед. изм. —"
            />
          </div>

          <label for="sep-status">Статус</label>
          <Select
            id="sep-status"
            v-model="ctx.form.value.status"
            :options="STATUS_OPTIONS"
            option-label="label"
            option-value="value"
            class="w-full"
          />

          <label for="sep-depleted">Исчерпан</label>
          <DatePicker
            id="sep-depleted"
            v-model="ctx.form.value.depleted_at"
            date-format="dd.mm.yy"
            placeholder="дд.мм.гггг"
            class="w-full"
            show-icon
          />

          <label for="sep-comments">Комментарии</label>
          <Textarea
            id="sep-comments"
            v-model="ctx.form.value.comments"
            rows="3"
            placeholder="Особенности применения, источник, замечания"
            class="w-full"
          />
        </div>

        <!-- ── Files section (only for saved records) ── -->
        <RecordFiles
          v-if="ctx.mode.value === 'edit'"
          entity-type="separators"
          :record-id="ctx.currentId.value"
          file-id-field="separator_file_id"
        />
      </div>
    </template>
  </RowOpenPage>

  <TypedDeleteConfirm
    :visible="ctx.deleteModalVisible.value"
    :phrase="ctx.deleteModalPhrase.value"
    description="Удаление сепаратора необратимо."
    @update:visible="(v) => { if (!v) ctx.cancelDelete() }"
    @confirmed="ctx.confirmDelete"
    @cancelled="ctx.cancelDelete"
  />
</template>

<style scoped>
.separator-title {
  font-size: 16px;
  font-weight: 600;
  color: #003274;
}
.separator-form {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 10px 16px;
  align-items: center;
  max-width: 700px;
}
.form-grid label {
  font-size: 13px;
  font-weight: 500;
  color: #003274;
}
.w-full { width: 100%; }
.meta-text { color: #6B7280; font-size: 13px; }
.perm-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 8px;
}

.status-pill {
  display: inline-flex;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}
.status-pill--available { background: rgba(82, 201, 166, 0.14); color: #1d7a5f; }
.status-pill--used { background: rgba(0, 50, 116, 0.06); color: #003274; }
.status-pill--scrap { background: rgba(176, 0, 32, 0.08); color: #b00020; }
.status-pill--unknown { color: #6B7280; }
/* Files block styling lives in components/parity/RecordFiles.vue */
</style>
