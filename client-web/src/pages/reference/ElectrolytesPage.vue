<script setup>
/**
 * ElectrolytesPage — "Электролиты" (electrolyte reference).
 *
 * Migrated to row-open + foundation pattern per V2 parity. See:
 *   - docs/current/electrolytes.md
 *   - docs/instructions/frontend_parity_handoff.md §"Electrolytes And Separators"
 *   - public/js/electrolytes.js (vanilla reference)
 *
 * Files block is delegated to the shared <RecordFiles> foundation
 * component (added 2026-05-14 as the third per-surface migration
 * exposed the duplication with Separators).
 */
import { ref, onMounted } from 'vue';
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

// ── Constants ────────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { value: 'liquid', label: 'жидкий' },
  { value: 'solid',  label: 'твёрдый' },
  { value: 'gel',    label: 'гель' },
];

const STATUS_OPTIONS = [
  { value: 'active',   label: 'активный' },
  { value: 'inactive', label: 'неактивный' },
  { value: 'archived', label: 'архивный' },
];

// ── List state ───────────────────────────────────────────────────────
const electrolytes = ref([]);
const loading = ref(false);

async function loadList() {
  loading.value = true;
  try {
    const { data } = await api.get('/api/electrolytes');
    electrolytes.value = data;
  } finally {
    loading.value = false;
  }
}

onMounted(() => loadList());

// ── Form ─────────────────────────────────────────────────────────────
function emptyForm() {
  return {
    name: '',
    electrolyte_type: '',
    solvent_system: '',
    salts: '',
    concentration: '',
    additives: '',
    notes: '',
    status: 'active',
  };
}

async function loadOne(id) {
  const item = electrolytes.value.find((e) => e.electrolyte_id === id);
  if (!item) throw new Error(`Электролит #${id} не найден`);
  return {
    item,
    form: {
      name: item.name || '',
      electrolyte_type: item.electrolyte_type || '',
      solvent_system: item.solvent_system || '',
      salts: item.salts || '',
      concentration: item.concentration || '',
      additives: item.additives || '',
      notes: item.notes || '',
      status: item.status || 'active',
    },
  };
}

async function saveOne(form, mode, currentId) {
  const payload = {
    name: form.name.trim(),
    electrolyte_type: form.electrolyte_type,
    solvent_system: form.solvent_system || null,
    salts: form.salts || null,
    concentration: form.concentration || null,
    additives: form.additives || null,
    notes: form.notes || null,
    status: form.status,
  };

  let response;
  if (mode === 'create') {
    response = await api.post('/api/electrolytes', payload);
  } else {
    response = await api.put(`/api/electrolytes/${currentId}`, payload);
  }
  return response.data;
}

function validate(form) {
  if (!form.name?.trim()) return 'Заполните название электролита';
  if (!form.electrolyte_type) return 'Выберите тип электролита';
  return true;
}

// ── Foundation hook ──────────────────────────────────────────────────
const ctx = useRowOpenForm({
  entityType: 'electrolytes',
  idField: 'electrolyte_id',
  emptyForm,
  validate,
  loadOne,
  saveOne,
  list: { ref: electrolytes, load: loadList },
  deletePhrase: (id) => `DELETE ELECTROLYTE ${id}`,
  hasDeleteCheck: true,
  deleteMessages: {
    success: 'Электролит удалён',
  },
});

// ── Filters ──────────────────────────────────────────────────────────
const filters = [
  { field: 'text', type: 'text', placeholder: 'Название, заметки, соли...', label: 'Поиск' },
  {
    field: 'status',
    type: 'select',
    label: 'Статус',
    emptyOption: 'Все статусы',
    options: STATUS_OPTIONS,
  },
  {
    field: 'electrolyte_type',
    type: 'select',
    label: 'Тип',
    emptyOption: 'Все типы',
    options: TYPE_OPTIONS,
  },
];

function textHaystack(row) {
  return [
    row.name,
    row.solvent_system,
    row.salts,
    row.concentration,
    row.additives,
    row.notes,
    row.electrolyte_type,
    row.status,
  ].filter(Boolean).join(' ');
}

// ── Columns ──────────────────────────────────────────────────────────
const columns = [
  { field: 'name', header: 'Название' },
  { field: 'electrolyte_type', header: 'Тип', width: '100px' },
  { field: 'salts', header: 'Соли', width: '180px' },
  { field: 'concentration', header: 'Концентрация', width: '140px' },
  { field: 'status', header: 'Статус', width: '120px' },
];

function typeLabel(t) {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label || t || '—';
}
function statusLabel(s) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label || s || '—';
}

// ── Meta string for sticky header ────────────────────────────────────
function formatMeta(item) {
  if (!item) return '';
  const parts = [`ID: ${item.electrolyte_id}`];
  if (item.electrolyte_type) parts.push(`тип: ${typeLabel(item.electrolyte_type)}`);
  if (item.status) parts.push(`статус: ${statusLabel(item.status)}`);
  return parts.join(' · ');
}

// ── List-row actions ─────────────────────────────────────────────────
const { onRowPrint, onHeaderPrint } = usePrintHandlers('electrolytes', ctx);
</script>

<template>
  <RowOpenPage
    title="Электролиты"
    icon="pi pi-flask"
    add-placeholder="+ Добавить электролит"
    :list="electrolytes"
    :columns="columns"
    :filters="filters"
    :row-actions="['print', 'duplicate']"
    :current-id="ctx.currentId.value"
    id-field="electrolyte_id"
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
    <template #col-electrolyte_type="{ data }">
      <span class="meta-text">{{ typeLabel(data.electrolyte_type) }}</span>
    </template>
    <template #col-status="{ data }">
      <span :class="['status-pill', `status-pill--${data.status || 'unknown'}`]">
        {{ statusLabel(data.status) }}
      </span>
    </template>
    <template #col-salts="{ data }">
      <span class="meta-text">{{ data.salts || '' }}</span>
    </template>
    <template #col-concentration="{ data }">
      <span class="meta-text">{{ data.concentration || '' }}</span>
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
            placeholder="Новый электролит"
            class="electrolyte-title"
          />
        </template>
      </OpenedRecordHeader>

      <div class="electrolyte-form">
        <div class="form-grid">
          <label for="el-type">Тип</label>
          <Select
            id="el-type"
            v-model="ctx.form.value.electrolyte_type"
            :options="TYPE_OPTIONS"
            option-label="label"
            option-value="value"
            placeholder="— выбрать —"
            class="w-full"
          />

          <label for="el-status">Статус</label>
          <Select
            id="el-status"
            v-model="ctx.form.value.status"
            :options="STATUS_OPTIONS"
            option-label="label"
            option-value="value"
            class="w-full"
          />

          <label for="el-solvent">Растворитель</label>
          <InputText
            id="el-solvent"
            v-model="ctx.form.value.solvent_system"
            placeholder="EC:DMC 1:1, EC:EMC:DEC 1:1:1, ..."
            class="w-full"
          />

          <label for="el-salts">Соли</label>
          <InputText
            id="el-salts"
            v-model="ctx.form.value.salts"
            placeholder="LiPF6, LiTFSI, ..."
            class="w-full"
          />

          <label for="el-concentration">Концентрация</label>
          <InputText
            id="el-concentration"
            v-model="ctx.form.value.concentration"
            placeholder="1 моль/л, 1.2 М, ..."
            class="w-full"
          />

          <label for="el-additives">Добавки</label>
          <InputText
            id="el-additives"
            v-model="ctx.form.value.additives"
            placeholder="VC 2%, FEC 5%, ..."
            class="w-full"
          />

          <label for="el-notes">Заметки</label>
          <Textarea
            id="el-notes"
            v-model="ctx.form.value.notes"
            rows="3"
            placeholder="Особенности приготовления, источник, и т.п."
            class="w-full"
          />
        </div>

        <!-- ── Files section (only for saved records) ── -->
        <RecordFiles
          v-if="ctx.mode.value === 'edit'"
          entity-type="electrolytes"
          :record-id="ctx.currentId.value"
          file-id-field="electrolyte_file_id"
        />
      </div>
    </template>
  </RowOpenPage>

  <TypedDeleteConfirm
    :visible="ctx.deleteModalVisible.value"
    :phrase="ctx.deleteModalPhrase.value"
    description="Удаление электролита необратимо."
    @update:visible="(v) => { if (!v) ctx.cancelDelete() }"
    @confirmed="ctx.confirmDelete"
    @cancelled="ctx.cancelDelete"
  />
</template>

<style scoped>
.electrolyte-title {
  font-size: 16px;
  font-weight: 600;
  color: #003274;
}
.electrolyte-form {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
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

.status-pill {
  display: inline-flex;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}
.status-pill--active { background: rgba(82, 201, 166, 0.14); color: #1d7a5f; }
.status-pill--inactive { background: rgba(176, 0, 32, 0.08); color: #b00020; }
.status-pill--archived { background: rgba(0, 50, 116, 0.06); color: #003274; }
.status-pill--unknown { color: #6B7280; }
/* Files block styling lives in components/parity/RecordFiles.vue */
</style>
