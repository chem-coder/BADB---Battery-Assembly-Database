<script setup>
/**
 * ElectrodeBatchPanel — per-batch detail surface for ElectrodesPage.
 *
 * Replaces the legacy ElectrodeFormPage (route /electrodes/:id), folding
 * its three legitimate sections into one inline panel mounted below the
 * constructor:
 *   1. Электроды — list of electrodes in the batch (mass / cup /
 *      comments / include_in_capacity_average / status / scrap+delete)
 *   2. Масса фольги — foil mass rows
 *   3. Сводная ёмкость — capacity summary (read-only derived)
 *
 * What the legacy page did that's NOT migrated:
 *   - Cutting params (target_form_factor, shape, dimensions) — already
 *     handled by the constructor's `cutting` stage in electrodeStages.js.
 *   - Drying params — already in the constructor's `drying` stage.
 *   - Batch create — already done via BatchCreateDialog.
 *
 * Scoped to one batchId. Loads/refreshes its own state. Backend writes
 * round-trip via per-row PUTs (no big save button) so changes never get
 * lost waiting for an explicit save.
 *
 * Architectural rationale: docs/instructions/vue-frontend-architecture.md
 * principle #1 — "Constructor is the only edit surface; form pages are
 * being phased out". This panel completes that phase for electrodes.
 */
import { ref, watch, computed } from 'vue';
import api from '@/services/api';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { toastApiError } from '@/utils/errorClassifier';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import Textarea from 'primevue/textarea';
import CollapsibleSection from '@/components/parity/CollapsibleSection.vue';
import ElectrodeBulkPasteDialog from '@/components/ElectrodeBulkPasteDialog.vue';
import { fmtCapacity } from '@/utils/formatCapacity';

const props = defineProps({
  batchId: { type: [Number, String, null], default: null },
  // Scope hint (audit P2 #7) — when the constructor has multiple
  // batches open for comparison, the panel only edits the ACTIVE one.
  // Pass `constructorCount` so we can warn the user explicitly that
  // their edits won't apply to the other open batches.
  constructorCount: { type: Number, default: 1 },
});

const toast = useToast();
const confirm = useConfirm();

// Save indicator (audit P2 #5) — increments on every in-flight PUT/POST/
// DELETE, decrements on response. When > 0 the panel header shows a
// brief "Сохранение…" badge. When it goes 1→0 we briefly flash a
// "Сохранено" pill so the user knows the round-trip landed.
const saveInflight = ref(0);
const justSavedAt = ref(0);
let savedFlashTimer = null;
function startSave() {
  saveInflight.value += 1;
}
function endSave() {
  saveInflight.value = Math.max(0, saveInflight.value - 1);
  if (saveInflight.value === 0) {
    justSavedAt.value = Date.now();
    if (savedFlashTimer) clearTimeout(savedFlashTimer);
    savedFlashTimer = setTimeout(() => { justSavedAt.value = 0; }, 1500);
  }
}
const showSaving = computed(() => saveInflight.value > 0);
const showSaved = computed(() => !showSaving.value && justSavedAt.value > 0);

// Scrap-with-reason dialog state (audit P2 #6 — replaces window.prompt).
const scrapTarget = ref(null);   // electrode object being scrapped
const scrapReason = ref('');

// ── Reactive state ──
const electrodes = ref([]);          // array of electrode rows from /electrodes/electrode-cut-batches/:id/electrodes
const foilRows = ref([]);            // array of { _key, mass_g }
const capacitySummary = ref(null);   // { average_capacity_theoretical_mAh, average_capacity_actual_mAh, ... }
const loading = ref(false);
const bulkPasteVisible = ref(false);

let foilCounter = 0;
let nextNewRowId = -1;               // local sentinel for new (unsaved) rows

// ── Load all batch data ──
async function load(batchId) {
  if (!batchId) {
    electrodes.value = [];
    foilRows.value = [];
    capacitySummary.value = null;
    return;
  }
  loading.value = true;
  try {
    await Promise.all([
      loadElectrodes(batchId),
      loadFoilMasses(batchId),
      loadCapacitySummary(batchId),
    ]);
  } finally {
    loading.value = false;
  }
}

watch(() => props.batchId, load, { immediate: true });

async function loadElectrodes(batchId) {
  try {
    const { data } = await api.get(
      `/api/electrodes/electrode-cut-batches/${batchId}/electrodes`,
    );
    electrodes.value = data;
  } catch (err) {
    toastApiError(toast, err, 'Ошибка загрузки электродов');
  }
}

async function loadFoilMasses(batchId) {
  try {
    const { data } = await api.get(
      `/api/electrodes/electrode-cut-batches/${batchId}/foil-masses`,
    );
    if (data.length) {
      foilRows.value = data.map((m) => ({ _key: foilCounter++, mass_g: m.mass_g ?? '' }));
    } else {
      foilRows.value = [{ _key: foilCounter++, mass_g: '' }];
    }
  } catch {
    foilRows.value = [{ _key: foilCounter++, mass_g: '' }];
  }
}

async function loadCapacitySummary(batchId) {
  try {
    const { data } = await api.get(
      `/api/electrodes/electrode-cut-batches/${batchId}/report`,
    );
    capacitySummary.value = data?.capacity_summary || null;
  } catch {
    capacitySummary.value = null;
  }
}

// Debounced wrapper (audit P3 #16). When a user bulk-pastes 60 electrode
// masses, each row triggers a PUT + capacity reload. Without debouncing
// that's 60 backend round-trips for derived data the user only sees
// once they stop typing. 800ms idle window matches the existing
// stage-editor autosave cadence, so the user-perceived "settled" delay
// stays consistent across the page.
let capacityReloadTimer = null;
function scheduleCapacityReload(batchId) {
  if (capacityReloadTimer) clearTimeout(capacityReloadTimer);
  capacityReloadTimer = setTimeout(() => {
    loadCapacitySummary(batchId);
  }, 800);
}

// ── Per-row write helpers ──
async function updateElectrode(e, field, value) {
  if (!e.electrode_id) return;
  startSave();
  try {
    // ?? null (not || null) to preserve numeric 0 — mass=0 is a valid
    // calibration record, cup=0 means "stand zero" — legacy comment from
    // ElectrodeFormPage.
    await api.put(`/api/electrodes/${e.electrode_id}`, { [field]: value ?? null });
    await loadElectrodes(props.batchId);
    scheduleCapacityReload(props.batchId);
  } catch (err) {
    toastApiError(toast, err, 'Ошибка обновления электрода');
  } finally {
    endSave();
  }
}

// Triggered by the per-row scrap button — opens the DS-styled dialog
// (audit P2 #6). The actual API call lives in confirmScrap() below.
function scrapElectrode(e) {
  scrapTarget.value = e;
  scrapReason.value = '';
}
async function confirmScrap() {
  const e = scrapTarget.value;
  const reason = scrapReason.value.trim();
  if (!e || !reason) return;
  startSave();
  try {
    await api.put(`/api/electrodes/${e.electrode_id}/status`, {
      status_code: 3,
      scrapped_reason: reason,
      used_in_battery_id: null,
    });
    await loadElectrodes(props.batchId);
    scheduleCapacityReload(props.batchId);
    scrapTarget.value = null;
  } catch (err) {
    toastApiError(toast, err, 'Ошибка списания');
  } finally {
    endSave();
  }
}

function deleteElectrode(e, index) {
  if (e._new) {
    electrodes.value.splice(index, 1);
    return;
  }
  // PrimeVue ConfirmDialog (audit P2 #6) — replaces ugly window.confirm.
  // Confirm service registered globally in main.js; <ConfirmDialog /> is
  // mounted in App.vue.
  confirm.require({
    message: `Удалить электрод #${e.electrode_id}? Действие необратимо.`,
    header: 'Удаление электрода',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Удалить',
    rejectLabel: 'Отмена',
    acceptProps: { severity: 'danger' },
    accept: async () => {
      startSave();
      try {
        await api.delete(`/api/electrodes/${e.electrode_id}`);
        await loadElectrodes(props.batchId);
        scheduleCapacityReload(props.batchId);
      } catch (err) {
        toastApiError(toast, err, 'Ошибка удаления');
      } finally {
        endSave();
      }
    },
  });
}

// ── Append / save new (unsaved) row ──
function appendElectrodeRow() {
  electrodes.value.push({
    _new: true,
    _localId: nextNewRowId--,
    electrode_mass_g: null,
    cup_number: null,
    comments: '',
    include_in_capacity_average: true,
  });
}

async function commitNewRow(e, index) {
  if (!e._new || !e.electrode_mass_g) return;
  startSave();
  try {
    await api.post('/api/electrodes', {
      cut_batch_id: Number(props.batchId),
      electrode_mass_g: e.electrode_mass_g,
      cup_number: e.cup_number ?? null,
      comments: e.comments || null,
    });
    await loadElectrodes(props.batchId);
    scheduleCapacityReload(props.batchId);
  } catch (err) {
    toastApiError(toast, err, 'Ошибка создания электрода');
  } finally {
    endSave();
  }
}

// ── Foil mass row helpers ──
function addFoilRow() {
  foilRows.value.push({ _key: foilCounter++, mass_g: '' });
}

function removeFoilRow(index) {
  foilRows.value.splice(index, 1);
  if (!foilRows.value.length) addFoilRow();
}

// Save the full foil list on blur — replace-all semantics match the
// vanilla flow (delete-then-insert under the same /foil-masses endpoint).
let foilSaveTimer = null;
function scheduleFoilSave() {
  if (foilSaveTimer) clearTimeout(foilSaveTimer);
  foilSaveTimer = setTimeout(saveFoilMassesNow, 600);
}
async function saveFoilMassesNow() {
  if (!props.batchId) return;
  startSave();
  try {
    await api.delete(`/api/electrodes/electrode-cut-batches/${props.batchId}/foil-masses`);
    for (const row of foilRows.value) {
      const mass = Number(row.mass_g);
      if (!Number.isFinite(mass) || mass <= 0) continue;
      await api.post(`/api/electrodes/electrode-cut-batches/${props.batchId}/foil-masses`, {
        cut_batch_id: Number(props.batchId),
        mass_g: mass,
      });
    }
    scheduleCapacityReload(props.batchId);
  } catch (err) {
    toastApiError(toast, err, 'Ошибка сохранения массы фольги');
  } finally {
    endSave();
  }
}

// ── Bulk paste handler ──
function onBulkPasteApplied(rows) {
  // Each row from ElectrodeBulkPasteDialog has { mass_g, cup_number, comments }.
  // Append as `_new` so the user can adjust before they actually commit.
  for (const r of rows) {
    electrodes.value.push({
      _new: true,
      _localId: nextNewRowId--,
      electrode_mass_g: r.mass_g,
      cup_number: r.cup_number ?? null,
      comments: r.comments || '',
      include_in_capacity_average: true,
    });
  }
}

// ── Display helpers ──
const electrodeCount = computed(() => electrodes.value.filter((e) => !e._new).length);
const newRowCount    = computed(() => electrodes.value.filter((e) => e._new).length);

function fmtCap(val) {
  return fmtCapacity(val);
}
</script>

<template>
  <div v-if="batchId" class="ebp glass-card">
    <!-- Header strip — only renders when there's something meaningful
         to show: a save-status pill (saving / saved flash / loading)
         or the multi-batch scope hint. The batch id was here too but
         the constructor above already shows «ЭТАПЫ ДЛЯ: #N», so
         duplicating it just added a header that never closed. -->
    <div v-if="constructorCount > 1 || showSaving || showSaved || loading" class="ebp-header">
      <div class="ebp-header-main">
        <span v-if="constructorCount > 1" class="ebp-scope-warn">
          <i class="pi pi-info-circle" />
          Редактируется только активная партия ({{ constructorCount }} в конструкторе — кликните по другой колонке для переключения)
        </span>
      </div>
      <div class="ebp-header-status">
        <span v-if="showSaving" class="ebp-status ebp-status--saving">
          <i class="pi pi-spin pi-spinner" /> Сохранение…
        </span>
        <span v-else-if="showSaved" class="ebp-status ebp-status--saved">
          <i class="pi pi-check" /> Сохранено
        </span>
        <span v-else-if="loading" class="ebp-status ebp-status--loading">
          <i class="pi pi-spin pi-spinner" /> Загрузка…
        </span>
      </div>
    </div>

    <!-- ────── Сводная ёмкость ──────
         Surfaced at the top of the panel: it's the most important
         number for the batch (theoretical / actual capacity), and
         hiding it under 60 rows of electrodes meant operators had to
         scroll the whole table just to see the result of what they
         just typed. Two read-only cards, derived from /report. -->
    <CollapsibleSection title="Сводная ёмкость" persist-key="ebp-capacity">
      <div v-if="!capacitySummary" class="ebp-empty">
        Сводная ёмкость рассчитывается автоматически по заполненным массам.
      </div>
      <div v-else class="ebp-capacity-grid">
        <div class="ebp-cap-card">
          <div class="ebp-cap-label">Средняя теоретическая</div>
          <div class="ebp-cap-value">{{ fmtCap(capacitySummary.average_capacity_theoretical_mAh) }}</div>
        </div>
        <div class="ebp-cap-card">
          <div class="ebp-cap-label">Средняя фактическая</div>
          <div class="ebp-cap-value">{{ fmtCap(capacitySummary.average_capacity_actual_mAh) }}</div>
        </div>
        <div v-if="capacitySummary.electrode_count != null" class="ebp-cap-card">
          <div class="ebp-cap-label">Учтено электродов</div>
          <div class="ebp-cap-value">{{ capacitySummary.electrode_count }}</div>
        </div>
      </div>
    </CollapsibleSection>

    <!-- ────── Электроды ────── -->
    <CollapsibleSection
      title="Электроды"
      persist-key="ebp-electrodes"
      :count="electrodeCount + (newRowCount ? ` (+${newRowCount} новых)` : '')"
    >
      <div class="ebp-toolbar">
        <Button
          label="Добавить строку"
          icon="pi pi-plus"
          size="small"
          outlined
          @click="appendElectrodeRow"
        />
        <Button
          label="Вставить из буфера"
          icon="pi pi-clone"
          size="small"
          severity="secondary"
          text
          @click="bulkPasteVisible = true"
        />
      </div>

      <div v-if="loading && !electrodes.length" class="ebp-empty">
        <i class="pi pi-spin pi-spinner" /> Загрузка электродов…
      </div>
      <div v-else-if="!electrodes.length" class="ebp-empty">
        Нет электродов в партии. Добавьте строку или вставьте список из Excel.
      </div>

      <table v-else class="ebp-table">
        <thead>
          <tr>
            <th class="ebp-th-idx">#</th>
            <th>№</th>
            <th>Масса, г</th>
            <th>Стаканчик №</th>
            <th>Комментарии</th>
            <th class="ebp-th-include" title="Включать в средние значения ёмкости партии">В среднем</th>
            <th>Статус</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(e, idx) in electrodes" :key="e.electrode_id || `new-${e._localId}`">
            <td class="ebp-td-idx">{{ idx + 1 }}</td>
            <td>{{ e.number_in_batch ?? '' }}</td>
            <td>
              <InputNumber
                v-model="e.electrode_mass_g"
                :min="0"
                :max-fraction-digits="4"
                class="ebp-input"
                @blur="e._new ? commitNewRow(e, idx) : updateElectrode(e, 'electrode_mass_g', e.electrode_mass_g)"
              />
            </td>
            <td>
              <InputNumber
                v-model="e.cup_number"
                :min="0"
                :use-grouping="false"
                class="ebp-input"
                @blur="e._new ? null : updateElectrode(e, 'cup_number', e.cup_number)"
              />
            </td>
            <td>
              <InputText
                v-model="e.comments"
                class="ebp-input"
                @blur="e._new ? null : updateElectrode(e, 'comments', e.comments)"
              />
            </td>
            <td class="ebp-td-include">
              <Checkbox
                v-if="!e._new && e.electrode_id"
                :model-value="!!e.include_in_capacity_average"
                :binary="true"
                @update:model-value="(v) => updateElectrode(e, 'include_in_capacity_average', v)"
              />
            </td>
            <td class="ebp-td-status">
              <span v-if="e._new" class="badge badge-outline badge-2">новый</span>
              <span v-else-if="e.status_code === 1" class="badge badge-4">Доступен</span>
              <span v-else-if="e.status_code === 2" class="badge badge-6" :title="`Использован в батарее #${e.used_in_battery_id}`">В батарее {{ e.used_in_battery_id }}</span>
              <span v-else-if="e.status_code === 3" class="badge badge-8" :title="`Причина: ${e.scrapped_reason || '—'}`">Списан</span>
              <span v-else class="ebp-cell-empty">—</span>
            </td>
            <td class="ebp-td-actions">
              <Button
                v-if="!e._new && e.status_code === 1"
                icon="pi pi-ban"
                severity="warning"
                text
                rounded
                size="small"
                title="Списать"
                @click="scrapElectrode(e)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                title="Удалить"
                @click="deleteElectrode(e, idx)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </CollapsibleSection>

    <!-- ────── Масса фольги ────── -->
    <CollapsibleSection title="Масса фольги" persist-key="ebp-foil">
      <div class="ebp-toolbar">
        <Button
          label="Добавить строку"
          icon="pi pi-plus"
          size="small"
          outlined
          @click="addFoilRow"
        />
      </div>
      <table class="ebp-table ebp-table--foil">
        <thead>
          <tr>
            <th class="ebp-th-idx">#</th>
            <th>Масса фольги, г</th>
            <th class="ebp-th-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in foilRows" :key="row._key">
            <td class="ebp-td-idx">{{ idx + 1 }}</td>
            <td>
              <InputNumber
                v-model="row.mass_g"
                :min="0"
                :max-fraction-digits="4"
                class="ebp-input"
                @blur="scheduleFoilSave"
              />
            </td>
            <td class="ebp-td-actions">
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                title="Удалить"
                @click="removeFoilRow(idx); scheduleFoilSave()"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </CollapsibleSection>

    <ElectrodeBulkPasteDialog
      v-model:visible="bulkPasteVisible"
      @apply="onBulkPasteApplied"
    />

    <!-- Scrap-reason dialog — replaces window.prompt with a DS-styled
         modal (audit P2 #6). User must provide a non-empty reason. -->
    <Dialog
      :visible="!!scrapTarget"
      @update:visible="(v) => { if (!v) scrapTarget = null }"
      modal
      :closable="!showSaving"
      :draggable="false"
      :style="{ width: '420px' }"
      header="Списание электрода"
    >
      <p class="ebp-scrap-hint">
        Электрод <strong>#{{ scrapTarget?.electrode_id }}</strong> будет помечен как списанный.
        Укажите причину — она запишется в журнал партии.
      </p>
      <label class="ebp-scrap-label">Причина списания <span class="ebp-req">*</span></label>
      <Textarea
        v-model="scrapReason"
        :autofocus="true"
        rows="3"
        class="ebp-scrap-input"
        placeholder="Например: повреждение края, неверная масса"
      />
      <template #footer>
        <Button label="Отмена" severity="secondary" outlined :disabled="showSaving" @click="scrapTarget = null" />
        <Button
          label="Списать"
          icon="pi pi-ban"
          severity="danger"
          :disabled="!scrapReason.trim() || showSaving"
          :loading="showSaving"
          @click="confirmScrap"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
/* Outer card — uses the global .glass-card token (defined in
   global.css) for background + border + shadow. Local class only
   adds layout: padding rhythm matching CrudTable's ct-table-card and
   margin-top spacing from the constructor above (kept tight so the
   two cards read as one flow). */
.ebp {
  margin-top: 8px;
  padding: 12px 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}
.ebp-loading-bar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11.5px;
  font-weight: 600;
  color: rgba(0, 50, 116, 0.65);
  background: rgba(0, 50, 116, 0.06);
  border-radius: 6px;
  align-self: flex-start;
}
.ebp-loading-bar i { font-size: 11px; }

/* Header — batch id + scope hint on left, save status on right. Sits
   inside the glass-card as a title-row; border-bottom acts as the
   visual separator from the first CollapsibleSection. */
.ebp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0 10px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.08);
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.ebp-header-main {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
.ebp-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(0, 50, 116, 0.50);
}
.ebp-batch-id {
  font-size: 15px;
  font-weight: 700;
  color: #003274;
  font-variant-numeric: tabular-nums;
}
.ebp-scope-warn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-size: 11.5px;
  color: #8E5A0F;
  background: rgba(210, 145, 50, 0.10);
  border: 1px solid rgba(210, 145, 50, 0.30);
  border-radius: 10px;
}
.ebp-scope-warn i { font-size: 11px; }

.ebp-header-status {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
.ebp-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
}
.ebp-status i { font-size: 10px; }
.ebp-status--saving {
  background: rgba(0, 50, 116, 0.06);
  color: rgba(0, 50, 116, 0.75);
}
.ebp-status--saved {
  background: rgba(82, 201, 166, 0.12);
  color: #1e7a5a;
}
.ebp-status--loading {
  background: rgba(0, 50, 116, 0.04);
  color: rgba(0, 50, 116, 0.55);
}

/* Scrap reason dialog body — DS form-field rhythm. */
.ebp-scrap-hint {
  font-size: 13px;
  color: #4B5563;
  line-height: 1.4;
  margin: 0 0 10px;
}
.ebp-scrap-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
  margin-bottom: 4px;
}
.ebp-req { color: #E53935; margin-left: 2px; }
.ebp-scrap-input { width: 100%; }
.ebp-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 8px 0;
}
.ebp-empty {
  font-size: 12.5px;
  color: #6B7280;
  padding: 8px 4px;
}
/* Table — mirrors CrudTable header/row visuals so the EBP reads as
   the same component family. Header bg/colour, body hover, vertical
   row separators all match `.ct-table-card :deep(.p-datatable-*)`
   in CrudTable.vue. The hand-rolled table can't reuse the PrimeVue
   DataTable wholesale (per-row editable cells with bespoke save flow),
   so we hand-match the visual rhythm. */
.ebp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}
.ebp-table thead th {
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #003274;
  background: rgba(0, 50, 116, 0.12);
  padding: 8px 10px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.18);
  border-right: 1px solid rgba(0, 50, 116, 0.15);
  white-space: nowrap;
}
.ebp-table thead th:last-child { border-right: none; }
.ebp-table tbody tr {
  background: transparent;
  border-bottom: 1px solid rgba(180, 210, 255, 0.18);
  transition: background 0.12s;
}
.ebp-table tbody tr:hover {
  background: rgba(0, 50, 116, 0.04);
}
.ebp-table tbody tr:last-child {
  border-bottom: none;
}
.ebp-table tbody td {
  padding: 6px 10px;
  border-right: 1px solid rgba(0, 50, 116, 0.08);
  vertical-align: middle;
}
.ebp-table tbody td:last-child {
  border-right: none;
}

.ebp-th-idx, .ebp-td-idx {
  width: 44px;
  text-align: center;
  color: #6B7280;
  font-variant-numeric: tabular-nums;
}
.ebp-th-include, .ebp-td-include {
  width: 78px;
  text-align: center;
}
.ebp-td-status {
  font-size: 12px;
  color: #4B5563;
  white-space: nowrap;
}
.ebp-th-actions, .ebp-td-actions {
  width: 78px;
  text-align: right;
  white-space: nowrap;
}
/* Column widths for the electrodes table (8 cols). Foil table has its
   own simpler 3-col layout via .ebp-table--foil + max-width below. */
.ebp-table:not(.ebp-table--foil) thead th:nth-child(2),
.ebp-table:not(.ebp-table--foil) tbody td:nth-child(2) {
  width: 52px;   /* № (number_in_batch) */
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.ebp-table:not(.ebp-table--foil) thead th:nth-child(3),
.ebp-table:not(.ebp-table--foil) tbody td:nth-child(3) {
  width: 110px;  /* Масса, г */
}
.ebp-table:not(.ebp-table--foil) thead th:nth-child(4),
.ebp-table:not(.ebp-table--foil) tbody td:nth-child(4) {
  width: 100px;  /* Стаканчик № */
}
/* Col 5 (Комментарии) takes remaining space — no explicit width. */
.ebp-table:not(.ebp-table--foil) thead th:nth-child(7),
.ebp-table:not(.ebp-table--foil) tbody td:nth-child(7) {
  width: 130px;  /* Статус — accommodates the badge */
}
.ebp-cell-empty {
  color: rgba(0, 50, 116, 0.30);
}
.ebp-input {
  width: 100%;
  min-width: 60px;
}
.ebp-input :deep(.p-inputtext) {
  height: 30px !important;
  min-height: 30px !important;
  font-size: 12.5px !important;
  padding: 3px 8px !important;
  background: rgba(255, 255, 255, 0.85) !important;
  border-color: rgba(0, 50, 116, 0.18) !important;
}
.ebp-input :deep(.p-inputtext:focus) {
  border-color: #003274 !important;
}

.ebp-table--foil { max-width: 380px; }

.ebp-capacity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin: 4px 0;
}
.ebp-cap-card {
  padding: 10px 14px;
  border: 1px solid rgba(0, 50, 116, 0.10);
  border-radius: 8px;
  background: white;
}
.ebp-cap-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.55);
  margin-bottom: 4px;
}
.ebp-cap-value {
  font-size: 18px;
  font-weight: 700;
  color: #003274;
  font-variant-numeric: tabular-nums;
}
</style>
