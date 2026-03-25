<script setup>
/**
 * SeparatorStructuresPage — "Структуры сепараторов" (справочник)
 * Uses CrudTable + SaveIndicator (from Design System).
 * Simple CRUD with inline edit via Dialog.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'

const toast = useToast()
const crudTable = ref(null)

// ── Data ───────────────────────────────────────────────────────────────
const structuresList = ref([])
const loading = ref(false)

async function loadStructures() {
  loading.value = true
  try {
    const { data } = await api.get('/api/structures')
    structuresList.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить структуры', life: 3000 })
  } finally {
    loading.value = false
  }
}

onMounted(loadStructures)

// ── Column config ──────────────────────────────────────────────────────
const columns = [
  { field: 'name',                header: 'Название',     minWidth: '150px' },
  { field: 'structure_comments',  header: 'Комментарий',  minWidth: '200px', sortable: false },
]

// ── Save indicator (delete flow) ──────────────────────────────────────
const pendingDelete = ref([])
const saveState = ref('idle')
let saveTimer = null

function onDelete(items) {
  pendingDelete.value = items
  saveState.value = 'idle'
}

async function confirmSave() {
  try {
    for (const item of pendingDelete.value) {
      await api.delete(`/api/structures/${item.sep_str_id}`)
    }
    pendingDelete.value = []
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
    crudTable.value?.clearSelection()
    await loadStructures()
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось удалить', life: 3000 })
  }
}

function discardChanges() {
  pendingDelete.value = []
  saveState.value = 'idle'
  crudTable.value?.clearSelection()
}

onUnmounted(() => clearTimeout(saveTimer))

// ── Form (Dialog) ─────────────────────────────────────────────────────
const formVisible = ref(false)
const mode = ref(null)
const currentId = ref(null)

const form = ref({
  name: '',
  structure_comments: '',
})

function resetForm() {
  form.value = { name: '', structure_comments: '' }
  mode.value = null
  currentId.value = null
  formVisible.value = false
}

function openCreate() {
  resetForm()
  mode.value = 'create'
  formVisible.value = true
}

function openEdit(s) {
  mode.value = 'edit'
  currentId.value = s.sep_str_id
  form.value = {
    name: s.name || '',
    structure_comments: s.structure_comments || s.comments || '',
  }
  formVisible.value = true
}

async function saveStructure() {
  if (!mode.value) return
  if (!form.value.name?.trim()) {
    toast.add({ severity: 'warn', summary: 'Заполните название', life: 3000 })
    return
  }

  const payload = {
    name: form.value.name,
    structure_comments: form.value.structure_comments.trim() || null,
  }

  try {
    if (mode.value === 'create') {
      await api.post('/api/structures', payload)
      toast.add({ severity: 'success', summary: 'Структура создана', life: 3000 })
    } else {
      await api.put(`/api/structures/${currentId.value}`, payload)
      toast.add({ severity: 'success', summary: 'Изменения сохранены', life: 3000 })
    }
    resetForm()
    await loadStructures()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка сохранения', life: 3000 })
  }
}
</script>

<template>
  <div class="structures-page">

    <PageHeader title="Структуры сепараторов" icon="pi pi-sitemap">
      <template #actions>
        <SaveIndicator
          :visible="pendingDelete.length > 0 || saveState === 'saved'"
          :saved="saveState === 'saved'"
          @save="confirmSave"
          @cancel="discardChanges"
        />
      </template>
    </PageHeader>

    <CrudTable
      ref="crudTable"
      :columns="columns"
      :data="structuresList"
      :loading="loading"
      id-field="sep_str_id"
      table-name="Структуры"
      show-add
      row-clickable
      @add="openCreate"
      @delete="onDelete"
      @row-click="(data) => openEdit(data)"
    >
      <!-- Custom cell: Название (bold) -->
      <template #col-name="{ data }">
        <strong>{{ data.name }}</strong>
      </template>

      <!-- Custom cell: Комментарий -->
      <template #col-structure_comments="{ data }">
        <span class="comment-text">{{ data.structure_comments || data.comments || '—' }}</span>
      </template>
    </CrudTable>

    <!-- ── Create / Edit Dialog ── -->
    <Dialog
      v-model:visible="formVisible"
      :header="mode === 'create' ? 'Новая структура' : 'Редактирование структуры'"
      :style="{ width: '460px' }"
      modal
      @hide="resetForm"
    >
      <div class="form-grid">
        <label>Название</label>
        <InputText v-model="form.name" placeholder="PP/PE/PP" class="w-full" />

        <label>Комментарий</label>
        <Textarea v-model="form.structure_comments" rows="3" placeholder="Описание, детали" class="w-full" />
      </div>

      <template #footer>
        <Button label="Отмена" severity="secondary" outlined @click="resetForm" />
        <Button :label="mode === 'create' ? 'Создать' : 'Сохранить'" @click="saveStructure" />
      </template>
    </Dialog>

  </div>
</template>

<style scoped>
.structures-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.structures-page :deep(.page-header) {
  margin-bottom: 3px !important;
}

/* ── Form styles ── */
.form-grid {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 10px 16px;
  align-items: center;
}
.form-grid label {
  font-size: 13px;
  font-weight: 500;
  color: #003274;
}
.w-full { width: 100%; }

/* ── Page-specific cell styles ── */
.comment-text {
  font-size: 13px;
  color: rgba(0, 50, 116, 0.6);
}
</style>
