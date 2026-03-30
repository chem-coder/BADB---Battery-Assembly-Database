<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import Password from 'primevue/password'
import Button from 'primevue/button'
import { useStatus } from '@/composables/useStatus'

const authStore = useAuthStore()
const { statusMsg, statusError, showStatus } = useStatus()

// --- Section 1: User info ---
const user = computed(() => authStore.user || {})

const roleBadge = computed(() => {
  const map = {
    admin:    { label: 'Администратор', cls: 'badge-danger' },
    lead:     { label: 'Ведущий',       cls: 'badge-warning' },
    employee: { label: 'Сотрудник',     cls: 'badge-info' },
  }
  return map[user.value.role] || { label: user.value.role || '—', cls: 'badge-info' }
})

// --- Section 2: Change password ---
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const fieldError = ref('')
const currentPasswordError = ref('')
const loading = ref(false)

function validate() {
  fieldError.value = ''
  currentPasswordError.value = ''

  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    fieldError.value = 'Все поля обязательны'
    return false
  }
  if (newPassword.value.length < 6) {
    fieldError.value = 'Новый пароль — минимум 6 символов'
    return false
  }
  if (newPassword.value !== confirmPassword.value) {
    fieldError.value = 'Пароли не совпадают'
    return false
  }
  if (newPassword.value === currentPassword.value) {
    fieldError.value = 'Новый пароль должен отличаться от текущего'
    return false
  }
  return true
}

async function onSubmit() {
  if (!validate()) return

  loading.value = true
  try {
    await api.put('/api/auth/change-password', {
      current_password: currentPassword.value,
      new_password: newPassword.value,
    })
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    fieldError.value = ''
    currentPasswordError.value = ''
    showStatus('Пароль успешно изменён')
  } catch (err) {
    if (err.response?.status === 401) {
      currentPasswordError.value = 'Неверный текущий пароль'
    } else {
      showStatus('Ошибка сервера', true)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="profile-wrapper">
    <h2 class="profile-title">Профиль</h2>

    <!-- Section 1: User info -->
    <div class="profile-card">
      <h3 class="card-title"><i class="pi pi-user"></i> Информация</h3>
      <table class="info-table">
        <tr>
          <td class="info-label">Имя:</td>
          <td>{{ user.name || '—' }}</td>
        </tr>
        <tr>
          <td class="info-label">Логин:</td>
          <td>{{ user.login || '—' }}</td>
        </tr>
        <tr>
          <td class="info-label">Роль:</td>
          <td>{{ roleBadge.label }}</td>
        </tr>
        <tr>
          <td class="info-label">Должность:</td>
          <td>{{ user.position || '—' }}</td>
        </tr>
      </table>
    </div>

    <!-- Section 2: Change password -->
    <details class="profile-card">
      <summary class="card-title"><i class="pi pi-key"></i> Смена пароля <i class="pi pi-chevron-down chevron"></i></summary>

      <form class="pw-form" @submit.prevent="onSubmit">
        <div class="field">
          <label for="currentPw">Текущий пароль</label>
          <Password
            id="currentPw"
            v-model="currentPassword"
            placeholder="Введите текущий пароль"
            class="w-full"
            :class="{ 'p-invalid': currentPasswordError }"
            toggleMask
            :feedback="false"
            inputClass="w-full"
            autocomplete="current-password"
          />
          <small v-if="currentPasswordError" class="field-error">{{ currentPasswordError }}</small>
        </div>

        <div class="field">
          <label for="newPw">Новый пароль</label>
          <Password
            id="newPw"
            v-model="newPassword"
            placeholder="Минимум 6 символов"
            class="w-full"
            toggleMask
            :feedback="false"
            inputClass="w-full"
            autocomplete="new-password"
          />
        </div>

        <div class="field">
          <label for="confirmPw">Подтвердите новый пароль</label>
          <Password
            id="confirmPw"
            v-model="confirmPassword"
            placeholder="Повторите новый пароль"
            class="w-full"
            toggleMask
            :feedback="false"
            inputClass="w-full"
            autocomplete="new-password"
          />
        </div>

        <p v-if="fieldError" class="form-error">{{ fieldError }}</p>

        <Button
          type="submit"
          label="Сохранить пароль"
          :loading="loading"
          :disabled="loading"
        />

        <p v-if="statusMsg" :class="['status-msg', { error: statusError }]">{{ statusMsg }}</p>
      </form>

      <div class="pw-footer">
        Забыли пароль — обратитесь к администратору.
      </div>
    </details>

    <!-- Section 3: Login history placeholder -->
    <details class="profile-card">
      <summary class="card-title"><i class="pi pi-clock"></i> История входов <i class="pi pi-chevron-down chevron"></i></summary>
      <p class="placeholder-text">История входов будет доступна в следующей версии.</p>
    </details>
  </div>
</template>

<style scoped>
.profile-wrapper {
  max-width: 560px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.profile-title {
  font-family: 'Rosatom', system-ui, sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: #003366;
  margin: 0 0 1.5rem 0;
}

.profile-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  padding: 1.5rem 2rem;
  margin-bottom: 1.25rem;
}

.card-title {
  font-family: 'Rosatom', system-ui, sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #003366;
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

summary.card-title {
  cursor: pointer;
  list-style: none;
  user-select: none;
  margin: 0;
}

.card-title::-webkit-details-marker {
  display: none;
}

.card-title i {
  font-size: 14px;
}

.chevron {
  margin-left: auto;
  font-size: 12px;
  transition: transform 0.2s;
}

details.profile-card[open] > .card-title {
  margin-bottom: 1rem;
}

details.profile-card[open] > .card-title .chevron {
  transform: rotate(180deg);
}

/* Info table */
.info-table {
  width: 100%;
  border-collapse: collapse;
}

.info-table td {
  padding: 0.4rem 0;
  font-size: 14px;
  color: #1a1a2e;
}

.info-label {
  color: #6B7280;
  font-weight: 600;
  width: 110px;
  white-space: nowrap;
}

/* Role badge */
.role-badge {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
}

.badge-danger {
  background: #FEE2E2;
  color: #DC2626;
}

.badge-warning {
  background: #FEF3C7;
  color: #D97706;
}

.badge-info {
  background: #DBEAFE;
  color: #2563EB;
}

/* Password form */
.pw-form {
  text-align: left;
}

.field {
  margin-bottom: 1rem;
}

.field label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: #4B5563;
  margin-bottom: 0.35rem;
}

.w-full {
  width: 100%;
}

.field-error {
  color: #E74C3C;
  font-size: 12px;
  display: block;
  margin-top: 0.25rem;
}

.form-error {
  color: #E74C3C;
  font-size: 13px;
  text-align: center;
  margin: 0 0 0.75rem 0;
}

.status-msg {
  text-align: center;
  font-size: 13px;
  margin: 0.75rem 0 0 0;
  color: #2ECC94;
}

.status-msg.error {
  color: #E74C3C;
}

:deep(.p-inputtext) {
  background: #ffffff !important;
  color: #1a1a2e;
  border-color: #D1D7DE;
}

:deep(.p-inputtext:focus) {
  border-color: #003366;
  box-shadow: 0 0 0 2px rgba(0, 51, 102, 0.15);
}

.pw-footer {
  margin-top: 1.25rem;
  padding-top: 0.75rem;
  border-top: 1px solid #D1D7DE;
  font-size: 12px;
  color: #A8B0B8;
  text-align: center;
}

/* Placeholder */
.placeholder-text {
  color: #9CA3AF;
  font-size: 13px;
  margin: 0;
}
</style>
