<script setup>
/**
 * BatteryElectrochemEditor — per-battery file-attachment UI for
 * electrochemical measurement files (EIS, CV, GITT, etc.). Closes the
 * last 🟡 Vue parity gap (G2, Phase γ).
 *
 * Mounted one-per-battery in the AssemblyPage constructor section,
 * alongside the capacity card. Reads the cached file list via the
 * shared `useBackendCache` handle passed as a prop, so the parent
 * page controls load/invalidate lifecycle (consistent with the
 * capacity-panels pattern above it).
 *
 * The component owns only the local upload queue (`staged`) — files
 * the user has picked but not yet submitted. Each staged file gets an
 * optional per-file notes input. Clicking "Загрузить" walks the queue
 * sequentially, POSTing one entry per request (see MAX_FILE_BYTES for
 * why).
 *
 * Backend contract:
 *   - POST /api/batteries/battery_electrochem
 *     { battery_id, entries: [{file_name, file_content_base64, electrochem_notes}] }
 *     → inserts all, returns full list for that battery.
 *   - GET /api/batteries/battery_electrochem/:battery_id → array or null.
 *   - No DELETE endpoint (add-only, for now — entry in Dalia PR backlog).
 *
 * Download: file_link is `/uploads/electrochem/...`, served by
 * `express.static` in app.js:21 without auth (pre-existing Dalia
 * behavior — flagged separately in the Dalia PR backlog, not fixed
 * here).
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { fileToBase64 } from '@/utils/fileToBase64'
import { errorMessageRu, toastApiError } from '@/utils/errorClassifier'
import api from '@/services/api'

// Per-file client-side cap. Express JSON body limit is 10 MB (app.js:19)
// and base64 encoding inflates payloads by ~1.34× — so 6 MB raw leaves
// a comfortable margin (6 × 1.34 ≈ 8 MB base64 + wrapper, well under
// 10 MB). We also POST one file per request so the batch size never
// compounds.
const MAX_FILE_BYTES = 6 * 1024 * 1024

const props = defineProps({
  batteryId: { type: Number, required: true },
  // useBackendCache instance — { cache, loading, errors, load, invalidate, ... }
  cache: { type: Object, required: true },
})

const toast = useToast()

// ── Cache-backed state (parent-owned) ──────────────────────────────
const files = computed(() => props.cache.cache.value[props.batteryId] || [])
const loading = computed(() => props.cache.loading.value[props.batteryId] || false)
const errorCode = computed(() => props.cache.errors.value[props.batteryId])
// 'empty' is the "loaded-successfully-with-no-files" verdict from
// useBackendCache.isEmpty — treat it like a no-error state, not a UI
// error. (The parent doesn't set isEmpty on this cache, so this case
// won't fire here, but it's cheap to guard for future moves.)
const errorMsg = computed(() => {
  if (!errorCode.value || errorCode.value === 'empty') return null
  return errorMessageRu(errorCode.value)
})

// ── Local upload queue (component-owned) ───────────────────────────
const staged = ref([])      // [{ file: File, notes: string }]
const uploading = ref(false)

// In-flight delete guard, keyed by battery_electrochem_id. Second click
// on the same file is a no-op — prevents the "404 Not found" toast that
// would fire when the 2nd DELETE hits a row already removed by the 1st.
// Same pattern as MaterialsPage.deleteFile's deletingFileIds.
const deletingIds = ref({})

function onPick(e) {
  const picked = Array.from(e.target.files || [])
  for (const f of picked) {
    if (f.size > MAX_FILE_BYTES) {
      toast.add({
        severity: 'warn',
        summary: 'Файл слишком большой',
        detail: `«${f.name}» больше 6 МБ — пропущен. Разделите файл или сожмите.`,
        life: 4500,
      })
      continue
    }
    staged.value.push({ file: f, notes: '' })
  }
  // Clear the input so re-picking the same file triggers @change again.
  e.target.value = ''
}

function removeStaged(i) {
  staged.value.splice(i, 1)
}

// Delete an already-uploaded file. Mirrors MaterialsPage.deleteFile:
// confirm prompt + in-flight guard + invalidate-then-reload the cache
// on success. Toast on failure routes through toastApiError for the
// standard Russian classifier message.
async function deleteFile(f) {
  const id = f.battery_electrochem_id
  if (deletingIds.value[id]) return
  if (!confirm(`Удалить файл «${f.file_name}»?`)) return
  deletingIds.value[id] = true
  try {
    await api.delete(`/api/batteries/battery_electrochem/${id}`)
    // Refresh via parent's cache — same invalidate-then-load pattern as
    // onUpload() below so the list reflects the removed row.
    props.cache.invalidate(props.batteryId)
    await props.cache.load(props.batteryId)
    toast.add({
      severity: 'success',
      summary: 'Файл удалён',
      detail: f.file_name,
      life: 2500,
    })
  } catch (err) {
    toastApiError(toast, err, 'Не удалось удалить файл', { life: 4000 })
  } finally {
    deletingIds.value[id] = false
  }
}

async function onUpload() {
  if (uploading.value || !staged.value.length) return
  uploading.value = true
  // Snapshot batteryId so the whole upload walk targets one battery
  // even if a theoretical prop swap happened mid-loop. Given the
  // parent's :key="ec-${id}" this card unmounts on removal rather than
  // prop-mutating, but the snapshot is a one-line footgun-removal.
  const bid = props.batteryId
  const total = staged.value.length
  // Track the exact items that failed so we can re-stage only those
  // (users retry the specific failing files, not re-pick everything).
  const failedItems = []

  try {
    // Sequential per-file POSTs. Keeps each JSON body under the 10 MB
    // Express cap even when the user stages multiple near-limit files,
    // and lets partial failures be surfaced (e.g. 3 of 5 uploaded).
    for (const s of staged.value) {
      try {
        const b64 = await fileToBase64(s.file)
        await api.post('/api/batteries/battery_electrochem', {
          battery_id: bid,
          entries: [{
            file_name: s.file.name,
            file_content_base64: b64,
            electrochem_notes: s.notes || null,
          }],
        })
      } catch (e) {
        console.error('[Electrochem] upload failed for', s.file.name, e)
        failedItems.push(s)
      }
    }

    // Refresh the cached list via the parent's cache handle. The POST
    // response already contains the updated list, but invalidate-then-
    // load keeps the cache as the single source of truth.
    props.cache.invalidate(bid)
    await props.cache.load(bid)

    const failed = failedItems.length
    if (failed === 0) {
      toast.add({
        severity: 'success',
        summary: 'Загружено',
        detail: `Файлов: ${total}`,
        life: 2500,
      })
      staged.value = []
    } else if (failed < total) {
      toast.add({
        severity: 'warn',
        summary: 'Частичная загрузка',
        detail: `Не удалось загрузить ${failed} из ${total} — оставлены в очереди для повторной попытки.`,
        life: 5000,
      })
      // Keep ONLY the failing rows so user retries the exact subset —
      // not the already-uploaded ones (which would create duplicates
      // since the backend has no unique constraint on file_name).
      staged.value = failedItems
    } else {
      toast.add({
        severity: 'error',
        summary: 'Ошибка загрузки',
        detail: 'Не удалось загрузить ни одного файла.',
        life: 5000,
      })
      // Keep the staged queue intact so user can retry without re-picking.
    }
  } finally {
    uploading.value = false
  }
}

// ── Formatters ─────────────────────────────────────────────────────
function formatDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

// File-type metadata. Drives:
//   - the leading file-type icon in each row (PrimeIcons `pi-file-*`).
//   - whether the «preview» button is meaningful for this format —
//     PDFs/images/text render inline in a new browser tab without a
//     download prompt; binary office formats trigger a download even
//     with `target="_blank"` so the preview button is hidden for them
//     (download stays available).
const FILE_TYPE_META = {
  pdf:  { icon: 'pi pi-file-pdf',   tone: 'pdf',   previewable: true },
  png:  { icon: 'pi pi-image',      tone: 'image', previewable: true },
  jpg:  { icon: 'pi pi-image',      tone: 'image', previewable: true },
  jpeg: { icon: 'pi pi-image',      tone: 'image', previewable: true },
  gif:  { icon: 'pi pi-image',      tone: 'image', previewable: true },
  svg:  { icon: 'pi pi-image',      tone: 'image', previewable: true },
  webp: { icon: 'pi pi-image',      tone: 'image', previewable: true },
  txt:  { icon: 'pi pi-file',       tone: 'text',  previewable: true },
  csv:  { icon: 'pi pi-file',       tone: 'text',  previewable: true },
  xlsx: { icon: 'pi pi-file-excel', tone: 'sheet', previewable: false },
  xls:  { icon: 'pi pi-file-excel', tone: 'sheet', previewable: false },
  docx: { icon: 'pi pi-file-word',  tone: 'doc',   previewable: false },
  doc:  { icon: 'pi pi-file-word',  tone: 'doc',   previewable: false },
}
const FILE_TYPE_DEFAULT = { icon: 'pi pi-file', tone: 'other', previewable: false }

function fileTypeMeta(fileName) {
  const ext = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return FILE_TYPE_META[ext] || FILE_TYPE_DEFAULT
}

// In-app preview kind. Determines which renderer the preview Dialog
// uses for the selected file. `null` = no preview (Dialog won't open).
function previewKind(fileName) {
  const ext = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (['txt', 'csv'].includes(ext)) return 'text'
  return null
}

// ── Preview Dialog state ──────────────────────────────────────────
// `previewFile` holds the currently-previewed file object (or null
// for "closed"). The Dialog's v-model:visible derives from this via
// a computed proxy so opening/closing is just a single ref write.
const previewFile = ref(null)
const previewVisible = computed({
  get: () => previewFile.value !== null,
  set: (v) => { if (!v) previewFile.value = null },
})

function openPreview(f) {
  if (!previewKind(f.file_name)) return
  previewFile.value = f
}

// Warn (don't block) when the card unmounts with unsent files — the
// user most likely didn't mean to discard them. Vue can't block
// unmount from a confirm() cleanly, so a toast is the honest UX.
onBeforeUnmount(() => {
  if (staged.value.length > 0) {
    toast.add({
      severity: 'warn',
      summary: 'Файлы не загружены',
      detail: `${staged.value.length} шт. в очереди — их нужно будет добавить снова.`,
      life: 3500,
    })
  }
})
</script>

<template>
  <section class="electrochem-card">
    <div class="ec-head">
      <span class="ec-title">Электрохимия · Аккумулятор #{{ batteryId }}</span>
      <span v-if="loading" class="ec-loading">
        <i class="pi pi-spin pi-spinner" style="font-size:11px"></i> загрузка…
      </span>
    </div>

    <!-- Existing uploaded files. Each row:
           [file-type icon] [filename — previewable click-target]
                            [size·date] [👁 preview] [⬇ download] [🗑]
         The filename is a click-target that opens preview-able files
         (PDF / image / text) inline in a new tab. The dedicated 👁
         button is hidden for non-previewable formats (xlsx/docx) so
         the user doesn't get a confusing instant-download. ⬇ always
         forces save via the `download` attr. -->
    <div v-if="!loading && files.length > 0" class="ec-list">
      <div
        v-for="f in files"
        :key="f.battery_electrochem_id"
        class="ec-row"
        :class="[`ec-row--${fileTypeMeta(f.file_name).tone}`]"
      >
        <i :class="['ec-file-icon', fileTypeMeta(f.file_name).icon]"></i>

        <!-- Filename — clickable for preview if format supports it,
             plain text otherwise (use ⬇ button to save). Click opens
             an in-app Dialog (no new tab) — see the Dialog block at
             the bottom of this template. -->
        <button
          v-if="previewKind(f.file_name)"
          type="button"
          class="ec-file-name-link ec-file-name-link--button"
          :title="`Открыть «${f.file_name}»`"
          @click="openPreview(f)"
        >{{ f.file_name }}</button>
        <span v-else class="ec-file-name-link ec-file-name-link--plain">{{ f.file_name }}</span>

        <span class="ec-uploaded-at">{{ formatDate(f.uploaded_at) }}</span>

        <div class="ec-row-actions">
          <button
            v-if="previewKind(f.file_name)"
            type="button"
            class="ec-action-btn ec-action-btn--preview"
            :title="`Просмотр «${f.file_name}»`"
            @click="openPreview(f)"
          >
            <i class="pi pi-eye"></i>
          </button>
          <a
            :href="f.file_link"
            :download="f.file_name"
            class="ec-action-btn ec-action-btn--download"
            :title="`Скачать «${f.file_name}»`"
          >
            <i class="pi pi-download"></i>
          </a>
          <button
            type="button"
            class="ec-action-btn ec-action-btn--delete"
            :disabled="!!deletingIds[f.battery_electrochem_id]"
            :title="`Удалить «${f.file_name}»`"
            @click="deleteFile(f)"
          >
            <i :class="deletingIds[f.battery_electrochem_id] ? 'pi pi-spin pi-spinner' : 'pi pi-trash'"></i>
          </button>
        </div>

        <div v-if="f.electrochem_notes" class="ec-notes">{{ f.electrochem_notes }}</div>
      </div>
    </div>

    <!-- Fetch error (auth/server/network — not "empty") -->
    <div v-else-if="!loading && errorMsg" class="ec-empty ec-empty--error">
      {{ errorMsg }}
    </div>

    <!-- Empty state -->
    <div v-else-if="!loading" class="ec-empty">Файлы не прикреплены</div>

    <!-- Staged upload queue -->
    <div v-if="staged.length > 0" class="ec-staged">
      <div
        v-for="(s, i) in staged"
        :key="i"
        class="ec-stage-row"
      >
        <span class="ec-file-name" :title="s.file.name">
          {{ s.file.name }}
          <span class="ec-file-size">({{ formatSize(s.file.size) }})</span>
        </span>
        <input
          type="text"
          v-model="s.notes"
          placeholder="Заметки (необязательно)"
          class="ec-notes-input"
          :disabled="uploading"
        >
        <button
          type="button"
          class="ec-remove"
          :disabled="uploading"
          @click="removeStaged(i)"
          title="Убрать из очереди"
        >✕</button>
      </div>
      <button
        type="button"
        class="ec-upload"
        :disabled="uploading || staged.length === 0"
        @click="onUpload"
      >
        <i class="pi pi-cloud-upload"></i>
        {{ uploading ? 'Загрузка…' : `Загрузить (${staged.length})` }}
      </button>
    </div>

    <!-- File picker -->
    <label class="ec-pick" :class="{ 'ec-pick--disabled': uploading }">
      <input
        type="file"
        multiple
        :disabled="uploading"
        @change="onPick"
        class="ec-pick-input"
      >
      <i class="pi pi-plus"></i>
      <span>Добавить файлы (до 7 МБ каждый)</span>
    </label>
  </section>

  <!-- ── In-app preview Dialog ─────────────────────────────────────
       Opens when user clicks a previewable filename or the 👁 button.
       PDF → <iframe> (browser's built-in PDF viewer renders inline).
       Image → <img>. Text/csv → <iframe> (browser renders as text).
       The Dialog is `maximizable` so users can expand to fullscreen
       on small screens. `:dismissableMask` makes click-outside close
       it (Esc also works via the modal default). -->
  <Dialog
    v-model:visible="previewVisible"
    :header="previewFile?.file_name || 'Просмотр'"
    :style="{ width: '92vw', maxWidth: '1200px', height: '88vh' }"
    :contentStyle="{ padding: '0', display: 'flex', flexDirection: 'column' }"
    modal
    maximizable
    dismissableMask
  >
    <div class="ec-preview-shell">
      <iframe
        v-if="previewFile && previewKind(previewFile.file_name) === 'pdf'"
        :src="previewFile.file_link"
        class="ec-preview-frame"
        :title="previewFile.file_name"
      ></iframe>
      <iframe
        v-else-if="previewFile && previewKind(previewFile.file_name) === 'text'"
        :src="previewFile.file_link"
        class="ec-preview-frame ec-preview-frame--text"
        :title="previewFile.file_name"
      ></iframe>
      <div
        v-else-if="previewFile && previewKind(previewFile.file_name) === 'image'"
        class="ec-preview-image-wrap"
      >
        <img
          :src="previewFile.file_link"
          :alt="previewFile.file_name"
          class="ec-preview-image"
        />
      </div>
    </div>
    <template #footer>
      <a
        v-if="previewFile"
        :href="previewFile.file_link"
        :download="previewFile.file_name"
        class="ec-preview-download"
      >
        <i class="pi pi-download"></i>
        Скачать
      </a>
      <Button
        label="Закрыть"
        severity="secondary"
        text
        @click="previewFile = null"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.electrochem-card {
  border: 1px solid rgba(0, 50, 116, 0.12);
  border-radius: 10px;
  background: white;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ec-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
}

.ec-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
}

.ec-loading {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: rgba(0, 50, 116, 0.45);
}

.ec-empty {
  padding: 8px 2px;
  font-size: 13px;
  color: rgba(0, 50, 116, 0.45);
}

.ec-empty--error {
  color: rgba(200, 80, 70, 0.80);
}

.ec-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ec-row {
  display: grid;
  /* 4 cols on desktop:
     [type-icon · 18px] [filename · flex-rest] [date · auto] [actions · auto]
     Notes (when present) span all 4 via `grid-column: 1 / -1`. */
  grid-template-columns: 18px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 4px 10px;
  padding: 6px 8px;
  background: rgba(0, 50, 116, 0.025);
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 13px;
  transition: background 0.12s, border-color 0.12s;
}
.ec-row:hover {
  background: rgba(0, 50, 116, 0.05);
  border-color: rgba(0, 50, 116, 0.10);
}

/* File-type icon (left of filename). Tone classes pick a hue family
   that hints what kind of file the row is — PDFs red-orange,
   images green, sheets emerald, docs navy, fallback grey. */
.ec-file-icon {
  font-size: 16px;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
  color: rgba(0, 50, 116, 0.55);
}
.ec-row--pdf   .ec-file-icon { color: #c0392b; }   /* red */
.ec-row--image .ec-file-icon { color: #16a085; }   /* teal-green */
.ec-row--sheet .ec-file-icon { color: #1d7a5f; }   /* dark green */
.ec-row--doc   .ec-file-icon { color: #2c5282; }   /* navy variant */
.ec-row--text  .ec-file-icon { color: rgba(0, 50, 116, 0.65); }

/* Filename — link variant for previewable formats, plain text
   variant for non-previewable. Both ellipsis-truncate on overflow. */
.ec-file-name-link {
  color: #003274;
  text-decoration: none;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.ec-file-name-link:not(.ec-file-name-link--plain):hover {
  text-decoration: underline;
  text-underline-offset: 2px;
  color: #025EA1;
}
.ec-file-name-link--plain {
  cursor: default;
  /* No hover affordance — preview unavailable for this file type;
     use the ⬇ button to save instead. */
}

.ec-uploaded-at {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.5);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* Per-row action group — tight cluster of small icon buttons at the
   right end of the row. */
.ec-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.ec-action-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(0, 50, 116, 0.55);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  text-decoration: none;
  transition: background 0.12s, color 0.12s;
}
.ec-action-btn:hover:not(:disabled) {
  background: rgba(0, 50, 116, 0.10);
  color: #003274;
}
.ec-action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.ec-action-btn--delete {
  color: rgba(200, 80, 70, 0.55);
}
.ec-action-btn--delete:hover:not(:disabled) {
  background: rgba(200, 80, 70, 0.10);
  color: rgba(200, 80, 70, 0.9);
}

.ec-notes {
  grid-column: 1 / -1;
  font-size: 12px;
  color: rgba(0, 50, 116, 0.65);
  padding: 2px 0 0 28px;        /* align under filename, past the icon */
  font-style: italic;
}

/* The filename "link" is now a <button> that opens the in-app preview
   Dialog — strip native button chrome so it visually reads as a link. */
.ec-file-name-link--button {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
  /* Inherit color/weight from .ec-file-name-link base rule above. */
}

/* Preview Dialog content — fills the Dialog body completely so the
   PDF/image extends to the footer divider. PrimeVue's `contentStyle`
   prop already sets padding:0 + flex column; we just fill the
   remaining space here. */
.ec-preview-shell {
  flex: 1;
  min-height: 0;          /* let flex children shrink past intrinsic size */
  display: flex;
  align-items: stretch;
  justify-content: center;
  background: rgba(0, 50, 116, 0.04);
  overflow: hidden;
}
.ec-preview-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}
.ec-preview-frame--text {
  background: #fafbfc;
}
.ec-preview-image-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  overflow: auto;
}
.ec-preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  /* Subtle shadow so the image edge reads off the muted background. */
  box-shadow: 0 1px 4px rgba(0, 50, 116, 0.12);
}

.ec-preview-download {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  margin-right: auto;     /* push «Закрыть» to the opposite edge */
  border-radius: 6px;
  background: #003274;
  color: #fff;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s;
}
.ec-preview-download:hover {
  background: rgba(0, 50, 116, 0.85);
}
.ec-preview-download .pi {
  font-size: 13px;
}

/* Mobile — single-row layout would crush at 375 px wide. Stack the
   row into two visual lines: [icon | filename] | [date | actions]
   wrap to 2nd line if needed. */
@media (max-width: 540px) {
  .ec-row {
    grid-template-columns: 18px minmax(0, 1fr) auto;
    grid-template-areas:
      'icon name      actions'
      '.    timestamp actions'
      'notes notes    notes';
    row-gap: 2px;
  }
  .ec-file-icon { grid-area: icon; align-self: start; padding-top: 3px; }
  .ec-file-name-link { grid-area: name; }
  .ec-uploaded-at { grid-area: timestamp; }
  .ec-row-actions { grid-area: actions; align-self: center; }
  .ec-notes { grid-area: notes; padding-left: 28px; }
}

.ec-staged {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px dashed rgba(0, 50, 116, 0.20);
  border-radius: 6px;
  background: rgba(212, 164, 65, 0.04);
}

.ec-stage-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 1fr) 24px;
  gap: 8px;
  align-items: center;
}

.ec-file-size {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.45);
  margin-left: 4px;
}

.ec-notes-input {
  height: 28px;
  padding: 3px 8px;
  border: 1px solid rgba(0, 50, 116, 0.18);
  border-radius: 5px;
  background: white;
  color: #003274;
  font: inherit;
  font-size: 12px;
}

.ec-notes-input:focus {
  outline: none;
  border-color: rgba(0, 50, 116, 0.5);
}

.ec-remove {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(200, 80, 70, 0.55);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}

.ec-remove:hover:not(:disabled) {
  background: rgba(200, 80, 70, 0.10);
  color: rgba(200, 80, 70, 0.9);
}

.ec-remove:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.ec-upload {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  align-self: flex-start;
  border: none;
  border-radius: 6px;
  background: #003274;
  color: white;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s;
}

.ec-upload:hover:not(:disabled) {
  background: rgba(0, 50, 116, 0.85);
}

.ec-upload:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ec-pick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid rgba(0, 50, 116, 0.20);
  border-radius: 6px;
  background: rgba(0, 50, 116, 0.02);
  color: #003274;
  cursor: pointer;
  font-size: 13px;
  align-self: flex-start;
  transition: background 0.15s, border-color 0.15s;
}

.ec-pick:hover:not(.ec-pick--disabled) {
  background: rgba(0, 50, 116, 0.06);
  border-color: rgba(0, 50, 116, 0.4);
}

.ec-pick--disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ec-pick-input {
  display: none;
}

.ec-pick .pi {
  font-size: 13px;
}
</style>
