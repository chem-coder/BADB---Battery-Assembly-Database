<script setup>
/**
 * ProjectMembersTable — the «Участники» surface for one project.
 *
 * A table of ALL users: check to add as a member, set the 4-level access
 * (Администратор / Обычный / Просмотр / Нет доступа), an optional expiry, and an
 * optional functional role («Роль в команде»). Adding is fast (check + defaults);
 * details are optional.
 *
 * Soft-disable, not delete: unchecking a member keeps the participant record and
 * sets «Нет доступа» — the person is greyed «отключён», re-check to reinstate.
 * A genuine mistake can be hard-deleted (admin-only) ONLY when the user created
 * no lab records on the project (server-checked via the delete-check endpoint).
 * The lead / creator row is frozen-checked.
 *
 * Backend wiring:
 *   POST   /api/projects/:id/participants            (add member + role)
 *   PUT    /api/projects/:id/participants/:pid        (role)
 *   POST   /api/projects/:id/access                   (level + expiry; none = disable)
 *   GET    /api/projects/:id/participants/:pid/delete-check
 *   DELETE /api/projects/:id/participants/:pid        (guarded hard delete)
 */
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import api from '@/services/api';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '@/stores/auth';
import { toastApiError } from '@/utils/errorClassifier';
import { GRANT_LEVEL_OPTIONS, DEFAULT_GRANT_LEVEL, grantLevelLabel } from '@/utils/projectAccess';
import Button from 'primevue/button';
import Select from 'primevue/select';
import DatePicker from 'primevue/datepicker';

const props = defineProps({
  projectId: { type: [Number, String, null], default: null },
  // { lead_id, created_by, confidentiality_level } — lead/creator are frozen
  project: { type: Object, default: () => ({}) },
  // all active users (parent already loads /api/users)
  users: { type: Array, required: true },
});
const emit = defineEmits(['saved']);

const toast = useToast();
const { isAdmin } = storeToRefs(useAuthStore()); // gates the hard-delete escape hatch
const loading = ref(false);
const saving = ref(false);
const search = ref('');

const rows = ref([]);       // working copy (editable)
const original = ref({});   // user_id -> snapshot for diffing

const todayMinDate = new Date();

function isFrozen(userId) {
  const id = Number(userId);
  return id === Number(props.project?.lead_id) || id === Number(props.project?.created_by);
}

async function load(id) {
  if (!id) { rows.value = []; original.value = {}; return; }
  loading.value = true;
  try {
    const [pp, acc] = await Promise.all([
      api.get(`/api/projects/${id}/participants`),
      api.get(`/api/projects/${id}/access`),
    ]);
    const partByUser = new Map(pp.data.map((p) => [p.user_id, p]));
    // GET /access returns BOTH the implicit participant `view` row and the
    // explicit user grant per member. Prefer the explicit grant — it carries the
    // real level (edit/admin/none) and expiry.
    const accByUser = new Map();
    for (const a of acc.data) {
      if (a.grantee_type === 'department') continue;
      const existing = accByUser.get(a.grantee_id);
      if (!existing || a.grantee_type === 'user') accByUser.set(a.grantee_id, a);
    }
    const snap = {};
    rows.value = props.users.map((u) => {
      const part = partByUser.get(u.user_id);
      const a = accByUser.get(u.user_id);
      const frozen = isFrozen(u.user_id);
      const isMember = !!part || frozen;
      const level = a?.access_level || DEFAULT_GRANT_LEVEL;
      const isExpired = !!a?.is_expired;
      // active = a member whose access is neither denied nor expired
      const isActive = isMember && level !== 'none' && !isExpired;
      const row = {
        user_id: u.user_id,
        name: u.name,
        position: u.position,
        department_name: u.department_name,
        frozen,
        isMember,
        participant_id: part?.participant_id || null,
        checked: frozen || isActive,
        level: level === 'none' ? DEFAULT_GRANT_LEVEL : level,
        storedLevel: level,
        expiresAt: a?.expires_at ? new Date(a.expires_at) : null,
        is_expired: isExpired,
        role: part?.role_in_team || '',
      };
      snap[u.user_id] = {
        checked: row.checked,
        isMember,
        participant_id: row.participant_id,
        level: row.level,
        expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
        role: row.role,
      };
      return row;
    });
    original.value = snap;
  } catch (err) {
    toastApiError(toast, err);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => props.projectId, (id) => load(id), { immediate: true });

const filteredRows = computed(() => {
  const q = search.value.toLowerCase().trim();
  if (!q) return rows.value;
  return rows.value.filter((r) =>
    (r.name || '').toLowerCase().includes(q) ||
    (r.position || '').toLowerCase().includes(q) ||
    (r.department_name || '').toLowerCase().includes(q),
  );
});

const memberCount = computed(() => rows.value.filter((r) => r.checked).length);

function rowChanged(r) {
  const o = original.value[r.user_id];
  if (!o) return r.checked;
  return (
    r.checked !== o.checked ||
    (r.checked && (
      r.level !== o.level ||
      (r.expiresAt ? r.expiresAt.getTime() : null) !== o.expiresAt
    )) ||
    (r.role || '') !== (o.role || '')
  );
}
const dirtyCount = computed(() => rows.value.filter(rowChanged).length);

function toggle(r) {
  if (r.frozen || saving.value) return;
  r.checked = !r.checked;
  // re-checking a disabled member reinstates them at the default level
  if (r.checked && r.level === 'none') r.level = DEFAULT_GRANT_LEVEL;
}

async function save() {
  const pid = props.projectId;
  if (!pid || saving.value) return;
  saving.value = true;
  try {
    for (const r of rows.value) {
      if (!rowChanged(r)) continue;
      const o = original.value[r.user_id] || {};
      const expIso = r.expiresAt ? new Date(r.expiresAt).toISOString() : null;
      const level = r.level === 'none' ? DEFAULT_GRANT_LEVEL : r.level;

      if (r.checked && !o.checked) {
        // becoming active — add participant if not already one, then set access
        if (!o.isMember) {
          await api.post(`/api/projects/${pid}/participants`, {
            user_id: r.user_id,
            role_in_team: r.role || '',
          });
        }
        await api.post(`/api/projects/${pid}/access`, {
          user_ids: [r.user_id],
          access_level: level,
          expires_at: expIso,
        });
      } else if (!r.checked && o.checked) {
        // soft-disable — keep the participant, deny access
        await api.post(`/api/projects/${pid}/access`, {
          user_ids: [r.user_id],
          access_level: 'none',
        });
      } else if (r.checked && o.checked) {
        // active member — push level/expiry if changed
        if (r.level !== o.level || (r.expiresAt ? r.expiresAt.getTime() : null) !== o.expiresAt) {
          await api.post(`/api/projects/${pid}/access`, {
            user_ids: [r.user_id],
            access_level: level,
            expires_at: expIso,
          });
        }
      }

      // role change for an existing participant (new members set it at creation)
      if (r.participant_id && (r.role || '') !== (o.role || '')) {
        await api.put(`/api/projects/${pid}/participants/${r.participant_id}`, {
          role_in_team: r.role || '',
        });
      }
    }
    toast.add({ severity: 'success', summary: 'Участники сохранены', life: 2500 });
    await load(pid);
    emit('saved');
  } catch (err) {
    toastApiError(toast, err);
  } finally {
    saving.value = false;
  }
}

async function hardDelete(r) {
  const pid = props.projectId;
  if (!pid || !r.participant_id) return;
  try {
    const { data } = await api.get(`/api/projects/${pid}/participants/${r.participant_id}/delete-check`);
    if (!data.can_delete) {
      toast.add({ severity: 'warn', summary: 'Удаление недоступно', detail: data.message, life: 6000 });
      return;
    }
    if (!window.confirm(`Удалить ${r.name} из участников без следа? Это возможно, т.к. нет связанных лабораторных записей.`)) return;
    await api.delete(`/api/projects/${pid}/participants/${r.participant_id}`);
    toast.add({ severity: 'success', summary: 'Участник удалён', life: 2500 });
    await load(pid);
    emit('saved');
  } catch (err) {
    toastApiError(toast, err);
  }
}

function reset() {
  load(props.projectId);
}
</script>

<template>
  <div class="members-panel">
    <div class="members-header">
      <span class="section-label">Участники проекта</span>
      <span class="member-count">{{ memberCount }} в команде</span>
      <div class="members-search">
        <i class="pi pi-search"></i>
        <input v-model="search" placeholder="Поиск по имени, должности, отделу…" />
      </div>
      <div class="members-actions">
        <Button label="Отмена" size="small" text :disabled="!dirtyCount || saving" @click="reset" />
        <Button
          :label="dirtyCount ? `Сохранить (${dirtyCount})` : 'Сохранить'"
          icon="pi pi-check"
          size="small"
          :disabled="!dirtyCount || saving"
          :loading="saving"
          @click="save"
        />
      </div>
    </div>

    <div v-if="loading" class="members-loading">
      <i class="pi pi-spin pi-spinner"></i> Загрузка…
    </div>

    <div v-else class="members-table-wrap">
      <table class="members-table">
        <thead>
          <tr>
            <th class="col-check"></th>
            <th class="col-name">Сотрудник</th>
            <th class="col-access">Доступ</th>
            <th class="col-expires">Истекает</th>
            <th class="col-role">Роль в команде (функционал)</th>
            <th class="col-act"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in filteredRows"
            :key="r.user_id"
            :class="['member-row', r.checked ? 'member-row--active' : (r.isMember ? 'member-row--disabled' : '')]"
          >
            <td class="col-check">
              <input
                type="checkbox"
                :checked="r.checked"
                :disabled="r.frozen || saving"
                :title="r.frozen ? 'Руководитель / создатель — снять нельзя' : ''"
                @change="toggle(r)"
              />
            </td>
            <td class="col-name">
              <div class="m-name">
                {{ r.name }}
                <span v-if="r.frozen" class="m-frozen-badge">рук./создатель</span>
                <span v-else-if="r.isMember && !r.checked" class="m-disabled-badge">отключён</span>
              </div>
              <div class="m-sub">{{ [r.position, r.department_name].filter(Boolean).join(' · ') }}</div>
            </td>
            <td class="col-access">
              <Select
                v-if="r.checked"
                v-model="r.level"
                :options="GRANT_LEVEL_OPTIONS"
                option-label="label"
                option-value="value"
                :disabled="r.frozen || saving"
                class="m-level"
              />
              <span v-else-if="r.isMember" class="m-muted">{{ grantLevelLabel('none') }}</span>
              <span v-else class="m-muted">—</span>
            </td>
            <td class="col-expires">
              <DatePicker
                v-if="r.checked"
                v-model="r.expiresAt"
                placeholder="бессрочно"
                date-format="dd.mm.yy"
                :first-day-of-week="1"
                :min-date="todayMinDate"
                show-button-bar
                :disabled="saving"
                class="m-expires"
              />
              <span v-else class="m-muted">—</span>
            </td>
            <td class="col-role">
              <input
                v-if="r.checked"
                v-model="r.role"
                placeholder="напр. инженер-технолог"
                class="m-role-input"
                :disabled="saving"
              />
              <span v-else class="m-muted">—</span>
            </td>
            <td class="col-act">
              <Button
                v-if="isAdmin && r.isMember && !r.frozen && !r.checked"
                icon="pi pi-trash"
                severity="danger"
                text
                size="small"
                title="Удалить запись (только если нет лабораторных записей)"
                @click="hardDelete(r)"
              />
            </td>
          </tr>
          <tr v-if="!filteredRows.length">
            <td colspan="6" class="members-empty">Никого не найдено</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="members-hint">
      Снятие галочки <strong>отключает</strong> доступ (запись участника сохраняется — лабораторные
      данные остаются связаны). Повторная отметка восстанавливает доступ. «Истекает» по умолчанию
      бессрочно; по истечении участник понижается до просмотра (открытый проект) или «нет доступа»
      (ограниченный).
    </p>
  </div>
</template>

<style scoped>
.members-panel {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(0, 50, 116, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.members-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}
.member-count { font-size: 11px; font-weight: 600; color: rgba(0, 50, 116, 0.45); }
.members-search {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(180, 210, 255, 0.55);
  border-radius: 7px;
  flex: 1;
  min-width: 200px;
}
.members-search i { font-size: 11px; color: #9CA3AF; }
.members-search input { border: none; background: transparent; font-size: 12px; flex: 1; outline: none; font-family: inherit; }
.members-actions { display: flex; gap: 0.4rem; margin-left: auto; }

.members-loading, .members-empty {
  padding: 2rem; text-align: center; color: rgba(0, 50, 116, 0.4); font-size: 13px;
}

.members-table-wrap {
  max-height: 460px;
  overflow-y: auto;
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
  overscroll-behavior: contain;
}
.members-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.members-table thead th {
  position: sticky; top: 0; z-index: 1;
  background: #f3f7fd;
  text-align: left;
  padding: 7px 10px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(0, 50, 116, 0.55);
  border-bottom: 1px solid rgba(0, 50, 116, 0.1);
}
.member-row td { padding: 6px 10px; border-bottom: 1px solid rgba(0, 50, 116, 0.05); vertical-align: middle; }
.member-row:nth-child(even) td { background: rgba(0, 50, 116, 0.012); }
.member-row--active td { background: rgba(82, 201, 166, 0.06); }
.member-row--disabled td { background: rgba(0, 0, 0, 0.02); }
.member-row--disabled .m-name { color: #9CA3AF; }

.col-check { width: 34px; text-align: center; }
.col-check input { cursor: pointer; width: 15px; height: 15px; }
.col-access { width: 160px; }
.col-expires { width: 150px; }
.col-act { width: 36px; text-align: center; }

.m-name { font-weight: 600; color: #003274; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.m-sub { font-size: 11px; color: #8b97a8; margin-top: 1px; }
.m-frozen-badge {
  font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
  color: #8E44AD; background: rgba(142, 68, 173, 0.1); padding: 1px 6px; border-radius: 10px;
}
.m-disabled-badge {
  font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
  color: #b00020; background: rgba(176, 0, 32, 0.08); padding: 1px 6px; border-radius: 10px;
}
.m-muted { color: #b8c2d0; font-size: 12px; }
.m-level { width: 100%; }
.m-expires { width: 100%; }
.m-role-input {
  width: 100%;
  border: 1px solid rgba(180, 210, 255, 0.55);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  background: #fff;
}
.m-role-input:focus { border-color: rgba(0, 50, 116, 0.4); }

.members-hint { font-size: 11px; color: #8b97a8; line-height: 1.5; margin: 0; }
</style>
