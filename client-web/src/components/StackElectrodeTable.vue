<script setup>
/**
 * StackElectrodeTable — the electrode picker for ONE role (cathode |
 * anode) of the stack builder. Vanilla parity: renderCathodeElectrodeTable /
 * renderAnodeElectrodeTable + the stackSort machinery
 * (public/js/3-batteries.js:6299-6534).
 *
 * Pure presentation: receives the (already merged, available-only) pool,
 * the current selection and the N/P guidance, emits `toggle` per click.
 * Sort state is component-local — per-role independent, like vanilla's
 * state.ui.stackSort.
 *
 * The anode table carries the extra «A − средн.» column: this anode's
 * computed capacity minus the per-anode target from the N/P helper, plus
 * the «предложен / выбран» note and the green recommended-row highlight.
 */
import { ref, computed } from 'vue'
import Checkbox from 'primevue/checkbox'
import {
  sortElectrodesForPicker,
  nextStackSort,
  fmtStackCapacity,
  fmtCapacityDelta,
} from '@/utils/electrodeStack'

const props = defineProps({
  role: { type: String, required: true }, // 'cathode' | 'anode'
  electrodes: { type: Array, default: () => [] },
  selectedIds: { type: Set, default: () => new Set() },
  // Whole-table lock (read-only stack / invalid targets / no battery).
  disabled: { type: Boolean, default: false },
  // Unchecked boxes get disabled once the role's target count is reached
  // (vanilla renderStackUiState cap behaviour).
  canSelectMore: { type: Boolean, default: true },
  // N/P helper guidance (anode table only; null = helper inactive).
  npPerAnodeTarget: { type: Number, default: null },
  npRecommendedIds: { type: Set, default: () => new Set() },
})

const emit = defineEmits(['toggle'])

const isAnode = computed(() => props.role === 'anode')
const title = computed(() => (isAnode.value ? 'Аноды' : 'Катоды'))

// ── Sorting (vanilla stackSort: same-key click toggles, new key uses
// its default direction; № ascending initially) ──
const sort = ref({ key: 'number', dir: 'asc' })
function onSortClick(key) {
  sort.value = nextStackSort(sort.value, key)
}
const sortedElectrodes = computed(() => sortElectrodesForPicker(props.electrodes, sort.value))

function arrow(key) {
  if (sort.value.key !== key) return ''
  return sort.value.dir === 'asc' ? '▲' : '▼'
}
function ariaSort(key) {
  if (sort.value.key !== key) return 'none'
  return sort.value.dir === 'asc' ? 'ascending' : 'descending'
}

function isSelected(e) {
  return props.selectedIds.has(Number(e.electrode_id))
}

function isRowDisabled(e) {
  if (props.disabled) return true
  return !isSelected(e) && !props.canSelectMore
}

function isRecommended(e) {
  return isAnode.value && props.npRecommendedIds.has(Number(e.electrode_id))
}

function npDelta(e) {
  if (!isAnode.value || props.npPerAnodeTarget == null) return null
  const cap = Number(e.capacity_actual_mAh)
  if (!Number.isFinite(cap)) return null
  return cap - props.npPerAnodeTarget
}

// «предложен, выбран» / «предложен» / «выбран» (vanilla renderAnodeNpGuidance)
function npNote(e) {
  const parts = []
  if (isRecommended(e)) parts.push('предложен')
  if (isSelected(e)) parts.push('выбран')
  return parts.join(', ')
}

function onToggle(e) {
  if (isRowDisabled(e)) return
  emit('toggle', e)
}
</script>

<template>
  <div class="set-block">
    <div class="set-title">{{ title }}</div>
    <div v-if="electrodes.length === 0" class="set-empty">
      Нет доступных электродов в выбранных партиях.
    </div>
    <div v-else class="set-scroll">
      <table class="set-table">
        <thead>
          <tr>
            <th class="set-th set-th--idx"></th>
            <th
              class="set-th set-th--sortable"
              title="Номер электрода в партии (как в Excel). Нажмите для сортировки"
              :aria-sort="ariaSort('number')"
              @click="onSortClick('number')"
            >№ <span class="sort-arrow">{{ arrow('number') }}</span></th>
            <th
              class="set-th set-th--sortable"
              title="Нажмите для сортировки"
              :aria-sort="ariaSort('id')"
              @click="onSortClick('id')"
            >ID электрода <span class="sort-arrow">{{ arrow('id') }}</span></th>
            <th
              class="set-th set-th--sortable"
              title="Нажмите для сортировки"
              :aria-sort="ariaSort('mass')"
              @click="onSortClick('mass')"
            >m, g <span class="sort-arrow">{{ arrow('mass') }}</span></th>
            <th
              class="set-th"
              title="Расчётная ёмкость по фактически введённой массе и составу; не измерение после циклирования"
            >Расч. ёмк., мАч</th>
            <th
              v-if="isAnode"
              class="set-th"
              title="Ёмкость этого анода минус целевая ёмкость одного анода"
            >A − средн.</th>
            <th class="set-th set-th--pick">Выбрать</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(e, i) in sortedElectrodes"
            :key="e.electrode_id"
            class="set-row"
            :class="{
              'set-row--selected': isSelected(e),
              'set-row--recommended': isRecommended(e),
              'set-row--disabled': isRowDisabled(e),
            }"
            @click="onToggle(e)"
          >
            <td class="set-td set-td--idx">{{ i + 1 }}</td>
            <td class="set-td">{{ e.number_in_batch ?? '—' }}</td>
            <td class="set-td">{{ e.electrode_id }}</td>
            <td class="set-td">{{ e.electrode_mass_g ?? '—' }}</td>
            <td class="set-td">
              <div class="cap-primary">{{ fmtStackCapacity(e.capacity_actual_mAh) }}</div>
              <div class="cap-secondary">по рецепту: {{ fmtStackCapacity(e.capacity_theoretical_mAh) }}</div>
            </td>
            <td v-if="isAnode" class="set-td">
              <div class="cap-primary">{{ npDelta(e) == null ? '—' : fmtCapacityDelta(npDelta(e)) }}</div>
              <div v-if="npNote(e)" class="cap-secondary">{{ npNote(e) }}</div>
            </td>
            <td class="set-td set-td--pick" @click.stop>
              <Checkbox
                :model-value="isSelected(e)"
                :binary="true"
                :disabled="isRowDisabled(e)"
                @update:model-value="onToggle(e)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.set-block {
  flex: 1 1 340px;
  min-width: 0;
}

.set-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.55);
  margin-bottom: 6px;
}

.set-empty {
  font-size: 12.5px;
  color: rgba(0, 50, 116, 0.45);
  padding: 8px 2px;
}

/* Clean-scroll recipe: bounded height + contained overscroll so the page
   doesn't rubber-band, with an OPAQUE sticky header (translucent headers
   shimmer over scrolling rows). */
.set-scroll {
  max-height: 320px;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
}

.set-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.set-th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f2f6fa;
  padding: 6px 8px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  color: rgba(0, 50, 116, 0.6);
  border-bottom: 1.5px solid rgba(0, 50, 116, 0.10);
  white-space: nowrap;
  user-select: none;
}
.set-th--sortable { cursor: pointer; }
.set-th--sortable:hover { color: #003274; }
.sort-arrow { font-size: 9px; }
.set-th--idx { width: 28px; }
.set-th--pick { text-align: center; }

/* Zebra rows, not per-cell grid lines — lines shimmer on scroll. */
.set-row:nth-child(even) .set-td { background: rgba(0, 50, 116, 0.025); }
.set-row { cursor: pointer; }
.set-row:hover .set-td { background: rgba(82, 201, 166, 0.06); }
.set-row--selected .set-td { background: rgba(82, 201, 166, 0.10); }
.set-row--selected:hover .set-td { background: rgba(82, 201, 166, 0.14); }
/* N/P recommended anodes — vanilla battery-np-best-candidate green. */
.set-row--recommended .set-td { background: #f3f8ed; }
.set-row--recommended.set-row--selected .set-td { background: #e8f3e0; }
.set-row--disabled { cursor: default; }
.set-row--disabled .set-td { color: rgba(0, 50, 116, 0.35); }

.set-td {
  padding: 5px 8px;
  border-bottom: none;
  color: #1a2a3a;
  vertical-align: middle;
}
.set-td--idx {
  color: rgba(0, 50, 116, 0.35);
  font-size: 11px;
}
.set-td--pick { text-align: center; }

.cap-primary { line-height: 1.25; }
.cap-secondary {
  font-size: 10.5px;
  color: rgba(0, 50, 116, 0.45);
  line-height: 1.2;
}
</style>
