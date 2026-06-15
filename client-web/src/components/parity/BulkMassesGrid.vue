<!--
  BulkMassesGrid — inline editable mass list with bulk-paste.

  Sixth Phase A primitive. The "type the masses one at a time" pain
  point in vanilla's foil-mass workflow is solved by letting the user
  paste a column from Excel directly; the existing `parseBulkPaste`
  utility (used by `ElectrodeBulkPasteDialog`) does the heavy lifting.

  Behaviour
  ---------
  - v-model: Array<{ mass_g: number, cup_number?: number|null, comments?: string }>
  - Renders one row per item with inline `<input>`s, a × delete button,
    plus a footer with «+ Добавить» and «Вставить из Excel».
  - Pasting tab/comma/semicolon-separated text anywhere inside the grid
    invokes `parseBulkPaste` and REPLACES the current rows. A confirm
    is shown only when the grid already has content.
  - Optional columns: `showCupNumber` / `showComments` (default both
    true for the electrode use case; foil masses pass them as false).
  - Decimal commas (1,23) and dots (1.23) both parse via the same
    helper as the bulk-paste parser, so manual entry stays consistent.

  Props
  -----
  - `modelValue`     v-model array of row objects
  - `showCupNumber`  render the «Стакан» column (default true)
  - `showComments`   render the «Коммент.» column (default true)
  - `addButtonLabel` text for the «+ Добавить» button
  - `placeholder`    placeholder text shown in empty mass cells
  - `disabled`       disable all inputs and buttons

  Emits
  -----
  - `update:modelValue` (newArray)
  - `bulk-paste` ({ rowsAdded, skipped, replaced })   fires after a
    successful bulk-paste operation

  See also
  --------
  - `utils/electrodeBulkParse.js` — `parseBulkPaste` shared parser.
  - `docs/instructions/vue-frontend-architecture.md` §3.
-->

<template>
  <div class="bmg" :class="{ 'bmg--disabled': disabled }" @paste="onPaste">
    <table class="bmg-table">
      <thead>
        <tr>
          <th class="bmg-th bmg-th--idx">#</th>
          <th class="bmg-th bmg-th--mass">Масса, г</th>
          <th v-if="showCupNumber" class="bmg-th bmg-th--cup">Стакан</th>
          <th v-if="showComments" class="bmg-th bmg-th--comments">Коммент.</th>
          <th class="bmg-th bmg-th--actions" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i" class="bmg-tr">
          <td class="bmg-td bmg-td--idx">{{ i + 1 }}</td>
          <td class="bmg-td">
            <input
              type="text"
              inputmode="decimal"
              class="bmg-input bmg-input--mass"
              :value="formatNum(row.mass_g)"
              :placeholder="placeholder"
              :disabled="disabled"
              @input="onMassInput(i, $event.target.value)"
            />
          </td>
          <td v-if="showCupNumber" class="bmg-td">
            <input
              type="text"
              inputmode="numeric"
              class="bmg-input"
              :value="row.cup_number ?? ''"
              :disabled="disabled"
              @input="onCupInput(i, $event.target.value)"
            />
          </td>
          <td v-if="showComments" class="bmg-td">
            <input
              type="text"
              class="bmg-input"
              :value="row.comments || ''"
              :disabled="disabled"
              @input="onCommentsInput(i, $event.target.value)"
            />
          </td>
          <td class="bmg-td bmg-td--actions">
            <button
              type="button"
              class="bmg-del-btn"
              :disabled="disabled"
              title="Удалить строку"
              aria-label="Удалить строку"
              @click="removeRow(i)"
            ><i class="pi pi-times" /></button>
          </td>
        </tr>
        <tr v-if="rows.length === 0" class="bmg-empty">
          <td :colspan="colCount" class="bmg-empty-cell">
            Нет данных. Нажмите «+ Добавить» или вставьте из Excel.
          </td>
        </tr>
      </tbody>
    </table>

    <div class="bmg-footer">
      <button
        type="button"
        class="bmg-btn"
        :disabled="disabled"
        @click="addRow"
      >
        <i class="pi pi-plus" /> {{ addButtonLabel }}
      </button>
      <span class="bmg-hint">
        💡 Можно вставить столбец из Excel — заменит текущие строки
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { parseBulkPaste } from '@/utils/electrodeBulkParse.js';

const props = defineProps({
  modelValue:     { type: Array, default: () => [] },
  showCupNumber:  { type: Boolean, default: true },
  showComments:   { type: Boolean, default: true },
  addButtonLabel: { type: String, default: 'Добавить' },
  placeholder:    { type: String, default: '0,000' },
  disabled:       { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'bulk-paste']);

const rows = computed(() => props.modelValue || []);

const colCount = computed(() => {
  let n = 3; // # + Масса + actions
  if (props.showCupNumber) n += 1;
  if (props.showComments) n += 1;
  return n;
});

function emitNext(next) {
  emit('update:modelValue', next);
}

function makeBlankRow() {
  return { mass_g: null, cup_number: null, comments: '' };
}

function addRow() {
  if (props.disabled) return;
  emitNext([...rows.value, makeBlankRow()]);
}

function removeRow(i) {
  if (props.disabled) return;
  const next = rows.value.slice();
  next.splice(i, 1);
  emitNext(next);
}

/**
 * Same loose number parser as electrodeBulkParse.parseNumberLoose, kept
 * inline so the primitive doesn't pull in test-only exports. The two
 * sides must stay in sync — if either grows new rules, copy.
 */
function parseLoose(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim().replace(/\s+/g, '');
  if (!trimmed) return null;
  const normalized = trimmed.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatNum(n) {
  if (n == null || n === '') return '';
  // Keep user-typed precision; only format when we have a real number.
  if (typeof n === 'number') {
    return String(n).replace('.', ',');
  }
  return String(n);
}

function updateRow(i, patch) {
  const next = rows.value.slice();
  next[i] = { ...next[i], ...patch };
  emitNext(next);
}

function onMassInput(i, raw) {
  updateRow(i, { mass_g: parseLoose(raw) });
}
function onCupInput(i, raw) {
  const trimmed = String(raw).trim();
  const n = trimmed === '' ? null : Number(trimmed);
  updateRow(i, { cup_number: Number.isFinite(n) ? n : null });
}
function onCommentsInput(i, raw) {
  updateRow(i, { comments: raw });
}

/**
 * Single-column fast path: when the clipboard text has no tab characters,
 * we can't reuse `parseBulkPaste` because that helper treats commas as
 * column separators — and a column of Russian decimals like "1,23\n2,34"
 * would be split into two numeric "columns" of garbage.
 *
 * Detect single-column by absence of tabs. Each non-empty line then
 * parses as one mass value (rows without a numeric value count as skipped).
 * Header-looking lines (any Cyrillic / Latin letter) are skipped silently.
 */
function tryParseSingleColumn(text) {
  if (text.includes('\t')) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const rows = [];
  let skipped = 0;
  for (const line of lines) {
    if (/[a-zа-яё]/i.test(line)) { skipped += 1; continue; }
    const n = parseLoose(line);
    if (n != null) rows.push({ mass_g: n, cup_number: null, comments: '' });
    else skipped += 1;
  }
  return { rows, skippedLines: skipped };
}

/**
 * Bulk-paste handler. We listen on the wrapper `<div>` so the user can
 * paste from any input inside the grid — clipboard text is intercepted
 * and routed through the appropriate parser. If parsing yields at least
 * one row, the existing rows are REPLACED (after confirm if non-empty).
 */
function onPaste(event) {
  if (props.disabled) return;
  const text = event.clipboardData?.getData('text/plain') || '';
  // Single-cell paste (no newline, no separators) goes through the normal
  // input handler so the user can type a single value into a cell.
  if (!/\n|\t/.test(text) && text.indexOf(';') === -1) return;

  // Prefer the single-column parser when there are no tabs — it preserves
  // Russian decimal commas correctly. Multi-column (Excel) goes through
  // the shared parseBulkPaste which understands headers + cup + comments.
  const result = tryParseSingleColumn(text) || parseBulkPaste(text);
  const parsedRows = result.rows;
  const skippedLines = result.skippedLines;
  if (parsedRows.length === 0) return;

  event.preventDefault();

  const willReplace = rows.value.length > 0;
  if (willReplace) {
    const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(`Заменить текущие ${rows.value.length} строк на ${parsedRows.length}?`)
      : true;
    if (!confirmed) return;
  }

  emitNext(parsedRows);
  emit('bulk-paste', {
    rowsAdded: parsedRows.length,
    skipped: skippedLines,
    replaced: willReplace,
  });
}

// Exposed for unit tests so they can call parsing without simulating
// the full ClipboardEvent.
defineExpose({
  _addRow: addRow,
  _removeRow: removeRow,
  _updateRow: updateRow,
  _parseLoose: parseLoose,
});
</script>

<style scoped>
.bmg {
  border: 1px solid rgba(0, 50, 116, 0.10);
  border-radius: 8px;
  background: white;
  overflow: hidden;
}

.bmg-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.bmg-th {
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.55);
  background: rgba(0, 50, 116, 0.03);
  padding: 7px 8px;
  border-bottom: 1.5px solid rgba(0, 50, 116, 0.08);
}
.bmg-th--idx { width: 40px; text-align: center; }
.bmg-th--mass { width: 100px; }
.bmg-th--cup { width: 80px; }
.bmg-th--actions { width: 36px; }

.bmg-td {
  padding: 4px 6px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.04);
  vertical-align: middle;
}
.bmg-td--idx {
  text-align: center;
  font-size: 12px;
  color: #6B7280;
  font-variant-numeric: tabular-nums;
}
.bmg-td--actions { text-align: center; }
.bmg-tr:last-child .bmg-td { border-bottom: none; }

.bmg-input {
  width: 100%;
  height: 28px;
  padding: 3px 6px;
  border: 1px solid rgba(0, 50, 116, 0.10);
  border-radius: 5px;
  font: inherit;
  font-size: 12.5px;
  background: white;
  color: #1a2a3a;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.bmg-input--mass {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.bmg-input:hover:not(:focus):not(:disabled) {
  border-color: rgba(0, 50, 116, 0.25);
}
.bmg-input:focus {
  outline: none;
  border-color: #003274;
  box-shadow: 0 0 0 2px rgba(0, 50, 116, 0.10);
}
.bmg-input:disabled {
  background: rgba(0, 50, 116, 0.03);
  color: rgba(0, 50, 116, 0.55);
  cursor: not-allowed;
}

.bmg-del-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: rgba(198, 40, 40, 0.65);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.bmg-del-btn:hover:not(:disabled) {
  background: rgba(229, 57, 53, 0.10);
  color: #C62828;
  border-color: rgba(229, 57, 53, 0.30);
}
.bmg-del-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bmg-del-btn i { font-size: 11px; }

.bmg-empty .bmg-empty-cell {
  text-align: center;
  padding: 18px 12px;
  font-size: 12px;
  color: #6B7280;
  background: rgba(0, 50, 116, 0.02);
}

.bmg-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  background: rgba(0, 50, 116, 0.02);
  border-top: 1px solid rgba(0, 50, 116, 0.06);
}

.bmg-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border: 1.5px solid rgba(0, 50, 116, 0.20);
  border-radius: 6px;
  background: white;
  color: #003274;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.bmg-btn:hover:not(:disabled) {
  background: rgba(0, 50, 116, 0.06);
  border-color: rgba(0, 50, 116, 0.35);
}
.bmg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.bmg-btn i { font-size: 11px; }

.bmg-hint {
  font-size: 11.5px;
  color: #6B7280;
}
</style>
