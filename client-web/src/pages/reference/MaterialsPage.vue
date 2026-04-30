<script setup>
/**
 * MaterialsPage — "Материалы" (справочник)
 * Master-detail layout: left panel = material list, right panel = instances & components.
 * All CRUD inline, no dialogs.
 */
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import { toastApiError } from '@/utils/errorClassifier'
import PageHeader from '@/components/PageHeader.vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'

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

onMounted(loadMaterials)

function selectMaterial(m) {
  if (selectedMaterialId.value === m.material_id) return
  selectedMaterialId.value = m.material_id
  editForm.value = { name: m.name, role: m.role }
  instances.value = []
  openInstances.value = new Set()
  componentsMap.value = {}
  componentsLoaded.value = {}
  cancelAllEdits()
  resetInstanceCreate()
  resetComponentCreate()
  loadInstances(m.material_id)
}

// ── Create material (inline in left panel) ────────────────────────────
const creatingMaterial = ref(false)
const newMaterialForm = ref({ name: '', role: '' })

function startMaterialCreate() {
  creatingMaterial.value = true
  newMaterialForm.value = { name: '', role: '' }
}

function cancelMaterialCreate() {
  creatingMaterial.value = false
  newMaterialForm.value = { name: '', role: '' }
}

async function saveNewMaterial() {
  const name = newMaterialForm.value.name.trim()
  if (!name) { toast.add({ severity: 'warn', summary: 'Название обязательно', life: 3000 }); return }
  if (!newMaterialForm.value.role) { toast.add({ severity: 'warn', summary: 'Роль обязательна', life: 3000 }); return }
  try {
    const { data } = await api.post('/api/materials', { name, role: newMaterialForm.value.role })
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

// ── Edit material (right panel metadata) ──────────────────────────────
const editForm = ref({ name: '', role: '' })

async function saveMaterialEdit() {
  const name = editForm.value.name.trim()
  if (!name) return
  try {
    await api.put(`/api/materials/${selectedMaterialId.value}`, {
      name,
      role: editForm.value.role,
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
    // Auto-expand all instances and load their components
    openInstances.value = new Set(instances.value.map(i => i.material_instance_id))
    instances.value.forEach(inst => {
      const id = inst.material_instance_id
      if (!componentsLoaded.value[id]) loadComponents(id)
      // source-info is only meaningful for pure instances — backend
      // rejects non-pure with 400. Skip the load for composites (they
      // get a friendly "N/A" message in the template instead of a
      // spinner-forever + error toast). File lists share the pure-only
      // guard because they live under the source row.
      if (inst.is_pure) {
        if (!sourceInfoLoaded.value[id])   loadSourceInfo(id)
        if (!sourceFilesLoaded.value[id])  loadSourceFiles(id)
      }
      if (!propertiesLoaded.value[id])   loadProperties(id)
      if (!propertyFilesLoaded.value[id]) loadPropertyFiles(id)
    })
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
const newInstanceForm = ref({ name: '', notes: '' })
const creatingComponentFor = ref(null)
const newComponentForm = ref({ instance_id: '', percent: '', notes: '' })

function cancelAllEdits() {
  editingInstanceId.value = null
  editingComponentId.value = null
  creatingInstance.value = false
  creatingComponentFor.value = null
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
  newInstanceForm.value = { name: '', notes: '' }
}

function resetInstanceCreate() {
  creatingInstance.value = false
  newInstanceForm.value = { name: '', notes: '' }
}

async function saveNewInstance() {
  const name = newInstanceForm.value.name.trim()
  if (!name) return
  try {
    await api.post(`/api/materials/${selectedMaterialId.value}/instances`, {
      name,
      notes: newInstanceForm.value.notes.trim() || null,
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

async function startComponentCreate(instanceId) {
  cancelAllEdits()
  creatingComponentFor.value = instanceId
  newComponentForm.value = { instance_id: '', percent: '', notes: '' }
  await loadAllInstances()
}

function resetComponentCreate() {
  creatingComponentFor.value = null
  newComponentForm.value = { instance_id: '', percent: '', notes: '' }
}

async function saveNewComponent(instanceId) {
  const matInstId = newComponentForm.value.instance_id
  const pct = Number(newComponentForm.value.percent)
  if (!matInstId) { toast.add({ severity: 'warn', summary: 'Выберите экземпляр', life: 3000 }); return }
  if (isNaN(pct) || pct <= 0 || pct > 100) {
    toast.add({ severity: 'warn', summary: 'Некорректный % (0-100)', life: 3000 })
    return
  }
  try {
    await api.post(`/api/materials/instances/${instanceId}/components`, {
      component_material_instance_id: Number(matInstId),
      mass_fraction: pct / 100,
      notes: newComponentForm.value.notes.trim() || null,
    })
    toast.add({ severity: 'success', summary: 'Компонент добавлен', life: 3000 })
    resetComponentCreate()
    await loadComponents(instanceId)
  } catch (err) {
    toastApiError(toast, err, 'Не удалось добавить компонент')
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

        <!-- Material list -->
        <div class="material-list">
          <div
            v-for="m in filteredMaterials"
            :key="m.material_id"
            :class="['material-item', { active: selectedMaterialId === m.material_id }]"
            @click="selectMaterial(m)"
          >
            <div class="material-item-info">
              <span class="material-item-name">{{ m.name }}</span>
              <span class="material-item-role">{{ roleMap[m.role] || m.role }}</span>
            </div>
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              class="material-item-delete"
              @click.stop="deleteMaterial(m)"
            />
          </div>
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
                    <InputText
                      v-model="editInstanceForm.notes"
                      placeholder="Комментарий"
                      class="inst-notes-input"
                      @keydown="onEditKeydown($event, () => saveEditInstance(inst), cancelEditInstance)"
                    />
                    <Button icon="pi pi-check" text @click="saveEditInstance(inst)" />
                    <Button icon="pi pi-times" text severity="secondary" @click="cancelEditInstance" />
                  </template>

                  <template v-else>
                    <span class="inst-name">{{ inst.name }}</span>
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
                              <InputText
                                v-model="editComponentForm.notes"
                                placeholder="Комментарий"
                                @keydown="onEditKeydown($event, () => saveEditComponent(comp, inst.material_instance_id), cancelEditComponent)"
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

                    <!-- Create component inline -->
                    <div v-if="creatingComponentFor === inst.material_instance_id" class="create-comp-row">
                      <Select
                        v-model="newComponentForm.instance_id"
                        :options="allInstances"
                        optionLabel="name"
                        optionValue="material_instance_id"
                        placeholder="-- экземпляр --"
                        class="comp-select"
                      />
                      <InputText
                        v-model="newComponentForm.percent"
                        placeholder="%"
                        class="input-narrow"
                        @keydown.enter.prevent="saveNewComponent(inst.material_instance_id)"
                        @keydown.escape="resetComponentCreate"
                      />
                      <InputText
                        v-model="newComponentForm.notes"
                        placeholder="Комментарий"
                        class="input-flex"
                        @keydown.enter.prevent="saveNewComponent(inst.material_instance_id)"
                        @keydown.escape="resetComponentCreate"
                      />
                      <Button icon="pi pi-check" text @click="saveNewComponent(inst.material_instance_id)" />
                      <Button icon="pi pi-times" text severity="secondary" @click="resetComponentCreate" />
                    </div>
                    <Button
                      v-else
                      label="Состав"
                      icon="pi pi-plus"
                      text
                      severity="secondary"
                      @click="startComponentCreate(inst.material_instance_id)"
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
                          <input type="date" v-model="sourceInfoForm[inst.material_instance_id].date_ordered" class="date-input" />
                        </div>
                        <div class="form-field">
                          <label>Дата получения</label>
                          <input type="date" v-model="sourceInfoForm[inst.material_instance_id].date_received" class="date-input" />
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
              <div v-if="creatingInstance" class="create-inst-row">
                <InputText
                  v-model="newInstanceForm.name"
                  placeholder="Название экземпляра"
                  @keydown.enter.prevent="saveNewInstance"
                  @keydown.escape="resetInstanceCreate"
                />
                <InputText
                  v-model="newInstanceForm.notes"
                  placeholder="Комментарий"
                  class="input-flex"
                  @keydown.enter.prevent="saveNewInstance"
                  @keydown.escape="resetInstanceCreate"
                />
                <Button icon="pi pi-check" text @click="saveNewInstance" />
                <Button icon="pi pi-times" text severity="secondary" @click="resetInstanceCreate" />
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

.create-comp-row, .create-inst-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
}
.create-comp-row .pv-select { max-width: 250px; }

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
}
</style>
