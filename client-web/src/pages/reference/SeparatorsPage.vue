<script setup>
import { ref, onMounted, watch } from 'vue'
import api from '@/services/api'
import { useStatus } from '@/composables/useStatus'

const { statusMsg, statusError, showStatus } = useStatus()

const separators = ref([])
const activeUsers = ref([])
const structures = ref([])
const newName = ref('')

// Form state
const formVisible = ref(false)
const mode = ref(null)
const currentId = ref(null)
const titleText = ref('')
const titleEditing = ref(false)
const titleInput = ref('')

const form = ref({
  created_by: '',
  supplier: '',
  brand: '',
  batch: '',
  structure_id: '',
  air_perm: '',
  air_perm_units: '',
  thickness_um: '',
  porosity: '',
  file_path: '',
  comments: '',
  status: 'available',
  depleted_at: '',
})

function resetForm() {
  form.value = {
    created_by: '', supplier: '', brand: '', batch: '', structure_id: '',
    air_perm: '', air_perm_units: '', thickness_um: '', porosity: '',
    file_path: '', comments: '', status: 'available', depleted_at: '',
  }
  titleText.value = ''
  titleEditing.value = false
  titleInput.value = ''
  mode.value = null
  currentId.value = null
  formVisible.value = false
}

// API
async function loadSeparators() {
  const { data } = await api.get('/api/separators')
  separators.value = data
}

async function loadUsers() {
  const { data } = await api.get('/api/users')
  activeUsers.value = data.filter(u => u.active)
}

async function loadStructures() {
  const { data } = await api.get('/api/structures')
  structures.value = data
}

function validate() {
  const missing = []
  if (!form.value.created_by) missing.push('Кто добавил')
  if (!form.value.structure_id) missing.push('Тип структуры')
  if (missing.length) {
    showStatus('Заполните обязательные поля: ' + missing.join(', '), true)
    return false
  }
  return true
}

async function saveSeparator() {
  if (!mode.value) return
  if (!validate()) return

  const payload = { ...form.value, name: titleText.value }

  try {
    if (mode.value === 'create') {
      await api.post('/api/separators', payload)
      showStatus('Сепаратор сохранён')
    } else {
      await api.put(`/api/separators/${currentId.value}`, payload)
      showStatus('Изменения сохранены')
    }
    resetForm()
    loadSeparators()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка сохранения', true)
  }
}

async function deleteSeparator(sep) {
  if (!confirm(`Удалить сепаратор "${sep.name}"?`)) return
  try {
    await api.delete(`/api/separators/${sep.sep_id}`)
    showStatus('Сепаратор удалён')
    loadSeparators()
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

function startEdit(sep) {
  mode.value = 'edit'
  currentId.value = sep.sep_id
  titleText.value = sep.name

  form.value = {
    created_by: sep.created_by || '',
    supplier: sep.supplier || '',
    brand: sep.brand || '',
    batch: sep.batch || '',
    structure_id: sep.structure_id || '',
    air_perm: sep.air_perm ?? '',
    air_perm_units: sep.air_perm_units || '',
    thickness_um: sep.thickness_um ?? '',
    porosity: sep.porosity ?? '',
    file_path: sep.file_path || '',
    comments: sep.comments || '',
    status: sep.status || 'available',
    depleted_at: sep.depleted_at ? sep.depleted_at.slice(0, 10) : '',
  }

  formVisible.value = true
  loadUsers()
  loadStructures()
}

function duplicateSeparator(sep) {
  mode.value = 'create'
  currentId.value = null
  titleText.value = sep.name + ' (копия)'

  form.value = {
    created_by: '',
    supplier: sep.supplier || '',
    brand: sep.brand || '',
    batch: sep.batch || '',
    structure_id: sep.structure_id || '',
    air_perm: sep.air_perm ?? '',
    air_perm_units: sep.air_perm_units || '',
    thickness_um: sep.thickness_um ?? '',
    porosity: sep.porosity ?? '',
    file_path: '',
    comments: sep.comments || '',
    status: sep.status || 'available',
    depleted_at: '',
  }

  formVisible.value = true
  loadUsers()
  loadStructures()
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

// Hide depleted_at when status is 'available'
watch(() => form.value.status, (val) => {
  if (val === 'available') form.value.depleted_at = ''
})

function statusLabel(status) {
  const map = { available: 'в наличии', used: 'израсходован', scrap: 'списан' }
  return map[status] || status
}

onMounted(() => { loadSeparators(); loadUsers(); loadStructures() })
</script>

<template>
  <div>
    <input
      v-model="newName"
      class="add-input"
      :disabled="formVisible"
      placeholder="+ Добавить сепаратор"
      autocomplete="off"
      @keydown.enter="onAddEnter"
    />

    <!-- Form -->
    <form v-if="formVisible" autocomplete="on" @submit.prevent="saveSeparator">
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
        <input
          v-if="titleEditing"
          v-model="titleInput"
          @blur="finishTitleEdit"
          @keydown.enter.prevent="finishTitleEdit"
        />
        <h2 v-else style="cursor: pointer" @click="startTitleEdit">{{ titleText }}</h2>

        <label>Производитель / поставщик</label>
        <input v-model="form.supplier" type="text" placeholder="Celgard" /><br />

        <label>Марка</label>
        <input v-model="form.brand" type="text" placeholder="2320" /><br />

        <label>Партия</label>
        <input v-model="form.batch" type="text" placeholder="A1" /><br />
      </fieldset>

      <fieldset>
        <legend>Структура</legend>
        <label>Тип структуры</label>
        <select
          v-model="form.structure_id"
          :class="{ 'required-missing': !form.structure_id && mode }"
          @focus="loadStructures"
        >
          <option value="">— выбрать —</option>
          <option v-for="s in structures" :key="s.sep_str_id" :value="s.sep_str_id">{{ s.name }}</option>
        </select>
        <RouterLink to="/reference/separator-structures" target="_blank" class="ref-link">Управление структурами</RouterLink>
      </fieldset>

      <fieldset>
        <legend>Паспортные характеристики сепаратора</legend>

        <label>Воздушная проницаемость</label>
        <input v-model="form.air_perm" type="number" step="0.1" placeholder="20" /><br />

        <label>Единицы измерения воздушной проницаемости</label>
        <input v-model="form.air_perm_units" type="text" placeholder="s/100 мл или др. единицы" /><br />

        <label>Толщина, мкм</label>
        <input v-model="form.thickness_um" type="number" step="0.01" min="0" placeholder="например, 20" />

        <label>Пористость, %</label>
        <input v-model="form.porosity" type="number" step="0.1" min="0" max="100" placeholder="например, 40" />
      </fieldset>

      <fieldset>
        <legend>Документация</legend>
        <label>Файл паспорта</label>
        <input type="file" /><br />

        <label>Комментарии</label><br />
        <textarea v-model="form.comments" rows="3" cols="50" placeholder="Единицы измерения, методики (Гурли и т.п.), особые замечания"></textarea>
      </fieldset>

      <fieldset>
        <legend>Статус</legend>
        <label>Статус</label>
        <select v-model="form.status">
          <option value="available">в наличии</option>
          <option value="used">израсходован</option>
          <option value="scrap">забракован / списан</option>
        </select>

        <div v-if="form.status !== 'available'">
          <label>Дата списания</label>
          <input v-model="form.depleted_at" type="date" />
        </div>
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
      <li v-for="sep in separators" :key="sep.sep_id" class="item-row">
        <div class="item-info">
          <span>{{ sep.name }}</span>
          <span class="item-status">{{ statusLabel(sep.status) }}</span>
        </div>
        <div class="actions">
          <button title="Редактировать" @click="startEdit(sep)">✏️</button>
          <button title="Дублировать" @click="duplicateSeparator(sep)">📄</button>
          <button title="Удалить" @click="deleteSeparator(sep)">🗑</button>
        </div>
      </li>
    </ul>
  </div>
</template>
