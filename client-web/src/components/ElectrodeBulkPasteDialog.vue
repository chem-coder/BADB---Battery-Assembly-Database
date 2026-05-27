<script setup>
/**
 * ElectrodeBulkPasteDialog — bulk-import electrodes from clipboard.
 *
 * The user pastes tab/comma-separated values copied from Excel or
 * Google Sheets. The parser auto-detects header rows and column order;
 * the preview table shows what will be appended so the user can verify
 * before applying.
 *
 * Output: emits `applied` with an array of
 *   { mass_g, cup_number, comments }
 * The parent appends these to its electrodes[] list as new rows
 * (already-saved electrodes are not affected — append-only).
 */
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import { parseBulkPaste } from '@/utils/electrodeBulkParse';

const props = defineProps({
  visible: { type: Boolean, required: true },
});

const emit = defineEmits(['update:visible', 'applied']);

const pastedText = ref('');
const parsed = computed(() => parseBulkPaste(pastedText.value));

watch(
  () => props.visible,
  (v) => { if (v) pastedText.value = ''; }
);

function onApply() {
  if (parsed.value.rows.length === 0) return;
  emit('applied', parsed.value.rows);
  emit('update:visible', false);
}

function onCancel() {
  emit('update:visible', false);
}

function fmtMass(n) {
  if (n == null) return '—';
  return Number(n).toFixed(4).replace(/\.?0+$/, '');
}

function fmtCup(n) {
  if (n == null) return '—';
  return n;
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Вставка электродов из буфера"
    :style="{ width: '720px' }"
    modal
    :draggable="false"
    @update:visible="(v) => emit('update:visible', v)"
  >
    <div class="bulk-body">
      <p class="bulk-hint">
        Скопируйте столбцы из Excel/Google Sheets и вставьте сюда.
        Поддерживаются заголовки <code>Масса</code> / <code>Стакан</code> /
        <code>Комментарий</code> или их английские аналоги. Без заголовка
        порядок столбцов — масса, стакан, комментарий.
      </p>

      <Textarea
        v-model="pastedText"
        rows="6"
        class="paste-area"
        placeholder="1,234&#9;5&#9;комментарий&#10;1,256&#9;6"
        autofocus
      />

      <div v-if="parsed.rows.length > 0" class="preview">
        <p class="preview-summary">
          <strong>Распознано:</strong> {{ parsed.rows.length }} строк
          <span v-if="parsed.skippedLines > 0" class="preview-skipped">
            (пропущено {{ parsed.skippedLines }} без массы)
          </span>
          <span class="preview-cols">
            · столбцы: {{ parsed.columnsDetected.join(', ') }}
          </span>
        </p>
        <table class="preview-table">
          <thead>
            <tr>
              <th class="num-col">#</th>
              <th>Масса, г</th>
              <th>Стакан №</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in parsed.rows" :key="idx">
              <td class="num-col">{{ idx + 1 }}</td>
              <td>{{ fmtMass(row.mass_g) }}</td>
              <td>{{ fmtCup(row.cup_number) }}</td>
              <td>{{ row.comments || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="pastedText.length > 0" class="preview-empty">
        Не удалось распознать ни одной строки с массой.
      </div>
    </div>

    <template #footer>
      <Button label="Отмена" severity="secondary" outlined @click="onCancel" />
      <Button
        label="Добавить в список"
        icon="pi pi-plus"
        :disabled="parsed.rows.length === 0"
        @click="onApply"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.bulk-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
  overflow: hidden;
}
.bulk-hint {
  margin: 0;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.5;
}
.bulk-hint code {
  background: #f3f4f6;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
.paste-area {
  width: 100%;
  font-family: ui-monospace, monospace;
  font-size: 13px;
}
.preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
  overflow-y: auto;
}
.preview-summary {
  margin: 0;
  font-size: 13px;
  color: #003274;
}
.preview-skipped {
  color: #b45309;
  margin-left: 6px;
}
.preview-cols {
  color: #6b7280;
  margin-left: 6px;
}
.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.preview-table th,
.preview-table td {
  text-align: left;
  padding: 4px 8px;
  border-bottom: 1px solid #e5e7eb;
}
.preview-table th {
  background: #f9fafb;
  color: #003274;
  font-weight: 600;
}
.num-col {
  color: #6b7280;
  width: 36px;
}
.preview-empty {
  font-size: 13px;
  color: #b91c1c;
  padding: 8px;
  background: #fef2f2;
  border-radius: 4px;
}
</style>
