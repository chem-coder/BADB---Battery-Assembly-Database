<script setup>
/**
 * ProjectMembersTable — two views for one project's team.
 *
 *  «Выбор команды» (select): a compact table of ALL users — checkbox + name +
 *      access level. Check to add, set level. Used to build/edit the roster.
 *  «Участники» (participants, default): only the people on the team. Each is a
 *      bold name with a side/down expander; expanded shows their dept · title
 *      (tiny grey), an inline-editable project role, and Dima's expiry controls.
 *
 * Membership = a participant row OR an explicit user grant. Unchecking = soft
 * disable («Нет доступа», record kept). Both views share one rows[] + one Save.
 * See docs/future/project_member_flow.md.
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
  project: { type: Object, default: () => ({}) },
  users: { type: Array, required: true },
});
const emit = defineEmits(['saved']);

const toast = useToast();
const { isAdmin } = storeToRefs(useAuthStore());

const loading = ref(false);
const saving = ref(false);
const search = ref('');
const view = ref('participants'); // 'participants' | 'select'
const rows = ref([]);
const original = ref({});
const expanded = ref(new Set());    // user_ids expanded in the participants view
const editingRole = ref(new Set()); // user_ids whose role is mid-edit

const todayMinDate = new Date();
const DURATIONS = [7, 30, 90];

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
    // GET /access returns the implicit participant `view` row AND the explicit
    // user grant; prefer the explicit grant (real level + expiry).
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
      const grantLevel = a?.access_level || null;
      const grantExpired = !!a?.is_expired;
      // "added" = on the roster OR holding an explicit user grant
      const member = !!part || (!!a && a.grantee_type === 'user') || frozen;
      const denied = grantLevel === 'none' || grantExpired;
      const checked = frozen || (member && !denied);
      const row = {
        user_id: u.user_id,
        name: u.name,
        position: u.position,
        department_name: u.department_name,
        frozen,
        member,
        participant_id: part?.participant_id || null,
        checked,
        level: grantLevel && grantLevel !== 'none' ? grantLevel : DEFAULT_GRANT_LEVEL,
        expiresAt: a?.expires_at ? new Date(a.expires_at) : null,
        is_expired: grantExpired,
        role: part?.role_in_team || '',
      };
      snap[u.user_id] = {
        checked,
        member,
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

watch(() => props.projectId, (id) => { expanded.value = new Set(); load(id); }, { immediate: true });

const matchesSearch = (r) => {
  const q = search.value.toLowerCase().trim();
  if (!q) return true;
  return (r.name || '').toLowerCase().includes(q) ||
    (r.position || '').toLowerCase().includes(q) ||
    (r.department_name || '').toLowerCase().includes(q);
};

// select view = all users; participants view = members only (active or disabled)
const selectRows = computed(() => rows.value.filter(matchesSearch));
const participantRows = computed(() => rows.value.filter((r) => r.member && matchesSearch(r)));
const memberCount = computed(() => rows.value.filter((r) => r.checked).length);

function rowChanged(r) {
  const o = original.value[r.user_id];
  if (!o) return r.checked;
  return (
    r.checked !== o.checked ||
    (r.checked && (r.level !== o.level || (r.expiresAt ? r.expiresAt.getTime() : null) !== o.expiresAt)) ||
    (r.role || '') !== (o.role || '')
  );
}
const dirtyCount = computed(() => rows.value.filter(rowChanged).length);

function toggle(r) {
  if (r.frozen || saving.value) return;
  r.checked = !r.checked;
  if (r.checked && r.level === 'none') r.level = DEFAULT_GRANT_LEVEL;
}

// ── participants-view interactions ───────────────────────────────────
function toggleExpand(uid) {
  const s = new Set(expanded.value);
  s.has(uid) ? s.delete(uid) : s.add(uid);
  expanded.value = s;
}
function startRoleEdit(uid) { editingRole.value = new Set(editingRole.value).add(uid); }
function endRoleEdit(uid) { const s = new Set(editingRole.value); s.delete(uid); editingRole.value = s; }
function setDuration(r, days) {
  r.expiresAt = days == null ? null : new Date(Date.now() + days * 86400000);
}

async function save() {
  const pid = props.projectId;
  if (!pid || saving.value) return;
  saving.value = true;
  const failed = [];
  let okCount = 0;

  for (const r of rows.value) {
    if (!rowChanged(r)) continue;
    const o = original.value[r.user_id] || {};
    const expIso = r.expiresAt ? new Date(r.expiresAt).toISOString() : null;
    const level = r.level === 'none' ? DEFAULT_GRANT_LEVEL : r.level;
    try {
      if (r.checked && !o.checked) {
        if (!o.participant_id) {
          try {
            await api.post(`/api/projects/${pid}/participants`, { user_id: r.user_id, role_in_team: r.role || '' });
          } catch (e) {
            if (e?.response?.status !== 409) throw e;
          }
        }
        await api.post(`/api/projects/${pid}/access`, { user_ids: [r.user_id], access_level: level, expires_at: expIso });
      } else if (!r.checked && o.checked) {
        await api.post(`/api/projects/${pid}/access`, { user_ids: [r.user_id], access_level: 'none' });
      } else if (r.checked && o.checked) {
        if (r.level !== o.level || (r.expiresAt ? r.expiresAt.getTime() : null) !== o.expiresAt) {
          await api.post(`/api/projects/${pid}/access`, { user_ids: [r.user_id], access_level: level, expires_at: expIso });
        }
      }
      // role change on an existing participant (new members set it at creation)
      if (r.participant_id && (r.role || '') !== (o.role || '')) {
        await api.put(`/api/projects/${pid}/participants/${r.participant_id}`, { role_in_team: r.role || '' });
      }
      okCount += 1;
    } catch (e) {
      failed.push(r.name);
      // eslint-disable-next-line no-console
      console.error('member save failed for', r.name, e);
    }
  }

  saving.value = false;
  if (failed.length) {
    toast.add({ severity: 'warn', summary: `Сохранено: ${okCount}, не удалось: ${failed.length}`, detail: failed.join(', '), life: 6000 });
  } else if (okCount) {
    toast.add({ severity: 'success', summary: `Сохранено изменений: ${okCount}`, life: 2500 });
  }
  await load(pid);
  emit('saved');
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
    if (!window.confirm(`Удалить ${r.name} из участников без следа? Нет связанных лабораторных записей.`)) return;
    await api.delete(`/api/projects/${pid}/participants/${r.participant_id}`);
    toast.add({ severity: 'success', summary: 'Участник удалён', life: 2500 });
    await load(pid);
    emit('saved');
  } catch (err) {
    toastApiError(toast, err);
  }
}

function reset() { load(props.projectId); }
</script>

<template>
  <div class="members-panel">
    <div class="members-header">
      <div class="view-tabs">
        <button :class="['view-tab', view === 'participants' ? 'active' : '']" @click="view = 'participants'">
          Участники <span class="tab-count">{{ memberCount }}</span>
        </button>
        <button :class="['view-tab', view === 'select' ? 'active' : '']" @click="view = 'select'">
          Выбор команды
        </button>
      </div>
      <div class="members-search">
        <i class="pi pi-search"></i>
        <input v-model="search" placeholder="Поиск…" />
      </div>
      <div class="members-actions">
        <Button label="Отмена" size="small" text :disabled="!dirtyCount || saving" @click="reset" />
        <Button
          :label="dirtyCount ? `Сохранить (${dirtyCount})` : 'Сохранить'"
          icon="pi pi-check" size="small"
          :disabled="!dirtyCount || saving" :loading="saving"
          @click="save"
        />
      </div>
    </div>

    <div v-if="loading" class="members-loading"><i class="pi pi-spin pi-spinner"></i> Загрузка…</div>

    <!-- ── SELECT TEAM ─────────────────────────────────────────── -->
    <div v-else-if="view === 'select'" class="select-wrap">
      <table class="select-table">
        <tbody>
          <tr v-for="r in selectRows" :key="r.user_id" :class="['sel-row', r.checked ? 'sel-row--on' : '']">
            <td class="sel-check">
              <input type="checkbox" :checked="r.checked" :disabled="r.frozen || saving"
                :title="r.frozen ? 'Руководитель / создатель' : ''" @change="toggle(r)" />
            </td>
            <td class="sel-name">
              <span class="m-name">{{ r.name }}</span>
              <span v-if="r.frozen" class="m-badge m-badge--lead">рук.</span>
              <span v-else-if="r.member && !r.checked" class="m-badge m-badge--off">отключён</span>
            </td>
            <td class="sel-access">
              <Select v-if="r.checked" v-model="r.level" :options="GRANT_LEVEL_OPTIONS"
                option-label="label" option-value="value" :disabled="r.frozen || saving" class="lvl-select" />
              <span v-else class="m-muted">{{ r.member ? grantLevelLabel('none') : '—' }}</span>
            </td>
          </tr>
          <tr v-if="!selectRows.length"><td colspan="3" class="members-empty">Никого не найдено</td></tr>
        </tbody>
      </table>
    </div>

    <!-- ── PARTICIPANTS ────────────────────────────────────────── -->
    <div v-else class="part-wrap">
      <div v-for="r in participantRows" :key="r.user_id"
        :class="['part-row', r.checked ? '' : 'part-row--off', expanded.has(r.user_id) ? 'is-open' : '']">
        <div class="part-head" @click="toggleExpand(r.user_id)">
          <button class="expander" :class="{ open: expanded.has(r.user_id) }" type="button" @click.stop="toggleExpand(r.user_id)">
            <i class="pi pi-chevron-right"></i>
          </button>
          <span class="part-name">{{ r.name }}</span>
          <span v-if="r.frozen" class="m-badge m-badge--lead">рук.</span>
          <span v-else-if="!r.checked" class="m-badge m-badge--off">отключён</span>
          <span class="part-lvl">{{ grantLevelLabel(r.checked ? r.level : 'none') }}</span>
        </div>

        <div v-if="expanded.has(r.user_id)" class="part-body">
          <div class="part-col">
            <div class="part-meta">{{ [r.position, r.department_name].filter(Boolean).join(' · ') || '—' }}</div>
            <div class="role-line">
              <span class="role-label">Роль в проекте:</span>
              <input v-if="editingRole.has(r.user_id)" v-model="r.role" class="role-input"
                placeholder="напр. инженер-технолог" @blur="endRoleEdit(r.user_id)"
                @keyup.enter="endRoleEdit(r.user_id)" />
              <a v-else class="role-value" :class="{ 'role-empty': !r.role }" @click="startRoleEdit(r.user_id)">
                {{ r.role || 'Определить роль' }}
              </a>
            </div>
            <Button v-if="isAdmin && !r.frozen && !r.checked" label="Удалить запись" icon="pi pi-trash"
              severity="danger" text size="small" class="del-btn" @click="hardDelete(r)" />
          </div>
          <div class="part-col part-col--right" v-if="r.checked">
            <span class="role-label">Доступ истекает:</span>
            <div class="expiry-chips">
              <button v-for="d in DURATIONS" :key="d" type="button" class="exp-chip" @click="setDuration(r, d)">{{ d }} дн</button>
              <button type="button" :class="['exp-chip', !r.expiresAt ? 'active' : '']" @click="setDuration(r, null)">Бессрочно</button>
            </div>
            <DatePicker v-model="r.expiresAt" placeholder="или дата…" date-format="dd.mm.yy"
              :first-day-of-week="1" :min-date="todayMinDate" show-button-bar class="exp-date" />
          </div>
        </div>
      </div>
      <div v-if="!participantRows.length" class="members-empty">
        В команде пока никого. Нажмите «Выбор команды», чтобы добавить.
      </div>
    </div>

    <p v-if="!loading" class="members-hint">
      Снятие галочки <strong>отключает</strong> доступ (запись сохраняется). По истечении срока участник
      понижается до просмотра (открытый проект) или «нет доступа» (ограниченный).
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
.members-header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }

.view-tabs { display: flex; gap: 4px; background: rgba(0, 50, 116, 0.05); border-radius: 8px; padding: 3px; }
.view-tab {
  border: none; background: transparent; cursor: pointer; font-family: inherit;
  font-size: 12px; font-weight: 600; color: rgba(0, 50, 116, 0.55);
  padding: 4px 12px; border-radius: 6px; display: flex; align-items: center; gap: 6px;
}
.view-tab.active { background: #fff; color: #003274; box-shadow: 0 1px 3px rgba(0, 50, 116, 0.1); }
.tab-count {
  font-size: 10px; font-weight: 700; background: rgba(0, 50, 116, 0.12);
  color: #003274; border-radius: 10px; padding: 0 6px; min-width: 16px; text-align: center;
}

.members-search {
  display: flex; align-items: center; gap: 5px; padding: 3px 10px;
  background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(180, 210, 255, 0.55);
  border-radius: 7px; flex: 1; min-width: 160px;
}
.members-search i { font-size: 11px; color: #9CA3AF; }
.members-search input { border: none; background: transparent; font-size: 12px; flex: 1; outline: none; font-family: inherit; }
.members-actions { display: flex; gap: 0.4rem; margin-left: auto; }

.members-loading, .members-empty { padding: 1.5rem; text-align: center; color: rgba(0, 50, 116, 0.4); font-size: 13px; }

.m-name { font-weight: 600; color: #003274; font-size: 13px; }
.m-muted { color: #b8c2d0; font-size: 12px; }
.m-badge {
  font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
  padding: 1px 6px; border-radius: 10px; margin-left: 6px;
}
.m-badge--lead { color: #8E44AD; background: rgba(142, 68, 173, 0.1); }
.m-badge--off { color: #b00020; background: rgba(176, 0, 32, 0.08); }

/* ── select view ── */
.select-wrap {
  max-height: 440px; overflow-y: auto;
  border: 1px solid rgba(0, 50, 116, 0.08); border-radius: 8px;
}
.select-table { width: 100%; border-collapse: collapse; }
.sel-row td { height: 40px; padding: 0 10px; border-bottom: 1px solid rgba(0, 50, 116, 0.05); vertical-align: middle; }
.sel-row:nth-child(even) td { background: rgba(0, 50, 116, 0.012); }
.sel-row--on td { background: rgba(82, 201, 166, 0.06); }
.sel-check { width: 34px; text-align: center; }
.sel-check input { cursor: pointer; width: 15px; height: 15px; }
.sel-access { width: 175px; }

/* compact Select — fixed 28px height + matching font so checking a row never
   changes its height (the original "table jumps when you select" complaint). */
.lvl-select { width: 100%; font-family: inherit; }
.lvl-select :deep(.p-select) { min-height: 0; height: 28px; align-items: center; }
.lvl-select :deep(.p-select-label) { font-size: 13px; font-family: inherit; padding: 0 8px; color: #003274; display: flex; align-items: center; }
.lvl-select :deep(.p-select-dropdown) { width: 1.8rem; }

/* ── participants view ── */
.part-wrap { display: flex; flex-direction: column; border: 1px solid rgba(0, 50, 116, 0.08); border-radius: 8px; overflow: hidden; }
.part-row { border-bottom: 1px solid rgba(0, 50, 116, 0.06); }
.part-row:last-child { border-bottom: none; }
.part-row--off .part-name { color: #9CA3AF; }
.part-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; }
.part-head:hover { background: rgba(0, 50, 116, 0.025); }
.part-name { font-weight: 700; color: #003274; font-size: 13.5px; }
.part-lvl { margin-left: auto; font-size: 11px; color: #8b97a8; }

.expander {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border: 1px solid rgba(0, 50, 116, 0.3);
  border-radius: 5px; background: #fff; cursor: pointer; flex-shrink: 0; padding: 0;
}
.expander i { font-size: 9px; color: #003274; transition: transform 0.18s ease; }
.expander.open i { transform: rotate(90deg); }
.expander:hover { border-color: #003274; background: rgba(0, 50, 116, 0.04); }

.part-body {
  display: flex; gap: 1.5rem; padding: 4px 12px 12px 38px;
  background: rgba(0, 50, 116, 0.015);
}
.part-col { display: flex; flex-direction: column; gap: 6px; }
.part-col--right { margin-left: auto; align-items: flex-start; }
.part-meta { font-size: 11px; color: #8b97a8; }
.role-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.role-label { font-size: 11px; color: rgba(0, 50, 116, 0.5); font-weight: 600; }
.role-value { font-size: 13px; color: #003274; cursor: pointer; border-bottom: 1px dashed rgba(0, 50, 116, 0.3); }
.role-value.role-empty { color: #9aa7b8; font-style: italic; border-bottom-color: rgba(0, 50, 116, 0.15); }
.role-value:hover { border-bottom-style: solid; }
.role-input {
  font-size: 13px; font-family: inherit; color: #003274;
  border: 1px solid rgba(0, 50, 116, 0.35); border-radius: 6px; padding: 3px 8px; outline: none; min-width: 200px;
}
.del-btn { align-self: flex-start; margin-top: 2px; }

.expiry-chips { display: flex; gap: 5px; flex-wrap: wrap; }
.exp-chip {
  border: 1px solid rgba(180, 210, 255, 0.7); background: #fff; border-radius: 14px;
  font-size: 11px; padding: 3px 10px; cursor: pointer; color: #003274; font-family: inherit;
}
.exp-chip:hover { background: rgba(0, 50, 116, 0.04); }
.exp-chip.active { background: #003274; color: #fff; border-color: #003274; }
.exp-date { margin-top: 2px; }
.exp-date :deep(.p-inputtext) { font-size: 12px; padding: 4px 8px; }

.members-hint { font-size: 11px; color: #8b97a8; line-height: 1.5; margin: 0; }
</style>
