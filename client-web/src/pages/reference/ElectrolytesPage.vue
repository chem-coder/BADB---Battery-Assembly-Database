<script setup>
/**
 * ElectrolytesPage — "Электролиты" (electrolyte reference).
 *
 * Migrated to row-open + foundation pattern per V2 parity. See:
 *   - docs/current/electrolytes.md
 *   - docs/instructions/frontend_parity_handoff.md §"Electrolytes And Separators"
 *   - public/js/electrolytes.js (vanilla reference)
 *
 * Surface notes (vanilla parity):
 *   - row-open opened-record form with sticky header (save/print/exit/delete);
 *   - typed delete confirmation `DELETE ELECTROLYTE <id>`;
 *   - GET /api/electrolytes/:id/delete-check before typed confirm;
 *   - print URL: /workflow/electrolyte-print.html?electrolyte_id=<id>;
 *   - list-level duplicate (client-side starter copy);
 *   - DB-backed file attachments: list/upload/download/delete.
 *
 * The file attachments block is inlined here for now. If Separators
 * needs the same pattern (it does, per vanilla), the section will be
 * extracted into a foundation component `RecordFiles.vue` in a
 * follow-up cleanup PR.
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

// ── Files (inline, candidate for foundation extraction) ──────────────
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
    const { data } = await api.get(`/api/electrolytes/${id}/files`);
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

// Reload files whenever currentId changes to a saved record.
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
    await api.post(`/api/electrolytes/${ctx.currentId.value}/files`, { entries });
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
    await api.delete(`/api/electrolytes/files/${fileId}`);
    setFilesStatus('Файл удалён', 'ok');
    await loadFiles(ctx.currentId.value);
  } catch (err) {
    setFilesStatus(err?.response?.data?.error || 'Ошибка удаления файла', 'error');
  }
}

function downloadUrl(file) {
  return file.download_url || `/api/electrolytes/files/${file.electrolyte_file_id}/download`;
}

function formatFileSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

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
        <div v-if="ctx.mode.value === 'edit'" class="files-section">
          <div class="section-header">
            <span class="section-title">Файлы</span>
            <span v-if="filesStatus" :class="['files-status', `files-status--${filesStatus.tone}`]">
              {{ filesStatus.message }}
            </span>
          </div>

          <div v-if="filesLoading" class="files-loading">Загрузка файлов...</div>
          <ul v-else-if="files.length > 0" class="files-list">
            <li v-for="f in files" :key="f.electrolyte_file_id" class="file-row">
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
                @click="onFileDelete(f.electrolyte_file_id)"
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

.files-section {
  border-top: 1px solid rgba(0, 50, 116, 0.1);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 700px;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}
.files-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 3px;
}
.files-status--ok { background: #f0fdf4; color: #166534; }
.files-status--error { background: #fef2f2; color: #b91c1c; }
.files-status--info { background: #eff6ff; color: #1e40af; }
.files-loading,
.files-empty {
  margin: 4px 0;
  font-size: 13px;
  color: #6B7280;
}
.files-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 3px;
}
.file-row:hover {
  background: rgba(0, 50, 116, 0.04);
}
.file-link {
  color: #003274;
  font-size: 13px;
  text-decoration: none;
  flex: 1;
}
.file-link:hover {
  text-decoration: underline;
}
.file-meta {
  font-size: 12px;
  color: #6B7280;
}
.hidden-input { display: none; }
.files-upload-row { margin-top: 4px; }
</style>
