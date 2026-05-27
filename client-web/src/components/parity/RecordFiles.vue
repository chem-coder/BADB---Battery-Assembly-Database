<script setup>
/**
 * RecordFiles — DB-backed file attachments block for opened records.
 *
 * Extracted from inline blocks in ElectrolytesPage and SeparatorsPage. The
 * pattern is identical for surfaces that store files in their own *_files
 * table (electrolyte_files, separator_files, ...) with these route shapes:
 *
 *   GET    /api/<entityType>/:id/files                  → list
 *   POST   /api/<entityType>/:id/files                  → upload (base64 entries)
 *   GET    /api/<entityType>/files/:fileId/download     → authenticated download
 *   DELETE /api/<entityType>/files/:fileId              → delete
 *
 * The list response is expected to contain rows with a `file_name`, optional
 * `mime_type`, optional `file_size_bytes`, and a `download_url` (preferred).
 * If `download_url` is absent, the component falls back to constructing one
 * from `entityType` and the per-row id field.
 *
 * The component is self-contained: it owns its loading state and transient
 * status messages. Parents only pass `entityType`, `recordId`, and
 * `fileIdField` (the column name varies: `electrolyte_file_id`,
 * `separator_file_id`, etc.). The component renders nothing when
 * `recordId` is null — the section header / wrapper is the parent's
 * responsibility, so this stays a low-level block.
 *
 * Used by:
 *   - client-web/src/pages/reference/ElectrolytesPage.vue
 *   - client-web/src/pages/reference/SeparatorsPage.vue
 */
import { ref, watch } from 'vue';
import api from '@/services/api';
import Button from 'primevue/button';

const props = defineProps({
  entityType: { type: String, required: true },
  recordId: { type: [Number, String, null], default: null },
  fileIdField: { type: String, required: true },
  // Optional override for parent-controlled status messages (rare).
  // If false (default), this component manages its own status.
  externalStatus: { type: Boolean, default: false },
});

const emit = defineEmits(['status']);

const files = ref([]);
const loading = ref(false);
const status = ref(null);
let statusTimer = null;
const fileInputEl = ref(null);

function setStatus(message, tone = 'info') {
  if (props.externalStatus) {
    emit('status', { message, tone });
    return;
  }
  if (statusTimer) clearTimeout(statusTimer);
  status.value = { message, tone };
  statusTimer = setTimeout(() => { status.value = null; }, 5000);
}

async function loadFiles() {
  if (props.recordId == null) {
    files.value = [];
    return;
  }
  loading.value = true;
  try {
    const { data } = await api.get(`/api/${props.entityType}/${props.recordId}/files`);
    files.value = Array.isArray(data) ? data : [];
  } catch (err) {
    files.value = [];
    setStatus(err?.response?.data?.error || 'Ошибка загрузки файлов', 'error');
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.recordId,
  () => loadFiles(),
  { immediate: true }
);

async function onFileSelected(event) {
  const input = event.target;
  if (!input.files || input.files.length === 0) return;

  if (props.recordId == null) {
    setStatus('Сохраните запись перед загрузкой файлов', 'error');
    input.value = '';
    return;
  }

  const entries = [];
  for (const file of Array.from(input.files)) {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    entries.push({
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      file_content_base64: base64,
    });
  }

  try {
    await api.post(`/api/${props.entityType}/${props.recordId}/files`, { entries });
    setStatus(entries.length === 1 ? 'Файл загружен' : `Загружено файлов: ${entries.length}`, 'ok');
    await loadFiles();
  } catch (err) {
    setStatus(err?.response?.data?.error || 'Ошибка загрузки файла', 'error');
  } finally {
    input.value = '';
  }
}

async function onFileDelete(fileId) {
  if (!window.confirm('Удалить файл?')) return;
  try {
    await api.delete(`/api/${props.entityType}/files/${fileId}`);
    setStatus('Файл удалён', 'ok');
    await loadFiles();
  } catch (err) {
    setStatus(err?.response?.data?.error || 'Ошибка удаления файла', 'error');
  }
}

function downloadUrl(file) {
  if (file.download_url) return file.download_url;
  return `/api/${props.entityType}/files/${file[props.fileIdField]}/download`;
}

function formatFileSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

function triggerFileSelect() {
  fileInputEl.value?.click();
}

// Exposed for parent template if it wants to render its own status.
defineExpose({ loadFiles, status });
</script>

<template>
  <div v-if="recordId != null" class="record-files">
    <div class="files-header">
      <span class="files-title">Файлы</span>
      <span
        v-if="!externalStatus && status"
        :class="['files-status', `files-status--${status.tone}`]"
      >
        {{ status.message }}
      </span>
    </div>

    <div v-if="loading" class="files-loading">Загрузка файлов...</div>
    <ul v-else-if="files.length > 0" class="files-list">
      <li v-for="f in files" :key="f[fileIdField]" class="file-row">
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
          aria-label="Удалить файл"
          @click="onFileDelete(f[fileIdField])"
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
        @click="triggerFileSelect"
      />
    </div>
  </div>
</template>

<style scoped>
.record-files {
  border-top: 1px solid rgba(0, 50, 116, 0.1);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 700px;
}
.files-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.files-title {
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
.file-row:hover { background: rgba(0, 50, 116, 0.04); }
.file-link {
  color: #003274;
  font-size: 13px;
  text-decoration: none;
  flex: 1;
}
.file-link:hover { text-decoration: underline; }
.file-meta { font-size: 12px; color: #6B7280; }
.hidden-input { display: none; }
.files-upload-row { margin-top: 4px; }
</style>
