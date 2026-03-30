<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { useStatus } from '@/composables/useStatus'

const { statusMsg, statusError, showStatus } = useStatus()

const structuresList = ref([])
const newName = ref('')

// Create form state
const formVisible = ref(false)
const mode = ref(null)
const titleText = ref('')
const titleEditing = ref(false)
const titleInput = ref('')
const formComments = ref('')

function resetForm() {
  titleText.value = ''
  titleEditing.value = false
  titleInput.value = ''
  formComments.value = ''
  mode.value = null
  formVisible.value = false
}

// Inline edit state
const editingId = ref(null)
const editName = ref('')
const editComments = ref('')

// API
async function loadStructures() {
  const { data } = await api.get('/api/structures')
  structuresList.value = data.sort((a, b) => a.name.localeCompare(b.name))
}

async function saveStructure() {
  if (!mode.value) return

  const payload = {
    name: titleText.value,
    structure_comments: formComments.value.trim() || null,
  }

  try {
    await api.post('/api/structures', payload)
    showStatus('Структура сохранена')
    resetForm()
    loadStructures()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка добавления структуры', true)
  }
}

async function deleteStructure(s) {
  if (!confirm(`Удалить структуру "${s.name}"?`)) return
  try {
    await api.delete(`/api/structures/${s.sep_str_id}`)
    showStatus('Удалено')
    loadStructures()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка удаления структуры', true)
  }
}

// Actions
function onAddEnter() {
  if (formVisible.value) return
  const name = newName.value.trim()
  if (!name) return

  mode.value = 'create'
  titleText.value = name
  formVisible.value = true
  newName.value = ''
}

// Editable title (create form)
function startTitleEdit() {
  titleInput.value = titleText.value
  titleEditing.value = true
}

function finishTitleEdit() {
  const val = titleInput.value.trim()
  if (val) titleText.value = val
  titleEditing.value = false
}

// Inline edit (for existing items)
function startInlineEdit(s) {
  editingId.value = s.sep_str_id
  editName.value = s.name
  editComments.value = s.structure_comments || s.comments || ''
}

function cancelInlineEdit() {
  editingId.value = null
}

async function saveInlineEdit(id) {
  const newNameVal = editName.value.trim()
  if (!newNameVal) return

  try {
    await api.put(`/api/structures/${id}`, {
      name: newNameVal,
      structure_comments: editComments.value.trim() || null,
    })
    showStatus('Сохранено')
    editingId.value = null
    loadStructures()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка обновления структуры', true)
  }
}

function onInlineKeydown(e, id) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    saveInlineEdit(id)
  }
  if (e.key === 'Escape') {
    cancelInlineEdit()
  }
}

onMounted(loadStructures)
</script>

<template>
  <div>
    <input
      v-model="newName"
      class="add-input"
      :disabled="formVisible"
      placeholder="+ Добавить структуру (например: PP/PE/PP)"
      autocomplete="off"
      @keydown.enter="onAddEnter"
    />

    <!-- Create form -->
    <form v-if="formVisible" @submit.prevent="saveStructure">
      <input
        v-if="titleEditing"
        v-model="titleInput"
        @blur="finishTitleEdit"
        @keydown.enter.prevent="finishTitleEdit"
      />
      <h2 v-else style="cursor: pointer" @click="startTitleEdit">{{ titleText }}</h2>

      <label>Комментарии</label><br />
      <textarea
        v-model="formComments"
        rows="3"
        cols="50"
        placeholder="Описание, детали, замечания"
      ></textarea>

      <br /><br />
      <button type="submit">Сохранить</button>
      <button type="button" @click="resetForm">Отменить</button>
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
      <li
        v-for="s in structuresList"
        :key="s.sep_str_id"
        class="item-row"
        :class="{ 'edit-row': editingId === s.sep_str_id }"
      >
        <!-- View mode -->
        <template v-if="editingId !== s.sep_str_id">
          <div class="item-info">
            <div>{{ s.name }}</div>
            <div
              v-if="s.structure_comments || s.comments"
              style="font-size: 0.85rem; color: #666"
            >
              {{ s.structure_comments || s.comments }}
            </div>
          </div>
          <div class="actions">
            <button title="Редактировать" @click="startInlineEdit(s)">✏️</button>
            <button title="Удалить" @click="deleteStructure(s)">🗑</button>
          </div>
        </template>

        <!-- Inline edit mode -->
        <template v-else>
          <div class="item-info">
            <input
              v-model="editName"
              @keydown="onInlineKeydown($event, s.sep_str_id)"
            />
            <textarea
              v-model="editComments"
              rows="2"
              placeholder="Комментарий (необязательно)"
              @keydown="onInlineKeydown($event, s.sep_str_id)"
            ></textarea>
          </div>
        </template>
      </li>
    </ul>
  </div>
</template>
