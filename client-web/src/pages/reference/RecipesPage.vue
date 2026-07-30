<script setup>
/**
 * RecipesPage — "Рецепты" (recipe reference).
 *
 * Vue V2 implementation matching vanilla v1 behavior. See:
 *   - docs/current/recipes.md
 *   - docs/instructions/frontend_parity_handoff.md §"Destructive And Safety Flows"
 *   - docs/instructions/vanilla_ui_patterns.md
 *   - public/js/recipes.js (vanilla reference)
 *
 * The page uses the parity foundation (RowOpenPage, OpenedRecordHeader,
 * useRowOpenForm, TypedDeleteConfirm) so behavior — delete-check, typed
 * confirmation, dirty tracking, unsaved guards, row-open pattern — is
 * shared with other parity surfaces and not reimplemented here.
 *
 * Surface-specific logic in this file:
 *   - composition lines (cathode_active/anode_active/binder/additive/solvent);
 *   - role auto-set from active-material line choice;
 *   - sum-to-100 validation over included non-solvent lines;
 *   - material filtering by line recipe_role.
 */
import { ref, watch, onMounted, onUnmounted } from 'vue';
import api from '@/services/api';
import { usePrintHandlers } from '@/composables/usePrintHandlers';
import { findDuplicateRecipe } from '@/utils/recipeDuplicate';

import RowOpenPage from '@/components/parity/RowOpenPage.vue';
import OpenedRecordHeader from '@/components/parity/OpenedRecordHeader.vue';
import EditableTitle from '@/components/parity/EditableTitle.vue';
import TypedDeleteConfirm from '@/components/parity/TypedDeleteConfirm.vue';
import { useRowOpenForm } from '@/composables/useRowOpenForm';

import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';

// ── Constants ────────────────────────────────────────────────────────
const LINE_ROLES = [
  { value: 'cathode_active', label: 'катодный АМ' },
  { value: 'anode_active',   label: 'анодный АМ' },
  { value: 'binder',         label: 'связующее' },
  { value: 'additive',       label: 'добавка' },
  { value: 'solvent',        label: 'растворитель' },
];

const RECIPE_ROLES = [
  { value: 'cathode', label: 'катод' },
  { value: 'anode',   label: 'анод' },
];

// Maps line.recipe_role -> material.role for material-options filtering.
const ROLE_TO_MATERIAL = {
  cathode_active: 'cathode_active',
  anode_active:   'anode_active',
  binder:         'binder',
  additive:       'conductive_additive',
  solvent:        'solvent',
};

// d047 — active-material lines are open slots: the recipe stores NO
// material for them (material_id null); the tape picks the chemistry
// via tapes.active_material_id. The material select on such lines is
// disabled and shows the «x» placeholder instead.
const ACTIVE_LINE_ROLES = new Set(['cathode_active', 'anode_active']);
function isActiveLine(line) {
  return ACTIVE_LINE_ROLES.has(line.recipe_role);
}

// ── List state ───────────────────────────────────────────────────────
const recipes = ref([]);
const loading = ref(false);

async function loadList() {
  loading.value = true;
  try {
    const { data } = await api.get('/api/recipes');
    recipes.value = data;
  } finally {
    loading.value = false;
  }
}

// ── Material cache (invalidated on save + window focus) ──────────────
let cachedMaterials = null;
async function fetchMaterials() {
  if (cachedMaterials) return cachedMaterials;
  const { data } = await api.get('/api/materials');
  cachedMaterials = data;
  return cachedMaterials;
}
function invalidateMaterials() { cachedMaterials = null; }

onMounted(() => {
  loadList();
  window.addEventListener('focus', invalidateMaterials);
});
onUnmounted(() => window.removeEventListener('focus', invalidateMaterials));

// ── Form factory and snapshots ──────────────────────────────────────
let lineKeyCounter = 0;
function makeEmptyLine(overrides = {}) {
  return {
    _key: lineKeyCounter++,
    recipe_role: '',
    material_id: null,
    include_in_pct: true,
    slurry_percent: '',
    line_notes: '',
    ...overrides,
  };
}

function emptyForm() {
  return {
    name: '',
    variant_label: '',
    role: '',
    notes: '',
    lines: [makeEmptyLine()],
  };
}

// ── Load / save handlers wired into useRowOpenForm ─────────────────
async function loadOne(id) {
  const [headerRes, linesRes] = await Promise.all([
    api.get(`/api/recipes/${id}`),
    api.get(`/api/recipes/${id}/lines`),
  ]);
  const recipe = headerRes.data;
  const lines = (linesRes.data || []).map((l) => ({
    _key: lineKeyCounter++,
    recipe_role: l.recipe_role || '',
    material_id: l.material_id ?? null,
    // Derived, not user-editable (2026-07-30): non-solvent lines are
    // always in the dry-% basis — matches vanilla, the DB reality and
    // the tape slurry math; removes the vanilla-roundtrip data-loss trap.
    include_in_pct: l.recipe_role !== 'solvent',
    slurry_percent: l.slurry_percent ?? '',
    line_notes: l.line_notes || '',
  }));

  const form = {
    name: recipe.name || '',
    variant_label: recipe.variant_label || '',
    role: recipe.role || '',
    notes: recipe.notes || '',
    lines: lines.length > 0 ? lines : [makeEmptyLine()],
  };
  return { item: recipe, form };
}

async function saveOne(form, mode, currentId) {
  // Solvent lines are excluded from the dry-solids sum and have
  // include_in_pct=false by default.
  // d047 — active lines MUST send material_id: null (open slot); the
  // backend rejects a non-null material on cathode_active/anode_active.
  const lines = form.lines.map((l) => ({
    material_id: isActiveLine(l) ? null : Number(l.material_id),
    recipe_role: l.recipe_role,
    include_in_pct: l.recipe_role !== 'solvent',
    slurry_percent: l.slurry_percent === '' || l.slurry_percent == null
      ? null
      : Number(l.slurry_percent),
    line_notes: l.line_notes || null,
  }));

  const payload = {
    name: form.name.trim(),
    role: form.role,
    variant_label: form.variant_label || null,
    notes: form.notes || null,
    lines,
  };

  let response;
  if (mode === 'create') {
    response = await api.post('/api/recipes', payload);
  } else {
    response = await api.put(`/api/recipes/${currentId}`, payload);
  }
  invalidateMaterials();
  return response.data;
}

// ── Validation ───────────────────────────────────────────────────────
function validate(form) {
  if (!form.name?.trim()) return 'Заполните название рецепта';

  // Duplicate guard: neither the backend nor the DB enforces uniqueness
  // of name+variant_label, so a duplicate pair would be created
  // silently — block here against the loaded list (own id excluded).
  const dup = findDuplicateRecipe(recipes.value, {
    name: form.name,
    variantLabel: form.variant_label,
    currentId: ctx.currentId.value,
  });
  if (dup) {
    return `Рецепт с таким названием и вариантом уже существует (#${dup.tape_recipe_id})`;
  }

  if (!form.role) return 'Не определена роль электрода (выберите активный материал)';
  if (!Array.isArray(form.lines) || form.lines.length === 0) {
    return 'Добавьте хотя бы один компонент';
  }
  for (const line of form.lines) {
    if (!line.recipe_role) return 'Укажите функциональную роль для каждого компонента';
    // d047 — active lines are open slots: null material is the ONLY
    // valid state for them; all other roles still require a material.
    if (line.material_id == null && !isActiveLine(line)) {
      return 'Выберите материал для каждого компонента';
    }
  }

  // Sum-to-100 check for included non-solvent lines.
  let sum = 0;
  for (const line of form.lines) {
    if (line.recipe_role === 'solvent') continue;
    const pct = Number(line.slurry_percent);
    if (line.slurry_percent === '' || line.slurry_percent == null || Number.isNaN(pct)) {
      return 'Укажите % для каждого включённого компонента';
    }
    if (pct < 0 || pct > 100) {
      return `% должен быть от 0 до 100`;
    }
    sum += pct;
  }
  if (Math.abs(sum - 100) > 0.01) {
    return `Сумма % включённых компонентов должна быть 100 (сейчас ${sum.toFixed(2)})`;
  }

  return true;
}

// ── Foundation hook ──────────────────────────────────────────────────
const ctx = useRowOpenForm({
  entityType: 'recipes',
  idField: 'tape_recipe_id',
  emptyForm,
  validate,
  loadOne,
  saveOne,
  list: { ref: recipes, load: loadList },
  deletePhrase: (id) => `DELETE RECIPE ${id}`,
  hasDeleteCheck: true,
  deleteMessages: {
    success: 'Рецепт удалён',
  },
});

// ── Composition line management (surface-specific) ───────────────────
const filteredMaterialsCache = ref({}); // keyed by line._key

async function refreshLineMaterials(line) {
  // d047 — slot lines have no material picker (select disabled), so
  // there is nothing to offer.
  if (isActiveLine(line)) {
    filteredMaterialsCache.value[line._key] = [];
    return;
  }
  const materials = await fetchMaterials();
  const targetRole = ROLE_TO_MATERIAL[line.recipe_role];
  filteredMaterialsCache.value[line._key] = targetRole
    ? materials.filter((m) => m.role === targetRole)
    : [];
}

async function onLineRoleChange(line) {
  // Auto-set recipe.role from active-material line choice (vanilla v1
  // behaviour: recipe-role select is disabled and derived).
  if (line.recipe_role === 'cathode_active') ctx.form.value.role = 'cathode';
  else if (line.recipe_role === 'anode_active') ctx.form.value.role = 'anode';

  // Material was previously selected for a different role — clear it.
  line.material_id = null;

  // Solvent lines do not contribute to the dry-solids sum.
  line.include_in_pct = line.recipe_role !== 'solvent';

  await refreshLineMaterials(line);
}

function addLine() {
  ctx.form.value.lines.push(makeEmptyLine());
}

function removeLine(idx) {
  ctx.form.value.lines.splice(idx, 1);
  if (ctx.form.value.lines.length === 0) ctx.form.value.lines.push(makeEmptyLine());
}

// Pre-populate material options for already-loaded lines (e.g. on openEdit).
async function refreshAllLineMaterials() {
  if (!ctx.form.value.lines) return;
  await Promise.all(ctx.form.value.lines.map((l) => refreshLineMaterials(l)));
}

// Re-run material filtering whenever the form changes (openCreate / openEdit
// / openDuplicate all reset the form ref). Cheap operation due to caching.
watch(
  () => ctx.form.value.lines,
  () => refreshAllLineMaterials(),
  { immediate: true }
);

// ── List columns and filter config ───────────────────────────────────
// d047 — recipes are chemistry-agnostic formulations now: the list no
// longer carries active_material_name (the tape chooses the material).
const columns = [
  { field: 'name', header: 'Название' },
  { field: 'role', header: 'Электрод', width: '110px' },
  { field: 'active_percent', header: '% активного', width: '110px' },
  { field: 'variant_label', header: 'Версия', width: '120px' },
  { field: 'created_by_name', header: 'Оператор', width: '140px' },
];

const filters = [
  { field: 'text', type: 'text', placeholder: 'Название, заметки, материалы...', label: 'Поиск' },
  {
    field: 'role',
    type: 'select',
    label: 'Роль',
    emptyOption: 'Все роли',
    options: RECIPE_ROLES,
  },
];

function textHaystack(row) {
  return [
    row.name,
    row.variant_label,
    row.notes,
    row.material_names,
    row.created_by_name,
    row.updated_by_name,
  ].filter(Boolean).join(' ');
}

// ── Meta formatting for sticky header ────────────────────────────────
function formatMeta(item) {
  if (!item) return 'Новый рецепт';
  const parts = [];
  if (item.created_by_name) parts.push(`Создал: ${item.created_by_name}`);
  if (item.created_at) parts.push(new Date(item.created_at).toLocaleDateString('ru-RU'));
  if (item.updated_by_name) {
    parts.push(`· Изменил: ${item.updated_by_name}`);
    if (item.updated_at) parts.push(new Date(item.updated_at).toLocaleDateString('ru-RU'));
  }
  return parts.join(' ');
}

function roleLabel(role) {
  return role === 'cathode' ? 'катод' : role === 'anode' ? 'анод' : role || '—';
}

// ── List-row actions ─────────────────────────────────────────────────
const { onRowPrint, onHeaderPrint } = usePrintHandlers('recipes', ctx);
</script>

<template>
  <RowOpenPage
    title="Рецепты"
    icon="pi pi-file-edit"
    add-placeholder="+ Добавить рецепт"
    :list="recipes"
    :columns="columns"
    :filters="filters"
    :row-actions="['print', 'duplicate']"
    :current-id="ctx.currentId.value"
    :mode="ctx.mode.value"
    id-field="tape_recipe_id"
    :loading="loading"
    :text-haystack="textHaystack"
    @create="(name) => ctx.openCreate(name)"
    @row-click="ctx.openEdit"
    @row-print="onRowPrint"
    @row-duplicate="ctx.openDuplicate"
  >
    <template #col-name="{ data }">
      <strong>{{ data.name }}</strong>
    </template>
    <template #col-role="{ data }">
      <span :class="['role-badge', `role-badge--${data.role || 'none'}`]">{{ roleLabel(data.role) }}</span>
    </template>
    <template #col-active_percent="{ data }">
      {{ data.active_percent != null ? `${data.active_percent}%` : '' }}
    </template>
    <template #col-variant_label="{ data }">
      <span class="meta-text">{{ data.variant_label || '' }}</span>
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
            placeholder="Новый рецепт"
            class="recipe-title"
          />
        </template>
      </OpenedRecordHeader>

      <div class="recipe-form">
        <div class="form-grid">
          <label>Вариант / версия</label>
          <InputText v-model="ctx.form.value.variant_label" placeholder="A / B / low binder / v2" class="w-full" />

          <label>Электрод</label>
          <Select
            v-model="ctx.form.value.role"
            :options="RECIPE_ROLES"
            option-label="label"
            option-value="value"
            placeholder="— определяется по активному материалу —"
            class="w-full"
            disabled
          />

          <label>Комментарии</label>
          <Textarea v-model="ctx.form.value.notes" rows="2" placeholder="Кратко: что это за рецепт" class="w-full" />
        </div>

        <div class="section-header">
          <span class="section-title">Состав рецепта</span>
          <Button label="+ Компонент" severity="secondary" outlined size="small" @click="addLine" />
        </div>

        <div class="lines-wrap">
          <table class="lines-table">
            <thead>
              <tr>
                <th>Функциональная роль</th>
                <th>Материал</th>
                <th title="Не-растворители всегда входят в сумму 100%">В сумму %</th>
                <th>% в пасте</th>
                <th>Заметки</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, idx) in ctx.form.value.lines" :key="line._key">
                <td>
                  <Select
                    v-model="line.recipe_role"
                    :options="LINE_ROLES"
                    option-label="label"
                    option-value="value"
                    placeholder="— роль —"
                    @change="onLineRoleChange(line)"
                  />
                </td>
                <td>
                  <!-- d047 — active lines are open slots: material is
                       chosen on the tape, so the select is disabled and
                       shows the «x» placeholder. -->
                  <Select
                    v-model="line.material_id"
                    :options="filteredMaterialsCache[line._key] || []"
                    option-label="name"
                    option-value="material_id"
                    :placeholder="isActiveLine(line) ? 'АМ — выбирается на ленте' : '— материал —'"
                    :disabled="!line.recipe_role || isActiveLine(line)"
                  />
                </td>
                <td class="col-include">
                  <!-- Derived from the role (2026-07-30): shown, not edited. -->
                  <span :title="line.recipe_role === 'solvent'
                    ? 'Растворитель не входит в сумму 100%'
                    : 'Входит в сумму 100% сухих компонентов'"
                  >{{ line.recipe_role === 'solvent' ? '—' : '✓' }}</span>
                </td>
                <td>
                  <InputText
                    v-model="line.slurry_percent"
                    style="width: 80px"
                    :disabled="line.recipe_role === 'solvent'"
                    :title="line.recipe_role === 'solvent' ? 'Растворитель не входит в сумму — % не задаётся' : ''"
                  />
                </td>
                <td>
                  <InputText v-model="line.line_notes" placeholder="Комментарий" />
                </td>
                <td>
                  <Button icon="pi pi-trash" severity="danger" text @click="removeLine(idx)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </RowOpenPage>

  <TypedDeleteConfirm
    :visible="ctx.deleteModalVisible.value"
    :phrase="ctx.deleteModalPhrase.value"
    description="Удаление рецепта необратимо."
    @update:visible="(v) => { if (!v) ctx.cancelDelete() }"
    @confirmed="ctx.confirmDelete"
    @cancelled="ctx.cancelDelete"
  />
</template>

<style scoped>
.recipe-title {
  font-size: 16px;
  font-weight: 600;
  color: #003274;
}

.recipe-form {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 10px 16px;
  align-items: center;
}
.form-grid label {
  font-size: 13px;
  font-weight: 500;
  color: #003274;
}
.w-full { width: 100%; }

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}

.lines-wrap {
  overflow-x: auto;
}
.lines-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 700px;
}
.lines-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
  padding: 6px 8px;
  border-bottom: 1px solid #D1D7DE;
}
.lines-table td {
  padding: 4px 8px;
  vertical-align: middle;
}
.lines-table th:nth-child(1), .lines-table td:nth-child(1) { width: 160px; }
.lines-table th:nth-child(2), .lines-table td:nth-child(2) { width: 220px; }
.lines-table th:nth-child(3), .lines-table td:nth-child(3) { width: 70px; text-align: center; }
.lines-table th:nth-child(4), .lines-table td:nth-child(4) { width: 90px; }
.lines-table th:nth-child(6), .lines-table td:nth-child(6) { width: 40px; }

.col-include {
  text-align: center;
}

.lines-table :deep(.p-select),
.lines-table :deep(.p-inputtext) {
  width: 100%;
}

.role-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}
.role-badge--cathode { background: rgba(0, 50, 116, 0.08); color: #003274; }
.role-badge--anode { background: rgba(211, 167, 84, 0.15); color: #9a7030; }
.role-badge--none { color: #6B7280; }

.meta-text { color: #6B7280; font-size: 13px; }
</style>
