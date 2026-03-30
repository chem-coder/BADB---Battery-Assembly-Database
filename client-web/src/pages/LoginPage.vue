<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import reneraLogo from '@/assets/logo/renera_horizontal.png'

const router = useRouter()
const auth = useAuthStore()

// ── Random TVEL graphic tile on each page load ────────────────────────────
// 4 tiles (2×2 grid from TVEL_graphics_RGB.ai), aspect ≈ 1.2 : 1
// Tile is rendered at 65vh tall → ~78vh wide.
// Safe position zones keep it within the viewport on any desktop screen.
onMounted(() => {
  // Pick a tile that differs from the previous one shown
  const last = parseInt(localStorage.getItem('badb-login-tile') || '0', 10)
  const pool = [1, 2, 3, 4].filter(n => n !== last)
  const tile = pool[Math.floor(Math.random() * pool.length)]
  localStorage.setItem('badb-login-tile', String(tile))

  // background-size: cover fills the entire screen at any resolution.
  // background-position controls which fragment is shown — fully random crop.
  // Range 15–85% avoids extreme corners while still giving good variety.
  const x = Math.round(15 + Math.random() * 70)
  const y = Math.round(15 + Math.random() * 70)

  const root = document.documentElement
  root.style.setProperty('--login-tile',   `url('/assets/tvel-tile-${tile}.webp')`)
  root.style.setProperty('--login-tile-x', `${x}%`)
  root.style.setProperty('--login-tile-y', `${y}%`)
})

// View toggle: 'login' | 'changePw' | 'changePwSuccess'
const view = ref('login')

// --- View A: Login ---
const login = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function onLoginSubmit() {
  error.value = ''
  if (!login.value || !password.value) {
    error.value = 'Введите логин и пароль'
    return
  }

  loading.value = true
  try {
    await auth.login(login.value, password.value)
    router.push('/')
  } catch (err) {
    if (err.response?.status === 429) {
      const retryMin = Math.ceil((err.response.data.retryAfter || 3600) / 60)
      error.value = `Аккаунт заблокирован. Повторите через ${retryMin} минут.`
    } else if (err.response?.status === 401) {
      error.value = 'Неверный логин или пароль'
    } else {
      error.value = 'Ошибка сервера. Попробуйте позже.'
    }
  } finally {
    loading.value = false
  }
}

function showChangePw() {
  cpLogin.value = login.value
  view.value = 'changePw'
  error.value = ''
}

function backToLogin() {
  view.value = 'login'
  cpCurrentPassword.value = ''
  cpNewPassword.value = ''
  cpConfirmPassword.value = ''
  cpCurrentError.value = ''
  cpFieldError.value = ''
  cpConfirmError.value = ''
  cpNewError.value = ''
}

// --- View B: Change password ---
const cpLogin = ref('')
const cpCurrentPassword = ref('')
const cpNewPassword = ref('')
const cpConfirmPassword = ref('')
const cpCurrentError = ref('')
const cpFieldError = ref('')
const cpConfirmError = ref('')
const cpNewError = ref('')
const cpLoading = ref(false)

function validateChangePw() {
  cpFieldError.value = ''
  cpCurrentError.value = ''
  cpConfirmError.value = ''
  cpNewError.value = ''

  if (!cpLogin.value || !cpCurrentPassword.value || !cpNewPassword.value || !cpConfirmPassword.value) {
    cpFieldError.value = 'Все поля обязательны'
    return false
  }
  if (cpNewPassword.value.length < 6) {
    cpNewError.value = 'Минимум 6 символов'
    return false
  }
  if (cpNewPassword.value !== cpConfirmPassword.value) {
    cpConfirmError.value = 'Пароли не совпадают'
    return false
  }
  if (cpNewPassword.value === cpCurrentPassword.value) {
    cpNewError.value = 'Новый пароль должен отличаться от текущего'
    return false
  }
  return true
}

async function onChangePwSubmit() {
  if (!validateChangePw()) return

  cpLoading.value = true
  try {
    await api.post('/api/auth/change-password-public', {
      login: cpLogin.value,
      current_password: cpCurrentPassword.value,
      new_password: cpNewPassword.value,
    })
    // Pre-fill login for View A
    login.value = cpLogin.value
    password.value = ''
    view.value = 'changePwSuccess'
  } catch (err) {
    if (err.response?.status === 401) {
      cpCurrentError.value = 'Неверный логин или пароль'
    } else if (err.response?.status === 400) {
      cpFieldError.value = err.response.data?.error || 'Ошибка валидации'
    } else {
      cpFieldError.value = 'Ошибка сервера. Попробуйте позже.'
    }
  } finally {
    cpLoading.value = false
  }
}

function goToLoginAfterSuccess() {
  cpCurrentPassword.value = ''
  cpNewPassword.value = ''
  cpConfirmPassword.value = ''
  cpCurrentError.value = ''
  cpFieldError.value = ''
  cpConfirmError.value = ''
  cpNewError.value = ''
  view.value = 'login'
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <img :src="reneraLogo" alt="РЭНЕРА" class="login-logo" />

      <!-- View A: Login -->
      <template v-if="view === 'login'">
        <h2 class="login-title">База данных центра ХИТ</h2>

        <form class="login-form" @submit.prevent="onLoginSubmit">
          <div class="field">
            <label for="login">Логин</label>
            <InputText
              id="login"
              v-model="login"
              placeholder="Введите логин"
              class="w-full"
              :class="{ 'p-invalid': error }"
              autocomplete="username"
            />
          </div>

          <div class="field">
            <label for="password">Пароль</label>
            <Password
              id="password"
              v-model="password"
              placeholder="Введите пароль"
              class="w-full"
              :class="{ 'p-invalid': error }"
              toggleMask
              :feedback="false"
              inputClass="w-full"
              autocomplete="current-password"
              @keydown.enter="onLoginSubmit"
            />
          </div>

          <div class="change-pw-link">
            <a href="#" @click.prevent="showChangePw">Сменить пароль</a>
          </div>

          <Button
            type="submit"
            label="Войти"
            class="w-full"
            :loading="loading"
          />

          <p v-if="error" class="login-error">{{ error }}</p>
        </form>
      </template>

      <!-- View B: Change password -->
      <template v-if="view === 'changePw'">
        <div class="cp-header">
          <a href="#" class="back-arrow" @click.prevent="backToLogin">&larr; К панели входа</a>
        </div>

        <form class="login-form" @submit.prevent="onChangePwSubmit">
          <div class="field">
            <label for="cpLogin">Логин</label>
            <InputText
              id="cpLogin"
              v-model="cpLogin"
              placeholder="Введите логин"
              class="w-full"
              autocomplete="username"
            />
          </div>

          <div class="field">
            <label for="cpCurrent">Текущий пароль</label>
            <Password
              id="cpCurrent"
              v-model="cpCurrentPassword"
              placeholder="Введите текущий пароль"
              class="w-full"
              :class="{ 'p-invalid': cpCurrentError }"
              toggleMask
              :feedback="false"
              inputClass="w-full"
              autocomplete="current-password"
            />
            <small v-if="cpCurrentError" class="field-error">{{ cpCurrentError }}</small>
            <div class="field-hint">Если забыли — обратитесь к администратору.</div>
          </div>

          <div class="field">
            <label for="cpNew">Новый пароль</label>
            <Password
              id="cpNew"
              v-model="cpNewPassword"
              placeholder="Минимум 6 символов"
              class="w-full"
              :class="{ 'p-invalid': cpNewError }"
              toggleMask
              :feedback="false"
              inputClass="w-full"
              autocomplete="new-password"
            />
            <small v-if="cpNewError" class="field-error">{{ cpNewError }}</small>
          </div>

          <div class="field">
            <label for="cpConfirm">Подтвердите новый пароль</label>
            <Password
              id="cpConfirm"
              v-model="cpConfirmPassword"
              placeholder="Повторите новый пароль"
              class="w-full"
              :class="{ 'p-invalid': cpConfirmError }"
              toggleMask
              :feedback="false"
              inputClass="w-full"
              autocomplete="new-password"
            />
            <small v-if="cpConfirmError" class="field-error">{{ cpConfirmError }}</small>
          </div>

          <p v-if="cpFieldError" class="login-error">{{ cpFieldError }}</p>

          <Button
            type="submit"
            label="Сохранить пароль"
            class="w-full"
            :loading="cpLoading"
            :disabled="cpLoading"
          />
        </form>
      </template>

      <!-- View B success -->
      <template v-if="view === 'changePwSuccess'">
        <div class="cp-success">
          <h2 class="login-title">Пароль успешно изменён</h2>
          <p class="cp-success-text">Войдите с новым паролем.</p>
          <Button
            label="Войти"
            class="w-full"
            @click="goToLoginAfterSuccess"
          />
        </div>
      </template>

      <div class="login-footer">
        v1.0
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #04122e;   /* fallback while tile loads */
  padding: 1rem;
  position: relative;
  overflow: hidden;
}

/* Layer 1 — TVEL tile at original colours, full-screen cover */
.login-page::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:    var(--login-tile,   url('/assets/tvel-tile-2.webp'));
  background-position: var(--login-tile-x, 50%) var(--login-tile-y, 50%);
  background-size:     cover;
  background-repeat:   no-repeat;
  opacity: 0.92;        /* near-original colours */
  pointer-events: none;
  z-index: 0;
}

/* Layer 2 — uniform dark scrim + heavy edge vignette */
.login-page::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    /* uniform tint */
    rgba(2, 8, 24, 0.38),
    /* heavy vignette — edges go nearly black */
    radial-gradient(
      ellipse 60% 65% at 50% 50%,
      transparent 0%,
      rgba(2, 8, 24, 0.82) 100%
    );
  pointer-events: none;
  z-index: 0;
}

/* ── Glassmorphism card ────────────────────────────────────────────────── */
.login-card {
  position: relative;
  z-index: 1;
  /* subtle frosted glass — dark blue tint, translucent */
  background: rgba(4, 18, 48, 0.55);
  backdrop-filter: blur(22px) saturate(1.25);
  -webkit-backdrop-filter: blur(22px) saturate(1.25);
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 16px;
  box-shadow:
    0 12px 48px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.07);
  padding: 2.5rem 2rem;
  width: 100%;
  max-width: 440px;
  text-align: center;
}

.login-logo {
  height: 68px;
  margin-bottom: 1.25rem;
  object-fit: contain;
  /* Brighten the РЭНЕРА logo so it reads on dark glass */
  filter: brightness(0) invert(1);
  opacity: 0.92;
}

.login-title {
  font-family: 'Rosatom', system-ui, sans-serif;
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.80);
  margin: 0 0 1.5rem 0;
  letter-spacing: 0.01em;
}

.login-form {
  text-align: left;
}

.field {
  margin-bottom: 1rem;
}

.field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.65);
  margin-bottom: 0.35rem;
}

.w-full {
  width: 100%;
}

/* White inputs — keep fully opaque for readability */
:deep(.p-inputtext) {
  background: rgba(255, 255, 255, 0.94) !important;
  color: #1a1a2e;
  border-color: rgba(255, 255, 255, 0.20);
  border-radius: 8px;
}

:deep(.p-inputtext:focus) {
  border-color: #52C9A6;
  box-shadow: 0 0 0 2px rgba(82, 201, 166, 0.25);
}

:deep(.p-password-input) {
  background: rgba(255, 255, 255, 0.94) !important;
  color: #1a1a2e;
  border-radius: 8px;
}

.login-error {
  color: #ff7c7c;
  font-size: 13px;
  text-align: center;
  margin: 0.75rem 0 0 0;
}

.login-footer {
  margin-top: 1rem;
  padding-top: 0.7rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.25);
}

/* Change password link */
.change-pw-link {
  margin-bottom: 1rem;
  text-align: left;
}

.change-pw-link a {
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
  text-decoration: none;
  transition: color 0.15s;
}

.change-pw-link a:hover {
  color: #52C9A6;
  text-decoration: none;
}

/* Change password view header */
.cp-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.back-arrow {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.55);
  text-decoration: none;
  line-height: 1;
  padding: 0.25rem 0;
  transition: color 0.15s;
}

.back-arrow:hover {
  color: #52C9A6;
}

.field-error {
  color: #ff7c7c;
  font-size: 12px;
  display: block;
  margin-top: 0.25rem;
}

.field-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.30);
  margin-top: 0.3rem;
}

/* Success view */
.cp-success {
  padding: 1rem 0;
}

.cp-success-text {
  color: rgba(255, 255, 255, 0.65);
  font-size: 14px;
  margin: 0 0 1.5rem 0;
}
</style>
