<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { useStatus } from '@/composables/useStatus'

const { statusMsg, statusError, showStatus } = useStatus()

const users = ref([])
const newName = ref('')

async function loadUsers() {
  const { data } = await api.get('/api/users')
  users.value = data.sort((a, b) => a.name.localeCompare(b.name))
}

async function createUser() {
  const name = newName.value.trim()
  if (!name) return
  try {
    await api.post('/api/users', { name })
    newName.value = ''
    showStatus('Пользователь создан')
    loadUsers()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка сохранения', true)
  }
}

// Inline edit state
const editingId = ref(null)
const editName = ref('')
const editActive = ref(true)

function startEdit(user) {
  editingId.value = user.user_id
  editName.value = user.name
  editActive.value = user.active
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(userId) {
  try {
    await api.put(`/api/users/${userId}`, {
      name: editName.value.trim(),
      active: editActive.value,
    })
    editingId.value = null
    showStatus('Изменения сохранены')
    loadUsers()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка обновления', true)
  }
}

async function deleteUser(user) {
  if (!confirm('Вы уверены?')) return
  try {
    await api.delete(`/api/users/${user.user_id}`)
    showStatus('Пользователь удалён')
    loadUsers()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка удаления', true)
  }
}

onMounted(loadUsers)
</script>

<template>
  <div>
    <input
      v-model="newName"
      class="add-input"
      placeholder="+ Добавить пользователя"
      autocomplete="off"
      @keydown.enter="createUser"
    />

    <div
      v-if="statusMsg"
      class="status-feedback"
      :style="{ color: statusError ? '#b00020' : 'darkcyan' }"
    >
      {{ statusMsg }}
    </div>

    <ul class="items-list">
      <li
        v-for="user in users"
        :key="user.user_id"
        class="item-row"
        :class="{ 'edit-row': editingId === user.user_id }"
      >
        <!-- View mode -->
        <template v-if="editingId !== user.user_id">
          <div class="item-info">
            <span>{{ user.name }}</span>
            <span
              class="item-status"
              :class="{ inactive: !user.active }"
            >
              {{ user.active ? 'активен' : 'неактивен' }}
            </span>
          </div>
          <div class="actions">
            <button title="Редактировать" @click="startEdit(user)">✏️</button>
            <button title="Удалить" @click="deleteUser(user)">🗑</button>
          </div>
        </template>

        <!-- Edit mode -->
        <template v-else>
          <input
            v-model="editName"
            @keydown.enter="saveEdit(user.user_id)"
            @keydown.escape="cancelEdit"
          />
          <select
            v-model="editActive"
            @keydown.enter="saveEdit(user.user_id)"
            @keydown.escape="cancelEdit"
          >
            <option :value="true">активен</option>
            <option :value="false">неактивен</option>
          </select>
        </template>
      </li>
    </ul>
  </div>
</template>
