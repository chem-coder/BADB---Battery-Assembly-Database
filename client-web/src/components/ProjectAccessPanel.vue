<script setup>
/**
 * ProjectAccessPanel — explicit user/department access management for a
 * saved Project record. Extracted from the inline section in the original
 * ProjectsPage.vue to keep the page-level migration thin.
 *
 * Self-contained: owns the access list, grant form state, copy-from-project
 * state, presets, and all related API calls. The parent only passes:
 *
 *   - projectId: number — the current opened project ID
 *   - confidentialityLevel: 'public' | 'department' | 'confidential'
 *     (controls the "явно допущенные" hint at the top)
 *   - users: User[] — active users for the user MultiSelect (parent loads
 *     /api/users so the same array can be reused for the Lead select)
 *   - departments: Department[] — for the department MultiSelect and to
 *     show department names in the access list
 *   - projectsForCopy: Project[] — all visible projects, used by the
 *     "copy access from project" feature (parent already loads /api/projects
 *     for the list page)
 *
 * The component watches `projectId` and reloads the access list when it
 * changes. When projectId is null, the component renders nothing.
 *
 * Used by:
 *   - client-web/src/pages/reference/ProjectsPage.vue
 *
 * Backend routes consumed:
 *   GET    /api/projects/:id/access
 *   GET    /api/projects/:id/access/presets
 *   POST   /api/projects/:id/access
 *   POST   /api/projects/:id/access/copy
 *   DELETE /api/projects/:id/access/user/:userId
 *   DELETE /api/projects/:id/access/department/:deptId
 */
import { ref, computed, watch } from 'vue';
import { useToast } from 'primevue/usetoast';
import api from '@/services/api';
import { toastApiError } from '@/utils/errorClassifier';
import { GRANT_LEVEL_OPTIONS, grantLevelLabel } from '@/utils/projectAccess';

import Button from 'primevue/button';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import DatePicker from 'primevue/datepicker';

const props = defineProps({
  projectId: { type: [Number, String, null], default: null },
  confidentialityLevel: { type: String, default: 'public' },
  users: { type: Array, required: true },
  projectsForCopy: { type: Array, required: true },
});

const toast = useToast();

// ── Access list ──────────────────────────────────────────────────────
const accessList = ref([]);
const accessLoading = ref(false);

async function loadAccess(id) {
  if (id == null) {
    accessList.value = [];
    return;
  }
  accessLoading.value = true;
  try {
    const { data } = await api.get(`/api/projects/${id}/access`);
    // Individual access only — legacy department grants are not shown/managed.
    accessList.value = data.filter((a) => a.grantee_type !== 'department');
  } catch {
    accessList.value = [];
  } finally {
    accessLoading.value = false;
  }
}

// ── Presets ──────────────────────────────────────────────────────────
const presets = ref([]);

async function loadPresets(id) {
  if (id == null) {
    presets.value = [];
    return;
  }
  try {
    const { data } = await api.get(`/api/projects/${id}/access/presets`);
    presets.value = data.presets || [];
  } catch {
    presets.value = [];
  }
}

// Reload everything when projectId changes (incl. initial mount).
watch(
  () => props.projectId,
  (id) => {
    loadAccess(id);
    loadPresets(id);
  },
  { immediate: true }
);

// ── Grant form state (individual users only) ────────────────────────
const grantSelectedUsers = ref([]);          // number[]
const grantLevel = ref('edit'); // обычный — members are elevated above view by default
const grantExpiresDate = ref(null);          // Date | null
const grantExpiresPreset = ref(null);        // null | 7 | 30 | 90

// Min date for expiry picker
const todayMinDate = computed(() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
});

// Users grouped by department for MultiSelect
const groupedUsers = computed(() => {
  const byDept = new Map();
  for (const u of props.users) {
    const key = u.department_id ?? 0;
    const label = u.department_name || 'Без отдела';
    if (!byDept.has(key)) byDept.set(key, { label, items: [] });
    byDept.get(key).items.push({
      user_id: u.user_id,
      name: u.name,
      position: u.position || '',
      department_name: u.department_name || '',
    });
  }
  return Array.from(byDept.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((g) => ({
      ...g,
      items: g.items.sort((a, b) => a.name.localeCompare(b.name)),
    }));
});

// Projects for "copy from", excluding current
const copyableProjects = computed(() =>
  props.projectsForCopy.filter((p) => p.project_id !== props.projectId)
);

function resetGrantForm() {
  grantSelectedUsers.value = [];
  grantLevel.value = 'edit';
  grantExpiresDate.value = null;
  grantExpiresPreset.value = null;
}

// Reset grant form when switching to a different project
watch(() => props.projectId, () => resetGrantForm());

async function grantAccess() {
  if (props.projectId == null) return;

  if (!grantSelectedUsers.value.length) {
    toast.add({ severity: 'warn', summary: 'Выберите пользователей', life: 2500 });
    return;
  }

  const body = {
    access_level: grantLevel.value,
    user_ids: grantSelectedUsers.value,
  };

  if (grantExpiresDate.value) {
    body.expires_at = grantExpiresDate.value.toISOString();
  } else if (grantExpiresPreset.value) {
    body.expires_in_days = grantExpiresPreset.value;
  }

  try {
    const { data } = await api.post(`/api/projects/${props.projectId}/access`, body);
    resetGrantForm();
    await loadAccess(props.projectId);
    toast.add({
      severity: 'success',
      summary: 'Доступ выдан',
      detail: `Пользователей: ${data.granted_users}`,
      life: 2500,
    });
  } catch (err) {
    toastApiError(toast, err, 'Не удалось выдать доступ');
  }
}

async function revokeAccess(entry) {
  if (props.projectId == null) return;
  if (!confirm(`Отозвать доступ у "${entry.grantee_name}"?`)) return;

  try {
    await api.delete(`/api/projects/${props.projectId}/access/user/${entry.grantee_id}`);
    await loadAccess(props.projectId);
    toast.add({ severity: 'success', summary: 'Доступ отозван', life: 2000 });
  } catch (err) {
    toastApiError(toast, err, 'Не удалось отозвать доступ');
  }
}

function applyPreset(preset) {
  if (!preset.user_ids.length) {
    toast.add({
      severity: 'info',
      summary: 'Пусто',
      detail: `${preset.label}: нет пользователей`,
      life: 2500,
    });
    return;
  }
  grantSelectedUsers.value = [...preset.user_ids];
  toast.add({
    severity: 'info',
    summary: `Выбрано: ${preset.user_ids.length}`,
    detail: preset.label,
    life: 2000,
  });
}

// ── Copy access ──────────────────────────────────────────────────────
const copyFromProjectId = ref(null);
const copyOverwrite = ref(false);
const copyBusy = ref(false);

watch(() => props.projectId, () => {
  copyFromProjectId.value = null;
  copyOverwrite.value = false;
});

async function copyAccessFromProject() {
  if (!copyFromProjectId.value || props.projectId == null) return;
  copyBusy.value = true;
  try {
    const { data } = await api.post(`/api/projects/${props.projectId}/access/copy`, {
      source_project_id: copyFromProjectId.value,
      overwrite: copyOverwrite.value,
    });
    await loadAccess(props.projectId);
    copyFromProjectId.value = null;
    copyOverwrite.value = false;
    toast.add({
      severity: 'success',
      summary: 'Доступ скопирован',
      detail: `Пользователей: ${data.copied_users}`,
      life: 3000,
    });
  } catch (err) {
    toastApiError(toast, err, 'Не удалось скопировать');
  } finally {
    copyBusy.value = false;
  }
}

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('ru-RU');
}

const accessHintText = computed(() => {
  if (props.confidentialityLevel === 'public') {
    return 'Проект открыт для всех — явный список не обязателен.';
  }
  return '';
});
</script>

<template>
  <div v-if="projectId != null" class="project-access-panel">
    <div class="access-header">
      <span class="section-label">Явно допущенные пользователи</span>
    </div>

    <div v-if="confidentialityLevel === 'public'" class="access-hint">
      <i class="pi pi-info-circle"></i>
      {{ accessHintText }}
    </div>

    <!-- ─── Quick actions (presets + copy from project) ─── -->
    <div class="access-quick">
      <div class="access-quick-label">Быстрые действия</div>
      <div class="access-quick-buttons">
        <Button
          v-for="p in presets"
          :key="p.key"
          size="small"
          outlined
          :label="`${p.label} (${p.count})`"
          :disabled="p.count === 0"
          :title="p.description"
          @click="applyPreset(p)"
        />
      </div>
      <div class="access-copy-row">
        <Select
          v-model="copyFromProjectId"
          :options="copyableProjects"
          option-label="name"
          option-value="project_id"
          placeholder="Скопировать доступ из проекта…"
          class="access-copy-select"
          filter
          show-clear
        />
        <label class="access-copy-overwrite">
          <input type="checkbox" v-model="copyOverwrite" />
          Перезаписать
        </label>
        <Button
          icon="pi pi-copy"
          label="Применить"
          size="small"
          :disabled="!copyFromProjectId || copyBusy"
          @click="copyAccessFromProject"
        />
      </div>
    </div>

    <!-- ─── Grant form ─── -->
    <div class="grant-box">
      <MultiSelect
        v-model="grantSelectedUsers"
        :options="groupedUsers"
        option-label="name"
        option-value="user_id"
        option-group-label="label"
        option-group-children="items"
        filter
        :filter-fields="['name', 'position', 'department_name']"
        placeholder="— выбрать сотрудников —"
        :max-selected-labels="2"
        selected-items-label="Выбрано: {0}"
        :show-toggle-all="true"
        class="grant-multiselect"
      >
        <template #option="slotProps">
          <div class="user-option">
            <span class="user-option-name">{{ slotProps.option.name }}</span>
            <span v-if="slotProps.option.position" class="user-option-pos">{{ slotProps.option.position }}</span>
          </div>
        </template>
      </MultiSelect>

      <div class="grant-row">
        <Select
          v-model="grantLevel"
          :options="GRANT_LEVEL_OPTIONS"
          option-label="label"
          option-value="value"
          class="grant-level"
        />

        <div class="grant-expires">
          <span class="grant-expires-label">Истекает:</span>
          <div class="grant-expires-presets">
            <button
              v-for="d in [7, 30, 90]"
              :key="d"
              type="button"
              :class="['expires-chip', grantExpiresPreset === d && !grantExpiresDate ? 'active' : '']"
              @click="grantExpiresPreset = (grantExpiresPreset === d ? null : d); grantExpiresDate = null"
            >{{ d }} дн.</button>
            <button
              type="button"
              :class="['expires-chip', !grantExpiresPreset && !grantExpiresDate ? 'active' : '']"
              @click="grantExpiresPreset = null; grantExpiresDate = null"
            >Бессрочно</button>
          </div>
          <DatePicker
            v-model="grantExpiresDate"
            placeholder="или дата…"
            date-format="dd.mm.yy"
            :first-day-of-week="1"
            :min-date="todayMinDate"
            show-button-bar
            class="grant-expires-date"
            @update:model-value="grantExpiresPreset = null"
          />
        </div>

        <Button
          label="Выдать"
          icon="pi pi-plus"
          size="small"
          :disabled="!grantSelectedUsers.length"
          @click="grantAccess"
        />
      </div>
    </div>

    <!-- ─── Access list ─── -->
    <div class="access-list">
      <div
        v-for="a in accessList"
        :key="`${a.grantee_type}-${a.grantee_id}`"
        :class="['access-row', a.is_expired ? 'access-row--expired' : '']"
      >
        <i class="pi pi-user access-icon" title="Пользователь"></i>
        <span class="access-name">{{ a.grantee_name }}</span>
        <span class="access-dept">{{ a.department_name || '' }}</span>
        <span v-if="a.expires_at" class="access-expires" :title="new Date(a.expires_at).toLocaleString('ru-RU')">
          <i class="pi pi-clock"></i>
          {{ a.is_expired ? 'истёк' : `до ${formatDate(a.expires_at)}` }}
        </span>
        <span :class="['access-level', `access-level--${a.access_level}`]">
          {{ grantLevelLabel(a.access_level) }}
        </span>
        <Button icon="pi pi-times" severity="danger" text size="small" @click="revokeAccess(a)" title="Отозвать доступ" />
      </div>
      <div v-if="!accessList.length && !accessLoading" class="access-empty">Нет явных допусков</div>
    </div>
  </div>
</template>

<style scoped>
.project-access-panel {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(0, 50, 116, 0.08);
}
.access-header { margin-bottom: 0.5rem; }
.section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}
.access-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  margin-bottom: 0.5rem;
  font-size: 12px;
  color: rgba(0, 50, 116, 0.55);
  background: rgba(0, 50, 116, 0.04);
  border-radius: 6px;
}
.access-hint .pi { font-size: 12px; color: rgba(0, 50, 116, 0.4); }

/* ── Quick actions (presets + copy) ── */
.access-quick {
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  background: rgba(211, 167, 84, 0.08);
  border: 1px solid rgba(211, 167, 84, 0.2);
  border-radius: 8px;
}
.access-quick-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.55);
  margin-bottom: 0.5rem;
}
.access-quick-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}
.access-copy-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.access-copy-select { flex: 1; min-width: 200px; }
.access-copy-overwrite {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #6B7280;
  white-space: nowrap;
  cursor: pointer;
}

/* ── Grant box ── */
.grant-box {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  background: rgba(0, 50, 116, 0.03);
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
}
.grant-target-toggle { align-self: flex-start; }
.grant-multiselect { width: 100%; }
.grant-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 0;
}
.grant-level { width: 170px; }

.user-option {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.user-option-name { font-size: 13px; font-weight: 500; color: #003274; }
.user-option-pos { font-size: 11px; color: #6B7280; }

/* ── Expiry row ── */
.grant-expires {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  flex: 1;
  min-width: 280px;
}
.grant-expires-label {
  font-size: 11px;
  color: #6B7280;
  font-weight: 500;
}
.grant-expires-presets { display: flex; gap: 3px; }
.expires-chip {
  padding: 3px 10px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  background: white;
  border-radius: 12px;
  font-size: 11px;
  color: #003274;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.expires-chip:hover { border-color: rgba(0, 50, 116, 0.35); }
.expires-chip.active {
  background: #003274;
  color: white;
  border-color: #003274;
}
.grant-expires-date :deep(.p-datepicker-input) {
  width: 130px !important;
  font-size: 12px;
}

/* ── Access list ── */
.access-list { display: flex; flex-direction: column; gap: 0; }
.access-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.25rem;
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
  font-size: 13px;
}
.access-row:last-child { border-bottom: none; }
.access-icon {
  color: rgba(0, 50, 116, 0.45);
  font-size: 14px;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}
.access-name { font-weight: 600; color: #003274; flex: 1; }
.access-dept { color: #6B7280; font-size: 12px; min-width: 80px; }
.access-level {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 10px;
}
.access-level--view { background: rgba(0, 50, 116, 0.08); color: #003274; }
.access-level--edit { background: rgba(82, 201, 166, 0.12); color: #1a8a64; }
.access-level--admin { background: rgba(176, 0, 32, 0.1); color: #b00020; }
.access-empty { color: #6B7280; font-size: 12px; padding: 0.5rem 0; }
.access-expires {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: #8a6d2b;
  background: rgba(211, 167, 84, 0.12);
  border: 0.5px solid rgba(211, 167, 84, 0.3);
  padding: 1px 6px;
  border-radius: 8px;
  white-space: nowrap;
}
.access-expires .pi { font-size: 9px; }
.access-row--expired { opacity: 0.55; }
.access-row--expired .access-name { text-decoration: line-through; }
.access-row--expired .access-expires {
  color: #b00020;
  background: rgba(176, 0, 32, 0.08);
  border-color: rgba(176, 0, 32, 0.25);
}
</style>
