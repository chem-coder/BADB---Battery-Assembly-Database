<script setup>
/**
 * MaterialsPage — "Материалы" (справочник)
 * Master-detail layout: left panel = material list, right panel = instances & components.
 * All CRUD inline, no dialogs.
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import { todayIsoMsk } from '@/utils/dateFormat'
import { toastApiError } from '@/utils/errorClassifier'
import { validateComposition, sumPercent, COMPOSITION_TOLERANCE } from '@/utils/materialComposition'
import { nameFingerprint } from '@/utils/nameFingerprint'
import { familyForSave } from '@/utils/materialFamilySave'
import PageHeader from '@/components/PageHeader.vue'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import DateInputISO from '@/components/parity/DateInputISO.vue'

const toast = useToast()

const roleMap = {
  cathode_active: 'катодный АМ',
  anode_active: 'анодный АМ',
  binder: 'связующее',
  conductive_additive: 'добавка',
  solvent: 'растворитель',
  other: 'другое',
}

const roleOptions = [
  { value: 'cathode_active', label: 'Катодный АМ' },
  { value: 'anode_active', label: 'Анодный АМ' },
  { value: 'binder', label: 'Связующее' },
  { value: 'conductive_additive', label: 'Добавка' },
  { value: 'solvent', label: 'Растворитель' },
  { value: 'other', label: 'Другое' },
]

// ── Family vocabulary (materials_model_cleanup.md §4, D5) ─────────────
// Controlled per-role vocabulary from /api/reference/material-families.
// Families only apply to active materials — for binders/additives/
// solvents the variation axis is preparation, not classification, so
// the family field is hidden entirely (spec §4: "no family; inventing
// one would be noise").
const materialFamilies = ref([])

async function loadFamilies() {
  try {
    const { data } = await api.get('/api/reference/material-families')
    materialFamilies.value = (Array.isArray(data) ? data : [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  } catch {
    // Non-fatal: the picker degrades to "keep whatever is stored"
    // (familyOptionsFor always appends the current value).
  }
}

function familyApplies(role) {
  return role === 'cathode_active' || role === 'anode_active'
}

// Options for the family Select, filtered by the material's role.
// Option label = human label («синтетический графит»), stored value =
// code (SG). A stored value not present in the vocabulary (legacy
// free-text) stays selectable so editing other fields never silently
// drops it.
function familyOptionsFor(role, currentValue) {
  const opts = materialFamilies.value
    .filter(f => f.role === role)
    .map(f => ({ value: f.code, label: f.label }))
  const cur = (currentValue || '').trim()
  if (cur && !opts.some(o => o.value === cur)) {
    opts.push({ value: cur, label: cur })
  }
  return opts
}

// ── Materials ─────────────────────────────────────────────────────────
const materials = ref([])
const filterText = ref('')
const filterRole = ref('')
const selectedMaterialId = ref(null)

const filteredMaterials = computed(() => {
  let result = materials.value
  const q = filterText.value.toLowerCase().trim()
  if (q) result = result.filter(m => m.name.toLowerCase().includes(q))
  if (filterRole.value) result = result.filter(m => m.role === filterRole.value)
  return result
})

// Grouped view of the list (the visible hierarchy Dalia asked for):
// role section → family sub-group → products. All NMC products sit
// under ONE «NMC» header; materials without a family collect under
// «Без семейства» (red — it is a to-fill gap on active roles). Roles
// without families (binders/solvents/…) get a single flat section.
const ROLE_ORDER = ['cathode_active', 'anode_active', 'active', 'binder', 'conductive_additive', 'solvent', 'other']
const groupedMaterials = computed(() => {
  const sections = []
  for (const role of ROLE_ORDER) {
    const inRole = filteredMaterials.value.filter(m => m.role === role)
    if (!inRole.length) continue
    if (familyApplies(role)) {
      const byFamily = new Map()
      for (const m of inRole) {
        const key = m.family || ''
        if (!byFamily.has(key)) byFamily.set(key, [])
        byFamily.get(key).push(m)
      }
      const famOrder = [...byFamily.keys()].sort((a, b) => {
        if (!a) return 1
        if (!b) return -1
        return a.localeCompare(b, 'ru')
      })
      sections.push({
        role,
        label: roleMap[role] || role,
        families: famOrder.map(f => ({
          family: f,
          items: byFamily.get(f).sort((x, y) => x.name.localeCompare(y.name, 'ru')),
        })),
      })
    } else {
      sections.push({
        role,
        label: roleMap[role] || role,
        families: [{ family: null, items: inRole.sort((x, y) => x.name.localeCompare(y.name, 'ru')) }],
      })
    }
  }
  return sections
})

const selectedMaterial = computed(() =>
  materials.value.find(m => m.material_id === selectedMaterialId.value) || null
)

async function loadMaterials() {
  try {
    const { data } = await api.get('/api/materials')
    materials.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить материалы', life: 3000 })
  }
}

onMounted(() => {
  loadMaterials()
  loadFamilies()
  loadEvalCandidates()
})

// ── Supplier evaluation prompts (§6.4, third moment) ─────────────────
// Unevaluated sources with real usage — shown as a dismissible banner so
// the rating question arrives WITH evidence, not at creation time.
const evalCandidates = ref([])
const evalBannerDismissed = ref(false)

async function loadEvalCandidates() {
  try {
    const { data } = await api.get('/api/materials/evaluation-candidates')
    evalCandidates.value = data
  } catch { /* non-critical — banner just stays hidden */ }
}

async function goEvaluate(c) {
  const m = materials.value.find(x => x.material_id === c.material_id)
  if (!m) return
  selectMaterial(m)
  // Open the instance so its source-info (rating fields) is visible.
  await nextTick()
  const inst = instances.value.find(i => i.material_instance_id === c.material_instance_id)
  if (inst && !openInstances.value.has(inst.material_instance_id)) toggleInstance(inst)
}

function selectMaterial(m) {
  if (selectedMaterialId.value === m.material_id) return
  selectedMaterialId.value = m.material_id
  editForm.value = { name: m.name, role: m.role, family: m.family || '', manufacturer: m.manufacturer || '' }
  instances.value = []
  openInstances.value = new Set()
  componentsMap.value = {}
  componentsLoaded.value = {}
  cancelAllEdits()
  resetInstanceCreate()
  cancelComposition()
  loadInstances(m.material_id)
}

// ── Create material (inline in left panel) ────────────────────────────
// `family` (d047 free text → d052 vocabulary) — chemistry family code
// (NMC, LFP, SG, …) used to group active-material pickers on the tape
// form. For active roles the value comes from the controlled vocabulary
// Select; for other roles the field is hidden and null is stored.
const creatingMaterial = ref(false)
const newMaterialForm = ref({ name: '', role: '', family: '', manufacturer: '' })

function startMaterialCreate() {
  creatingMaterial.value = true
  newMaterialForm.value = { name: '', role: '', family: '', manufacturer: '' }
}

function cancelMaterialCreate() {
  creatingMaterial.value = false
  newMaterialForm.value = { name: '', role: '', family: '', manufacturer: '' }
}

// Duplicate warning (D3, spec §6.3): warn — never block. Holds the
// matched existing material while the confirm dialog is open; null =
// dialog closed.
const duplicateWarn = ref(null)

async function saveNewMaterial() {
  const name = newMaterialForm.value.name.trim()
  if (!name) { toast.add({ severity: 'warn', summary: 'Название обязательно', life: 3000 }); return }
  if (!newMaterialForm.value.role) { toast.add({ severity: 'warn', summary: 'Роль обязательна', life: 3000 }); return }
  // D3 duplicate check before POST: fingerprint comparison catches
  // case/spacing/punctuation variants and Cyrillic/Latin homoglyphs
  // («СМС» vs "CMC"). On collision we ask, never block.
  const fp = nameFingerprint(name)
  const existing = fp
    ? materials.value.find(m => nameFingerprint(m.name) === fp)
    : null
  if (existing) {
    duplicateWarn.value = { existing }
    return
  }
  await doCreateMaterial()
}

async function doCreateMaterial() {
  const name = newMaterialForm.value.name.trim()
  const role = newMaterialForm.value.role
  try {
    await api.post('/api/materials', {
      name,
      role,
      // Family only applies to active materials (spec §4) — for other
      // roles the field is hidden in the form and null is stored.
      family: familyApplies(role) ? ((newMaterialForm.value.family || '').trim() || null) : null,
      manufacturer: (newMaterialForm.value.manufacturer || '').trim() || null,
    })
    toast.add({ severity: 'success', summary: 'Материал создан', life: 3000 })
    cancelMaterialCreate()
    await loadMaterials()
    // Auto-select the new material
    const created = materials.value.find(m => m.name === name)
    if (created) selectMaterial(created)
  } catch (err) {
    toastApiError(toast, err, 'Не удалось создать материал')
  }
}

// «Использовать существующий» — abandon the create, highlight/select
// the existing material instead (it is already in the left list).
function useExistingMaterial() {
  const existing = duplicateWarn.value?.existing
  duplicateWarn.value = null
  cancelMaterialCreate()
  if (existing) selectMaterial(existing)
}

// «Нет, это другой материал» — the user insists; proceed with creation
// exactly as typed (the fingerprint is comparison-only, never stored).
async function createDuplicateAnyway() {
  duplicateWarn.value = null
  await doCreateMaterial()
}

// ── Edit material (right panel metadata) ──────────────────────────────
const editForm = ref({ name: '', role: '', family: '', manufacturer: '' })

async function saveMaterialEdit() {
  const name = editForm.value.name.trim()
  if (!name) return
  // The PUT always overwrites family with the payload value, but the
  // family control is only shown for active roles — for other roles we
  // must resend the stored value, or editing (or switching the role
  // away from active) would silently NULL it (vanilla preserves it).
  const stored = materials.value.find(m => m.material_id === selectedMaterialId.value)
  try {
    await api.put(`/api/materials/${selectedMaterialId.value}`, {
      name,
      role: editForm.value.role,
      family: familyForSave({
        applies: familyApplies(editForm.value.role),
        formValue: editForm.value.family,
        storedValue: stored?.family,
      }),
      manufacturer: (editForm.value.manufacturer || '').trim() || null,
    })
    toast.add({ severity: 'success', summary: 'Материал обновлён', life: 3000 })
    await loadMaterials()
  } catch (err) {
    toastApiError(toast, err, 'Не удалось обновить материал')
  }
}

async function deleteMaterial(m) {
  if (!confirm(`Удалить материал "${m.name}"?`)) return
  try {
    await api.delete(`/api/materials/${m.material_id}`)
    toast.add({ severity: 'success', summary: 'Удалено', life: 3000 })
    if (selectedMaterialId.value === m.material_id) {
      selectedMaterialId.value = null
    }
    await loadMaterials()
  } catch (err) {
    toastApiError(toast, err, 'Не удалось удалить материал')
  }
}

// ── Instances ─────────────────────────────────────────────────────────
const instances = ref([])
const instancesLoading = ref(false)
const openInstances = ref(new Set())
const componentsMap = ref({})
const componentsLoaded = ref({})
const allInstances = ref([])

async function loadInstances(materialId) {
  instancesLoading.value = true
  try {
    const { data } = await api.get(`/api/materials/${materialId}/instances`)
    instances.value = data.sort((a, b) => a.name.localeCompare(b.name))
    // Instances start COLLAPSED (Dalia, 2026-07-28): a wall of expanded
    // instances hid how many there even were. Collapsing also removes the
    // eager ~5-requests-per-instance fan-out this loop used to fire —
    // toggleInstance() lazy-loads components/source/properties on expand.
    openInstances.value = new Set()
  } finally {
    instancesLoading.value = false
  }
}

async function loadComponents(instanceId) {
  const { data } = await api.get(`/api/materials/instances/${instanceId}/components`)
  componentsMap.value[instanceId] = data
  componentsLoaded.value[instanceId] = true
}

// ── Source info & properties (per material instance) ──────────────────
// Dalia added material_sources + material_properties in migrations
// d026/d027. The Vue UI exposes two per-instance forms:
//   - Source info — supplier, brand, lot, dates, quality rating, notes.
//   - Properties  — specific capacity (mAh/g), density (g/ml), notes.
// Loaded lazily when the user expands an instance (parallel with the
// components fetch). Same reactive object doubles as the edit buffer —
// on PUT success the backend-returned row replaces the buffer, so the
// form always reflects the authoritative DB state after save.
const sourceInfoForm = ref({})
const sourceInfoLoaded = ref({})
const sourceInfoSaving = ref({})
const propertiesForm = ref({})
const propertiesLoaded = ref({})
const propertiesSaving = ref({})

const QUALITY_LABELS = [
  { value: 'good', label: 'Хорошо' },
  { value: 'ok',   label: 'Приемлемо' },
  { value: 'bad',  label: 'Плохо' },
  { value: 'tbd',  label: 'Не оценено' },
]

function blankSourceInfo() {
  return {
    supplier: '', brand: '', model_or_catalog_no: '', lot_number: '',
    date_ordered: '', date_received: '',
    quality_rating_label: '', quality_rating_score: '',
    evaluation_notes: '', is_evaluated: false,
  }
}
function blankProperties() {
  return {
    specific_capacity_mAh_g: '',
    density_g_ml: '',
    notes: '',
  }
}

async function loadSourceInfo(instanceId) {
  try {
    const { data } = await api.get(`/api/materials/instances/${instanceId}/source-info`)
    // Endpoint returns { instance, source }. When source is null (no row
    // yet) we seed the form with blanks so inputs don't bind to null.
    const src = data?.source || {}
    sourceInfoForm.value[instanceId] = {
      ...blankSourceInfo(),
      ...src,
      // DB dates come back as ISO; inputs expect yyyy-mm-dd. Slice the T.
      date_ordered: src.date_ordered ? String(src.date_ordered).slice(0, 10) : '',
      date_received: src.date_received ? String(src.date_received).slice(0, 10) : '',
    }
    sourceInfoLoaded.value[instanceId] = true
  } catch (err) {
    toastApiError(toast, err, 'Источник — не удалось загрузить', { life: 4000 })
  }
}

async function saveSourceInfo(instanceId) {
  const form = sourceInfoForm.value[instanceId]
  if (!form) return
  sourceInfoSaving.value[instanceId] = true
  try {
    const payload = {
      supplier:               form.supplier || null,
      brand:                  form.brand || null,
      model_or_catalog_no:    form.model_or_catalog_no || null,
      lot_number:             form.lot_number || null,
      date_ordered:           form.date_ordered || null,
      date_received:          form.date_received || null,
      quality_rating_label:   form.quality_rating_label || null,
      quality_rating_score:   form.quality_rating_score === '' || form.quality_rating_score == null
                                ? null : Number(form.quality_rating_score),
      evaluation_notes:       form.evaluation_notes || null,
      is_evaluated:           !!form.is_evaluated,
    }
    await api.put(`/api/materials/instances/${instanceId}/source-info`, payload)
    toast.add({ severity: 'success', summary: 'Источник', detail: 'Сохранено', life: 2500 })
    // Reload to get canonical server state (including server-computed
    // updated_at / updated_by / updated_by_name).
    await loadSourceInfo(instanceId)
  } catch (err) {
    toastApiError(toast, err, 'Источник — ошибка сохранения', { life: 4000 })
  } finally {
    sourceInfoSaving.value[instanceId] = false
  }
  loadEvalCandidates()
}

async function loadProperties(instanceId) {
  try {
    const { data } = await api.get(`/api/materials/instances/${instanceId}/properties`)
    const p = data?.properties || {}
    propertiesForm.value[instanceId] = {
      ...blankProperties(),
      // Postgres normalises column names lower-case — the column is
      // specific_capacity_mAh_g, PG returns specific_capacity_mah_g.
      // Read both spellings to be robust.
      specific_capacity_mAh_g: p.specific_capacity_mAh_g ?? p.specific_capacity_mah_g ?? '',
      density_g_ml:            p.density_g_ml ?? '',
      notes:                   p.notes ?? '',
    }
    propertiesLoaded.value[instanceId] = true
  } catch (err) {
    toastApiError(toast, err, 'Свойства — не удалось загрузить', { life: 4000 })
  }
}

// ── Source-info and property files (d027) ────────────────────────────
// Two independent file buckets keyed by instance_id. Backend stores
// bytes as BYTEA with a mime type; we upload base64, list metadata,
// and fetch download blobs authenticated so the Bearer token is sent
// (direct <a href=/download> would lose the token in prod).
const sourceFilesMap = ref({})
const sourceFilesLoaded = ref({})
const propertyFilesMap = ref({})
const propertyFilesLoaded = ref({})
const uploadingSourceFiles = ref({})
const uploadingPropertyFiles = ref({})
// In-flight delete flags keyed by "kind-fileId" — prevents the "click
// twice, second click 404s" UX wart and stops the second toast from
// appearing. source-files and property-files have separate primary-key
// sequences so we namespace by kind to avoid a false-positive disable
// on a property-file when the user deletes a source-file with the same
// numeric id.
const deletingFileIds = ref({})
function deleteKey(kind, fileId) { return `${kind}-${fileId}` }

// Upload size budget — Express body limit is 10 MB (app.js:19) and
// base64 inflates bytes by 4/3. A 7 MB raw file → 9.4 MB base64 +
// JSON wrapper, which hugs the 10 MB wall with no margin; a long
// filename or a multi-file entries[] array can push it over. 6 MB
// leaves ~1.8 MB of headroom and matches BatteryElectrochemEditor.
const MAX_FILE_BYTES = 6 * 1024 * 1024

function validateUploadSize(files) {
  const oversized = Array.from(files).filter(f => f.size > MAX_FILE_BYTES)
  if (oversized.length === 0) return null
  const names = oversized.map(f => f.name).join(', ')
  return `Слишком большие файлы (лимит 6 МБ): ${names}`
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // readAsDataURL yields "data:<mime>;base64,<payload>" — strip the
      // prefix so the backend gets just the payload.
      const result = String(reader.result || '')
      const commaIdx = result.indexOf(',')
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function loadSourceFiles(instanceId) {
  try {
    const { data } = await api.get(`/api/materials/instances/${instanceId}/source-info/files`)
    sourceFilesMap.value[instanceId] = Array.isArray(data) ? data : []
    sourceFilesLoaded.value[instanceId] = true
  } catch (err) {
    // For composite instances the backend throws 400 — we guard upstream
    // via is_pure so this branch is only hit on real network failures.
    toastApiError(toast, err, 'Файлы источника — не удалось загрузить', { life: 4000 })
  }
}

async function loadPropertyFiles(instanceId) {
  try {
    const { data } = await api.get(`/api/materials/instances/${instanceId}/properties/files`)
    propertyFilesMap.value[instanceId] = Array.isArray(data) ? data : []
    propertyFilesLoaded.value[instanceId] = true
  } catch (err) {
    toastApiError(toast, err, 'Файлы свойств — не удалось загрузить', { life: 4000 })
  }
}

async function uploadSourceFiles(instanceId, fileList) {
  if (!fileList || fileList.length === 0) return
  // Pre-flight size check so oversize uploads don't silently 413 or get
  // a generic "Ошибка загрузки" — we explain exactly which file exceeds.
  const sizeError = validateUploadSize(fileList)
  if (sizeError) {
    toast.add({ severity: 'warn', summary: 'Размер файла', detail: sizeError, life: 5000 })
    return
  }
  uploadingSourceFiles.value[instanceId] = true
  try {
    const entries = await Promise.all(
      Array.from(fileList).map(async (f) => ({
        file_name: f.name,
        mime_type: f.type || 'application/octet-stream',
        file_content_base64: await fileToBase64(f),
      }))
    )
    await api.post(`/api/materials/instances/${instanceId}/source-info/files`, { entries })
    toast.add({ severity: 'success', summary: 'Файлы', detail: `Загружено: ${entries.length}`, life: 2500 })
    await loadSourceFiles(instanceId)
  } catch (err) {
    toastApiError(toast, err, 'Файлы — ошибка загрузки', { life: 4000 })
  } finally {
    uploadingSourceFiles.value[instanceId] = false
  }
}

async function uploadPropertyFiles(instanceId, fileList) {
  if (!fileList || fileList.length === 0) return
  const sizeError = validateUploadSize(fileList)
  if (sizeError) {
    toast.add({ severity: 'warn', summary: 'Размер файла', detail: sizeError, life: 5000 })
    return
  }
  uploadingPropertyFiles.value[instanceId] = true
  try {
    const entries = await Promise.all(
      Array.from(fileList).map(async (f) => ({
        file_name: f.name,
        mime_type: f.type || 'application/octet-stream',
        file_content_base64: await fileToBase64(f),
      }))
    )
    await api.post(`/api/materials/instances/${instanceId}/properties/files`, { entries })
    toast.add({ severity: 'success', summary: 'Файлы', detail: `Загружено: ${entries.length}`, life: 2500 })
    await loadPropertyFiles(instanceId)
  } catch (err) {
    toastApiError(toast, err, 'Файлы — ошибка загрузки', { life: 4000 })
  } finally {
    uploadingPropertyFiles.value[instanceId] = false
  }
}

// Authenticated file download — fetches blob via axios (Bearer token
// attached by the interceptor), creates an object URL, triggers a
// click on a temporary <a download>. Avoids the "direct <a> loses
// token in prod" trap and gives the user a proper Save dialog.
async function downloadFile(kind, fileId, suggestedName) {
  const path = kind === 'source'
    ? `/api/materials/source-files/${fileId}/download`
    : `/api/materials/property-files/${fileId}/download`
  try {
    const response = await api.get(path, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = url
    a.download = suggestedName || 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Revoke the object URL on next tick so the browser finishes the
    // download before we free it (revoking synchronously can race).
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (err) {
    toastApiError(toast, err, 'Скачивание — ошибка', { life: 4000 })
  }
}

async function deleteFile(kind, fileId, instanceId) {
  // In-flight guard — second click on the same file is a no-op, which
  // prevents the "404 Not found" toast that would fire when the 2nd
  // DELETE hits a row already removed by the 1st.
  const key = deleteKey(kind, fileId)
  if (deletingFileIds.value[key]) return
  if (!confirm('Удалить файл?')) return
  deletingFileIds.value[key] = true
  const path = kind === 'source'
    ? `/api/materials/source-files/${fileId}`
    : `/api/materials/property-files/${fileId}`
  try {
    await api.delete(path)
    toast.add({ severity: 'success', summary: 'Файл', detail: 'Удалён', life: 2500 })
    if (kind === 'source') await loadSourceFiles(instanceId)
    else await loadPropertyFiles(instanceId)
  } catch (err) {
    toastApiError(toast, err, 'Файл — ошибка удаления', { life: 4000 })
  } finally {
    deletingFileIds.value[key] = false
  }
}

function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

async function saveProperties(instanceId) {
  const form = propertiesForm.value[instanceId]
  if (!form) return
  propertiesSaving.value[instanceId] = true
  try {
    const payload = {
      specific_capacity_mAh_g: form.specific_capacity_mAh_g === '' || form.specific_capacity_mAh_g == null
                                 ? null : Number(form.specific_capacity_mAh_g),
      density_g_ml:            form.density_g_ml === '' || form.density_g_ml == null
                                 ? null : Number(form.density_g_ml),
      notes:                   form.notes || null,
    }
    await api.put(`/api/materials/instances/${instanceId}/properties`, payload)
    toast.add({ severity: 'success', summary: 'Свойства', detail: 'Сохранено', life: 2500 })
    await loadProperties(instanceId)
  } catch (err) {
    toastApiError(toast, err, 'Свойства — ошибка сохранения', { life: 4000 })
  } finally {
    propertiesSaving.value[instanceId] = false
  }
}

async function loadAllInstances() {
  const { data } = await api.get('/api/materials/instances')
  allInstances.value = data
}

function toggleInstance(inst) {
  const id = inst.material_instance_id
  if (openInstances.value.has(id)) {
    openInstances.value = new Set([...openInstances.value].filter(x => x !== id))
  } else {
    openInstances.value = new Set([...openInstances.value, id])
    if (!componentsLoaded.value[id]) loadComponents(id)
    // Same pure-instance gate as loadInstances above.
    if (inst.is_pure) {
      if (!sourceInfoLoaded.value[id])  loadSourceInfo(id)
      if (!sourceFilesLoaded.value[id]) loadSourceFiles(id)
    }
    if (!propertiesLoaded.value[id])   loadProperties(id)
    if (!propertyFilesLoaded.value[id]) loadPropertyFiles(id)
  }
}

// ── Mutual exclusion for edit/create states ───────────────────────────
const editingInstanceId = ref(null)
const editInstanceForm = ref({ name: '', notes: '' })
const editingComponentId = ref(null)
const editComponentForm = ref({ mass_fraction: '', notes: '' })
const creatingInstance = ref(false)
// «Bag arrival» flow (spec §6.4): an instance is usually a physical bag —
// supplier / lot / receipt date are asked right here, at the moment it
// enters the lab, instead of hiding behind the source-info page. All
// optional («уточню позже» = leave blank). isRaw unchecked = a prepared
// mixture to be composed later (no source questions).
const newInstanceForm = ref({ name: '', notes: '', isRaw: true, supplier: '', lotNumber: '', dateReceived: '' })
const instanceNameTouched = ref(false)

function suggestedInstanceName() {
  const base = selectedMaterial.value?.name || ''
  const lot = newInstanceForm.value.lotNumber.trim()
  return lot ? `${base} — партия ${lot}` : base
}

function syncSuggestedInstanceName() {
  if (!instanceNameTouched.value) newInstanceForm.value.name = suggestedInstanceName()
}
// Full-composition editor (vanilla-parity): edits/replaces the WHOLE
// composition at once via the canonical replace-all endpoint with client-side
// sum-to-100 validation. Replaces the old single-component POST add.
const compositionEditorFor = ref(null)   // instance id whose composition is open
const compositionRows = ref([])          // [{ component_material_instance_id, percent, notes }]
const compositionSaving = ref(false)

function cancelAllEdits() {
  editingInstanceId.value = null
  editingComponentId.value = null
  creatingInstance.value = false
  compositionEditorFor.value = null
}

// ── Instance CRUD ─────────────────────────────────────────────────────
function startEditInstance(inst) {
  cancelAllEdits()
  editingInstanceId.value = inst.material_instance_id
  editInstanceForm.value = { name: inst.name, notes: inst.notes || '' }
}

function cancelEditInstance() { editingInstanceId.value = null }

async function saveEditInstance(inst) {
  const name = editInstanceForm.value.name.trim()
  if (!name) return
  try {
    await api.put(`/api/materials/instances/${inst.material_instance_id}`, {
      name,
      notes: editInstanceForm.value.notes.trim() || null,
    })
    toast.add({ severity: 'success', summary: 'Экземпляр обновлён', life: 3000 })
    editingInstanceId.value = null
    await loadInstances(selectedMaterialId.value)
  } catch (err) {
    toastApiError(toast, err, 'Не удалось обновить экземпляр')
  }
}

async function deleteInstance(inst) {
  if (!confirm(`Удалить экземпляр "${inst.name}"?`)) return
  try {
    await api.delete(`/api/materials/instances/${inst.material_instance_id}`)
    toast.add({ severity: 'success', summary: 'Экземпляр удалён', life: 3000 })
    await loadInstances(selectedMaterialId.value)
  } catch (err) {
    toastApiError(toast, err, 'Не удалось удалить экземпляр')
  }
}

function startInstanceCreate() {
  cancelAllEdits()
  creatingInstance.value = true
  instanceNameTouched.value = false
  newInstanceForm.value = { name: '', notes: '', isRaw: true, supplier: '', lotNumber: '', dateReceived: todayIsoMsk() }
  syncSuggestedInstanceName()
}

function resetInstanceCreate() {
  creatingInstance.value = false
  newInstanceForm.value = { name: '', notes: '', isRaw: true, supplier: '', lotNumber: '', dateReceived: '' }
  instanceNameTouched.value = false
}

async function saveNewInstance() {
  const name = newInstanceForm.value.name.trim()
  if (!name) return
  try {
    const f = newInstanceForm.value
    await api.post(`/api/materials/${selectedMaterialId.value}/instances`, {
      name,
      notes: f.notes.trim() || null,
      // isRaw → is_pure: a leaf/bag gets a source row (supplier/lot live
      // there); a prepared mixture gets none until composed.
      is_pure: f.isRaw === true,
      supplier: f.isRaw ? (f.supplier.trim() || null) : null,
      lot_number: f.isRaw ? (f.lotNumber.trim() || null) : null,
      date_received: f.isRaw ? (f.dateReceived || null) : null,
    })
    toast.add({ severity: 'success', summary: 'Экземпляр создан', life: 3000 })
    resetInstanceCreate()
    await loadInstances(selectedMaterialId.value)
  } catch (err) {
    toastApiError(toast, err, 'Не удалось создать экземпляр')
  }
}

// ── Component CRUD ────────────────────────────────────────────────────
function startEditComponent(comp) {
  cancelAllEdits()
  editingComponentId.value = comp.material_instance_component_id
  editComponentForm.value = {
    mass_fraction: (comp.mass_fraction * 100).toFixed(2),
    notes: comp.notes || '',
  }
}

function cancelEditComponent() { editingComponentId.value = null }

async function saveEditComponent(comp, instanceId) {
  const pct = Number(editComponentForm.value.mass_fraction)
  if (isNaN(pct) || pct <= 0 || pct > 100) {
    toast.add({ severity: 'warn', summary: 'Некорректный % (0-100)', life: 3000 })
    return
  }
  try {
    await api.put(`/api/materials/instances/components/${comp.material_instance_component_id}`, {
      mass_fraction: pct / 100,
      notes: editComponentForm.value.notes.trim() || null,
    })
    toast.add({ severity: 'success', summary: 'Компонент обновлён', life: 3000 })
    editingComponentId.value = null
    await loadComponents(instanceId)
  } catch (err) {
    toastApiError(toast, err, 'Не удалось обновить компонент')
  }
}

async function deleteComponent(comp, instanceId) {
  if (!confirm('Удалить компонент?')) return
  try {
    await api.delete(`/api/materials/instances/components/${comp.material_instance_component_id}`)
    toast.add({ severity: 'success', summary: 'Компонент удалён', life: 3000 })
    await loadComponents(instanceId)
  } catch (err) {
    toastApiError(toast, err, 'Не удалось удалить компонент')
  }
}

// ── Full-composition editor (vanilla "Состав" parity) ─────────────────
// Mirrors vanilla public/js/materials.js openCompositionEditor: a multi-row
// editor seeded with the current components, with client-side sum-to-100
// validation, saved via the canonical replace-all PUT (which re-validates
// server-side). Replaces the old per-component POST add, which carried no
// whole-composition validation. Inline ✏️/🗑 per-component edit/delete stay
// as-is — vanilla leaves those un-revalidated too.
function blankCompositionRow() {
  return { component_material_instance_id: '', percent: '', notes: '' }
}

const compositionSum = computed(() => sumPercent(compositionRows.value))
const compositionSumOk = computed(
  () => Math.abs(compositionSum.value / 100 - 1) <= COMPOSITION_TOLERANCE
)

async function openCompositionEditor(instanceId) {
  cancelAllEdits()
  await loadAllInstances()
  const current = componentsMap.value[instanceId] || []
  compositionRows.value = current.length
    ? current.map(c => ({
        component_material_instance_id: c.component_material_instance_id,
        percent: (Number(c.mass_fraction) * 100).toFixed(2),
        notes: c.notes || '',
      }))
    : [blankCompositionRow()]
  compositionEditorFor.value = instanceId
}

function cancelComposition() {
  compositionEditorFor.value = null
  compositionRows.value = []
}

function addCompositionRow() {
  compositionRows.value.push(blankCompositionRow())
}

function removeCompositionRow(idx) {
  compositionRows.value.splice(idx, 1)
  if (compositionRows.value.length === 0) compositionRows.value.push(blankCompositionRow())
}

// Per-row dropdown options: exclude the parent instance (no self-reference)
// and disable instances already chosen in another row (no duplicates) —
// matches vanilla's refreshCompositionOptionAvailability.
function compositionOptionsForRow(rowIndex) {
  const chosenElsewhere = new Set(
    compositionRows.value
      .filter((_, i) => i !== rowIndex)
      .map(r => Number(r.component_material_instance_id))
      .filter(n => Number.isInteger(n) && n > 0)
  )
  return allInstances.value
    .filter(inst => inst.material_instance_id !== compositionEditorFor.value)
    .map(inst => ({ ...inst, _disabled: chosenElsewhere.has(inst.material_instance_id) }))
}

async function saveComposition(instanceId) {
  const result = validateComposition(compositionRows.value, instanceId)
  if (!result.ok) {
    toast.add({ severity: 'warn', summary: 'Состав', detail: result.error, life: 4000 })
    return
  }
  compositionSaving.value = true
  try {
    await api.put(`/api/materials/instances/${instanceId}/components`, { components: result.components })
    toast.add({ severity: 'success', summary: 'Состав сохранён', life: 3000 })
    cancelComposition()
    await loadComponents(instanceId)
    // Replace-all always leaves ≥1 component, so the instance is now composite
    // (not pure) — reflect that locally so the source-info form hides without a
    // full reload.
    const inst = instances.value.find(i => i.material_instance_id === instanceId)
    if (inst) inst.is_pure = false
  } catch (err) {
    toastApiError(toast, err, 'Не удалось сохранить состав')
  } finally {
    compositionSaving.value = false
  }
}

function onEditKeydown(e, saveFn, cancelFn) {
  if (e.key === 'Enter') { e.preventDefault(); saveFn() }
  if (e.key === 'Escape') cancelFn()
}
</script>

<template>
  <div class="materials-page">
    <PageHeader title="Материалы" icon="pi pi-warehouse" />

    <!-- Оценка поставщиков (§6.4): подсказка появляется, когда есть
         неоценённые источники с реальным использованием — вопрос задаётся
         вместе с доказательствами, а не при создании. -->
    <div v-if="evalCandidates.length && !evalBannerDismissed" class="glass-card eval-banner">
      <div class="eval-banner-head">
        <i class="pi pi-star" />
        <span>Оценка поставщиков — есть материалы с накопленным опытом:</span>
        <Button icon="pi pi-times" text size="small" class="eval-banner-close"
          @click="evalBannerDismissed = true" />
      </div>
      <ul class="eval-banner-list">
        <li v-for="c in evalCandidates" :key="c.material_instance_id">
          <span class="eval-item-name">{{ c.material_name }}</span>
          <span v-if="c.instance_name !== c.material_name"> · {{ c.instance_name }}</span>
          <span v-if="c.supplier"> · {{ c.supplier }}</span>
          — {{ Number(c.tapes_used) }} {{ Number(c.tapes_used) === 1 ? 'лента' : (Number(c.tapes_used) < 5 ? 'ленты' : 'лент') }}<template v-if="c.has_cycling">, есть циклирование</template>
          <Button label="Оценить" size="small" text class="eval-item-btn" @click="goEvaluate(c)" />
        </li>
      </ul>
    </div>

    <div class="materials-content">
      <!-- ── Left Panel: Material List ── -->
      <div class="left-panel">
        <div class="left-toolbar">
          <Button label="Добавить" icon="pi pi-plus" severity="secondary" outlined class="add-btn" @click="startMaterialCreate" />
        </div>

        <!-- Inline create material -->
        <div v-if="creatingMaterial" class="create-material-form">
          <InputText
            v-model="newMaterialForm.name"
            placeholder="Название"
            class="w-full"
            @keydown.enter.prevent="saveNewMaterial"
            @keydown.escape="cancelMaterialCreate"
          />
          <Select
            v-model="newMaterialForm.role"
            :options="roleOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="-- роль --"
            class="w-full"
          />
          <!-- Family — controlled vocabulary, active materials only
               (spec §4): for binders/additives/solvents the field is
               hidden entirely, families don't apply there. -->
          <Select
            v-if="familyApplies(newMaterialForm.role)"
            v-model="newMaterialForm.family"
            :options="familyOptionsFor(newMaterialForm.role, newMaterialForm.family)"
            optionLabel="label"
            optionValue="value"
            placeholder="— семейство —"
            showClear
            class="w-full"
          />
          <InputText
            v-model="newMaterialForm.manufacturer"
            placeholder="Производитель"
            class="w-full"
            @keydown.enter.prevent="saveNewMaterial"
            @keydown.escape="cancelMaterialCreate"
          />
          <div class="create-material-actions">
            <Button label="Создать" @click="saveNewMaterial" />
            <Button label="Отмена" severity="secondary" outlined @click="cancelMaterialCreate" />
          </div>
        </div>

        <!-- Filters -->
        <div class="filter-wrap">
          <InputText v-model="filterText" placeholder="Поиск..." class="w-full" />
          <div class="role-chips">
            <button
              v-for="opt in roleOptions"
              :key="opt.value"
              :class="['role-chip', { active: filterRole === opt.value }]"
              @click="filterRole = filterRole === opt.value ? '' : opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>

        <!-- Material list — grouped: role → family → products, so all NMC
             products sit under one «NMC» header (the agreed hierarchy). -->
        <div class="material-list">
          <template v-for="section in groupedMaterials" :key="section.role">
            <div class="material-group-role">{{ section.label }}</div>
            <template v-for="fam in section.families" :key="section.role + ':' + (fam.family ?? '')">
              <div
                v-if="fam.family !== null"
                :class="['material-group-family', { 'missing-attr': !fam.family }]"
              >{{ fam.family || 'Без семейства' }}</div>
          <div
            v-for="m in fam.items"
            :key="m.material_id"
            :class="['material-item', 'material-item--grouped', { active: selectedMaterialId === m.material_id }]"
            @click="selectMaterial(m)"
          >
            <div class="material-item-info">
              <span class="material-item-name">{{ m.name }}</span>
              <!-- Meta line: роль · семейство · производитель.
                   D4 (spec §6.2): for active materials a missing family/
                   manufacturer is rendered as a red placeholder so the
                   incompleteness stays uncomfortable. For other roles
                   family is "not applicable" — no nag, render nothing. -->
              <!-- Role and family now live in the group headers above;
                   the item meta carries only the manufacturer (red when
                   missing on active roles — D4). -->
              <span class="material-item-role">
                <template v-if="familyApplies(m.role)">
                  <span v-if="m.manufacturer">{{ m.manufacturer }}</span>
                  <span v-else class="missing-attr">Производитель: неизвестен</span>
                </template>
                <template v-else><template v-if="m.manufacturer">{{ m.manufacturer }}</template></template>
              </span>
            </div>
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              class="material-item-delete"
              @click.stop="deleteMaterial(m)"
            />
          </div>
            </template>
          </template>
          <div v-if="filteredMaterials.length === 0" class="empty-text">
            {{ filterText ? 'Ничего не найдено' : 'Нет материалов' }}
          </div>
        </div>
      </div>

      <!-- ── Right Panel: Selected Material Detail ── -->
      <div class="right-panel">
        <template v-if="selectedMaterial">
          <!-- Metadata -->
          <div class="detail-section">
            <div class="section-title">Метаданные</div>
            <div class="metadata-row">
              <InputText v-model="editForm.name" placeholder="Название" class="meta-name" />
              <Select
                v-model="editForm.role"
                :options="roleOptions"
                optionLabel="label"
                optionValue="value"
                class="meta-role"
              />
              <!-- Family — controlled vocabulary Select (spec §4), only
                   for active materials; hidden for other roles where the
                   family axis doesn't apply. A legacy stored value not in
                   the vocabulary stays selectable via familyOptionsFor. -->
              <Select
                v-if="familyApplies(editForm.role)"
                v-model="editForm.family"
                :options="familyOptionsFor(editForm.role, editForm.family)"
                optionLabel="label"
                optionValue="value"
                placeholder="— семейство —"
                showClear
                v-tooltip.top="'Семейство химии (NMC, LFP, SG…) — группирует материалы в выборе активного материала ленты'"
                class="meta-family"
              />
              <InputText
                v-model="editForm.manufacturer"
                placeholder="Производитель"
                v-tooltip.top="'Кто производит продукт (BTR, Solvay…). Поставщик конкретной партии вводится в карточке экземпляра'"
                class="meta-manufacturer"
              />
              <Button label="Сохранить" @click="saveMaterialEdit" />
            </div>
          </div>

          <!-- Instances -->
          <div class="detail-section">
            <div class="section-header">
              <span class="section-title">Экземпляры</span>
              <Button label="Экземпляр" icon="pi pi-plus" severity="secondary" outlined @click="startInstanceCreate" />
            </div>

            <div v-if="instancesLoading" class="loading-text">Загрузка...</div>

            <div v-else class="instances-list">
              <div v-for="inst in instances" :key="inst.material_instance_id" class="instance-block">
                <!-- Instance row -->
                <div class="instance-row">
                  <button type="button" class="expand-btn" @click="toggleInstance(inst)">
                    <i :class="['pi', openInstances.has(inst.material_instance_id) ? 'pi-chevron-down' : 'pi-chevron-right']" />
                  </button>

                  <template v-if="editingInstanceId === inst.material_instance_id">
                    <InputText
                      v-model="editInstanceForm.name"
                      class="inst-name-input"
                      @keydown="onEditKeydown($event, () => saveEditInstance(inst), cancelEditInstance)"
                    />
                    <!-- Textarea, not InputText: notes are multiline and a
                         single-line input flattens stored line breaks on
                         save. Enter types a newline here — save via ✓. -->
                    <Textarea
                      v-model="editInstanceForm.notes"
                      placeholder="Комментарий"
                      class="inst-notes-input"
                      autoResize
                      :rows="2"
                      @keydown.escape="cancelEditInstance"
                    />
                    <Button icon="pi pi-check" text @click="saveEditInstance(inst)" />
                    <Button icon="pi pi-times" text severity="secondary" @click="cancelEditInstance" />
                  </template>

                  <template v-else>
                    <span class="inst-name">{{ inst.name }}</span>
                    <!-- Composition state as a computed badge, never part
                         of the stored name (spec §6.1, the d047 lesson):
                         «исходный» = leaf (as-received/as-purchased),
                         «приготовленный» = composed of other instances.
                         is_pure is backend-computed leaf-vs-mixture and
                         is kept in sync locally by saveComposition. -->
                    <span :class="['inst-badge', inst.is_pure ? 'inst-badge--raw' : 'inst-badge--prepared']">
                      {{ inst.is_pure ? 'исходный' : 'приготовленный' }}
                    </span>
                    <span v-if="inst.notes" class="inst-notes">{{ inst.notes }}</span>
                    <div class="actions">
                      <Button icon="pi pi-pencil" text @click.stop="startEditInstance(inst)" />
                      <Button icon="pi pi-trash" text severity="danger" @click.stop="deleteInstance(inst)" />
                    </div>
                  </template>
                </div>

                <!-- Components (expanded) -->
                <div v-if="openInstances.has(inst.material_instance_id)" class="components-section">
                  <template v-if="componentsLoaded[inst.material_instance_id]">
                    <table v-if="(componentsMap[inst.material_instance_id] || []).length > 0" class="comp-table">
                      <thead>
                        <tr>
                          <th>Компонент</th>
                          <th>%</th>
                          <th>Заметки</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="comp in componentsMap[inst.material_instance_id]" :key="comp.material_instance_component_id">
                          <template v-if="editingComponentId === comp.material_instance_component_id">
                            <td>{{ comp.component_name }}</td>
                            <td>
                              <InputText
                                v-model="editComponentForm.mass_fraction"
                                class="input-narrow"
                                @keydown="onEditKeydown($event, () => saveEditComponent(comp, inst.material_instance_id), cancelEditComponent)"
                              />
                            </td>
                            <td>
                              <Textarea
                                v-model="editComponentForm.notes"
                                placeholder="Комментарий"
                                autoResize
                                :rows="2"
                                @keydown.escape="cancelEditComponent"
                              />
                            </td>
                            <td>
                              <Button icon="pi pi-check" text @click="saveEditComponent(comp, inst.material_instance_id)" />
                              <Button icon="pi pi-times" text severity="secondary" @click="cancelEditComponent" />
                            </td>
                          </template>
                          <template v-else>
                            <td>{{ comp.component_name }}</td>
                            <td>{{ (comp.mass_fraction * 100).toFixed(2) }}%</td>
                            <td class="meta-text">{{ comp.notes || '' }}</td>
                            <td>
                              <Button icon="pi pi-pencil" text @click="startEditComponent(comp)" />
                              <Button icon="pi pi-trash" text severity="danger" @click="deleteComponent(comp, inst.material_instance_id)" />
                            </td>
                          </template>
                        </tr>
                      </tbody>
                    </table>
                    <div v-else class="empty-text">Нет компонентов</div>

                    <!-- Full-composition editor (vanilla "Состав" parity):
                         edits/replaces the whole composition at once, validated
                         to sum to 100% before the canonical replace-all PUT. -->
                    <div v-if="compositionEditorFor === inst.material_instance_id" class="composition-editor">
                      <div class="comp-editor-head">Состав — сумма должна быть ровно 100%</div>
                      <div
                        v-for="(crow, idx) in compositionRows"
                        :key="idx"
                        class="comp-editor-row"
                      >
                        <Select
                          v-model="crow.component_material_instance_id"
                          :options="compositionOptionsForRow(idx)"
                          optionLabel="name"
                          optionValue="material_instance_id"
                          optionDisabled="_disabled"
                          filter
                          placeholder="— экземпляр —"
                          class="comp-select"
                        />
                        <InputText
                          v-model="crow.percent"
                          placeholder="%"
                          class="input-narrow"
                          @keydown.enter.prevent="addCompositionRow"
                        />
                        <InputText
                          v-model="crow.notes"
                          placeholder="Комментарий"
                          class="input-flex"
                        />
                        <Button
                          icon="pi pi-times"
                          text
                          severity="secondary"
                          title="Удалить строку"
                          @click="removeCompositionRow(idx)"
                        />
                      </div>
                      <div class="comp-editor-foot">
                        <span :class="['comp-sum', { 'comp-sum--bad': !compositionSumOk }]">
                          Σ {{ compositionSum.toFixed(2) }}%
                        </span>
                        <div class="comp-editor-actions">
                          <Button label="Ингредиент" icon="pi pi-plus" text size="small" @click="addCompositionRow" />
                          <Button
                            label="Сохранить состав"
                            icon="pi pi-check"
                            size="small"
                            :loading="compositionSaving"
                            :disabled="compositionSaving"
                            @click="saveComposition(inst.material_instance_id)"
                          />
                          <Button label="Отмена" severity="secondary" outlined size="small" @click="cancelComposition" />
                        </div>
                      </div>
                    </div>
                    <Button
                      v-else
                      :label="(componentsMap[inst.material_instance_id] || []).length ? 'Изменить состав' : 'Задать состав'"
                      icon="pi pi-sliders-h"
                      text
                      severity="secondary"
                      @click="openCompositionEditor(inst.material_instance_id)"
                    />
                  </template>
                  <div v-else class="loading-text">Загрузка...</div>

                  <!-- ── Source info (supplier/lot/quality, d026) ──
                       Only meaningful for "pure" instances (single compound,
                       no components). Backend returns 400 for composites,
                       so we hide the form entirely and show a short hint
                       instead of a loading spinner that never resolves. -->
                  <div v-if="!inst.is_pure" class="instance-sub-section instance-sub-section--muted">
                    <div class="sub-section-title">Источник</div>
                    <div class="meta-text">
                      Информация о поставщике/партии/качестве ведётся только для
                      однокомпонентных материалов. У этого экземпляра есть компоненты
                      — источник каждого компонента ведётся в его отдельной карточке.
                    </div>
                  </div>
                  <div v-else class="instance-sub-section">
                    <div class="sub-section-title">Источник (поставщик · партия · качество)</div>
                    <template v-if="sourceInfoLoaded[inst.material_instance_id]">
                      <div class="form-grid">
                        <div class="form-field">
                          <label>Поставщик</label>
                          <InputText v-model="sourceInfoForm[inst.material_instance_id].supplier" class="w-full" />
                        </div>
                        <div class="form-field">
                          <label>Бренд</label>
                          <InputText v-model="sourceInfoForm[inst.material_instance_id].brand" class="w-full" />
                        </div>
                        <div class="form-field">
                          <label>Модель / каталожный №</label>
                          <InputText v-model="sourceInfoForm[inst.material_instance_id].model_or_catalog_no" class="w-full" />
                        </div>
                        <div class="form-field">
                          <label>Номер партии</label>
                          <InputText v-model="sourceInfoForm[inst.material_instance_id].lot_number" class="w-full" />
                        </div>
                        <div class="form-field">
                          <label>Дата заказа</label>
                          <DateInputISO v-model="sourceInfoForm[inst.material_instance_id].date_ordered" class="date-input" />
                        </div>
                        <div class="form-field">
                          <label>Дата получения</label>
                          <DateInputISO v-model="sourceInfoForm[inst.material_instance_id].date_received" class="date-input" />
                        </div>
                        <div class="form-field">
                          <label>Метка качества</label>
                          <Select
                            v-model="sourceInfoForm[inst.material_instance_id].quality_rating_label"
                            :options="QUALITY_LABELS"
                            optionLabel="label"
                            optionValue="value"
                            placeholder="—"
                            showClear
                            class="w-full"
                          />
                        </div>
                        <div class="form-field">
                          <label title="1 — худшая оценка, 5 — лучшая">Оценка, 1–5</label>
                          <input
                            type="number" min="1" max="5" step="1"
                            v-model="sourceInfoForm[inst.material_instance_id].quality_rating_score"
                            class="num-input"
                          />
                        </div>
                        <div class="form-field form-field--full">
                          <label>Комментарий по оценке</label>
                          <textarea
                            v-model="sourceInfoForm[inst.material_instance_id].evaluation_notes"
                            class="textarea-input"
                            rows="2"
                          />
                        </div>
                        <div class="form-field form-field--full form-field--checkbox">
                          <label>
                            <input
                              type="checkbox"
                              v-model="sourceInfoForm[inst.material_instance_id].is_evaluated"
                            />
                            Оценка завершена
                          </label>
                        </div>
                      </div>
                      <div class="form-actions">
                        <Button
                          label="Сохранить источник"
                          icon="pi pi-save"
                          size="small"
                          :loading="!!sourceInfoSaving[inst.material_instance_id]"
                          :disabled="!!sourceInfoSaving[inst.material_instance_id]"
                          @click="saveSourceInfo(inst.material_instance_id)"
                        />
                      </div>

                      <!-- Source files (datasheets, certificates) — d027 -->
                      <div class="files-panel">
                        <div class="files-panel-head">
                          <span class="files-panel-title">📎 Прикреплённые файлы источника</span>
                          <label class="file-upload-btn" :class="{ 'is-busy': !!uploadingSourceFiles[inst.material_instance_id] }">
                            <i :class="uploadingSourceFiles[inst.material_instance_id] ? 'pi pi-spin pi-spinner' : 'pi pi-plus'"></i>
                            Добавить
                            <input
                              type="file"
                              multiple
                              style="display:none"
                              :disabled="!!uploadingSourceFiles[inst.material_instance_id]"
                              @change="(e) => { uploadSourceFiles(inst.material_instance_id, e.target.files); e.target.value = '' }"
                            />
                          </label>
                        </div>
                        <ul v-if="sourceFilesLoaded[inst.material_instance_id] && (sourceFilesMap[inst.material_instance_id] || []).length" class="file-list">
                          <li v-for="f in sourceFilesMap[inst.material_instance_id]" :key="f.material_source_file_id">
                            <button
                              type="button"
                              class="file-link"
                              :title="f.mime_type || ''"
                              @click="downloadFile('source', f.material_source_file_id, f.file_name)"
                            >
                              <i class="pi pi-file" style="font-size:11px;margin-right:4px"></i>
                              {{ f.file_name }}
                            </button>
                            <button
                              type="button"
                              class="file-del-btn"
                              title="Удалить файл"
                              :disabled="!!deletingFileIds[`source-${f.material_source_file_id}`]"
                              @click="deleteFile('source', f.material_source_file_id, inst.material_instance_id)"
                            >
                              <i :class="deletingFileIds[`source-${f.material_source_file_id}`] ? 'pi pi-spin pi-spinner' : 'pi pi-trash'"></i>
                            </button>
                          </li>
                        </ul>
                        <div v-else-if="!sourceFilesLoaded[inst.material_instance_id]" class="loading-text loading-text--small">Загрузка файлов…</div>
                        <div v-else class="empty-text empty-text--small">Файлы не прикреплены</div>
                      </div>
                    </template>
                    <div v-else class="loading-text">Загрузка…</div>
                  </div>

                  <!-- ── Properties (spec capacity / density, d026) ── -->
                  <div class="instance-sub-section">
                    <div class="sub-section-title">Свойства (удельная ёмкость · плотность)</div>
                    <template v-if="propertiesLoaded[inst.material_instance_id]">
                      <div class="form-grid">
                        <div class="form-field">
                          <label>Удельная ёмкость, мАч/г</label>
                          <input
                            type="number" step="any" min="0"
                            v-model="propertiesForm[inst.material_instance_id].specific_capacity_mAh_g"
                            class="num-input"
                          />
                        </div>
                        <div class="form-field">
                          <label>Плотность, г/мл</label>
                          <input
                            type="number" step="any" min="0"
                            v-model="propertiesForm[inst.material_instance_id].density_g_ml"
                            class="num-input"
                          />
                        </div>
                        <div class="form-field form-field--full">
                          <label>Заметки</label>
                          <textarea
                            v-model="propertiesForm[inst.material_instance_id].notes"
                            class="textarea-input"
                            rows="2"
                          />
                        </div>
                      </div>
                      <div class="form-actions">
                        <Button
                          label="Сохранить свойства"
                          icon="pi pi-save"
                          size="small"
                          :loading="!!propertiesSaving[inst.material_instance_id]"
                          :disabled="!!propertiesSaving[inst.material_instance_id]"
                          @click="saveProperties(inst.material_instance_id)"
                        />
                      </div>

                      <!-- Property files (measurement reports etc) — d027 -->
                      <div class="files-panel">
                        <div class="files-panel-head">
                          <span class="files-panel-title">📎 Файлы свойств</span>
                          <label class="file-upload-btn" :class="{ 'is-busy': !!uploadingPropertyFiles[inst.material_instance_id] }">
                            <i :class="uploadingPropertyFiles[inst.material_instance_id] ? 'pi pi-spin pi-spinner' : 'pi pi-plus'"></i>
                            Добавить
                            <input
                              type="file"
                              multiple
                              style="display:none"
                              :disabled="!!uploadingPropertyFiles[inst.material_instance_id]"
                              @change="(e) => { uploadPropertyFiles(inst.material_instance_id, e.target.files); e.target.value = '' }"
                            />
                          </label>
                        </div>
                        <ul v-if="propertyFilesLoaded[inst.material_instance_id] && (propertyFilesMap[inst.material_instance_id] || []).length" class="file-list">
                          <li v-for="f in propertyFilesMap[inst.material_instance_id]" :key="f.material_property_file_id">
                            <button
                              type="button"
                              class="file-link"
                              :title="f.mime_type || ''"
                              @click="downloadFile('property', f.material_property_file_id, f.file_name)"
                            >
                              <i class="pi pi-file" style="font-size:11px;margin-right:4px"></i>
                              {{ f.file_name }}
                            </button>
                            <button
                              type="button"
                              class="file-del-btn"
                              title="Удалить файл"
                              :disabled="!!deletingFileIds[`property-${f.material_property_file_id}`]"
                              @click="deleteFile('property', f.material_property_file_id, inst.material_instance_id)"
                            >
                              <i :class="deletingFileIds[`property-${f.material_property_file_id}`] ? 'pi pi-spin pi-spinner' : 'pi pi-trash'"></i>
                            </button>
                          </li>
                        </ul>
                        <div v-else-if="!propertyFilesLoaded[inst.material_instance_id]" class="loading-text loading-text--small">Загрузка файлов…</div>
                        <div v-else class="empty-text empty-text--small">Файлы не прикреплены</div>
                      </div>
                    </template>
                    <div v-else class="loading-text">Загрузка…</div>
                  </div>
                </div>
              </div>

              <div v-if="instances.length === 0 && !instancesLoading" class="empty-text">Нет экземпляров</div>

              <!-- Create instance inline -->
              <div v-if="creatingInstance" class="create-inst-block">
                <div class="create-inst-row">
                  <InputText
                    v-model="newInstanceForm.name"
                    placeholder="Название экземпляра"
                    @input="instanceNameTouched = true"
                    @keydown.enter.prevent="saveNewInstance"
                    @keydown.escape="resetInstanceCreate"
                  />
                  <Textarea
                    v-model="newInstanceForm.notes"
                    placeholder="Комментарий"
                    class="input-flex"
                    autoResize
                    :rows="2"
                    @keydown.escape="resetInstanceCreate"
                  />
                  <Button icon="pi pi-check" text @click="saveNewInstance" />
                  <Button icon="pi pi-times" text severity="secondary" @click="resetInstanceCreate" />
                </div>
                <label class="create-inst-raw">
                  <Checkbox v-model="newInstanceForm.isRaw" binary />
                  <span>исходный — мешок/партия от поставщика (иначе: приготовленная смесь)</span>
                </label>
                <!-- «Приход мешка» — supplier/lot/date at the moment the bag
                     enters the lab (spec §6.4). Optional; blanks stay blank. -->
                <div v-if="newInstanceForm.isRaw" class="create-inst-row create-inst-bag">
                  <InputText
                    v-model="newInstanceForm.supplier"
                    placeholder="Поставщик (у кого куплено)"
                    v-tooltip.top="'Продавец этого мешка. Производитель продукта указывается на материале.'"
                  />
                  <InputText
                    v-model="newInstanceForm.lotNumber"
                    placeholder="№ партии (lot)"
                    @input="syncSuggestedInstanceName()"
                  />
                  <InputText
                    v-model="newInstanceForm.dateReceived"
                    type="date"
                    v-tooltip.top="'Дата получения'"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Empty state -->
        <div v-else class="empty-state">
          <i class="pi pi-arrow-left" style="font-size: 1.5rem; color: #D1D7DE"></i>
          <p>Выберите материал из списка слева</p>
        </div>
      </div>
    </div>

    <!-- Duplicate warning on create (D3, spec §6.3): the typed name's
         fingerprint collides with an existing material. Warn — never
         block: primary action selects the existing entry, the escape
         hatch proceeds with creation as typed. Closing the dialog (✕)
         returns to the create form unchanged. -->
    <Dialog
      :visible="!!duplicateWarn"
      modal
      header="Похожий материал"
      :style="{ width: '26rem' }"
      @update:visible="(v) => { if (!v) duplicateWarn = null }"
    >
      <p class="dup-warn-text">
        Похоже на существующий «{{ duplicateWarn?.existing?.name }}» — использовать его?
      </p>
      <template #footer>
        <Button
          label="Использовать существующий"
          icon="pi pi-check"
          @click="useExistingMaterial"
        />
        <Button
          label="Нет, это другой материал"
          severity="secondary"
          outlined
          @click="createDuplicateAnyway"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.materials-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.materials-page :deep(.page-header) { margin-bottom: 3px !important; }

/* ── Master-detail layout (glass-card) ── */
.materials-content {
  display: flex;
  background: rgba(255, 255, 255, 0.62);
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 12px;
  box-shadow: 0 4px 11px rgba(0, 50, 116, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  min-height: 500px;
  max-height: calc(100vh - 160px);
  overflow: hidden;
}

/* ── Left panel ── */
.left-panel {
  width: 280px;
  flex-shrink: 0;
  border-right: 0.5px solid rgba(180, 210, 255, 0.4);
  display: flex;
  flex-direction: column;
  background: rgba(248, 252, 255, 0.5);
}

.left-toolbar {
  padding: 0.75rem;
  border-bottom: 0.5px solid rgba(180, 210, 255, 0.3);
}
.add-btn { width: 100%; }

.create-material-form {
  padding: 0.75rem;
  border-bottom: 0.5px solid rgba(180, 210, 255, 0.3);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.create-material-actions {
  display: flex;
  gap: 0.4rem;
}

.filter-wrap {
  padding: 0.5rem 0.75rem;
  border-bottom: 0.5px solid rgba(180, 210, 255, 0.3);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.role-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.role-chip {
  padding: 2px 8px;
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 20px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.6);
  color: #6B7280;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.role-chip:hover {
  border-color: rgba(82, 201, 166, 0.45);
  color: #003274;
  box-shadow: 2px 3px 6px rgba(82, 201, 166, 0.12);
}
.role-chip.active {
  background: rgba(0, 50, 116, 0.08);
  border-color: #003274;
  color: #003274;
  font-weight: 600;
}

.material-list {
  flex: 1;
  overflow-y: auto;
}

.material-group-role {
  padding: 10px 8px 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(0, 50, 116, 0.55);
}

.material-group-family {
  padding: 6px 8px 2px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #003274;
}

/* Products sit indented under their family header. */
.material-item--grouped {
  margin-left: 14px;
}

.material-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  border-bottom: 0.5px solid rgba(180, 210, 255, 0.2);
  transition: background 0.15s;
}
.material-item:hover { background: rgba(0, 50, 116, 0.04); }
.material-item.active {
  background: rgba(0, 50, 116, 0.08);
  border-left: 3px solid #003274;
  box-shadow: inset 0 0 0 0.5px rgba(0, 50, 116, 0.08);
}

.material-item-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
}
.material-item-name {
  font-size: 13px;
  font-weight: 600;
  color: #003274;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.material-item-role {
  font-size: 11px;
  color: #6B7280;
}

/* D4 (spec §6.2): red placeholder for data that SHOULD be filled but
   isn't («Производитель: неизвестен», «Семейство: не указано»).
   UI-only — NULL in DB stays the single "unknown" representation.
   Never applied to not-applicable fields (e.g. a solvent's family). */
.create-inst-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.create-inst-raw {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #345;
  cursor: pointer;
}
.create-inst-bag :deep(input[type='date']) {
  padding: 6px 8px;
}

.missing-attr {
  color: #c0392b;
}

.material-item-delete {
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.material-item:hover .material-item-delete { opacity: 1; }
.material-item-delete.p-button { width: 2rem; height: 2rem; }

/* ── Right panel ── */
.right-panel {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 0.75rem;
  color: #6B7280;
  font-size: 14px;
}

/* ── Detail sections ── */
.detail-section {
  margin-bottom: 1.5rem;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}
.section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
  margin-bottom: 0.5rem;
}

.metadata-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.meta-name { flex: 1; }
.meta-role { width: 160px; flex-shrink: 0; }
.meta-family { width: 150px; flex-shrink: 0; }
.meta-manufacturer { width: 140px; flex-shrink: 0; }

/* Duplicate-warning dialog (D3) */
.dup-warn-text {
  margin: 0;
  font-size: 14px;
  color: #003274;
  line-height: 1.5;
}

/* ── Shared form styles ── */
.w-full { width: 100%; }
.input-narrow { width: 80px; flex-shrink: 0; }
.input-flex { flex: 1; }
.comp-select { min-width: 200px; }

.meta-text { color: #6B7280; font-size: 12px; }
.loading-text { color: #6B7280; font-size: 13px; padding: 0.5rem 0; }
.empty-text { color: #6B7280; font-size: 13px; padding: 0.5rem 0; text-align: center; }

/* ── Instances ── */
.instances-list {
  display: flex;
  flex-direction: column;
}
.instance-block {
  border-bottom: 0.5px solid rgba(180, 210, 255, 0.3);
}
.instance-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.25rem;
  transition: background 0.12s;
}
.instance-row:hover { background: rgba(0, 50, 116, 0.03); }

.expand-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #6B7280;
  padding: 2px 4px;
  font-size: 11px;
}

.inst-name {
  font-weight: 600;
  font-size: 13px;
  color: #003274;
  flex-shrink: 0;
}
.inst-notes {
  color: #6B7280;
  font-size: 12px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Composition-state badge (spec §6.1): computed, never stored in the
   name. «исходный» = calm gray leaf; «приготовленный» = green-tinted
   mixture (matches the app's teal accent used for positive states). */
.inst-badge {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 20px;
  font-size: 10.5px;
  font-weight: 500;
  white-space: nowrap;
}
.inst-badge--raw {
  background: rgba(107, 114, 128, 0.10);
  color: #6B7280;
  border: 0.5px solid rgba(107, 114, 128, 0.25);
}
.inst-badge--prepared {
  background: rgba(82, 201, 166, 0.14);
  color: #1a8a64;
  border: 0.5px solid rgba(82, 201, 166, 0.35);
}
.inst-name-input { flex: 0 0 200px; }
.inst-notes-input { flex: 1; }

.actions { display: flex; gap: 0.15rem; margin-left: auto; flex-shrink: 0; }

/* ── Components ── */
.components-section {
  margin-left: 1.75rem;
  padding-bottom: 0.5rem;
}

/* ── Source-info & Properties sub-sections (Dalia d026) ── */
.instance-sub-section {
  margin-top: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: rgba(0, 50, 116, 0.02);
  border: 0.5px solid rgba(0, 50, 116, 0.08);
  border-radius: 6px;
}
.instance-sub-section--muted {
  background: rgba(0, 50, 116, 0.015);
  opacity: 0.75;
}
.instance-sub-section--muted .meta-text {
  font-size: 12px;
  line-height: 1.45;
  color: #6B7280;
}
.sub-section-title {
  font-size: 11px;
  font-weight: 600;
  color: rgba(0, 50, 116, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 0.5rem;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem 0.7rem;
  margin-bottom: 0.5rem;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.form-field--full { grid-column: 1 / -1; }
.form-field--checkbox label {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.form-field label {
  font-size: 11px;
  color: #6B7280;
  font-weight: 500;
}
.num-input,
.date-input {
  padding: 4px 8px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 5px;
  background: white;
  color: #003274;
  font-size: 13px;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}
.num-input:focus,
.date-input:focus {
  outline: none;
  border-color: #003274;
  box-shadow: 0 0 0 2px rgba(0, 50, 116, 0.1);
}
.textarea-input {
  padding: 5px 8px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 5px;
  background: white;
  color: #003274;
  font-size: 13px;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
}

/* ── File attachments (d027) ── */
.files-panel {
  margin-top: 0.75rem;
  padding-top: 0.65rem;
  border-top: 0.5px dashed rgba(0, 50, 116, 0.15);
}
.files-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.35rem;
}
.files-panel-title {
  font-size: 11px;
  font-weight: 600;
  color: #6B7280;
}
.file-upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 5px;
  background: white;
  color: #003274;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}
.file-upload-btn:hover:not(.is-busy) {
  background: #003274;
  color: white;
}
.file-upload-btn.is-busy {
  opacity: 0.6;
  cursor: progress;
}
.file-upload-btn i { font-size: 11px; }
.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.file-list li {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 4px;
  transition: background 0.1s;
}
.file-list li:hover { background: rgba(0, 50, 116, 0.04); }
.file-link {
  flex: 1;
  text-align: left;
  background: transparent;
  border: none;
  color: #003274;
  cursor: pointer;
  font-size: 12.5px;
  font-family: inherit;
  padding: 2px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-link:hover { text-decoration: underline; }
.file-del-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: rgba(231, 76, 60, 0.7);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}
.file-del-btn:hover { background: rgba(231, 76, 60, 0.1); color: #E74C3C; }
.file-del-btn i { font-size: 11px; }
.loading-text--small,
.empty-text--small {
  font-size: 11px;
  padding: 3px 0;
}
.comp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.comp-table th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: #6B7280;
  padding: 0.25rem 0.4rem;
  border-bottom: 0.5px solid rgba(180, 210, 255, 0.4);
}
.comp-table td {
  padding: 0.25rem 0.4rem;
  vertical-align: middle;
}
.comp-table th:nth-child(2), .comp-table td:nth-child(2) { width: 80px; }
.comp-table th:nth-child(4), .comp-table td:nth-child(4) { width: 70px; }

.create-inst-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
}

/* ── Full-composition editor (vanilla "Состав" parity) ── */
.composition-editor {
  margin: 0.5rem 0 0.25rem;
  padding: 0.6rem 0.75rem;
  background: rgba(0, 50, 116, 0.02);
  border: 0.5px solid rgba(0, 50, 116, 0.1);
  border-radius: 6px;
}
.comp-editor-head {
  font-size: 11px;
  font-weight: 600;
  color: rgba(0, 50, 116, 0.7);
  margin-bottom: 0.5rem;
}
.comp-editor-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.comp-editor-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.6rem;
  flex-wrap: wrap;
}
.comp-editor-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.comp-sum {
  font-size: 13px;
  font-weight: 700;
  color: #2f8f5b;
  font-variant-numeric: tabular-nums;
}
.comp-sum--bad { color: #E74C3C; }

/* ── PrimeVue overrides for compact areas ── */
.instance-row :deep(.p-button-icon-only) {
  width: 2rem;
  height: 2rem;
}
.comp-table :deep(.p-button-icon-only) {
  width: 2rem;
  height: 2rem;
}
.material-item-delete :deep(.p-button) {
  width: 2rem;
  height: 2rem;
}

/* ── Mobile ── */
@media (max-width: 768px) {
  .materials-content {
    flex-direction: column;
    max-height: none;
    min-height: auto;
  }
  .left-panel {
    width: 100%;
    max-height: 40vh;
    border-right: none;
    border-bottom: 0.5px solid rgba(180, 210, 255, 0.4);
  }
  .right-panel {
    padding: 1rem;
  }
  .metadata-row {
    flex-wrap: wrap;
  }
  .meta-name { flex: 1 1 100%; }
  .meta-role { width: 100%; }
  .meta-family { width: 100%; }
  .meta-manufacturer { width: 100%; }
}
.eval-banner {
  margin: 0 0 14px;
  padding: 12px 16px;
  border-left: 4px solid #e8a013;
}
.eval-banner-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #003274;
}
.eval-banner-close { margin-left: auto; }
.eval-banner-list {
  margin: 8px 0 0;
  padding-left: 22px;
}
.eval-banner-list li { padding: 2px 0; }
.eval-item-name { font-weight: 600; }
.eval-item-btn { margin-left: 6px; }
</style>
