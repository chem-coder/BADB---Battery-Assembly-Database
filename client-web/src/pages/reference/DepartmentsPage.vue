<script setup>
/**
 * DepartmentsPage — "Отделы" (department reference).
 *
 * NEW Vue page (no prior Vue equivalent). Built directly against the
 * parity foundation to match vanilla v1 behaviour. See:
 *   - docs/current/departments.md
 *   - public/js/departments.js (vanilla reference)
 *   - public/reference/departments.html
 *
 * Surface notes (vanilla parity):
 *   - admin-only create/update; non-admin can view.
 *   - no print, no duplicate, no delete (per current docs/current/departments.md).
 *   - 2 user-facing fields: `name`, `head_user_id` (optional).
 *   - filter by head includes special "Без руководителя" option.
 *   - head select shows active users; if the currently-selected head is
 *     inactive, that user is still listed with "(неактивен)" suffix.
 *   - save keeps record open.
 */
import { ref, watch, computed, onMounted } from 'vue';
import api from '@/services/api';
import { useAuth } from '@/composables/useAuth';

import RowOpenPage from '@/components/parity/RowOpenPage.vue';
import OpenedRecordHeader from '@/components/parity/OpenedRecordHeader.vue';
import EditableTitle from '@/components/parity/EditableTitle.vue';
import { useRowOpenForm } from '@/composables/useRowOpenForm';

import InputText from 'primevue/inputtext';
import Select from 'primevue/select';

// Sentinel value used in the "head" filter to mean "departments without a head".
const NO_HEAD_FILTER = '__no_head__';

const { isAdmin } = useAuth();

// ── List + users state ───────────────────────────────────────────────
const departments = ref([]);
const loading = ref(false);
const users = ref([]);

async function loadList() {
  loading.value = true;
  try {
    const { data } = await api.get('/api/departments');
    departments.value = data;
  } finally {
    loading.value = false;
  }
}

async function loadUsers() {
  const { data } = await api.get('/api/users');
  users.value = data;
}

onMounted(() => {
  loadList();
  loadUsers();
});

// ── Form helpers ─────────────────────────────────────────────────────
function emptyForm() {
  return { name: '', head_user_id: '' };
}

async function loadOne(id) {
  const { data } = await api.get(`/api/departments/${id}`);
  return {
    item: data,
    form: {
      name: data.name || '',
      head_user_id: data.head_user_id != null ? String(data.head_user_id) : '',
    },
  };
}

async function saveOne(form, mode, currentId) {
  const payload = {
    name: form.name.trim(),
    head_user_id: form.head_user_id === '' ? null : Number(form.head_user_id),
  };

  let response;
  if (mode === 'create') {
    response = await api.post('/api/departments', payload);
  } else {
    response = await api.put(`/api/departments/${currentId}`, payload);
  }
  return response.data;
}

function validate(form) {
  if (!form.name?.trim()) return 'Заполните название отдела';
  return true;
}

// ── Foundation hook (no delete on this surface) ──────────────────────
const ctx = useRowOpenForm({
  entityType: 'departments',
  idField: 'department_id',
  emptyForm,
  validate,
  loadOne,
  saveOne,
  list: { ref: departments, load: loadList },
  // No delete-check, no typed phrase — departments have no delete route per
  // docs/current/departments.md "There is no current department delete route."
  hasDeleteCheck: false,
});

// ── Active users for the head <Select>, including the currently-selected
//     user even if they are inactive (mirrors vanilla activeUsersForSelect).
const headOptions = ref([]);
function rebuildHeadOptions() {
  const selectedId = ctx.form.value.head_user_id;
  const selectedStr = selectedId == null ? '' : String(selectedId);
  const filtered = users.value.filter(
    (u) => u.active || String(u.user_id) === selectedStr
  );
  headOptions.value = [
    { value: '', label: '— без руководителя —' },
    ...filtered.map((u) => ({
      value: String(u.user_id),
      label: u.active ? u.name : `${u.name} (неактивен)`,
    })),
  ];
}

// Rebuild whenever the form's head_user_id changes (so the selected option
// stays visible when switching records) or when users load.
watch(
  [() => ctx.form.value.head_user_id, users],
  () => rebuildHeadOptions(),
  { immediate: true }
);

// ── Filters ──────────────────────────────────────────────────────────
// Head filter offers "Все руководители" / "Без руководителя" / one entry
// per user. We rebuild the options list when users load.
const filterHeadOptions = ref([]);
watch(users, (next) => {
  filterHeadOptions.value = [...next]
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((u) => ({
      value: String(u.user_id),
      label: u.active ? u.name : `${u.name} (неактивен)`,
    }));
});

const filters = ref([
  { field: 'text', type: 'text', placeholder: 'ID, название, руководитель...', label: 'Поиск' },
]);

// PageFilterBar takes filters as a prop; we want to recompute the head-select
// when users change, but `filters` is reactive so we splice the head filter
// in once users are loaded. Keep it as a computed-by-watch list.
watch(filterHeadOptions, (opts) => {
  const head = {
    field: 'head_user_id',
    type: 'select',
    label: 'Руководитель',
    emptyOption: 'Все руководители',
    options: [
      { value: NO_HEAD_FILTER, label: 'Без руководителя' },
      ...opts,
    ],
  };
  // Replace any existing head filter or append.
  const idx = filters.value.findIndex((f) => f.field === 'head_user_id');
  if (idx >= 0) filters.value.splice(idx, 1, head);
  else filters.value.push(head);
});

// Text-search haystack for client-side filtering.
function textHaystack(row) {
  return [
    row.department_id,
    row.name,
    row.head_name,
  ].filter(Boolean).join(' ');
}

// Custom filter logic for head_user_id (because the "no head" sentinel
// needs special handling that PageFilterBar's generic select match
// cannot express). We pre-filter the list before passing to RowOpenPage,
// using a derived ref.
const headFilterValue = ref('');
const filteredDepartments = computed(() => {
  if (!headFilterValue.value) return departments.value;
  if (headFilterValue.value === NO_HEAD_FILTER) {
    return departments.value.filter((d) => d.head_user_id == null);
  }
  return departments.value.filter((d) => String(d.head_user_id) === headFilterValue.value);
});

// Intercept the filter-changed event from RowOpenPage to track head selection.
function onFiltersChanged({ state }) {
  headFilterValue.value = state.head_user_id || '';
}

// ── Columns ──────────────────────────────────────────────────────────
const columns = [
  { field: 'department_id', header: 'ID', width: '80px' },
  { field: 'name', header: 'Название' },
  { field: 'head_label', header: 'Руководитель', width: '260px' },
];

function headDisplay(dept) {
  if (!dept?.head_user_id) return '— без руководителя —';
  return dept.head_name || `Пользователь #${dept.head_user_id}`;
}

// ── Meta string for sticky header ────────────────────────────────────
function formatMeta(item) {
  if (!item) return '';
  const parts = [`ID: ${item.department_id}`];
  if (item.head_user_id != null) {
    parts.push(`руководитель: ${item.head_name || `#${item.head_user_id}`}`);
  } else {
    parts.push('без руководителя');
  }
  return parts.join(' · ');
}

// ── Admin gate ───────────────────────────────────────────────────────
// Non-admin users can view but not create or edit. The add input and form
// inputs are disabled.
function onCreate(name) {
  if (!isAdmin.value) {
    ctx.setStatus('Создание отделов доступно только администраторам', 'error');
    return;
  }
  ctx.openCreate(name);
}
</script>

<template>
  <RowOpenPage
    title="Отделы"
    icon="pi pi-users"
    :add-placeholder="isAdmin ? '+ Добавить отдел' : ''"
    :list="filteredDepartments"
    :columns="columns"
    :filters="filters"
    :current-id="ctx.currentId.value"
    :mode="ctx.mode.value"
    id-field="department_id"
    :loading="loading"
    :text-haystack="textHaystack"
    @create="onCreate"
    @row-click="ctx.openEdit"
    @filters-changed="onFiltersChanged"
  >
    <template #col-head_label="{ data }">
      <span class="meta-text">{{ headDisplay(data) }}</span>
    </template>

    <template #opened-record>
      <OpenedRecordHeader
        :meta="formatMeta(ctx.currentItem.value)"
        :dirty="ctx.isDirty.value"
        :status="ctx.status.value"
        :save-disabled="!isAdmin"
        @save="ctx.save"
        @exit="ctx.exit"
      >
        <template #title>
          <EditableTitle
            v-model="ctx.form.value.name"
            placeholder="Новый отдел"
            :disabled="!isAdmin"
            class="dept-title"
          />
        </template>
      </OpenedRecordHeader>

      <div class="dept-form">
        <div v-if="!isAdmin" class="readonly-notice">
          Редактирование отделов доступно только администраторам.
        </div>

        <div class="form-grid">
          <label for="dept-name">Название</label>
          <InputText
            id="dept-name"
            v-model="ctx.form.value.name"
            placeholder="Название отдела"
            class="w-full"
            :disabled="!isAdmin"
          />

          <label for="dept-head">Руководитель</label>
          <Select
            id="dept-head"
            v-model="ctx.form.value.head_user_id"
            :options="headOptions"
            option-label="label"
            option-value="value"
            placeholder="— без руководителя —"
            class="w-full"
            :disabled="!isAdmin"
          />
        </div>
      </div>
    </template>
  </RowOpenPage>
</template>

<style scoped>
.dept-title {
  font-size: 16px;
  font-weight: 600;
  color: #003274;
}
.dept-form {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
.meta-text { color: #4B5563; font-size: 13px; }
</style>
