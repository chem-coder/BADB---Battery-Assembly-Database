<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { useStatus } from '@/composables/useStatus'

const { statusMsg, statusError, showStatus } = useStatus()

const projects = ref([])
const activeUsers = ref([])
const newName = ref('')

// Form state
const formVisible = ref(false)
const mode = ref(null)       // 'create' | 'edit'
const currentId = ref(null)
const titleText = ref('')
const titleEditing = ref(false)
const titleInput = ref('')

const form = ref({
  created_by: '',
  lead_id: '',
  description: '',
  start_date: '',
  due_date: '',
  status: 'active',
})

function resetForm() {
  form.value = { created_by: '', lead_id: '', description: '', start_date: '', due_date: '', status: 'active' }
  titleText.value = ''
  titleEditing.value = false
  titleInput.value = ''
  mode.value = null
  currentId.value = null
  formVisible.value = false
}

// API
async function loadProjects() {
  const { data } = await api.get('/api/projects')
  projects.value = data
}

async function loadUsers() {
  const { data } = await api.get('/api/users')
  activeUsers.value = data.filter(u => u.active)
}

async function saveProject() {
  if (!mode.value) return
  if (!form.value.created_by) {
    showStatus('Заполните обязательные поля: Кто добавил', true)
    return
  }

  const payload = { ...form.value, name: titleText.value }

  try {
    if (mode.value === 'create') {
      await api.post('/api/projects', payload)
      showStatus('Проект сохранён')
    } else {
      await api.put(`/api/projects/${currentId.value}`, payload)
      showStatus('Изменения сохранены')
    }
    resetForm()
    loadProjects()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка сохранения', true)
  }
}

async function deleteProject(proj) {
  if (!confirm(`Удалить проект "${proj.name}"?`)) return
  try {
    await api.delete(`/api/projects/${proj.project_id}`)
    showStatus('Проект удалён')
    loadProjects()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка удаления', true)
  }
}

// Actions
function onAddEnter() {
  if (formVisible.value) return
  const name = newName.value.trim()
  if (!name) return

  mode.value = 'create'
  currentId.value = null
  titleText.value = name
  formVisible.value = true
  newName.value = ''
}

function startEdit(proj) {
  mode.value = 'edit'
  currentId.value = proj.project_id
  titleText.value = proj.name

  form.value = {
    created_by: proj.created_by || '',
    lead_id: proj.lead_id || '',
    description: proj.description || '',
    start_date: proj.start_date ? proj.start_date.slice(0, 10) : '',
    due_date: proj.due_date ? proj.due_date.slice(0, 10) : '',
    status: proj.status || 'active',
  }

  formVisible.value = true
  loadUsers()
}

function duplicateProject(proj) {
  mode.value = 'create'
  currentId.value = null
  titleText.value = proj.name + ' (копия)'

  form.value = {
    created_by: '',
    lead_id: '',
    description: proj.description || '',
    start_date: proj.start_date ? proj.start_date.slice(0, 10) : '',
    due_date: proj.due_date ? proj.due_date.slice(0, 10) : '',
    status: proj.status || 'active',
  }

  formVisible.value = true
  loadUsers()
}

// Editable title
function startTitleEdit() {
  titleInput.value = titleText.value
  titleEditing.value = true
}

function finishTitleEdit() {
  const val = titleInput.value.trim()
  if (val) titleText.value = val
  titleEditing.value = false
}

function statusLabel(status) {
  const map = { active: 'активный', paused: 'приостановлен', completed: 'завершён', archived: 'архивирован' }
  return map[status] || status
}

onMounted(() => { loadProjects(); loadUsers() })
</script>

<template>
  <div>
    <input
      v-model="newName"
      class="add-input"
      :disabled="formVisible"
      placeholder="+ Добавить проект"
      autocomplete="off"
      @keydown.enter="onAddEnter"
    />

    <!-- Form -->
    <form v-if="formVisible" autocomplete="off" @submit.prevent="saveProject">
      <fieldset>
        <legend>Метаданные</legend>
        <label>Кто добавил</label>
        <select
          v-model="form.created_by"
          :class="{ 'required-missing': !form.created_by && mode }"
          @focus="loadUsers"
        >
          <option value="">— выбрать пользователя —</option>
          <option v-for="u in activeUsers" :key="u.user_id" :value="u.user_id">{{ u.name }}</option>
        </select>
        <RouterLink to="/reference/users" target="_blank" class="ref-link">Управление пользователями</RouterLink>
      </fieldset>

      <fieldset>
        <!-- Editable title -->
        <input
          v-if="titleEditing"
          v-model="titleInput"
          @blur="finishTitleEdit"
          @keydown.enter.prevent="finishTitleEdit"
        />
        <h2 v-else style="cursor: pointer" @click="startTitleEdit">{{ titleText }}</h2>

        <label>Руководитель</label>
        <select v-model="form.lead_id" @focus="loadUsers">
          <option value="">— выбрать пользователя —</option>
          <option v-for="u in activeUsers" :key="u.user_id" :value="u.user_id">{{ u.name }}</option>
        </select>
        <RouterLink to="/reference/users" target="_blank" class="ref-link">Управление пользователями</RouterLink>

        <label>Описание проекта</label><br />
        <textarea v-model="form.description" rows="3" cols="50" placeholder="Единицы измерения, методики, особые замечания"></textarea>

        <label>Дата начала</label>
        <input v-model="form.start_date" type="date" />

        <label>Плановая дата окончания</label>
        <input v-model="form.due_date" type="date" />
      </fieldset>

      <fieldset>
        <legend>Статус</legend>
        <select v-model="form.status">
          <option value="active">активный</option>
          <option value="paused">приостановлен</option>
          <option value="completed">завершен</option>
          <option value="archived">архивирован</option>
        </select>
      </fieldset>

      <button type="submit">Сохранить запись</button>
      <button type="button" @click="resetForm">Очистить форму</button>
    </form>

    <div
      v-if="statusMsg"
      class="status-feedback"
      :style="{ color: statusError ? '#b00020' : 'darkcyan' }"
    >
      {{ statusMsg }}
    </div>

    <!-- List -->
    <ul class="items-list">
      <li v-for="proj in projects" :key="proj.project_id" class="item-row">
        <div class="item-info">
          <span>{{ proj.name }}</span>
          <span class="item-status">{{ statusLabel(proj.status) }}</span>
        </div>
        <div class="actions">
          <button title="Редактировать" @click="startEdit(proj)">✏️</button>
          <button title="Дублировать" @click="duplicateProject(proj)">📄</button>
          <button title="Удалить" @click="deleteProject(proj)">🗑</button>
        </div>
      </li>
    </ul>
  </div>
</template>
