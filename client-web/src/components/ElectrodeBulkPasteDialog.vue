<script setup>
/**
 * ElectrodeBulkPasteDialog — bulk-import electrodes from clipboard.
 *
 * The user pastes tab/comma-separated values copied from Excel or
 * Google Sheets. The parser auto-detects header rows and column order;
 * the preview is rendered inside a constructor-style mini-zone so the
 * user can verify what will be appended before applying.
 *
 * Design tokens used (src/pages/DesignSystemPage.vue):
 *   - eyebrow / constructor title: 11px 700 uppercase 0.05em
 *     rgba(0,50,116,0.50)
 *   - card title:                  Rosatom 15px 700 #003274
 *   - field label:                 13px 600 #4B5563
 *   - body text:                   14px 400 #333333
 *   - small/hint:                  12px 400 #6B7280
 *   - badge-2 (охра) for warnings, badge-8 (red) for errors,
 *     badge-3 (хвойный) for success counts
 *   - constructor box: 1px solid rgba(0,50,116,0.12), 10px radius
 *
 * Output: emits `applied` with an array of
 *   { mass_g, cup_number, comments }
 * Parent appends these as new electrode rows (append-only).
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
  return n == null ? '—' : n;
}

const columnLabels = {
  mass: 'Масса',
  cup: 'Стакан',
  comments: 'Комментарий',
};
</script>

<template>
  <Dialog
    :visible="visible"
    :style="{ width: '760px' }"
    modal
    :draggable="false"
    :show-header="false"
    @update:visible="(v) => emit('update:visible', v)"
  >
    <div class="bp-card">
      <div class="bp-eyebrow">Электроды · Импорт</div>
      <h3 class="bp-title">Вставка из буфера</h3>

      <p class="bp-hint">
        Скопируйте столбцы из Excel или Google Sheets и вставьте в поле ниже.
        Заголовок строки распознаётся автоматически — поддерживаются
        <code>Масса</code> / <code>Стакан</code> / <code>Комментарий</code>
        (и английские аналоги). Без заголовка порядок столбцов —
        масса, стакан, комментарий.
      </p>

      <label class="bp-field-label" for="bp-paste">Данные</label>
      <Textarea
        id="bp-paste"
        v-model="pastedText"
        rows="6"
        class="bp-paste-area"
        placeholder="1,234&#9;5&#9;комментарий&#10;1,256&#9;6"
        autofocus
      />

      <!-- ── Constructor-style preview zone ── -->
      <div v-if="parsed.rows.length > 0" class="bp-constructor">
        <div class="bp-constructor-head">
          <span class="bp-constructor-title">Распознано</span>
          <div class="bp-pills">
            <span class="badge badge-3">{{ parsed.rows.length }} строк</span>
            <span v-if="parsed.skippedLines > 0" class="badge badge-2">
              <i class="pi pi-exclamation-triangle" /> пропущено {{ parsed.skippedLines }}
            </span>
            <span class="badge badge-outline badge-6">
              {{ parsed.columnsDetected.map(c => columnLabels[c] || c).join(' · ') }}
            </span>
          </div>
        </div>
        <div class="bp-table-wrap">
          <table class="bp-table">
            <thead>
              <tr>
                <th class="bp-num">№</th>
                <th>Масса, г</th>
                <th>Стакан №</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in parsed.rows" :key="idx">
                <td class="bp-num">{{ idx + 1 }}</td>
                <td>{{ fmtMass(row.mass_g) }}</td>
                <td>{{ fmtCup(row.cup_number) }}</td>
                <td>{{ row.comments || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="pastedText.length > 0" class="bp-empty">
        <span class="badge badge-8">
          <i class="pi pi-times-circle" /> Не удалось распознать ни одной строки с массой
        </span>
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
/* ── Card layout matching .glass-card section pattern ── */
.bp-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-xs) 0 var(--space-sm);
  max-height: 70vh;
  overflow: hidden;
}
.bp-eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
}
.bp-title {
  font-family: 'Rosatom', system-ui, sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #003274;
  margin: 0;
  line-height: 1.3;
}
.bp-hint {
  margin: 0;
  font-size: 12px;
  font-weight: 400;
  color: #6B7280;
  line-height: 1.5;
}
.bp-hint code {
  background: rgba(0, 50, 116, 0.06);
  color: #003274;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
}
.bp-field-label {
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
}
.bp-paste-area {
  width: 100%;
  font-family: ui-monospace, monospace;
  font-size: 13px;
}

/* ── Constructor-style preview ── */
.bp-constructor {
  border: 1px solid rgba(0, 50, 116, 0.12);
  border-radius: 10px;
  background: white;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 280px;
}
.bp-constructor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid rgba(0, 50, 116, 0.10);
  flex-wrap: wrap;
}
.bp-constructor-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
}
.bp-pills {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  flex-wrap: wrap;
}
.bp-pills .badge i {
  font-size: 10px;
  margin-right: 4px;
}

/* ── Table inside the constructor zone ── */
.bp-table-wrap {
  overflow-y: auto;
  flex: 1;
}
.bp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  color: #333333;
}
.bp-table th {
  background: rgba(0, 50, 116, 0.04);
  color: #003274;
  font-family: 'Rosatom', system-ui, sans-serif;
  font-weight: 700;
  font-size: 13px;
  text-align: left;
  padding: var(--space-xs) var(--space-md);
  position: sticky;
  top: 0;
  z-index: 1;
}
.bp-table td {
  padding: var(--space-xs) var(--space-md);
  border-top: 1px solid rgba(0, 50, 116, 0.06);
}
.bp-num {
  color: #9CA3AF;
  width: 48px;
  font-size: 12px;
}

/* ── Empty / error pill ── */
.bp-empty {
  padding: var(--space-xs) 0;
}
.bp-empty .badge i {
  margin-right: 4px;
}
</style>
