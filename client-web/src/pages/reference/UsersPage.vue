<script setup>
/**
 * UsersPage — "Пользователи" (administration).
 *
 * Migrated to row-open + foundation pattern per V2 parity. See:
 *   - docs/current/users.md
 *   - docs/instructions/frontend_parity_handoff.md §"Recipes And Users Page Pattern"
 *   - public/js/users.js (vanilla reference)
 *
 * Surface notes (vanilla parity):
 *   - admin can create users; non-admin cannot;
 *   - admin can edit any user; others can edit only themselves;
 *   - only admin can change another user's role;
 *   - password reset uses `reset_password: true` toggle in payload;
 *   - delete: admin can delete anyone, others can delete only self;
 *     no delete-check route, no typed phrase; backend returns 409 with
 *     dependency conflicts on blocked delete;
 *   - no print, no duplicate, no files.
 */
import { ref, computed, onMounted } from 'vue';
import api from '@/services/api';
import { useAuth } from '@/composables/useAuth';

import RowOpenPage from '@/components/parity/RowOpenPage.vue';
import OpenedRecordHeader from '@/components/parity/OpenedRecordHeader.vue';
import EditableTitle from '@/components/parity/EditableTitle.vue';
import { useRowOpenForm } from '@/composables/useRowOpenForm';

import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Select from 'primevue/select';

const { currentUser, isAdmin } = useAuth();

// ── Constants ────────────────────────────────────────────────────────
const ROLE_OPTIONS = [
  { value: 'employee', label: 'Сотрудник' },
  { value: 'lead',     label: 'Руководитель' },
  { value: 'admin',    label: 'Администратор' },
];

const ACTIVE_OPTIONS = [
  { value: true,  label: 'активен' },
  { value: false, label: 'неактивен' },
];

const UNDECIDED_DEPARTMENT_LABEL = 'Не определено';

// ── List + departments ──────────────────────────────────────────────
const users = ref([]);
const departments = ref([]);
const loading = ref(false);

async function loadList() {
  loading.value = true;
  try {
    const { data } = await api.get('/api/users');
    users.value = data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } finally {
    loading.value = false;
  }
}

async function loadDepartments() {
  const { data } = await api.get('/api/departments');
  departments.value = data;
}

onMounted(() => {
  loadList();
  loadDepartments();
});

// ── Form ─────────────────────────────────────────────────────────────
// Password fields and reset_password flag are not part of dirty
// tracking — they are managed separately so toggling the reset UI
// does not flag the form as dirty until the user types something.
function emptyForm() {
  return {
    name: '',
    login: '',
    role: '',
    position: '',
    department_id: null,
    active: true,
    // Password reset state, only sent to server when explicitly toggled
    reset_password: false,
    password: '',
    confirm_password: '',
  };
}

async function loadOne(id) {
  // GET /api/users/:id is not a standard route — the list endpoint returns
  // everything we need. Look up in the in-memory list.
  const user = users.value.find((u) => u.user_id === id);
  if (!user) throw new Error(`Пользователь #${id} не найден`);
  return {
    item: user,
    form: {
      name: user.name || '',
      login: user.login || '',
      role: user.role || '',
      position: user.position || '',
      department_id: user.department_id ?? null,
      active: user.active !== false,
      reset_password: false,
      password: '',
      confirm_password: '',
    },
  };
}

async function saveOne(form, mode, currentId) {
  const payload = {
    name: form.name.trim(),
    login: form.login.trim(),
    role: form.role,
    position: form.position.trim(),
    department_id: form.department_id,
    active: form.active,
  };

  // Password is sent on create OR when explicit reset is toggled on edit.
  if (mode === 'create' || form.reset_password) {
    payload.password = form.password;
  }
  if (mode === 'edit' && form.reset_password) {
    payload.reset_password = true;
  }

  let response;
  if (mode === 'create') {
    response = await api.post('/api/users', payload);
  } else {
    response = await api.put(`/api/users/${currentId}`, payload);
  }
  return response.data;
}

function validate(form) {
  if (!form.name?.trim()) return 'Заполните имя';
  if (!form.login?.trim()) return 'Заполните логин';
  if (!form.role) return 'Выберите роль';
  if (!form.position?.trim()) return 'Заполните должность';
  if (form.department_id === '' || form.department_id === undefined) {
    return 'Выберите отдел (можно "Не определено")';
  }

  // Mode-dependent password validation runs against the in-progress form;
  // we don't have direct access to mode here. The composable's mode value
  // is closure-captured below via outer ref.
  if (mode.value === 'create') {
    if (!form.password) return 'Заполните пароль';
    if (form.password.length < 6) return 'Пароль должен быть не короче 6 символов';
  }
  if (mode.value === 'edit' && form.reset_password) {
    if (!form.password || form.password.length < 6) {
      return 'Пароль должен быть не короче 6 символов';
    }
    if (form.password !== form.confirm_password) {
      return 'Пароли не совпадают';
    }
  }
  return true;
}

// ── Foundation hook ──────────────────────────────────────────────────
const ctx = useRowOpenForm({
  entityType: 'users',
  idField: 'user_id',
  emptyForm,
  validate,
  loadOne,
  saveOne,
  list: { ref: users, load: loadList },
  hasDeleteCheck: false,
  // No typed delete phrase per vanilla.
  deletePhrase: null,
  deleteMessages: {
    success: 'Пользователь удалён',
    plainConfirm: 'Удалить пользователя? Действие необратимо.',
  },
});

const mode = ctx.mode;

// ── Permission gating ────────────────────────────────────────────────
const canCreate = computed(() => isAdmin.value);

function isSelfRecord() {
  return ctx.currentItem.value?.user_id === currentUser.value?.userId;
}

const canEditCurrent = computed(() => {
  if (mode.value === 'create') return isAdmin.value;
  if (mode.value === 'edit') {
    if (isAdmin.value) return true;
    return isSelfRecord();
  }
  return false;
});

const canChangeRole = computed(() => {
  // Only admin can change role of anyone (including self).
  return isAdmin.value;
});

const canDeleteCurrent = computed(() => {
  if (mode.value !== 'edit') return false;
  if (isAdmin.value) return true;
  return isSelfRecord();
});

// ── Filters ──────────────────────────────────────────────────────────
const UNDECIDED_DEPARTMENT_FILTER = '__no_dept__';

const departmentFilterOptions = computed(() => [
  { value: UNDECIDED_DEPARTMENT_FILTER, label: UNDECIDED_DEPARTMENT_LABEL },
  ...departments.value.map((d) => ({ value: String(d.department_id), label: d.name })),
]);

const filters = computed(() => [
  { field: 'text', type: 'text', placeholder: 'Имя, логин, должность...', label: 'Поиск' },
  {
    field: 'role',
    type: 'select',
    label: 'Роль',
    emptyOption: 'Все роли',
    options: ROLE_OPTIONS,
  },
  {
    field: 'department_id',
    type: 'select',
    label: 'Отдел',
    emptyOption: 'Все отделы',
    options: departmentFilterOptions.value,
  },
  {
    field: 'active',
    type: 'select',
    label: 'Статус',
    emptyOption: 'Все',
    options: [
      { value: 'true', label: 'Активные' },
      { value: 'false', label: 'Неактивные' },
    ],
  },
]);

// Custom filter logic (department null + boolean cast for active).
const filterState = ref({});
function onFiltersChanged({ state }) {
  filterState.value = state;
}

const filteredUsers = computed(() => {
  const s = filterState.value;
  if (!s || Object.values(s).every((v) => !v)) return users.value;

  return users.value.filter((u) => {
    if (s.role && u.role !== s.role) return false;
    if (s.department_id) {
      if (s.department_id === UNDECIDED_DEPARTMENT_FILTER) {
        if (u.department_id != null) return false;
      } else if (String(u.department_id) !== s.department_id) {
        return false;
      }
    }
    if (s.active === 'true' && u.active !== true) return false;
    if (s.active === 'false' && u.active === true) return false;
    if (s.text) {
      const needle = String(s.text).toLowerCase();
      const haystack = [u.name, u.login, u.position, u.department_name, u.role]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
});

// ── Department options (for form Select) ─────────────────────────────
const departmentSelectOptions = computed(() => [
  { value: null, label: '— ' + UNDECIDED_DEPARTMENT_LABEL + ' —' },
  ...departments.value.map((d) => ({ value: d.department_id, label: d.name })),
]);

// ── Columns ──────────────────────────────────────────────────────────
const columns = [
  { field: 'name', header: 'Имя' },
  { field: 'login', header: 'Логин', width: '140px' },
  { field: 'position', header: 'Должность', width: '200px' },
  { field: 'department_name', header: 'Отдел', width: '160px' },
  { field: 'role', header: 'Роль', width: '110px' },
  { field: 'active', header: 'Статус', width: '110px' },
  { field: 'last_login', header: 'Последний вход', width: '160px' },
];

function roleLabel(role) {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label || role;
}

function formatMeta(item) {
  if (!item) return '';
  const parts = [`ID: ${item.user_id}`];
  if (item.last_login) {
    parts.push(`последний вход: ${new Date(item.last_login).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}`);
  }
  return parts.join(' · ');
}

// ── Password reset toggle ────────────────────────────────────────────
function togglePasswordReset() {
  if (ctx.form.value.reset_password) {
    ctx.form.value.reset_password = false;
    ctx.form.value.password = '';
    ctx.form.value.confirm_password = '';
  } else {
    ctx.form.value.reset_password = true;
  }
}

function setPositionUndecided() {
  ctx.form.value.position = UNDECIDED_DEPARTMENT_LABEL;
}
</script>

<template>
  <RowOpenPage
    title="Пользователи"
    icon="pi pi-users"
    :add-placeholder="canCreate ? '+ Добавить пользователя' : ''"
    :list="filteredUsers"
    :columns="columns"
    :filters="filters"
    :current-id="ctx.currentId.value"
    id-field="user_id"
    :loading="loading"
    @create="(name) => ctx.openCreate(name)"
    @row-click="ctx.openEdit"
    @filters-changed="onFiltersChanged"
  >
    <template #col-name="{ data }">
      <strong>{{ data.name }}</strong>
    </template>
    <template #col-login="{ data }">
      <span class="meta-text">{{ data.login || '—' }}</span>
    </template>
    <template #col-position="{ data }">
      <span class="meta-text">{{ data.position || '—' }}</span>
    </template>
    <template #col-department_name="{ data }">
      {{ data.department_name || '—' }}
    </template>
    <template #col-role="{ data }">
      <span :class="['role-badge', `role-badge--${data.role || 'unknown'}`]">
        {{ data.role === 'admin' ? 'Админ' : data.role === 'lead' ? 'Лид' : 'Сотр.' }}
      </span>
    </template>
    <template #col-active="{ data }">
      <span :class="['status-pill', data.active ? 'status-pill--active' : 'status-pill--inactive']">
        {{ data.active ? 'активен' : 'неактивен' }}
      </span>
    </template>
    <template #col-last_login="{ data }">
      <span class="meta-text">
        {{ data.last_login ? new Date(data.last_login).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—' }}
      </span>
    </template>

    <template #opened-record>
      <OpenedRecordHeader
        :meta="formatMeta(ctx.currentItem.value)"
        :dirty="ctx.isDirty.value"
        :status="ctx.status.value"
        :show-delete="canDeleteCurrent"
        :save-disabled="!canEditCurrent"
        @save="ctx.save"
        @exit="ctx.exit"
        @delete="ctx.deleteRecord"
      >
        <template #title>
          <EditableTitle
            v-model="ctx.form.value.name"
            placeholder="Новый пользователь"
            :disabled="!canEditCurrent"
            class="user-title"
          />
        </template>
      </OpenedRecordHeader>

      <div class="user-form">
        <div v-if="!canEditCurrent" class="readonly-notice">
          Просмотр без редактирования: доступ к изменению ограничен.
        </div>

        <div class="form-grid">
          <label for="user-login">Логин</label>
          <InputText
            id="user-login"
            v-model="ctx.form.value.login"
            placeholder="Логин"
            class="w-full"
            :disabled="!canEditCurrent"
            autocomplete="off"
          />

          <label for="user-role">Роль</label>
          <Select
            id="user-role"
            v-model="ctx.form.value.role"
            :options="ROLE_OPTIONS"
            option-label="label"
            option-value="value"
            placeholder="Выберите роль"
            class="w-full"
            :disabled="!canEditCurrent || !canChangeRole"
          />

          <label for="user-position">Должность</label>
          <div class="position-row">
            <InputText
              id="user-position"
              v-model="ctx.form.value.position"
              placeholder="Должность"
              class="w-full"
              :disabled="!canEditCurrent"
            />
            <Button
              type="button"
              :label="UNDECIDED_DEPARTMENT_LABEL"
              severity="secondary"
              text
              :disabled="!canEditCurrent"
              @click="setPositionUndecided"
            />
          </div>

          <label for="user-department">Отдел</label>
          <Select
            id="user-department"
            v-model="ctx.form.value.department_id"
            :options="departmentSelectOptions"
            option-label="label"
            option-value="value"
            placeholder="Выберите отдел"
            class="w-full"
            :disabled="!canEditCurrent"
          />

          <label for="user-active">Статус</label>
          <Select
            id="user-active"
            v-model="ctx.form.value.active"
            :options="ACTIVE_OPTIONS"
            option-label="label"
            option-value="value"
            class="w-full"
            :disabled="!canEditCurrent"
          />
        </div>

        <!-- Password block: visible at create, OR when reset toggle is on for edit -->
        <div v-if="mode === 'create'" class="form-grid">
          <label for="user-password">Пароль</label>
          <Password
            id="user-password"
            v-model="ctx.form.value.password"
            :feedback="false"
            toggle-mask
            placeholder="Временный пароль (минимум 6 символов)"
            class="w-full"
            input-class="w-full"
            :disabled="!canEditCurrent"
          />
        </div>

        <div v-else-if="mode === 'edit' && canEditCurrent" class="password-edit-block">
          <div v-if="!ctx.form.value.reset_password" class="password-toggle-row">
            <Button
              type="button"
              label="Сбросить пароль"
              severity="secondary"
              outlined
              @click="togglePasswordReset"
            />
          </div>

          <div v-else class="password-reset-fields">
            <div class="form-grid">
              <label for="user-new-password">Новый пароль</label>
              <Password
                id="user-new-password"
                v-model="ctx.form.value.password"
                :feedback="false"
                toggle-mask
                placeholder="Минимум 6 символов"
                class="w-full"
                input-class="w-full"
              />

              <label for="user-confirm-password">Подтверждение</label>
              <Password
                id="user-confirm-password"
                v-model="ctx.form.value.confirm_password"
                :feedback="false"
                toggle-mask
                placeholder="Повторите новый пароль"
                class="w-full"
                input-class="w-full"
              />
            </div>
            <Button
              type="button"
              label="Отмена сброса"
              severity="secondary"
              text
              @click="togglePasswordReset"
            />
          </div>
        </div>
      </div>
    </template>
  </RowOpenPage>
</template>

<style scoped>
.user-title {
  font-size: 16px;
  font-weight: 600;
  color: #003274;
}
.user-form {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.readonly-notice {
  font-size: 13px;
  color: #6B7280;
  background: #F3F4F6;
  padding: 8px 12px;
  border-left: 3px solid #D1D5DB;
  border-radius: 3px;
}
.form-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 10px 16px;
  align-items: center;
  max-width: 600px;
}
.form-grid label {
  font-size: 13px;
  font-weight: 500;
  color: #003274;
}
.w-full { width: 100%; }
.position-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.password-edit-block {
  border-top: 1px solid rgba(0, 50, 116, 0.1);
  padding-top: 12px;
}
.password-toggle-row {
  display: flex;
  justify-content: flex-start;
}
.password-reset-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.meta-text {
  color: #6B7280;
  font-size: 13px;
}
.role-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}
.role-badge--admin { background: rgba(176, 0, 32, 0.1); color: #b00020; }
.role-badge--lead { background: rgba(211, 167, 84, 0.15); color: #9a7030; }
.role-badge--employee { background: rgba(0, 50, 116, 0.08); color: #003274; }
.role-badge--unknown { color: #6B7280; }
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
