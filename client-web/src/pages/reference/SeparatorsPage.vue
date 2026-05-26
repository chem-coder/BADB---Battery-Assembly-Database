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
 *   - inline DB-backed files block.
 *
 * The inline files block is a near-duplicate of ElectrolytesPage.vue.
 * Extraction into `RecordFiles.vue` is the next cleanup PR after this
 * migration lands.
 */
import { ref, watch, onMounted } from 'vue';
import api from '@/services/api';
import { usePrintHandlers } from '@/composables/usePrintHandlers';

import RowOpenPage from '@/components/parity/RowOpenPage.vue';
import OpenedRecordHeader from '@/components/parity/OpenedRecordHeader.vue';
import EditableTitle from '@/components/parity/EditableTitle.vue';
import TypedDeleteConfirm from '@/components/parity/TypedDeleteConfirm.vue';
import { useRowOpenForm } from '@/composables/useRowOpenForm';

import Button from 'primevue/button';
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

// ── Files (inline, identical pattern to Electrolytes) ────────────────
// Candidate for foundation extraction into RecordFiles.vue.
const files = ref([]);
const filesLoading = ref(false);
const filesStatus = ref(null);
let filesStatusTimer = null;
const fileInputEl = ref(null);

async function loadFiles(id) {
  if (id == null) {
    files.value = [];
    return;
  }
  filesLoading.value = true;
  try {
    const { data } = await api.get(`/api/separators/${id}/files`);
    files.value = data || [];
  } catch (err) {
    files.value = [];
    setFilesStatus(err?.response?.data?.error || 'Ошибка загрузки файлов', 'error');
  } finally {
    filesLoading.value = false;
  }
}

function setFilesStatus(message, tone = 'info') {
  if (filesStatusTimer) clearTimeout(filesStatusTimer);
  filesStatus.value = { message, tone };
  filesStatusTimer = setTimeout(() => { filesStatus.value = null; }, 5000);
}

watch(
  () => ctx.currentId.value,
  (id) => loadFiles(id),
  { immediate: true }
);

async function onFileSelected(event) {
  const input = event.target;
  if (!input.files || input.files.length === 0) return;
  if (ctx.currentId.value == null) {
    setFilesStatus('Сохраните запись перед загрузкой файлов', 'error');
    input.value = '';
    return;
  }

  const entries = [];
  for (const file of Array.from(input.files)) {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((s, b) => s + String.fromCharCode(b), '')
    );
    entries.push({
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      file_content_base64: base64,
    });
  }

  try {
    await api.post(`/api/separators/${ctx.currentId.value}/files`, { entries });
    setFilesStatus('Файл загружен', 'ok');
    await loadFiles(ctx.currentId.value);
  } catch (err) {
    setFilesStatus(err?.response?.data?.error || 'Ошибка загрузки файла', 'error');
  } finally {
    input.value = '';
  }
}

async function onFileDelete(fileId) {
  if (!window.confirm('Удалить файл?')) return;
  try {
    await api.delete(`/api/separators/files/${fileId}`);
    setFilesStatus('Файл удалён', 'ok');
    await loadFiles(ctx.currentId.value);
  } catch (err) {
    setFilesStatus(err?.response?.data?.error || 'Ошибка удаления файла', 'error');
  }
}

function downloadUrl(file) {
  return file.download_url || `/api/separators/files/${file.separator_file_id}/download`;
}

function formatFileSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

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
        <div v-if="ctx.mode.value === 'edit'" class="files-section">
          <div class="section-header">
            <span class="section-title">Файлы</span>
            <span v-if="filesStatus" :class="['files-status', `files-status--${filesStatus.tone}`]">
              {{ filesStatus.message }}
            </span>
          </div>

          <div v-if="filesLoading" class="files-loading">Загрузка файлов...</div>
          <ul v-else-if="files.length > 0" class="files-list">
            <li v-for="f in files" :key="f.separator_file_id" class="file-row">
              <a :href="downloadUrl(f)" target="_blank" rel="noopener" class="file-link">
                {{ f.file_name }}
              </a>
              <span class="file-meta">
                {{ f.mime_type || '' }}
                <template v-if="f.file_size_bytes != null">
                  · {{ formatFileSize(f.file_size_bytes) }}
                </template>
              </span>
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                size="small"
                title="Удалить файл"
                @click="onFileDelete(f.separator_file_id)"
              />
            </li>
          </ul>
          <p v-else class="files-empty">Файлы не прикреплены.</p>

          <div class="files-upload-row">
            <input
              ref="fileInputEl"
              type="file"
              multiple
              class="hidden-input"
              @change="onFileSelected"
            />
            <Button
              icon="pi pi-upload"
              label="Загрузить файлы"
              severity="secondary"
              outlined
              size="small"
              @click="fileInputEl?.click()"
            />
          </div>
        </div>
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

.files-section {
  border-top: 1px solid rgba(0, 50, 116, 0.1);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 700px;
}
.section-header { display: flex; justify-content: space-between; align-items: center; }
.section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}
.files-status { font-size: 12px; padding: 2px 8px; border-radius: 3px; }
.files-status--ok { background: #f0fdf4; color: #166534; }
.files-status--error { background: #fef2f2; color: #b91c1c; }
.files-status--info { background: #eff6ff; color: #1e40af; }
.files-loading, .files-empty { margin: 4px 0; font-size: 13px; color: #6B7280; }
.files-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 3px;
}
.file-row:hover { background: rgba(0, 50, 116, 0.04); }
.file-link { color: #003274; font-size: 13px; text-decoration: none; flex: 1; }
.file-link:hover { text-decoration: underline; }
.file-meta { font-size: 12px; color: #6B7280; }
.hidden-input { display: none; }
.files-upload-row { margin-top: 4px; }
</style>
