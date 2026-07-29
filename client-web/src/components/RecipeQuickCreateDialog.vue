<script setup>
/**
 * RecipeQuickCreateDialog — «+ Новая рецептура…» inline from the tape flow
 * (feature_backlog 2026-07-28 №3; design agreed in the materials sessions).
 *
 * Composition-first: the user enters the formulation (АМ % + supporting
 * lines), the name auto-derives in the d047 convention
 * («96 АМ : 2.2 Super P : 1.8 PVDF»), and BEFORE creating we ask the
 * backend's /api/recipes/check-duplicate (the d047 canonical signature) —
 * an identical formulation switches to the existing recipe instead of
 * creating a twin. That keeps the d047 dedup a permanent guarantee.
 *
 * Emits `created(tape_recipe_id)` for both outcomes (new or existing).
 */
import { ref, computed, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import api from '@/services/api';
import { toastApiError } from '@/utils/errorClassifier';

const props = defineProps({
  visible: { type: Boolean, required: true },
  /** Full materials list (role, material_id, name) — from the page's refData. */
  materials: { type: Array, default: () => [] },
  /** Preselect the electrode role, e.g. from the tape's context. */
  initialRole: { type: String, default: 'cathode' },
});
const emit = defineEmits(['update:visible', 'created']);

const toast = useToast();

const role = ref('cathode');
const activePercent = ref(null);
const notes = ref('');
const saving = ref(false);
const duplicate = ref(null); // { tape_recipe_id, name } when detected

// Supporting lines. Solvent lines are excluded from the 100% dry-solids
// sum (same rule as the Recipes page).
const LINE_ROLES = [
  { value: 'binder', label: 'связующее', materialRole: 'binder' },
  { value: 'additive', label: 'провод. добавка', materialRole: 'conductive_additive' },
  { value: 'solvent', label: 'растворитель', materialRole: 'solvent' },
];
const lines = ref([]);

function emptyLine() {
  return { recipe_role: 'binder', material_id: null, slurry_percent: null };
}

watch(() => props.visible, (v) => {
  if (!v) return;
  role.value = props.initialRole === 'anode' ? 'anode' : 'cathode';
  activePercent.value = null;
  notes.value = '';
  duplicate.value = null;
  saving.value = false;
  lines.value = [emptyLine(), emptyLine()];
});

function materialOptionsFor(line) {
  const lr = LINE_ROLES.find(r => r.value === line.recipe_role);
  return props.materials
    .filter(m => m.role === (lr ? lr.materialRole : ''))
    .map(m => ({ value: m.material_id, label: m.name }));
}

function materialName(id) {
  return props.materials.find(m => m.material_id === id)?.name || '';
}

function isIncluded(line) {
  return line.recipe_role !== 'solvent';
}

function fmtPct(v) {
  // d047 naming uses trimmed numbers: 2.20 → 2.2, 96.0 → 96.
  return String(Number(v));
}

const includedSum = computed(() => {
  let sum = Number(activePercent.value) || 0;
  for (const l of lines.value) {
    if (isIncluded(l)) sum += Number(l.slurry_percent) || 0;
  }
  return Math.round(sum * 1000) / 1000;
});

// Auto-name in the d047 convention, from the composition itself.
const suggestedName = computed(() => {
  if (!activePercent.value) return '';
  const parts = [`${fmtPct(activePercent.value)} АМ`];
  for (const l of lines.value) {
    if (!isIncluded(l) || !l.material_id || !l.slurry_percent) continue;
    parts.push(`${fmtPct(l.slurry_percent)} ${materialName(l.material_id)}`);
  }
  return parts.join(' : ');
});

const canSave = computed(() => {
  if (saving.value) return false;
  if (!activePercent.value || activePercent.value <= 0) return false;
  for (const l of lines.value) {
    if (!l.material_id) return false;
    if (isIncluded(l) && (!l.slurry_percent || l.slurry_percent <= 0)) return false;
  }
  return includedSum.value === 100;
});

function buildLines() {
  const activeRole = role.value === 'cathode' ? 'cathode_active' : 'anode_active';
  return [
    // d047: the active line is an open slot — material_id NULL.
    { recipe_role: activeRole, material_id: null, slurry_percent: activePercent.value, include_in_pct: true, line_notes: null },
    ...lines.value.map(l => ({
      recipe_role: l.recipe_role === 'additive' ? 'additive' : l.recipe_role,
      material_id: l.material_id,
      slurry_percent: l.slurry_percent,
      include_in_pct: isIncluded(l),
      line_notes: null,
    })),
  ];
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  duplicate.value = null;
  try {
    const payload = buildLines();
    const { data: check } = await api.post('/api/recipes/check-duplicate', {
      role: role.value,
      lines: payload.map(l => ({
        recipe_role: l.recipe_role,
        material_id: l.material_id,
        slurry_percent: l.slurry_percent,
        include_in_pct: l.include_in_pct,
      })),
    });
    if (check.duplicate) {
      duplicate.value = check.duplicate;
      saving.value = false;
      return; // user decides in the inline prompt
    }
    const { data: created } = await api.post('/api/recipes', {
      name: suggestedName.value,
      role: role.value,
      variant_label: null,
      notes: notes.value.trim() || null,
      lines: payload,
    });
    toast.add({ severity: 'success', summary: `Рецептура создана: ${suggestedName.value}`, life: 3500 });
    emit('created', created.tape_recipe_id);
    emit('update:visible', false);
  } catch (err) {
    toastApiError(toast, err, 'Не удалось создать рецептуру');
    saving.value = false;
  }
}

function useExisting() {
  if (!duplicate.value) return;
  toast.add({ severity: 'info', summary: `Используется существующая: ${duplicate.value.name}`, life: 3500 });
  emit('created', duplicate.value.tape_recipe_id);
  emit('update:visible', false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :style="{ width: '560px' }"
    header="Новая рецептура"
    @update:visible="(v) => emit('update:visible', v)"
  >
    <div class="rqc-body">
      <div class="rqc-row">
        <Select
          v-model="role"
          :options="[{ value: 'cathode', label: 'катодная' }, { value: 'anode', label: 'анодная' }]"
          option-value="value"
          option-label="label"
        />
        <InputNumber
          v-model="activePercent"
          :min="0" :max="100" :max-fraction-digits="3"
          placeholder="% АМ"
          suffix=" % АМ"
        />
      </div>

      <div v-for="(l, i) in lines" :key="i" class="rqc-row rqc-line">
        <Select
          v-model="l.recipe_role"
          :options="LINE_ROLES"
          option-value="value"
          option-label="label"
          @change="l.material_id = null"
        />
        <Select
          v-model="l.material_id"
          :options="materialOptionsFor(l)"
          option-value="value"
          option-label="label"
          filter
          placeholder="— материал —"
        />
        <InputNumber
          v-model="l.slurry_percent"
          :min="0" :max="100" :max-fraction-digits="3"
          :placeholder="isIncluded(l) ? '%' : '% (вне 100%)'"
        />
        <Button icon="pi pi-times" text severity="secondary" :disabled="lines.length <= 1"
          @click="lines.splice(i, 1)" />
      </div>
      <Button label="+ строка" text size="small" @click="lines.push(emptyLine())" />

      <div class="rqc-sum" :class="{ 'rqc-sum--bad': includedSum !== 100 }">
        Сумма сухих компонентов: {{ includedSum }} % (нужно 100 %)
      </div>

      <div v-if="suggestedName" class="rqc-name">
        Название: <strong>{{ suggestedName }}</strong>
      </div>

      <InputText v-model="notes" placeholder="Заметки (необязательно)" />

      <!-- Duplicate found: switch instead of creating a twin (d047 model:
           identical composition IS the same recipe). -->
      <div v-if="duplicate" class="rqc-duplicate">
        <i class="pi pi-exclamation-triangle" />
        Такая рецептура уже есть: <strong>{{ duplicate.name }}</strong>
        <div class="rqc-duplicate-actions">
          <Button label="Использовать существующую" size="small" @click="useExisting" />
          <Button label="Отмена" size="small" text severity="secondary" @click="duplicate = null" />
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="Отмена" text severity="secondary" @click="emit('update:visible', false)" />
      <Button label="Создать" icon="pi pi-plus" :disabled="!canSave" :loading="saving" @click="save" />
    </template>
  </Dialog>
</template>

<style scoped>
.rqc-body { display: flex; flex-direction: column; gap: 10px; }
.rqc-row { display: flex; gap: 8px; align-items: center; }
.rqc-row :deep(.p-select) { min-width: 140px; }
.rqc-line :deep(.p-inputnumber input) { width: 90px; }
.rqc-sum { font-size: 13px; color: #2e7d32; }
.rqc-sum--bad { color: #c0392b; font-weight: 600; }
.rqc-name { font-size: 13px; color: #003274; }
.rqc-duplicate {
  border-left: 4px solid #e8a013;
  background: rgba(232, 160, 19, 0.08);
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
}
.rqc-duplicate .pi { margin-right: 6px; color: #b26a00; }
.rqc-duplicate-actions { margin-top: 8px; display: flex; gap: 8px; }
</style>
