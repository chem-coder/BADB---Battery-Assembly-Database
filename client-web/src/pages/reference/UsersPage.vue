<script setup>
/**
 * UsersPage — "Пользователи" (администрирование)
 * Uses CrudTable + SaveIndicator (from Design System).
 * Simple CRUD with Dialog for create/edit.
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

const toast = useToast()
const crudTable = ref(null)

// ── Data ───────────────────────────────────────────────────────────────
const users = ref([])
const loading = ref(false)

async function loadUsers() {
  loading.value = true
  try {
    const { data } = await api.get('/api/users')
    users.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить пользователей', life: 3000 })
  } finally {
    loading.value = false
  }
}

onMounted(loadUsers)

// ── Column config ──────────────────────────────────────────────────────
const columns = [
  { field: 'name',   header: 'Имя',    minWidth: '150px' },
  { field: 'active', header: 'Статус',  minWidth: '80px', width: '120px' },
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
      await api.delete(`/api/users/${item.user_id}`)
    }
    pendingDelete.value = []
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
    crudTable.value?.clearSelection()
    await loadUsers()
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
  active: true,
})

function resetForm() {
  form.value = { name: '', active: true }
  mode.value = null
  currentId.value = null
  formVisible.value = false
}

function openCreate() {
  resetForm()
  mode.value = 'create'
  formVisible.value = true
}

function openEdit(user) {
  mode.value = 'edit'
  currentId.value = user.user_id
  form.value = {
    name: user.name || '',
    active: user.active,
  }
  formVisible.value = true
}

async function saveUser() {
  if (!mode.value) return
  if (!form.value.name?.trim()) {
    toast.add({ severity: 'warn', summary: 'Заполните имя', life: 3000 })
    return
  }

  try {
    if (mode.value === 'create') {
      await api.post('/api/users', { name: form.value.name.trim() })
      toast.add({ severity: 'success', summary: 'Пользователь создан', life: 3000 })
    } else {
      await api.put(`/api/users/${currentId.value}`, {
        name: form.value.name.trim(),
        active: form.value.active,
      })
      toast.add({ severity: 'success', summary: 'Изменения сохранены', life: 3000 })
    }
    resetForm()
    await loadUsers()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка сохранения', life: 3000 })
  }
}
</script>

<template>
  <div class="users-page">

    <PageHeader title="Пользователи" icon="pi pi-users">
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
      :data="users"
      :loading="loading"
      id-field="user_id"
      table-name="Пользователи"
      show-add
      row-clickable
      @add="openCreate"
      @delete="onDelete"
      @row-click="(data) => openEdit(data)"
    >
      <!-- Custom cell: Имя (bold) -->
      <template #col-name="{ data }">
        <strong>{{ data.name }}</strong>
      </template>

      <!-- Custom cell: Статус -->
      <template #col-active="{ data }">
        <span :class="['status-pill', data.active ? 'status-pill--active' : 'status-pill--inactive']">
          {{ data.active ? 'активен' : 'неактивен' }}
        </span>
      </template>
    </CrudTable>

    <!-- ── Create / Edit Dialog ── -->
    <Dialog
      v-model:visible="formVisible"
      :header="mode === 'create' ? 'Новый пользователь' : 'Редактирование пользователя'"
      :style="{ width: '420px' }"
      modal
      @hide="resetForm"
    >
      <div class="form-grid">
        <label>Имя</label>
        <InputText v-model="form.name" placeholder="Имя пользователя" class="w-full" />

        <template v-if="mode === 'edit'">
          <label>Статус</label>
          <select v-model="form.active" class="pv-select">
            <option :value="true">активен</option>
            <option :value="false">неактивен</option>
          </select>
        </template>
      </div>

      <template #footer>
        <Button label="Отмена" severity="secondary" outlined @click="resetForm" />
        <Button :label="mode === 'create' ? 'Создать' : 'Сохранить'" @click="saveUser" />
      </template>
    </Dialog>

  </div>
</template>

<style scoped>
.users-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.users-page :deep(.page-header) {
  margin-bottom: 3px !important;
}

/* ── Form styles ── */
.form-grid {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 10px 16px;
  align-items: center;
}
.form-grid label {
  font-size: 13px;
  font-weight: 500;
  color: #003274;
}
.w-full { width: 100%; }
.pv-select {
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 1px solid #D1D7DE;
  border-radius: 6px;
  font-size: 13px;
  background: white;
}

/* ── Page-specific cell styles ── */
.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}
.status-pill--active {
  background: rgba(82, 201, 166, 0.14);
  color: #1d7a5f;
  border: 0.5px solid rgba(82, 201, 166, 0.35);
}
.status-pill--inactive {
  background: rgba(176, 0, 32, 0.08);
  color: #b00020;
  border: 0.5px solid rgba(176, 0, 32, 0.15);
}
</style>
