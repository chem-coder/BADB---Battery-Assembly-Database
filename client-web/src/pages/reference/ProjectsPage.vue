<script setup>
/**
 * ProjectsPage — "Проекты" (project reference).
 *
 * Migrated to row-open + foundation pattern per V2 parity. See:
 *   - docs/current/projects.md
 *   - docs/instructions/frontend_parity_handoff.md §"Recipes And Users Page Pattern"
 *     and §"Project Access Labels"
 *   - docs/instructions/vanilla_ui_patterns.md §"Access Terminology"
 *   - public/js/projects.js (vanilla reference)
 *
 * Surface specifics
 * -----------------
 * * 8 user-facing fields: name, lead_id, description, start_date, due_date,
 *   status, confidentiality_level, department_id.
 * * Statuses: active / paused / completed / archived.
 * * Confidentiality (UI label = "Доступ"): public → "открытый",
 *   confidential → "ограниченный" (the two selectable options). Legacy
 *   `department` is treated as "ограниченный" and is no longer a choice.
 *   Vocabulary lives in @/utils/projectAccess (matches vanilla projects.js).
 * * Delete: NO standalone delete-check route, NO typed phrase. Plain
 *   confirmation; backend 409 dependency conflicts surfaced as status.
 * * Print URL: /workflow/project-print.html?project_id=<id>.
 * * List-level duplicate is a client-side starter copy without access grants.
 *
 * Access management
 * -----------------
 * The user/department access management UI (grant form, presets, copy,
 * access list) is extracted into `client-web/src/components/ProjectAccessPanel.vue`
 * and rendered inside the opened-record area when the record is saved
 * (mode === 'edit'). This keeps the page-level migration focused on the
 * row-open / sticky-header / delete-flow shape.
 */
import { ref, computed, onMounted } from 'vue';
import api from '@/services/api';
import { usePrintHandlers } from '@/composables/usePrintHandlers';

import RowOpenPage from '@/components/parity/RowOpenPage.vue';
import OpenedRecordHeader from '@/components/parity/OpenedRecordHeader.vue';
import EditableTitle from '@/components/parity/EditableTitle.vue';
import ProjectMembersTable from '@/components/ProjectMembersTable.vue';
import { useRowOpenForm } from '@/composables/useRowOpenForm';

import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import DateInputISO from '@/components/parity/DateInputISO.vue';
import { ACCESS_OPTIONS, accessLabel, normalizeAccess } from '@/utils/projectAccess';

// ── Constants ────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'active',    label: 'активный' },
  { value: 'paused',    label: 'приостановлен' },
  { value: 'completed', label: 'завершён' },
  { value: 'archived',  label: 'архивирован' },
];

// Project access (confidentiality) vocabulary lives in @/utils/projectAccess
// (открытый / ограниченный; legacy `department` → ограниченный, not selectable).

// ── List + reference data ────────────────────────────────────────────
const projects = ref([]);
const activeUsers = ref([]);
const loading = ref(false);

async function loadList() {
  loading.value = true;
  try {
    const { data } = await api.get('/api/projects');
    projects.value = data;
  } finally {
    loading.value = false;
  }
}

async function loadUsers() {
  try {
    const { data } = await api.get('/api/users');
    activeUsers.value = data.filter((u) => u.active);
  } catch {}
}

onMounted(() => {
  loadList();
  loadUsers();
});

// ── Form helpers ─────────────────────────────────────────────────────
function emptyForm() {
  return {
    name: '',
    lead_id: '',
    description: '',
    start_date: '',
    due_date: '',
    status: 'active',
    confidentiality_level: 'public',
    department_id: null,
  };
}

async function loadOne(id) {
  const item = projects.value.find((p) => p.project_id === id);
  if (!item) throw new Error(`Проект #${id} не найден`);
  return {
    item,
    form: {
      name: item.name || '',
      lead_id: item.lead_id || '',
      description: item.description || '',
      start_date: item.start_date ? item.start_date.slice(0, 10) : '',
      due_date: item.due_date ? item.due_date.slice(0, 10) : '',
      status: item.status || 'active',
      confidentiality_level: item.confidentiality_level || 'public',
      department_id: item.department_id || null,
    },
  };
}

async function saveOne(form, mode, currentId) {
  const payload = {
    name: form.name.trim(),
    lead_id: form.lead_id || null,
    description: form.description || null,
    start_date: form.start_date || null,
    due_date: form.due_date || null,
    status: form.status,
    confidentiality_level: form.confidentiality_level,
    department_id: null, // project-access model is team-based; department_id is legacy-only
  };

  let response;
  if (mode === 'create') {
    response = await api.post('/api/projects', payload);
  } else {
    response = await api.put(`/api/projects/${currentId}`, payload);
  }
  return response.data;
}

function validate(form) {
  if (!form.name?.trim()) return 'Заполните название проекта';
  return true;
}

// ── Foundation hook ──────────────────────────────────────────────────
const ctx = useRowOpenForm({
  entityType: 'projects',
  idField: 'project_id',
  emptyForm,
  validate,
  loadOne,
  saveOne,
  list: { ref: projects, load: loadList },
  // No typed delete phrase, no delete-check (per vanilla):
  hasDeleteCheck: false,
  deletePhrase: null,
  deleteMessages: {
    success: 'Проект удалён',
    plainConfirm: 'Удалить проект? Действие необратимо. ' +
      'Удаление будет заблокировано, если проект связан с лентами, ' +
      'партиями электродов или аккумуляторами.',
  },
});

// The opened project's full list row — carries created_by, which the 8-field
// edit form omits but the members table needs to freeze the creator.
const openedProject = computed(
  () => projects.value.find((p) => p.project_id === ctx.currentId.value) || {},
);

// ── Visibility quick selector ────────────────────────────────────────
function setAccess(level) {
  ctx.form.value.confidentiality_level = level;
  ctx.form.value.department_id = null;
}

// ── Helpers ──────────────────────────────────────────────────────────
function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('ru-RU');
}

function statusLabel(status) {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label || status || '—';
}

function accessIcon(level) {
  if (level === 'confidential' || level === 'department') return 'pi pi-lock';
  return 'pi pi-globe';
}

// ── Filters ──────────────────────────────────────────────────────────
const filterState = ref({});
function onFiltersChanged({ state }) {
  filterState.value = state;
}

const filteredProjects = computed(() => {
  const s = filterState.value;
  if (!s || Object.values(s).every((v) => !v)) return projects.value;

  return projects.value.filter((p) => {
    if (s.status && p.status !== s.status) return false;
    if (s.confidentiality_level && normalizeAccess(p.confidentiality_level) !== s.confidentiality_level) return false;
    if (s.lead_id && String(p.lead_id) !== s.lead_id) return false;
    if (s.text) {
      const needle = String(s.text).toLowerCase();
      const haystack = [
        p.name, p.description, p.lead_name, p.created_by_name,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
});

const leadFilterOptions = computed(() =>
  activeUsers.value.map((u) => ({ value: String(u.user_id), label: u.name }))
);

const filters = computed(() => [
  { field: 'text', type: 'text', placeholder: 'Название, описание, руководитель...', label: 'Поиск' },
  {
    field: 'status',
    type: 'select',
    label: 'Статус',
    emptyOption: 'Все статусы',
    options: STATUS_OPTIONS,
  },
  {
    field: 'confidentiality_level',
    type: 'select',
    label: 'Доступ',
    emptyOption: 'Все уровни доступа',
    options: ACCESS_OPTIONS,
  },
  {
    field: 'lead_id',
    type: 'select',
    label: 'Руководитель',
    emptyOption: 'Все',
    options: leadFilterOptions.value,
  },
]);

// ── Columns ──────────────────────────────────────────────────────────
const columns = [
  { field: 'name', header: 'Название' },
  { field: 'description', header: 'Описание' },
  { field: 'confidentiality_level', header: 'Доступ', width: '160px' },
  { field: 'start_date', header: 'Начало', width: '110px' },
  { field: 'due_date', header: 'Окончание', width: '110px' },
  { field: 'status', header: 'Статус', width: '130px' },
  { field: 'lead_name', header: 'Руководитель', width: '160px' },
];

function formatMeta(item) {
  if (!item) return '';
  const parts = [`ID: ${item.project_id}`];
  if (item.lead_name) parts.push(`руководитель: ${item.lead_name}`);
  parts.push(`доступ: ${accessLabel(item.confidentiality_level)}`);
  return parts.join(' · ');
}

// ── List-row actions ─────────────────────────────────────────────────
const { onRowPrint, onHeaderPrint } = usePrintHandlers('projects', ctx);
</script>

<template>
  <RowOpenPage
    title="Проекты"
    icon="pi pi-briefcase"
    add-placeholder="+ Добавить проект"
    :list="filteredProjects"
    :columns="columns"
    :filters="filters"
    :row-actions="['print', 'duplicate']"
    :current-id="ctx.currentId.value"
    :mode="ctx.mode.value"
    id-field="project_id"
    :loading="loading"
    @create="(name) => ctx.openCreate(name)"
    @row-click="ctx.openEdit"
    @row-print="onRowPrint"
    @row-duplicate="ctx.openDuplicate"
    @filters-changed="onFiltersChanged"
  >
    <template #col-name="{ data }">
      <strong>{{ data.name || '— без названия —' }}</strong>
    </template>
    <template #col-description="{ data }">
      <span class="desc-text">{{ data.description || '' }}</span>
    </template>
    <template #col-confidentiality_level="{ data }">
      <span :class="['access-pill', `access-pill--${normalizeAccess(data.confidentiality_level || 'public')}`]">
        <i :class="accessIcon(data.confidentiality_level)"></i>
        {{ accessLabel(data.confidentiality_level) }}
      </span>
    </template>
    <template #col-start_date="{ data }">{{ formatDate(data.start_date) }}</template>
    <template #col-due_date="{ data }">{{ formatDate(data.due_date) }}</template>
    <template #col-status="{ data }">
      <span :class="['status-pill', `status-pill--${data.status || 'active'}`]">
        {{ statusLabel(data.status) }}
      </span>
    </template>
    <template #col-lead_name="{ data }">
      <span class="meta-text">{{ data.lead_name || '—' }}</span>
    </template>

    <template #opened-record>
      <OpenedRecordHeader
        :meta="formatMeta(ctx.currentItem.value)"
        :dirty="ctx.isDirty.value"
        :status="ctx.status.value"
        :show-print="ctx.mode.value === 'edit'"
        :show-delete="ctx.mode.value === 'edit'"
        @save="ctx.save"
        @print="onHeaderPrint"
        @exit="ctx.exit"
        @delete="ctx.deleteRecord"
      >
        <template #title>
          <EditableTitle
            v-model="ctx.form.value.name"
            placeholder="Новый проект"
            class="project-title"
          />
        </template>
      </OpenedRecordHeader>

      <div class="project-form">
        <div class="form-grid">
          <label for="proj-lead">Руководитель</label>
          <Select
            id="proj-lead"
            v-model="ctx.form.value.lead_id"
            :options="activeUsers"
            option-label="name"
            option-value="user_id"
            placeholder="— выбрать —"
            class="w-full"
            filter
            show-clear
          />

          <label for="proj-desc">Описание</label>
          <Textarea
            id="proj-desc"
            v-model="ctx.form.value.description"
            rows="3"
            placeholder="Описание проекта"
            class="w-full"
          />

          <label for="proj-start">Дата начала</label>
          <DateInputISO
            id="proj-start"
            v-model="ctx.form.value.start_date"
            class="w-full"
          />

          <label for="proj-due">Дата окончания</label>
          <DateInputISO
            id="proj-due"
            v-model="ctx.form.value.due_date"
            class="w-full"
          />

          <label for="proj-status">Статус</label>
          <Select
            id="proj-status"
            v-model="ctx.form.value.status"
            :options="STATUS_OPTIONS"
            option-label="label"
            option-value="value"
            class="w-full"
          />

          <label>Доступ</label>
          <div class="visibility-section">
            <div class="visibility-options">
              <button
                type="button"
                :class="['vis-btn', ctx.form.value.confidentiality_level === 'public' ? 'active' : '']"
                @click="setAccess('public')"
              >
                <i class="pi pi-globe"></i>
                <span class="vis-title">открытый</span>
                <span class="vis-hint">Видят все сотрудники</span>
              </button>
              <button
                type="button"
                :class="['vis-btn', ctx.form.value.confidentiality_level === 'confidential' ? 'active' : '']"
                @click="setAccess('confidential')"
              >
                <i class="pi pi-lock"></i>
                <span class="vis-title">ограниченный</span>
                <span class="vis-hint">Только явно допущенные</span>
              </button>
            </div>
            <div v-if="ctx.form.value.confidentiality_level === 'confidential'" class="vis-note">
              <i class="pi pi-info-circle"></i>
              Директор и админ видят проект всегда
            </div>
          </div>
        </div>

        <!-- Member management (the «Участники» surface; only for saved records) -->
        <ProjectMembersTable
          v-if="ctx.mode.value === 'edit'"
          :project-id="ctx.currentId.value"
          :project="{ lead_id: ctx.form.value.lead_id, created_by: openedProject.created_by, confidentiality_level: ctx.form.value.confidentiality_level }"
          :users="activeUsers"
        />
      </div>
    </template>
  </RowOpenPage>
</template>

<style scoped>
.project-title {
  font-size: 16px;
  font-weight: 600;
  color: #003274;
}
.project-form {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 10px 16px;
  align-items: center;
  max-width: 700px;
}
.form-grid label {
  font-size: 13px;
  font-weight: 500;
  color: #003274;
}
.w-full { width: 100%; }
.desc-text { font-size: 13px; color: rgba(0, 50, 116, 0.6); }
.meta-text { color: #6B7280; font-size: 13px; }

/* ── Status pill ── */
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
.status-pill--paused {
  background: rgba(211, 167, 84, 0.12);
  color: #8a6d2b;
  border: 0.5px solid rgba(211, 167, 84, 0.3);
}
.status-pill--completed {
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
  border: 0.5px solid rgba(0, 50, 116, 0.15);
}
.status-pill--archived {
  background: rgba(0, 50, 116, 0.06);
  color: rgba(0, 50, 116, 0.45);
  border: 0.5px solid rgba(0, 50, 116, 0.12);
}

/* ── Access pill (table) ── */
.access-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.access-pill .pi { font-size: 10px; }
.access-pill--public {
  background: rgba(82, 201, 166, 0.12);
  color: #1a8a64;
}
.access-pill--confidential {
  background: rgba(176, 0, 32, 0.1);
  color: #b00020;
}

/* ── Visibility selector ── */
.visibility-section { display: flex; flex-direction: column; }
.visibility-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.vis-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 8px;
  border: 1.5px solid rgba(0, 50, 116, 0.12);
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  text-align: center;
}
.vis-btn .pi { font-size: 16px; color: rgba(0, 50, 116, 0.5); }
.vis-btn .vis-title {
  font-size: 13px;
  font-weight: 600;
  color: #003274;
}
.vis-btn .vis-hint {
  font-size: 10px;
  color: #6B7280;
  line-height: 1.3;
}
.vis-btn:hover {
  border-color: rgba(0, 50, 116, 0.3);
  background: rgba(0, 50, 116, 0.02);
}
.vis-btn.active {
  border-color: #003274;
  background: rgba(0, 50, 116, 0.06);
}
.vis-btn.active .pi { color: #003274; }

.vis-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 0.5rem;
  padding: 6px 10px;
  font-size: 11px;
  color: rgba(0, 50, 116, 0.55);
  background: rgba(211, 167, 84, 0.10);
  border: 1px solid rgba(211, 167, 84, 0.25);
  border-radius: 6px;
}
.vis-note .pi { font-size: 11px; color: rgba(211, 167, 84, 0.8); }
</style>
