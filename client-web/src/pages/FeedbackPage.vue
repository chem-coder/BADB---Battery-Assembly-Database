<script setup>
/**
 * FeedbackPage — "Обратная связь"
 * Colleagues can submit: text, photos, audio, files
 * Categories: bug, feature, improvement, question
 */
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import { fileToBase64 } from '@/utils/fileToBase64'
import { toastApiError } from '@/utils/errorClassifier'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'

const toast = useToast()
const authStore = useAuthStore()

const items = ref([])
const loading = ref(false)

const CATEGORIES = [
  { label: 'Баг', value: 'bug', icon: 'pi pi-exclamation-triangle', color: '#E74C3C' },
  { label: 'Новый функционал', value: 'feature', icon: 'pi pi-star', color: '#6CACE4' },
  { label: 'Улучшение', value: 'improvement', icon: 'pi pi-arrow-up', color: '#52C9A6' },
  { label: 'Вопрос', value: 'question', icon: 'pi pi-question-circle', color: '#D3A754' },
  { label: 'Другое', value: 'other', icon: 'pi pi-comment', color: '#6B7280' },
]

const STATUSES = [
  { label: 'Открыто', value: 'open' },
  { label: 'В работе', value: 'in_progress' },
  { label: 'Решено', value: 'resolved' },
  { label: 'Закрыто', value: 'closed' },
]

const catMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

async function loadFeedback() {
  loading.value = true
  try {
    const { data } = await api.get('/api/feedback')
    items.value = data
  } catch (err) {
    toastApiError(toast, err, 'Не удалось загрузить')
  } finally {
    loading.value = false
  }
}

onMounted(loadFeedback)

// ── Create Dialog ─────────────────────────────────────────────────────
const dialogVisible = ref(false)
const form = ref({ title: '', body: '', category: 'improvement' })
const pendingFiles = ref([])

function openCreate() {
  form.value = { title: '', body: '', category: 'improvement' }
  pendingFiles.value = []
  dialogVisible.value = true
}

async function onFileSelect(event) {
  // Snapshot the FileList synchronously so clearing the input below can't
  // race with the async reads. `event.target.files` is live and gets
  // replaced on the next user interaction.
  const files = Array.from(event.target.files || [])
  event.target.value = ''

  // Awaited read per file — the previous FileReader + onload callback
  // path could push entries AFTER the user clicked «Отправить», leading
  // to a submit that silently dropped files that hadn't finished
  // reading yet. Routing through the shared fileToBase64 util makes
  // the read part of the same promise chain as the caller's await.
  for (const file of files) {
    try {
      const base64 = await fileToBase64(file)
      pendingFiles.value.push({
        name: file.name,
        mime: file.type,
        size: file.size,
        base64,
      })
    } catch (err) {
      console.error('[Feedback] file read failed', file.name, err)
      toast.add({
        severity: 'error',
        summary: 'Не удалось прочитать файл',
        detail: file.name,
        life: 3500,
      })
    }
  }
}

function removeFile(index) {
  pendingFiles.value.splice(index, 1)
}

async function submitFeedback() {
  if (!form.value.title?.trim()) {
    toast.add({ severity: 'warn', summary: 'Заголовок обязателен', life: 3000 })
    return
  }

  try {
    const { data: fb } = await api.post('/api/feedback', {
      title: form.value.title,
      body: form.value.body,
      category: form.value.category,
    })

    // Upload attachments
    for (const file of pendingFiles.value) {
      await api.post(`/api/feedback/${fb.feedback_id}/attachments`, {
        filename: file.name,
        data: file.base64,
        mime_type: file.mime,
      })
    }

    toast.add({ severity: 'success', summary: 'Отправлено!', life: 3000 })
    dialogVisible.value = false
    await loadFeedback()
  } catch (err) {
    toastApiError(toast, err, 'Не удалось отправить')
  }
}

// ── Status change ─────────────────────────────────────────────────────
async function changeStatus(item, newStatus) {
  try {
    await api.patch(`/api/feedback/${item.feedback_id}/status`, { status: newStatus })
    toast.add({ severity: 'success', summary: 'Статус обновлён', life: 2000 })
    await loadFeedback()
  } catch (err) {
    toastApiError(toast, err, 'Не удалось обновить статус')
  }
}

async function deleteFeedback(item) {
  if (!confirm(`Удалить "${item.title}"?`)) return
  try {
    await api.delete(`/api/feedback/${item.feedback_id}`)
    await loadFeedback()
  } catch (err) {
    toastApiError(toast, err, 'Не удалось удалить')
  }
}

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

function fileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const isAdmin = computed(() => ['admin', 'lead'].includes(authStore.user?.role))
</script>

<template>
  <div class="feedback-page">
    <PageHeader title="Обратная связь" icon="pi pi-comments" />

    <div class="feedback-toolbar">
      <Button label="Написать" icon="pi pi-plus" @click="openCreate" />
      <span class="feedback-hint">Сообщите о баге, предложите улучшение или задайте вопрос</span>
    </div>

    <!-- Feedback list -->
    <div class="feedback-list">
      <div v-if="loading" class="loading-text">Загрузка...</div>
      <div v-else-if="items.length === 0" class="empty-text">Пока нет обращений</div>

      <div v-for="item in items" :key="item.feedback_id" class="glass-card feedback-card">
        <div class="fb-header">
          <span class="fb-category" :style="{ color: catMap[item.category]?.color || '#6B7280' }">
            <i :class="catMap[item.category]?.icon || 'pi pi-comment'"></i>
            {{ catMap[item.category]?.label || item.category }}
          </span>
          <span :class="['fb-status', `fb-status--${item.status}`]">
            {{ STATUSES.find(s => s.value === item.status)?.label || item.status }}
          </span>
        </div>

        <h3 class="fb-title">{{ item.title }}</h3>
        <p v-if="item.body" class="fb-body">{{ item.body }}</p>

        <div class="fb-meta">
          <span class="fb-author">{{ item.user_name }}</span>
          <span class="fb-date">{{ formatDate(item.created_at) }}</span>
          <span v-if="item.attachment_count > 0" class="fb-attachments">
            <i class="pi pi-paperclip"></i> {{ item.attachment_count }}
          </span>
        </div>

        <div v-if="item.resolved_by_name" class="fb-resolved">
          Решено: {{ item.resolved_by_name }}, {{ formatDate(item.resolved_at) }}
        </div>

        <div v-if="isAdmin" class="fb-actions">
          <Select
            :modelValue="item.status"
            :options="STATUSES"
            optionLabel="label"
            optionValue="value"
            @update:modelValue="val => changeStatus(item, val)"
            class="fb-status-select"
          />
          <Button icon="pi pi-trash" severity="danger" text @click="deleteFeedback(item)" />
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <Dialog
      v-model:visible="dialogVisible"
      header="Новое обращение"
      :style="{ width: '560px' }"
      modal
    >
      <form class="fb-form" @submit.prevent="submitFeedback">
        <label>Категория</label>
        <Select
          v-model="form.category"
          :options="CATEGORIES"
          optionLabel="label"
          optionValue="value"
          class="w-full"
        />

        <label>Заголовок</label>
        <InputText v-model="form.title" placeholder="Кратко: что случилось или что хотите" class="w-full" />

        <label>Описание</label>
        <Textarea v-model="form.body" rows="4" placeholder="Подробности, шаги воспроизведения, предложение..." class="w-full" />

        <label>Файлы (фото, скриншот, аудио, документ)</label>
        <div class="file-upload-area">
          <input ref="fileInput" type="file" multiple accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" @change="onFileSelect" class="file-input-hidden" />
          <Button type="button" label="Выбрать файлы" icon="pi pi-upload" severity="secondary" outlined @click="$refs.fileInput.click()" />
          <div v-if="pendingFiles.length > 0" class="file-list">
            <div v-for="(f, i) in pendingFiles" :key="i" class="file-item">
              <i :class="f.mime?.startsWith('image') ? 'pi pi-image' : f.mime?.startsWith('audio') ? 'pi pi-volume-up' : 'pi pi-file'"></i>
              <span class="file-name">{{ f.name }}</span>
              <span class="file-size">{{ fileSize(f.size) }}</span>
              <Button icon="pi pi-times" severity="secondary" text size="small" @click="removeFile(i)" />
            </div>
          </div>
        </div>
      </form>

      <template #footer>
        <Button label="Отмена" severity="secondary" outlined @click="dialogVisible = false" />
        <Button label="Отправить" icon="pi pi-send" @click="submitFeedback" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.feedback-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.feedback-page :deep(.page-header) { margin-bottom: 3px !important; }

.feedback-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.feedback-hint {
  font-size: 13px;
  color: #6B7280;
}

.feedback-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.feedback-card {
  padding: 1.25rem;
}

.fb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.fb-category {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.fb-status {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 20px;
}
.fb-status--open { background: rgba(0, 50, 116, 0.08); color: #003274; }
.fb-status--in_progress { background: rgba(211, 167, 84, 0.15); color: #9a7030; }
.fb-status--resolved { background: rgba(82, 201, 166, 0.14); color: #1d7a5f; }
.fb-status--closed { background: rgba(107, 114, 128, 0.1); color: #6B7280; }

.fb-title {
  font-size: 16px;
  font-weight: 700;
  color: #003274;
  margin: 0 0 0.35rem;
}
.fb-body {
  font-size: 14px;
  color: #333;
  margin: 0 0 0.75rem;
  white-space: pre-wrap;
  line-height: 1.5;
}

.fb-meta {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 12px;
  color: #6B7280;
}
.fb-author { font-weight: 600; color: #003274; }
.fb-attachments { display: flex; align-items: center; gap: 3px; }

.fb-resolved {
  margin-top: 0.5rem;
  font-size: 12px;
  color: #1d7a5f;
  font-style: italic;
}

.fb-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 0.5px solid rgba(180, 210, 255, 0.3);
}
.fb-status-select { width: 160px; }

/* ── Form ── */
.fb-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.fb-form label {
  font-size: 13px;
  font-weight: 500;
  color: #003274;
  margin-top: 0.25rem;
}
.w-full { width: 100%; }

.file-upload-area {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.file-input-hidden { display: none; }
.file-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.file-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  background: rgba(0, 50, 116, 0.03);
  border-radius: 6px;
  font-size: 12px;
}
.file-item i { color: #003274; }
.file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size { color: #6B7280; flex-shrink: 0; }

.loading-text, .empty-text {
  text-align: center;
  padding: 2rem;
  color: #6B7280;
  font-size: 14px;
}

@media (max-width: 768px) {
  .feedback-toolbar { flex-direction: column; align-items: stretch; }
  .feedback-hint { display: none; }
}
</style>
