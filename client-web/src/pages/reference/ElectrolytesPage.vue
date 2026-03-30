<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { useStatus } from '@/composables/useStatus'

const { statusMsg, statusError, showStatus } = useStatus()

const electrolytes = ref([])
const activeUsers = ref([])
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
  electrolyte_type: '',
  solvent_system: '',
  salts: '',
  concentration: '',
  additives: '',
  notes: '',
  status: 'active',
})

function resetForm() {
  form.value = {
    created_by: '', electrolyte_type: '', solvent_system: '', salts: '',
    concentration: '', additives: '', notes: '', status: 'active',
  }
  titleText.value = ''
  titleEditing.value = false
  titleInput.value = ''
  mode.value = null
  currentId.value = null
  formVisible.value = false
}

// API
async function loadElectrolytes() {
  const { data } = await api.get('/api/electrolytes')
  electrolytes.value = data
}

async function loadUsers() {
  const { data } = await api.get('/api/users')
  activeUsers.value = data.filter(u => u.active)
}

function validate() {
  const missing = []
  if (!form.value.created_by) missing.push('Кто добавил')
  if (!form.value.electrolyte_type) missing.push('Тип электролита')
  if (missing.length) {
    showStatus('Заполните обязательные поля: ' + missing.join(', '), true)
    return false
  }
  return true
}

async function saveElectrolyte() {
  if (!mode.value) return
  if (!validate()) return

  const payload = { ...form.value, name: titleText.value }
  if (payload.created_by) payload.created_by = Number(payload.created_by)

  try {
    if (mode.value === 'create') {
      await api.post('/api/electrolytes', payload)
      showStatus('Электролит сохранён')
    } else {
      await api.put(`/api/electrolytes/${currentId.value}`, payload)
      showStatus('Изменения сохранены')
    }
    resetForm()
    loadElectrolytes()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка сохранения', true)
  }
}

async function deleteElectrolyte(el) {
  if (!confirm(`Удалить электролит "${el.name}"?`)) return
  try {
    await api.delete(`/api/electrolytes/${el.electrolyte_id}`)
    showStatus('Электролит удалён')
    loadElectrolytes()
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

function startEdit(el) {
  mode.value = 'edit'
  currentId.value = el.electrolyte_id
  titleText.value = el.name

  form.value = {
    created_by: el.created_by || '',
    electrolyte_type: el.electrolyte_type || '',
    solvent_system: el.solvent_system || '',
    salts: el.salts || '',
    concentration: el.concentration || '',
    additives: el.additives || '',
    notes: el.notes || '',
    status: el.status || 'active',
  }

  formVisible.value = true
  loadUsers()
}

function duplicateElectrolyte(el) {
  mode.value = 'create'
  currentId.value = null
  titleText.value = el.name + ' (копия)'

  form.value = {
    created_by: '',
    electrolyte_type: el.electrolyte_type || '',
    solvent_system: el.solvent_system || '',
    salts: el.salts || '',
    concentration: el.concentration || '',
    additives: el.additives || '',
    notes: el.notes || '',
    status: el.status || 'active',
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

function typeLabel(type) {
  const map = { liquid: 'Жидкий', solid: 'Твёрдый', gel: 'Гелевый' }
  return map[type] || type
}

function statusLabel(status) {
  const map = { active: 'активный', inactive: 'не используется', archived: 'архив' }
  return map[status] || status
}

onMounted(() => { loadElectrolytes(); loadUsers() })
</script>

<template>
  <div>
    <input
      v-model="newName"
      class="add-input"
      :disabled="formVisible"
      placeholder="+ Добавить электролит"
      autocomplete="off"
      @keydown.enter="onAddEnter"
    />

    <!-- Form -->
    <form v-if="formVisible" autocomplete="on" @submit.prevent="saveElectrolyte">
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
        <br />

        <label>Тип электролита</label>
        <select
          v-model="form.electrolyte_type"
          :class="{ 'required-missing': !form.electrolyte_type && mode }"
        >
          <option value="">— выбрать тип —</option>
          <option value="liquid">Жидкий</option>
          <option value="solid">Твёрдый</option>
          <option value="gel">Гелевый</option>
        </select>
      </fieldset>

      <fieldset>
        <legend>Состав и описание</legend>

        <input
          v-if="titleEditing"
          v-model="titleInput"
          @blur="finishTitleEdit"
          @keydown.enter.prevent="finishTitleEdit"
        />
        <h2 v-else style="cursor: pointer" @click="startTitleEdit">{{ titleText }}</h2>

        <label>Растворители (система)</label>
        <input v-model="form.solvent_system" type="text" placeholder="например: EC/DMC 1:1" /><br />

        <label>Соли</label>
        <input v-model="form.salts" type="text" placeholder="например: LiPF6" /><br />

        <label>Концентрация</label>
        <input v-model="form.concentration" type="text" placeholder="например: 1 M" /><br />

        <label>Добавки</label>
        <input v-model="form.additives" type="text" placeholder="например: 2% VC" /><br />

        <label>Примечания</label><br />
        <textarea v-model="form.notes" rows="3" placeholder="Любая дополнительная информация"></textarea>
      </fieldset>

      <fieldset>
        <legend>Статус</legend>
        <select v-model="form.status">
          <option value="active">активный</option>
          <option value="inactive">не используется</option>
          <option value="archived">архив</option>
        </select>
      </fieldset>

      <button type="submit">Сохранить запись</button>
      <button type="button" @click="resetForm">Выход</button>
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
      <li v-for="el in electrolytes" :key="el.electrolyte_id" class="item-row">
        <div class="item-info">
          <span>{{ el.name }}</span>
          <span class="item-status">{{ typeLabel(el.electrolyte_type) }}</span>
          <span class="item-status">{{ statusLabel(el.status) }}</span>
        </div>
        <div class="actions">
          <button title="Редактировать" @click="startEdit(el)">✏️</button>
          <button title="Дублировать" @click="duplicateElectrolyte(el)">📄</button>
          <button title="Удалить" @click="deleteElectrolyte(el)">🗑</button>
        </div>
      </li>
    </ul>
  </div>
</template>
