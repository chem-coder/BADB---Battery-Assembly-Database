<script setup>
/**
 * BatchCreateDialog — replaces the dedicated /electrodes/new route with
 * a single modal that gathers EVERYTHING needed to create an electrode
 * cut batch in one POST. Sections:
 *   1. Источник  — operator (auto), tape (required), project (auto from tape)
 *   2. Нарезка   — form factor + config + shape + dimensions
 *   3. Заметка   — comments
 *
 * After Save the batch lands in the list; further editing (electrode
 * masses, drying, etc.) happens inline by clicking the row.
 *
 * Visual language matches EntityCreateDialog: glass-card outer, Rosatom
 * title, brand-blue primary button, brand toned mask. Wider (640px) and
 * grouped into sections because it carries ~9 fields instead of 2-3.
 */
import { ref, computed, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Textarea from 'primevue/textarea';
import DateInputISO from '@/components/parity/DateInputISO.vue';
import Checkbox from 'primevue/checkbox';
import { todayIsoMsk } from '@/utils/dateFormat';

const FORM_FACTOR_OPTIONS = [
  { value: 'coin', label: 'Монеточный' },
  { value: 'pouch', label: 'Пакетный' },
  { value: 'cylindrical', label: 'Цилиндрический' },
];

const CONFIG_BY_FORM_FACTOR = {
  coin: [
    { value: '2016', label: '2016' },
    { value: '2025', label: '2025' },
    { value: '2032', label: '2032' },
    { value: 'other', label: 'Другое' },
  ],
  pouch: [
    { value: '103x83', label: '103 × 83' },
    { value: '86x56', label: '86 × 56' },
    { value: 'other', label: 'Другое' },
  ],
  cylindrical: [
    { value: '18650', label: '18650' },
    { value: '21700', label: '21700' },
    { value: 'other', label: 'Другое' },
  ],
};

function shapeForFormFactor(ff) {
  if (ff === 'coin') return 'circle';
  if (ff === 'pouch' || ff === 'cylindrical') return 'rectangle';
  return '';
}

const props = defineProps({
  visible: { type: Boolean, required: true },
  tapes: { type: Array, default: () => [] },
  /** Full users list for the "Оператор" select. */
  users: { type: Array, default: () => [] },
  /** Full projects list for the "Проект" select. */
  projects: { type: Array, default: () => [] },
  /** Current logged-in user (passed for default operator + audit display). */
  currentUserId: { type: [Number, String, null], default: null },
  currentUserName: { type: String, default: '' },
  defaultTapeId: { type: [Number, String, null], default: null },
});

const emit = defineEmits(['update:visible', 'create', 'create-project']);

// Multi-project per M:N table `electrode_cut_batch_projects` (d029).
// Backend accepts `project_ids: [...]` on POST (services/electrodeBatchProjectService.js).
// We keep singular `selectedProject` as the FIRST selected project — used
// only for the cascading "tape filter" and the description card preview.
const projectIds = ref([]);
const tapeId = ref(null);
const operatorId = ref(null);
// Business date (vue-vs-backend-audit-2026-05.md #4). Backend
// column `item_created_at` (d035) — defaults to today MSK, operator
// can backdate.
const itemCreatedAt = ref(todayIsoMsk());
// Test-batch flag (audit #5). Excludes batch from capacity averages and
// shows a list marker. Backend column `is_test_batch` (d039).
const isTestBatch = ref(false);
const formFactor = ref('');
const configCode = ref('');
const configOther = ref('');
const shape = ref('');
const diameterMm = ref(null);
const lengthMm = ref(null);
const widthMm = ref(null);
const comments = ref('');
const submitting = ref(false);

// Inline "create new project" mini-form.
const newProjectVisible = ref(false);
const newProjectName = ref('');
const newProjectDescription = ref('');
const creatingProject = ref(false);

function reset() {
  projectIds.value = [];
  itemCreatedAt.value = todayIsoMsk();
  isTestBatch.value = false;
  tapeId.value = props.defaultTapeId ? Number(props.defaultTapeId) : null;
  // Operator defaults to current user — usually they are the same person,
  // but the picker lets a data-entry assistant log a batch on behalf of
  // the operator who actually did the work.
  operatorId.value = props.currentUserId ? Number(props.currentUserId) : null;
  formFactor.value = '';
  configCode.value = '';
  configOther.value = '';
  shape.value = '';
  diameterMm.value = null;
  lengthMm.value = null;
  widthMm.value = null;
  comments.value = '';
  submitting.value = false;
  newProjectVisible.value = false;
  newProjectName.value = '';
  newProjectDescription.value = '';
  creatingProject.value = false;
}

watch(() => props.visible, (v) => { if (v) reset(); });

// Cascade: form factor → shape + clear invalid config
watch(formFactor, (ff) => {
  shape.value = shapeForFormFactor(ff);
  const allowed = CONFIG_BY_FORM_FACTOR[ff] || [];
  if (!allowed.some(o => o.value === configCode.value)) {
    configCode.value = '';
    configOther.value = '';
  }
});

watch(configCode, (cc) => {
  if (cc !== 'other') configOther.value = '';
});

// Project options — sorted by name, active first.
const projectOptions = computed(() =>
  (props.projects || [])
    .slice()
    .sort((a, b) => {
      // active before non-active, then alphabetical
      if ((a.status === 'active') !== (b.status === 'active')) {
        return a.status === 'active' ? -1 : 1;
      }
      return (a.name || '').localeCompare(b.name || '', 'ru');
    })
    .map(p => ({ value: p.project_id, label: p.name, _raw: p }))
);

// First selected project — drives the description card preview. When the
// user picks multiple projects we only have screen real-estate to summarise
// one; first-selected is the most predictable choice.
const selectedProject = computed(() => {
  const firstId = (projectIds.value || [])[0];
  if (!firstId) return null;
  return (props.projects || []).find(p => p.project_id === firstId) || null;
});

// Tape options — narrowed by ANY of the selected projects. With no project
// picked yet we show ALL tapes (selecting one then back-fills below).
const tapeOptions = computed(() => {
  const allTapes = (props.tapes || []);
  const pidSet = new Set((projectIds.value || []).map(Number));
  const narrowed = pidSet.size > 0
    ? allTapes.filter(t => pidSet.has(Number(t.project_id)))
    : allTapes;
  return narrowed.map(t => ({
    value: t.tape_id,
    label: `#${t.tape_id} · ${t.name || '—'}${t.role ? ` · ${t.role}` : ''}`,
    project: t.project_name || '',
    _projectId: t.project_id,
  }));
});

const userOptions = computed(() =>
  (props.users || []).map(u => ({ value: u.user_id, label: u.name }))
);

// If a tape is picked but no projects yet, auto-fill the tape's project
// as the first item in the multi-select.
watch(tapeId, (tid) => {
  if (!tid) return;
  const t = (props.tapes || []).find(x => x.tape_id === tid);
  if (t?.project_id && (!projectIds.value || projectIds.value.length === 0)) {
    projectIds.value = [Number(t.project_id)];
  }
});

// If the user removes ALL projects after picking a tape, clear the tape.
// If they remove only some, keep the tape as long as it still matches one
// of the remaining projects.
watch(projectIds, (pids) => {
  if (!tapeId.value) return;
  if (!pids || pids.length === 0) {
    // No filter — leave tape alone.
    return;
  }
  const t = (props.tapes || []).find(x => x.tape_id === tapeId.value);
  if (!t) return;
  const pidSet = new Set(pids.map(Number));
  if (!pidSet.has(Number(t.project_id))) {
    tapeId.value = null;
  }
}, { deep: true });

async function onCreateProject() {
  const name = newProjectName.value.trim();
  if (!name) return;
  creatingProject.value = true;
  // Parent owns the API call so we don't import axios here. The
  // resolved value should be the newly created project record so we
  // can auto-select it; on error the parent should leave us as-is.
  try {
    const created = await new Promise((resolve, reject) => {
      emit('create-project', {
        payload: {
          name,
          description: newProjectDescription.value.trim() || null,
        },
        resolve,
        reject,
      });
    });
    if (created && created.project_id) {
      // Append the new project to the current selection (preserve any
      // already-picked ones) — feels less destructive than replacing.
      const next = [...(projectIds.value || []), Number(created.project_id)];
      // Dedup just in case.
      projectIds.value = Array.from(new Set(next));
    }
    newProjectVisible.value = false;
    newProjectName.value = '';
    newProjectDescription.value = '';
  } catch (e) {
    // Parent already showed a toast; keep the inline form open so user
    // can adjust and retry.
  } finally {
    creatingProject.value = false;
  }
}

const selectedTape = computed(() =>
  tapeOptions.value.find(t => t.value === tapeId.value) || null
);

const configOptions = computed(() => CONFIG_BY_FORM_FACTOR[formFactor.value] || []);

const isCircle = computed(() => shape.value === 'circle');
const isRectangle = computed(() => shape.value === 'rectangle');

const canSubmit = computed(() => {
  if (submitting.value) return false;
  if (!projectIds.value || projectIds.value.length === 0) return false;
  if (!tapeId.value) return false;
  if (configCode.value === 'other' && !configOther.value.trim()) return false;
  return true;
});

function onCancel() {
  if (submitting.value) return;
  emit('update:visible', false);
}

function onSubmit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  const pids = (projectIds.value || []).map(Number).filter(Number.isFinite);
  emit('create', {
    tape_id: Number(tapeId.value),
    // Multi-project per d029 — array is the source of truth. Echo
    // `project_id` as the primary (first) entry so older code paths that
    // only read singular still work.
    project_ids: pids,
    project_id: pids[0] || null,
    item_created_at: itemCreatedAt.value || null,
    // Test batch flag (audit #5) — backend column is_test_batch (d039).
    is_test_batch: !!isTestBatch.value,
    // operator_user_id is the BUSINESS operator (who physically cut the
    // electrodes) — distinct from the audit `created_by` that the backend
    // fills from the JWT. Forwarded in the payload so the moment Dalia
    // adds an `operator_user_id` column to electrode_cut_batches, this
    // wiring is already in place. Today the backend will ignore the
    // field; see docs/instructions/operator-vs-creator.md for the spec.
    operator_user_id: operatorId.value ? Number(operatorId.value) : null,
    comments: comments.value.trim() || null,
    target_form_factor: formFactor.value || null,
    target_config_code: configCode.value || null,
    target_config_other: configCode.value === 'other' ? (configOther.value.trim() || null) : null,
    shape: shape.value || null,
    diameter_mm: isCircle.value ? diameterMm.value || null : null,
    length_mm: isRectangle.value ? lengthMm.value || null : null,
    width_mm: isRectangle.value ? widthMm.value || null : null,
  });
}

defineExpose({ resetSubmitting() { submitting.value = false; } });
</script>

<template>
  <Dialog
    :visible="visible"
    :style="{ width: '640px' }"
    :pt="{ root: { class: 'bcd-dialog-root' }, content: { class: 'bcd-content' } }"
    modal
    :draggable="false"
    :closable="!submitting"
    :show-header="false"
    @update:visible="(v) => emit('update:visible', v)"
  >
    <div class="bcd-card">
      <div class="bcd-eyebrow">Электроды · Создание</div>
      <h3 class="bcd-title">Новая партия электродов</h3>
      <p class="bcd-hint">
        Заполните параметры нарезки. После создания партии можно перейти
        к взвешиванию электродов и сушке.
      </p>

      <!-- Section: source -->
      <div class="bcd-section">
        <div class="bcd-section-title">Источник</div>

        <div class="bcd-row">
          <div class="bcd-field bcd-field--half">
            <label>Заполнил <span class="bcd-derived">(audit)</span></label>
            <div class="bcd-readonly">
              <i class="pi pi-pencil" />
              <span>{{ currentUserName || '—' }}</span>
            </div>
          </div>
          <div class="bcd-field bcd-field--half">
            <label for="bcd-op">Оператор</label>
            <Select
              id="bcd-op"
              v-model="operatorId"
              :options="userOptions"
              option-label="label"
              option-value="value"
              placeholder="— оператор —"
              filter
              show-clear
              class="bcd-input"
            />
          </div>
        </div>

        <div class="bcd-field">
          <label for="bcd-itemdate">Дата создания партии</label>
          <DateInputISO
            id="bcd-itemdate"
            v-model="itemCreatedAt"
            class="bcd-input"
          />
        </div>

        <!-- Test-batch checkbox (audit #5) — excludes batch from
             capacity averages, shows a marker in the list. Column
             `is_test_batch` (d039). -->
        <div class="bcd-field bcd-field--checkbox">
          <label class="bcd-checkbox-label" for="bcd-test">
            <Checkbox id="bcd-test" v-model="isTestBatch" :binary="true" />
            <span>Тестовая партия</span>
          </label>
          <p class="bcd-hint-inline">
            Не учитывается в средних по проекту, отмечается в списке.
          </p>
        </div>

        <!-- Project: required, with description card + inline "+ new" -->
        <div class="bcd-field">
          <div class="bcd-label-row">
            <label for="bcd-prj">Проект <span class="bcd-req">*</span></label>
            <button
              v-if="!newProjectVisible"
              type="button"
              class="bcd-link"
              @click="newProjectVisible = true"
            >
              <i class="pi pi-plus" /> Создать проект
            </button>
          </div>
          <MultiSelect
            id="bcd-prj"
            v-model="projectIds"
            :options="projectOptions"
            option-label="label"
            option-value="value"
            placeholder="— выбрать один или несколько проектов —"
            filter
            :max-selected-labels="3"
            selected-items-label="Выбрано: {0}"
            display="chip"
            class="bcd-input"
          />
          <!-- Project description card — appears once a project is picked -->
          <div v-if="selectedProject" class="bcd-project-card">
            <div class="bcd-project-head">
              <span class="bcd-project-name">{{ selectedProject.name }}</span>
              <span
                v-if="selectedProject.status"
                :class="['bcd-status', `bcd-status--${selectedProject.status}`]"
              >{{ selectedProject.status === 'active' ? 'активный'
                  : selectedProject.status === 'archived' ? 'архив'
                  : selectedProject.status }}</span>
            </div>
            <div v-if="selectedProject.lead_name" class="bcd-project-line">
              <i class="pi pi-user" /> Руководитель: {{ selectedProject.lead_name }}
            </div>
            <div v-if="selectedProject.description" class="bcd-project-desc">
              {{ selectedProject.description }}
            </div>
            <div v-else class="bcd-project-desc bcd-project-desc--empty">
              Без описания
            </div>
          </div>

          <!-- Inline "create new project" form, appears only on demand -->
          <div v-if="newProjectVisible" class="bcd-subform">
            <div class="bcd-subform-title">Новый проект</div>
            <div class="bcd-field">
              <label for="bcd-np-name">Название <span class="bcd-req">*</span></label>
              <InputText
                id="bcd-np-name"
                v-model="newProjectName"
                placeholder="Например: «Импортозамещение сепараторов»"
                class="bcd-input"
              />
            </div>
            <div class="bcd-field">
              <label for="bcd-np-desc">Описание</label>
              <Textarea
                id="bcd-np-desc"
                v-model="newProjectDescription"
                rows="2"
                placeholder="Краткое описание проекта"
                class="bcd-input bcd-textarea"
              />
            </div>
            <div class="bcd-subform-actions">
              <Button
                label="Отмена"
                severity="secondary"
                text
                size="small"
                :disabled="creatingProject"
                @click="newProjectVisible = false"
              />
              <Button
                label="Создать"
                icon="pi pi-check"
                size="small"
                :loading="creatingProject"
                :disabled="!newProjectName.trim() || creatingProject"
                @click="onCreateProject"
              />
            </div>
          </div>
        </div>

        <div class="bcd-field">
          <label for="bcd-tape">Лента <span class="bcd-req">*</span></label>
          <Select
            id="bcd-tape"
            v-model="tapeId"
            :options="tapeOptions"
            option-label="label"
            option-value="value"
            :placeholder="projectId ? '— выбрать ленту проекта —' : '— сначала проект (или любая лента) —'"
            filter
            show-clear
            class="bcd-input"
          />
        </div>
      </div>

      <!-- Section: cutting -->
      <div class="bcd-section">
        <div class="bcd-section-title">Параметры нарезки</div>
        <div class="bcd-row">
          <div class="bcd-field bcd-field--half">
            <label for="bcd-ff">Семейство</label>
            <Select
              id="bcd-ff"
              v-model="formFactor"
              :options="FORM_FACTOR_OPTIONS"
              option-label="label"
              option-value="value"
              placeholder="— семейство —"
              show-clear
              class="bcd-input"
            />
          </div>
          <div class="bcd-field bcd-field--half">
            <label for="bcd-cc">Конфигурация</label>
            <Select
              id="bcd-cc"
              v-model="configCode"
              :options="configOptions"
              option-label="label"
              option-value="value"
              :placeholder="formFactor ? '— конфигурация —' : 'сначала семейство'"
              :disabled="!formFactor"
              show-clear
              class="bcd-input"
            />
          </div>
        </div>
        <div v-if="configCode === 'other'" class="bcd-field">
          <label for="bcd-co">Конфигурация (своя) <span class="bcd-req">*</span></label>
          <InputText id="bcd-co" v-model="configOther" placeholder="Например: 5050" class="bcd-input" />
        </div>

        <!-- Dimensions: depend on shape -->
        <div v-if="isCircle" class="bcd-field">
          <label for="bcd-dia">Диаметр, мм</label>
          <InputNumber
            id="bcd-dia"
            v-model="diameterMm"
            :min="0"
            :max-fraction-digits="2"
            placeholder="например, 16"
            class="bcd-input"
            input-class="bcd-input"
          />
        </div>
        <div v-else-if="isRectangle" class="bcd-row">
          <div class="bcd-field bcd-field--half">
            <label for="bcd-len">Длина, мм</label>
            <InputNumber
              id="bcd-len"
              v-model="lengthMm"
              :min="0"
              :max-fraction-digits="2"
              class="bcd-input"
              input-class="bcd-input"
            />
          </div>
          <div class="bcd-field bcd-field--half">
            <label for="bcd-wid">Ширина, мм</label>
            <InputNumber
              id="bcd-wid"
              v-model="widthMm"
              :min="0"
              :max-fraction-digits="2"
              class="bcd-input"
              input-class="bcd-input"
            />
          </div>
        </div>
      </div>

      <!-- Section: comments -->
      <div class="bcd-section">
        <div class="bcd-section-title">Заметка</div>
        <div class="bcd-field">
          <Textarea v-model="comments" rows="2"
            placeholder="Комментарии о вырезании (опционально)"
            class="bcd-input bcd-textarea" />
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="Отмена" severity="secondary" outlined :disabled="submitting" @click="onCancel" />
      <Button
        label="Создать партию"
        icon="pi pi-plus"
        :disabled="!canSubmit"
        :loading="submitting"
        @click="onSubmit"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.bcd-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px 28px 8px;
  background: white;
}
.bcd-eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 50, 116, 0.50);
}
.bcd-title {
  font-family: 'Rosatom', system-ui, sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #003274;
  margin: 0;
  line-height: 1.2;
}
.bcd-hint {
  margin: 0 0 6px;
  font-size: 13px;
  color: #6B7280;
  line-height: 1.5;
}

/* Section group — eyebrow + fields, tight visual rhythm */
.bcd-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 50, 116, 0.08);
}
.bcd-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
}

.bcd-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.bcd-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.bcd-field--half { /* sits inside .bcd-row */ }

.bcd-field label {
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
}
.bcd-req {
  color: #E74C3C;
  margin-left: 3px;
  font-weight: 700;
}
.bcd-derived {
  font-size: 11px;
  font-weight: 500;
  color: #9CA3AF;
  margin-left: 4px;
  text-transform: lowercase;
  letter-spacing: 0;
}

.bcd-input {
  width: 100%;
}
.bcd-textarea {
  font-size: 13px;
}

.bcd-readonly {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 50, 116, 0.04);
  border: 1px solid rgba(0, 50, 116, 0.10);
  border-radius: 6px;
  font-size: 14px;
  color: #003274;
  font-weight: 500;
  min-height: 36px;
  box-sizing: border-box;
}
.bcd-readonly .pi {
  font-size: 13px;
  color: rgba(0, 50, 116, 0.55);
}

/* Label + inline "+ Создать проект" link on the same row */
.bcd-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bcd-link {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #025EA1;
  padding: 2px 4px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.bcd-link:hover {
  background: rgba(2, 94, 161, 0.08);
  color: #003274;
}
.bcd-link .pi { font-size: 10px; }

/* Project description card — appears under the Project select */
.bcd-project-card {
  margin-top: 6px;
  padding: 10px 12px;
  background: rgba(0, 50, 116, 0.03);
  border: 1px solid rgba(0, 50, 116, 0.10);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bcd-project-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bcd-project-name {
  font-family: 'Rosatom', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 700;
  color: #003274;
}
.bcd-status {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 10px;
}
.bcd-status--active { color: #1d7a5f; background: rgba(82, 201, 166, 0.14); }
.bcd-status--archived { color: #003274; background: rgba(0, 50, 116, 0.08); }
.bcd-project-line {
  font-size: 12px;
  color: #4B5563;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.bcd-project-line .pi { font-size: 11px; color: rgba(0, 50, 116, 0.55); }
.bcd-project-desc {
  font-size: 12px;
  color: #333333;
  line-height: 1.45;
}
.bcd-project-desc--empty {
  color: #9CA3AF;
  font-style: italic;
}

/* Inline "+ create project" mini-form */
.bcd-subform {
  margin-top: 8px;
  padding: 12px;
  background: rgba(0, 94, 161, 0.04);
  border: 1px dashed rgba(2, 94, 161, 0.35);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bcd-subform-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #025EA1;
}
.bcd-subform-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>

<style>
.p-dialog.bcd-dialog-root {
  border: 1px solid rgba(0, 50, 116, 0.14);
  border-radius: 14px;
  background: white !important;
  background-color: white !important;
  box-shadow:
    0 24px 60px rgba(0, 50, 116, 0.22),
    0 4px 12px rgba(0, 50, 116, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
  overflow: hidden;
  backdrop-filter: none !important;
}
.p-dialog.bcd-dialog-root .p-dialog-content,
.p-dialog.bcd-dialog-root .bcd-content {
  background: white !important;
  background-color: white !important;
  padding: 0 !important;
}
.p-dialog.bcd-dialog-root .p-dialog-footer {
  background: white !important;
  background-color: white !important;
  border-top: 1px solid rgba(0, 50, 116, 0.08);
  padding: 14px 28px 18px !important;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
.p-dialog-mask:has(.bcd-dialog-root) {
  background: rgba(0, 50, 116, 0.28);
  backdrop-filter: blur(2px);
}
</style>
