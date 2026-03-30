<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import api from '@/services/api'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import Button from 'primevue/button'
import Panel from 'primevue/panel'
import Stepper from 'primevue/stepper'
import StepList from 'primevue/steplist'
import Step from 'primevue/step'
import StepPanels from 'primevue/steppanels'
import StepPanel from 'primevue/steppanel'
import PageHeader from '@/components/PageHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import TapeGantt from '@/components/TapeGantt.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()

function showStatus(msg, isError = false) {
  toast.add({
    severity: isError ? 'error' : 'success',
    summary: isError ? 'Ошибка' : 'Готово',
    detail: msg,
    life: 3000,
  })
}

// ── Mode ──
const isNew = computed(() => route.path === '/tapes/new')
const tapeId = computed(() => isNew.value ? null : Number(route.params.id))

// ── Stepper ──
const activeStep = ref('general')

// ── Reference data ──
const users = ref([])
const projects = ref([])
const recipes = ref([])
const atmospheres = ref([])
const dryMixingMethods = ref([])
const wetMixingMethods = ref([])
const foils = ref([])
const coatingMethods = ref([])

// ── General info ──
const tapeName = ref('')
const editingName = ref(false)
const createdBy = ref('')
const projectId = ref('')
const tapeNotes = ref('')
const tapeType = ref('')
const tapeRecipeId = ref('')
const calcMode = ref('from_active_mass')
const targetMassG = ref('')
const tapeStatus = ref('draft')
const tapeCreatedAt = ref(null)
const currentTapeId = ref(null)

// ── Recipe lines & instance caching ──
const currentRecipeLines = ref([])
const selectedInstanceByLineId = reactive({})
const instanceCacheByMaterialId = reactive({})
const instanceComponentsCache = reactive({})
const slurryActuals = reactive({})

// ── Steps: Drying AM (0) ──
const dryAm = reactive({
  operator: '', date: '', time: '', notes: '',
  temperature: 80, atmosphere: '', targetDuration: 120, otherParam: ''
})

// ── Steps: Weighing (I.1) ──
const weighing = reactive({
  operator: '', date: '', time: '', notes: ''
})

// ── Steps: Mixing (I.2) ──
const mixing = reactive({
  operator: '', date: '', time: '', notes: '',
  slurryVolumeMl: '', dryMixingId: '', wetMixingId: '',
  dryStartDate: '', dryStartTime: '', dryDurationMin: '', dryRpm: '',
  wetStartDate: '', wetStartTime: '', wetDurationMin: '', wetRpm: '',
  viscosityCp: ''
})

// ── Steps: Coating (II.1) ──
const coating = reactive({
  operator: '', date: '', time: '', notes: '',
  foilId: '', coatingId: ''
})

const coatingMethodPreview = ref(null)

// ── Steps: Drying Tape (II.2) ──
const dryingTape = reactive({
  operator: '', date: '', time: '', notes: '',
  temperature: 80, atmosphere: '', targetDuration: 120, otherParam: ''
})

// ── Steps: Calendering (II.3) ──
const calendering = reactive({
  operator: '', date: '', time: '', notes: '',
  tempC: '', pressureValue: '', pressureUnits: '',
  drawSpeedMMin: '', initThicknessMicrons: '', finalThicknessMicrons: '',
  noPasses: '', otherParams: '',
  shine: false, curl: false, dots: false, otherCheck: false, otherText: ''
})

// ── Steps: Drying Pressed Tape (II.4) ──
const dryingPressedTape = reactive({
  operator: '', date: '', time: '', notes: '',
  temperature: 80, atmosphere: '', targetDuration: 120, otherParam: ''
})

// ── Dirty flags ──
const dirtySteps = reactive({
  general_info: false, recipe_materials: false,
  drying_am: false, weighing: false, mixing: false,
  coating: false, drying_tape: false, calendering: false, drying_pressed_tape: false
})
const isRestoring = ref(false)

function setDirty(step, val = true) {
  if (step === 'general_info' && isRestoring.value && val) return
  dirtySteps[step] = val
}

function clearAllDirty() {
  Object.keys(dirtySteps).forEach(k => dirtySteps[k] = false)
}

const anyDirty = computed(() => Object.values(dirtySteps).some(Boolean))

// ── Step completion ──
const step1Complete = computed(() => !!projectId.value && !!tapeType.value && !!tapeRecipeId.value && !!currentTapeId.value)
const step2Complete = computed(() => !!weighing.date && !!weighing.time)
const step3Complete = computed(() => !!coating.date && !!coating.time)
const step4Complete = computed(() => !!calendering.date && !!calendering.time)

// ── Live timer ──
const liveSinceText = ref('')
let liveSinceTimer = null

const stepDateTimePairs = computed(() => [
  [dryAm.date, dryAm.time],
  [weighing.date, weighing.time],
  [mixing.date, mixing.time],
  [coating.date, coating.time],
  [dryingTape.date, dryingTape.time],
  [calendering.date, calendering.time],
  [dryingPressedTape.date, dryingPressedTape.time],
])

function getLatestStepStart() {
  let latest = null
  for (const [d, t] of stepDateTimePairs.value) {
    if (!d || !t) continue
    const dt = new Date(`${d}T${t}`)
    if (!Number.isFinite(dt.getTime())) continue
    if (!latest || dt.getTime() > latest.getTime()) latest = dt
  }
  return latest
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h <= 0 ? `${m} мин` : `${h} ч ${m} мин`
}

function updateLiveTimer() {
  const latest = getLatestStepStart()
  if (!latest) { liveSinceText.value = ''; return }
  const ms = Date.now() - latest.getTime()
  const text = formatDurationMs(ms)
  liveSinceText.value = text ? `С последнего этапа: ${text}` : ''
}

function startLiveTimer() {
  stopLiveTimer()
  updateLiveTimer()
  liveSinceTimer = setInterval(updateLiveTimer, 1000)
}

function stopLiveTimer() {
  if (liveSinceTimer) { clearInterval(liveSinceTimer); liveSinceTimer = null }
}

const timeSinceHours = computed(() => {
  const latest = getLatestStepStart()
  if (!latest) return null
  return (Date.now() - latest.getTime()) / 3600000
})

const timeClass = computed(() => {
  const h = timeSinceHours.value
  if (h == null) return ''
  if (h < 24) return 'time-ok'
  if (h < 72) return 'time-warn'
  return 'time-danger'
})

// ── Gantt stages ──
function findUserName(userId) {
  if (!userId) return ''
  const u = users.value.find(x => String(x.user_id) === String(userId))
  return u?.name || ''
}

const tapeStages = computed(() => {
  if (!currentTapeId.value) return []

  function stageStatus(date, time) {
    if (!date || !time) return 'pending'
    // If this is the active step based on stepper, mark active
    return 'done'
  }

  const stages = [
    {
      name: 'Общая информация',
      operator: findUserName(createdBy.value),
      startedAt: tapeCreatedAt.value,
      status: currentTapeId.value ? 'done' : 'pending'
    },
    {
      name: 'Замес',
      operator: findUserName(weighing.operator),
      startedAt: weighing.date && weighing.time ? `${weighing.date}T${weighing.time}` : null,
      status: weighing.date && weighing.time ? 'done' : 'pending'
    },
    {
      name: 'Нанесение',
      operator: findUserName(coating.operator),
      startedAt: coating.date && coating.time ? `${coating.date}T${coating.time}` : null,
      status: coating.date && coating.time ? 'done' : 'pending'
    },
    {
      name: 'Каландрирование',
      operator: findUserName(calendering.operator),
      startedAt: calendering.date && calendering.time ? `${calendering.date}T${calendering.time}` : null,
      status: calendering.date && calendering.time ? 'done' : 'pending'
    },
  ]

  // Mark the latest completed step's next pending step as 'active'
  const lastDoneIdx = stages.map(s => s.status).lastIndexOf('done')
  const nextPendingIdx = stages.findIndex((s, i) => i > lastDoneIdx && s.status === 'pending')
  if (nextPendingIdx >= 0) stages[nextPendingIdx].status = 'active'

  return stages
})

// ── Delay helpers ──
function delayBetween(prevDate, prevTime, curDate, curTime) {
  if (!prevDate || !prevTime || !curDate || !curTime) return ''
  const prev = new Date(`${prevDate}T${prevTime}`)
  const cur = new Date(`${curDate}T${curTime}`)
  if (!Number.isFinite(prev.getTime()) || !Number.isFinite(cur.getTime())) return ''
  const ms = cur.getTime() - prev.getTime()
  const text = formatDurationMs(ms)
  return text ? `Время с прошлого этапа: ${text}` : ''
}

const weighingDelay = computed(() => delayBetween(dryAm.date, dryAm.time, weighing.date, weighing.time))
const mixingDelay = computed(() => delayBetween(weighing.date, weighing.time, mixing.date, mixing.time))
const coatingDelay = computed(() => delayBetween(mixing.date, mixing.time, coating.date, coating.time))
const dryingTapeDelay = computed(() => delayBetween(coating.date, coating.time, dryingTape.date, dryingTape.time))
const calenderingDelay = computed(() => delayBetween(dryingTape.date, dryingTape.time, calendering.date, calendering.time))
const dryingPressedTapeDelay = computed(() => delayBetween(calendering.date, calendering.time, dryingPressedTape.date, dryingPressedTape.time))

// ── beforeunload ──
function onBeforeUnload(e) {
  if (!anyDirty.value) return
  e.preventDefault()
  e.returnValue = ''
}

// ── Route leave guard ──
onBeforeRouteLeave((to, from, next) => {
  if (anyDirty.value) {
    if (!confirm('Есть несохранённые изменения. Уйти без сохранения?')) return next(false)
  }
  next()
})

// ── Role labels ──
const roleLabels = {
  cathode_active: 'Активный материал',
  anode_active: 'Активный материал',
  binder: 'Связующее',
  additive: 'Проводящая добавка',
  solvent: 'Растворитель',
  other: 'Другое'
}

function roleLabel(role) { return roleLabels[role] || role || '' }

// ── Calc mode label ──
const massLabel = computed(() =>
  calcMode.value === 'from_slurry_mass'
    ? 'Общая масса суспензии, г'
    : 'Масса активного материала, г'
)

// ── Recipe planned mass calculation ──

async function fetchInstances(materialId) {
  if (!materialId) return []
  if (instanceCacheByMaterialId[materialId]) return instanceCacheByMaterialId[materialId]
  const { data } = await api.get(`/api/materials/${materialId}/instances`)
  instanceCacheByMaterialId[materialId] = data
  return data
}

async function fetchComponents(instanceId) {
  if (!instanceId) return []
  if (instanceComponentsCache[instanceId]) return instanceComponentsCache[instanceId]
  const { data } = await api.get(`/api/materials/instances/${instanceId}/components`)
  instanceComponentsCache[instanceId] = data
  return data
}

const instancesByLineId = reactive({})

async function loadInstancesForLine(line) {
  if (instancesByLineId[line.recipe_line_id]) return
  const data = await fetchInstances(line.material_id)
  instancesByLineId[line.recipe_line_id] = data.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

const calculationResult = computed(() => {
  const lines = currentRecipeLines.value
  const inputValue = Number(targetMassG.value)
  if (!lines.length || !Number.isFinite(inputValue) || inputValue <= 0) return null

  const activeLine = lines.find(l => l.recipe_role === 'cathode_active' || l.recipe_role === 'anode_active')
  if (!activeLine) return null
  const activePercent = Number(activeLine.slurry_percent)
  if (!Number.isFinite(activePercent) || activePercent <= 0) return null

  let target
  if (calcMode.value === 'from_active_mass') {
    target = inputValue
  } else if (calcMode.value === 'from_slurry_mass') {
    const totalDryPercent = lines
      .filter(l => l.include_in_pct)
      .reduce((sum, l) => sum + Number(l.slurry_percent || 0), 0)
    if (!Number.isFinite(totalDryPercent) || totalDryPercent <= 0 || totalDryPercent > 100) return null
    const totalDryMassFromWet = inputValue * (totalDryPercent / 100)
    target = totalDryMassFromWet * (activePercent / totalDryPercent)
  } else {
    return null
  }

  if (!Number.isFinite(target) || target <= 0 || activePercent > 100) return null
  const totalDryMass = target / (activePercent / 100)

  const targetDryByMaterialId = {}
  lines.forEach(l => {
    if (!l.include_in_pct) return
    const pct = Number(l.slurry_percent)
    if (!Number.isFinite(pct) || pct <= 0) return
    const matId = Number(l.material_id)
    targetDryByMaterialId[matId] = (targetDryByMaterialId[matId] || 0) + totalDryMass * (pct / 100)
  })

  const remainingDry = { ...targetDryByMaterialId }
  const perLine = {}
  const expandedData = []

  for (const line of lines) {
    const lineId = line.recipe_line_id
    const matId = Number(line.material_id)
    const tdry = targetDryByMaterialId[matId]

    perLine[lineId] = { targetDry: Number.isFinite(tdry) ? tdry : null, plannedMass: null }

    const selectedId = selectedInstanceByLineId[lineId]
    if (!selectedId) continue

    const needDry = Number(remainingDry[matId] || 0)
    if (!Number.isFinite(needDry) || needDry <= 0) {
      perLine[lineId].plannedMass = 0
      continue
    }

    let components = instanceComponentsCache[selectedId]
    if (!components) { fetchComponents(selectedId); continue }
    if (!components.length) {
      components = [{ material_id: matId, material_name: line.material_name, mass_fraction: 1 }]
    }

    const match = components.find(c => Number(c.material_id ?? c.component_material_id) === matId)
    const fLine = match ? Number(match.mass_fraction) : NaN
    if (!Number.isFinite(fLine) || fLine <= 0) continue

    const instanceMass = needDry / fLine
    perLine[lineId].plannedMass = instanceMass

    const instances = instancesByLineId[lineId] || []
    const inst = instances.find(i => String(i.material_instance_id) === String(selectedId))

    expandedData.push({
      role: roleLabel(line.recipe_role),
      material: line.material_name,
      instanceName: inst?.name || '',
      instanceMass,
      components: components.map(c => {
        const frac = Number(c.mass_fraction)
        const safeFrac = Number.isFinite(frac) && frac > 0 ? frac : 0
        return { material_name: c.material_name, fraction: safeFrac, mass: instanceMass * safeFrac }
      })
    })

    components.forEach(c => {
      const frac = Number(c.mass_fraction)
      if (!Number.isFinite(frac)) return
      const mid = Number(c.material_id)
      if (!Number.isFinite(mid)) return
      if (c.material_role === 'solvent') return
      if (remainingDry[mid] == null) return
      remainingDry[mid] -= instanceMass * frac
      if (remainingDry[mid] < 0) remainingDry[mid] = 0
    })
  }

  return { perLine, expandedData }
})

function plannedMassFor(lineId) {
  if (!calculationResult.value) return ''
  const v = calculationResult.value.perLine[lineId]?.plannedMass
  return v != null && Number.isFinite(v) ? v.toFixed(4) : ''
}

function targetDryFor(lineId) {
  if (!calculationResult.value) return ''
  const v = calculationResult.value.perLine[lineId]?.targetDry
  return v != null && Number.isFinite(v) ? v.toFixed(4) : ''
}

// ── "Сейчас" helper ──
function setNow(target, dateKey, timeKey) {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  target[dateKey] = `${yyyy}-${mm}-${dd}`
  target[timeKey] = `${hh}:${min}`
}

// ── Datetime parse helper ──
function parseDt(isoStr) {
  if (!isoStr) return { date: '', time: '' }
  const dt = new Date(isoStr)
  if (!Number.isFinite(dt.getTime())) return { date: '', time: '' }
  const yyyy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  const hh = String(dt.getHours()).padStart(2, '0')
  const min = String(dt.getMinutes()).padStart(2, '0')
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` }
}

function buildStartedAt(date, time) {
  if (!date || !time) return null
  return `${date}T${time}`
}

// ── Mixing params visibility ──
const showDryParams = computed(() => {
  const id = mixing.dryMixingId
  if (!id) return false
  const m = dryMixingMethods.value.find(x => String(x.dry_mixing_id) === String(id))
  const code = m?.name || ''
  return code && code !== 'none' && code !== 'hand'
})

const showWetParams = computed(() => {
  const id = mixing.wetMixingId
  if (!id) return false
  const m = wetMixingMethods.value.find(x => String(x.wet_mixing_id) === String(id))
  const code = m?.name || ''
  return code && code !== 'none' && code !== 'hand'
})

// ── Coating method preview ──
watch(() => coating.coatingId, async (val) => {
  if (!val) { coatingMethodPreview.value = null; return }
  const m = coatingMethods.value.find(x => String(x.coating_id) === String(val))
  coatingMethodPreview.value = m || null
})

// ── Calendering appearance ──
function buildCalAppearance() {
  const vals = []
  if (calendering.shine) vals.push('Блеск')
  if (calendering.curl) vals.push('Закрутка')
  if (calendering.dots) vals.push('Точечки')
  if (calendering.otherCheck && calendering.otherText.trim()) vals.push('Другое: ' + calendering.otherText.trim())
  return vals.join('; ')
}

function parseCalAppearance(str) {
  calendering.shine = (str || '').includes('Блеск')
  calendering.curl = (str || '').includes('Закрутка')
  calendering.dots = (str || '').includes('Точечки')
  if ((str || '').includes('Другое:')) {
    calendering.otherCheck = true
    calendering.otherText = (str || '').split('Другое:')[1]?.split(';')[0]?.trim() || ''
  } else {
    calendering.otherCheck = false
    calendering.otherText = ''
  }
}

// ── API: load reference data ──
async function loadUsers() { try { users.value = (await api.get('/api/users')).data } catch {} }
async function loadProjects() { try { projects.value = (await api.get('/api/projects')).data } catch {} }
async function loadAtmospheres() { try { atmospheres.value = (await api.get('/api/reference/drying-atmospheres')).data } catch {} }
async function loadDryMixingMethods() { try { dryMixingMethods.value = (await api.get('/api/reference/dry-mixing-methods')).data } catch {} }
async function loadWetMixingMethods() { try { wetMixingMethods.value = (await api.get('/api/reference/wet-mixing-methods')).data } catch {} }
async function loadFoils() { try { foils.value = (await api.get('/api/reference/foils')).data } catch {} }
async function loadCoatingMethods() { try { coatingMethods.value = (await api.get('/api/reference/coating-methods')).data } catch {} }

async function loadRecipes() {
  try {
    const role = tapeType.value || null
    if (!role) { recipes.value = []; return }
    const params = role ? { role } : {}
    recipes.value = (await api.get('/api/recipes', { params })).data
  } catch { recipes.value = [] }
}

// ── Recipe loading ──
watch(tapeType, () => {
  if (!isRestoring.value) { tapeRecipeId.value = ''; currentRecipeLines.value = [] }
  loadRecipes()
})

watch(tapeRecipeId, async (val) => {
  if (!val) {
    currentRecipeLines.value = []
    Object.keys(selectedInstanceByLineId).forEach(k => delete selectedInstanceByLineId[k])
    Object.keys(instanceCacheByMaterialId).forEach(k => delete instanceCacheByMaterialId[k])
    return
  }
  try {
    const { data: lines } = await api.get(`/api/recipes/${val}/lines`)
    currentRecipeLines.value = lines
    if (!isRestoring.value) {
      Object.keys(selectedInstanceByLineId).forEach(k => delete selectedInstanceByLineId[k])
    }
    Object.keys(instanceCacheByMaterialId).forEach(k => delete instanceCacheByMaterialId[k])
    for (const line of lines) { loadInstancesForLine(line) }
  } catch (e) { console.error(e) }
})

function onInstanceChange(lineId, val) {
  selectedInstanceByLineId[lineId] = val || null
  if (val) fetchComponents(val)
  if (!isRestoring.value) setDirty('recipe_materials')
}

function onActualChange(lineId, field, val) {
  if (!slurryActuals[lineId]) slurryActuals[lineId] = { mode: 'mass', value: '' }
  slurryActuals[lineId][field] = val
  if (!isRestoring.value) setDirty('recipe_materials')
}

// ── Save general info ──
const saving = ref(false)

async function saveGeneralInfo() {
  if (!projectId.value || !tapeRecipeId.value) {
    showStatus('Выберите проект и рецепт', true)
    return
  }

  saving.value = true
  const data = {
    name: tapeName.value,
    created_by: createdBy.value || (authStore.user?.userId ? String(authStore.user.userId) : ''),
    project_id: projectId.value,
    notes: tapeNotes.value,
    tape_type: tapeType.value,
    tape_recipe_id: tapeRecipeId.value,
    calc_mode: calcMode.value,
    target_mass_g: targetMassG.value || null,
  }

  try {
    if (!currentTapeId.value) {
      const { data: created } = await api.post('/api/tapes', data)
      currentTapeId.value = created.tape_id
      // Update URL from /tapes/new to /tapes/:id
      if (isNew.value) {
        router.replace(`/tapes/${created.tape_id}`)
      }
      await saveAllActuals()
      clearAllDirty()
      showStatus('Лента создана')
    } else {
      await api.put(`/api/tapes/${currentTapeId.value}`, data)
      await saveAllActuals()
      clearAllDirty()
      showStatus('Сохранено')
    }
  } catch (e) {
    showStatus(e.response?.data?.error || 'Ошибка сохранения', true)
  } finally {
    saving.value = false
  }
}

async function saveAllActuals() {
  if (!currentTapeId.value) return
  for (const line of currentRecipeLines.value) {
    const lineId = line.recipe_line_id
    const instanceId = selectedInstanceByLineId[lineId]
    if (!instanceId) continue
    const actual = slurryActuals[lineId] || { mode: 'mass', value: '' }
    const payload = { recipe_line_id: lineId, material_instance_id: Number(instanceId) }
    const value = Number(actual.value)
    if (Number.isFinite(value) && value > 0) {
      payload.measure_mode = actual.mode
      if (actual.mode === 'mass') payload.actual_mass_g = value
      if (actual.mode === 'volume') payload.actual_volume_ml = value
    }
    try { await api.post(`/api/tapes/${currentTapeId.value}/actuals`, payload) } catch {}
  }
}

// ── Save drying step (generic) ──
async function saveDryingStep(code, src) {
  if (!currentTapeId.value) { showStatus('Сначала создайте ленту', true); return }
  const payload = {
    performed_by: Number(src.operator) || null,
    started_at: buildStartedAt(src.date, src.time),
    comments: src.notes || null,
    temperature_c: Number(src.temperature) || null,
    atmosphere: src.atmosphere || null,
    target_duration_min: Number(src.targetDuration) || null,
    other_parameters: src.otherParam || null,
  }
  try {
    await api.post(`/api/tapes/${currentTapeId.value}/steps/by-code/${code}`, payload)
    setDirty(code, false)
    showStatus('Этап сушки сохранён')
  } catch (e) { showStatus(e.response?.data?.error || 'Ошибка', true) }
}

// ── Save weighing ──
async function saveWeighing() {
  if (!currentTapeId.value) { showStatus('Сначала создайте ленту', true); return }
  const payload = {
    performed_by: Number(weighing.operator) || null,
    started_at: buildStartedAt(weighing.date, weighing.time),
    comments: weighing.notes || null,
  }
  try {
    await api.post(`/api/tapes/${currentTapeId.value}/steps/by-code/weighing`, payload)
    setDirty('weighing', false)
    showStatus('I.1 сохранён')
  } catch (e) { showStatus(e.response?.data?.error || 'Ошибка', true) }
}

// ── Save mixing ──
async function saveMixing() {
  if (!currentTapeId.value) { showStatus('Сначала создайте ленту', true); return }
  const payload = {
    performed_by: Number(mixing.operator) || null,
    started_at: buildStartedAt(mixing.date, mixing.time),
    comments: mixing.notes || null,
    slurry_volume_ml: mixing.slurryVolumeMl || null,
    dry_mixing_id: mixing.dryMixingId || null,
    dry_start_time: buildStartedAt(mixing.dryStartDate, mixing.dryStartTime),
    dry_duration_min: mixing.dryDurationMin || null,
    dry_rpm: mixing.dryRpm || null,
    wet_mixing_id: mixing.wetMixingId || null,
    wet_start_time: buildStartedAt(mixing.wetStartDate, mixing.wetStartTime),
    wet_duration_min: mixing.wetDurationMin || null,
    wet_rpm: mixing.wetRpm || null,
    viscosity_cP: mixing.viscosityCp || null,
  }
  try {
    await api.post(`/api/tapes/${currentTapeId.value}/steps/by-code/mixing`, payload)
    setDirty('mixing', false)
    showStatus('Этап перемешивания сохранён')
  } catch (e) { showStatus(e.response?.data?.error || 'Ошибка', true) }
}

// ── Save coating ──
async function saveCoating() {
  if (!currentTapeId.value) { showStatus('Сначала создайте ленту', true); return }
  const payload = {
    performed_by: Number(coating.operator) || null,
    started_at: buildStartedAt(coating.date, coating.time),
    comments: coating.notes || null,
    foil_id: coating.foilId || null,
    coating_id: coating.coatingId || null,
  }
  try {
    await api.post(`/api/tapes/${currentTapeId.value}/steps/by-code/coating`, payload)
    setDirty('coating', false)
    showStatus('Этап нанесения сохранён')
  } catch (e) { showStatus(e.response?.data?.error || 'Ошибка', true) }
}

// ── Save calendering ──
async function saveCalendering() {
  if (!currentTapeId.value) { showStatus('Сначала создайте ленту', true); return }
  const payload = {
    performed_by: Number(calendering.operator) || null,
    started_at: buildStartedAt(calendering.date, calendering.time),
    comments: calendering.notes || null,
    temp_c: calendering.tempC || null,
    pressure_value: calendering.pressureValue || null,
    pressure_units: calendering.pressureUnits || null,
    draw_speed_m_min: calendering.drawSpeedMMin || null,
    init_thickness_microns: calendering.initThicknessMicrons || null,
    final_thickness_microns: calendering.finalThicknessMicrons || null,
    no_passes: calendering.noPasses || null,
    other_params: calendering.otherParams || null,
    appearance: buildCalAppearance(),
  }
  try {
    await api.post(`/api/tapes/${currentTapeId.value}/steps/by-code/calendering`, payload)
    setDirty('calendering', false)
    showStatus('Этап каландрирования сохранён')
  } catch (e) { showStatus(e.response?.data?.error || 'Ошибка', true) }
}

// ── Restore tape for edit mode ──
async function restoreTape() {
  if (!tapeId.value) return
  isRestoring.value = true

  try {
    const { data: allTapes } = await api.get('/api/tapes')
    const t = allTapes.find(x => x.tape_id === tapeId.value)
    if (!t) { showStatus('Лента не найдена', true); router.push('/tapes'); return }

    currentTapeId.value = t.tape_id
    tapeCreatedAt.value = t.created_at || null
    tapeName.value = t.name || ''
    tapeNotes.value = t.notes || ''
    createdBy.value = t.created_by || ''
    projectId.value = t.project_id || ''
    tapeType.value = t.role || ''
    calcMode.value = t.calc_mode || 'from_active_mass'
    targetMassG.value = t.target_mass_g || ''
    tapeStatus.value = t.status || 'draft'

    await loadRecipes()
    tapeRecipeId.value = t.tape_recipe_id || ''

    // restore actuals + instance selections
    if (t.tape_recipe_id) {
      try {
        const { data: actuals } = await api.get(`/api/tapes/${t.tape_id}/actuals`)
        actuals.forEach(a => {
          if (a.material_instance_id) selectedInstanceByLineId[a.recipe_line_id] = String(a.material_instance_id)
          slurryActuals[a.recipe_line_id] = {
            mode: a.measure_mode || 'mass',
            value: a.measure_mode === 'volume' ? (a.actual_volume_ml ?? '') : (a.actual_mass_g ?? '')
          }
        })
      } catch {}
    }

    // restore drying steps
    await Promise.all([
      restoreDryingStep('drying_am', dryAm),
      restoreDryingStep('drying_tape', dryingTape),
      restoreDryingStep('drying_pressed_tape', dryingPressedTape),
    ])

    // restore weighing
    try {
      const { data: w } = await api.get(`/api/tapes/${t.tape_id}/steps/by-code/weighing`)
      if (w) {
        const dt = parseDt(w.started_at)
        weighing.operator = String(w.performed_by ?? '')
        weighing.date = dt.date; weighing.time = dt.time
        weighing.notes = w.comments || ''
      }
    } catch {}

    // restore mixing
    try {
      const { data: m } = await api.get(`/api/tapes/${t.tape_id}/steps/by-code/mixing`)
      if (m) {
        const dt = parseDt(m.started_at)
        mixing.operator = String(m.performed_by ?? '')
        mixing.date = dt.date; mixing.time = dt.time
        mixing.notes = m.comments || ''
        mixing.slurryVolumeMl = m.slurry_volume_ml ?? ''
        mixing.dryMixingId = m.dry_mixing_id ?? ''
        mixing.wetMixingId = m.wet_mixing_id ?? ''
        const dryDt = parseDt(m.dry_start_time)
        mixing.dryStartDate = dryDt.date; mixing.dryStartTime = dryDt.time
        mixing.dryDurationMin = m.dry_duration_min ?? ''
        mixing.dryRpm = m.dry_rpm ?? ''
        const wetDt = parseDt(m.wet_start_time)
        mixing.wetStartDate = wetDt.date; mixing.wetStartTime = wetDt.time
        mixing.wetDurationMin = m.wet_duration_min ?? ''
        mixing.wetRpm = m.wet_rpm ?? ''
        mixing.viscosityCp = m.viscosity_cp ?? ''
      }
    } catch {}

    // restore coating
    try {
      const { data: c } = await api.get(`/api/tapes/${t.tape_id}/steps/by-code/coating`)
      if (c) {
        const dt = parseDt(c.started_at)
        coating.operator = String(c.performed_by ?? '')
        coating.date = dt.date; coating.time = dt.time
        coating.notes = c.comments || ''
        coating.foilId = c.foil_id ?? ''
        coating.coatingId = c.coating_id ?? ''
      }
    } catch {}

    // restore calendering
    try {
      const { data: cal } = await api.get(`/api/tapes/${t.tape_id}/steps/by-code/calendering`)
      if (cal) {
        const dt = parseDt(cal.started_at)
        calendering.operator = String(cal.performed_by ?? '')
        calendering.date = dt.date; calendering.time = dt.time
        calendering.notes = cal.comments || ''
        calendering.tempC = cal.temp_c ?? ''
        calendering.pressureValue = cal.pressure_value ?? ''
        calendering.pressureUnits = cal.pressure_units ?? ''
        calendering.drawSpeedMMin = cal.draw_speed_m_min ?? ''
        calendering.initThicknessMicrons = cal.init_thickness_microns ?? ''
        calendering.finalThicknessMicrons = cal.final_thickness_microns ?? ''
        calendering.noPasses = cal.no_passes ?? ''
        calendering.otherParams = cal.other_params ?? ''
        parseCalAppearance(cal.appearance)
      }
    } catch {}
  } catch (e) {
    showStatus('Ошибка загрузки ленты', true)
    console.error(e)
  }

  isRestoring.value = false
  clearAllDirty()
  startLiveTimer()
}

async function restoreDryingStep(code, target) {
  try {
    const { data } = await api.get(`/api/tapes/${currentTapeId.value}/steps/by-code/${code}`)
    if (!data) return
    const dt = parseDt(data.started_at)
    target.operator = String(data.performed_by ?? '')
    target.date = dt.date; target.time = dt.time
    target.notes = data.comments || ''
    target.temperature = data.temperature_c ?? 80
    target.atmosphere = data.atmosphere || ''
    target.targetDuration = data.target_duration_min ?? 120
    target.otherParam = data.other_parameters || ''
  } catch {}
}

// ── Delete ──
async function confirmDelete() {
  if (!confirm(`Удалить ленту "${tapeName.value}"?`)) return
  try {
    await api.delete(`/api/tapes/${currentTapeId.value}`)
    clearAllDirty()
    showStatus('Удалено')
    router.push('/tapes')
  } catch { showStatus('Ошибка удаления', true) }
}

// ── Window focus: invalidate instance cache ──
function onWindowFocus() {
  Object.keys(instanceCacheByMaterialId).forEach(k => delete instanceCacheByMaterialId[k])
  Object.keys(instancesByLineId).forEach(k => delete instancesByLineId[k])
  currentRecipeLines.value.forEach(line => loadInstancesForLine(line))
}

// ── Step navigation helpers ──
function saveAndNext(stepValue) {
  activeStep.value = stepValue
}

// ── Init ──
onMounted(async () => {
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('focus', onWindowFocus)
  await Promise.all([
    loadUsers(), loadProjects(),
    loadAtmospheres(), loadDryMixingMethods(), loadWetMixingMethods(),
    loadFoils(), loadCoatingMethods(),
  ])

  if (isNew.value) {
    // Auto-fill operator
    if (authStore.user) createdBy.value = String(authStore.user.userId)
    startLiveTimer()
  } else {
    await restoreTape()
  }
})

onUnmounted(() => {
  stopLiveTimer()
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('focus', onWindowFocus)
})
</script>

<template>
  <div class="tape-form-page">
    <PageHeader
      :title="tapeName || 'Новая лента'"
      icon="pi pi-sliders-h"
      back-to="/tapes"
      :subtitle="liveSinceText"
    >
      <template #actions>
        <span v-if="liveSinceText && currentTapeId" :class="['time-badge', timeClass]">
          {{ liveSinceText }}
        </span>
        <StatusBadge v-if="currentTapeId" :status="tapeStatus" />
        <Button v-if="currentTapeId"
          label="Удалить" icon="pi pi-trash" severity="danger" outlined size="small"
          @click="confirmDelete" />
      </template>
    </PageHeader>

    <TapeGantt v-if="currentTapeId" :stages="tapeStages" />

    <!-- Editable name -->
    <div class="tape-name-block">
      <h2 v-if="!editingName" @click="editingName = true" class="tape-title clickable">
        {{ tapeName || '— без названия —' }}
      </h2>
      <input
        v-else
        v-model="tapeName"
        class="tape-name-input"
        @blur="editingName = false"
        @keydown.enter="editingName = false"
      />
    </div>

    <!-- ════════ STEPPER ════════ -->
    <Stepper v-model:value="activeStep" class="tape-stepper">
      <StepList>
        <Step value="general">
          <template #default="{ activateCallback, active }">
            <button class="step-btn" :class="{ active }" @click="activateCallback">
              <span class="step-indicator" :class="step1Complete ? 'complete' : ''">
                {{ step1Complete ? '✅' : '1' }}
              </span>
              Общая информация
            </button>
          </template>
        </Step>
        <Step value="weighing">
          <template #default="{ activateCallback, active }">
            <button class="step-btn" :class="{ active }" @click="currentTapeId && activateCallback()" :disabled="!currentTapeId">
              <span class="step-indicator" :class="step2Complete ? 'complete' : ''">
                {{ step2Complete ? '✅' : '2' }}
              </span>
              Замес
            </button>
          </template>
        </Step>
        <Step value="coating">
          <template #default="{ activateCallback, active }">
            <button class="step-btn" :class="{ active }" @click="currentTapeId && activateCallback()" :disabled="!currentTapeId">
              <span class="step-indicator" :class="step3Complete ? 'complete' : ''">
                {{ step3Complete ? '✅' : '3' }}
              </span>
              Нанесение
            </button>
          </template>
        </Step>
        <Step value="calendering">
          <template #default="{ activateCallback, active }">
            <button class="step-btn" :class="{ active }" @click="currentTapeId && activateCallback()" :disabled="!currentTapeId">
              <span class="step-indicator" :class="step4Complete ? 'complete' : ''">
                {{ step4Complete ? '✅' : '4' }}
              </span>
              Каландрирование
            </button>
          </template>
        </Step>
        <Step value="summary">
          <template #default="{ activateCallback, active }">
            <button class="step-btn" :class="{ active }" @click="currentTapeId && activateCallback()" :disabled="!currentTapeId">
              <span class="step-indicator">5</span>
              Итог
            </button>
          </template>
        </Step>
      </StepList>

      <StepPanels>
        <!-- ═══ Step 1: General Info ═══ -->
        <StepPanel value="general">
          <div class="form-body">
            <fieldset @input="setDirty('general_info')" @change="setDirty('general_info')">
              <label>Кто добавил</label>
              <input type="text" :value="authStore.user?.name || ''" disabled class="field-medium" />

              <label>Проект</label>
              <select v-model="projectId" class="field-medium">
                <option value="">— выбрать проект —</option>
                <option v-for="p in projects" :key="p.project_id" :value="p.project_id">{{ p.name }}</option>
              </select>

              <label>Примечания</label>
              <textarea v-model="tapeNotes" placeholder="Общие комментарии о ленте" class="field-wide"></textarea>

              <hr />

              <label>Тип электродной ленты</label>
              <select v-model="tapeType" class="field-medium">
                <option value="">— выбрать тип —</option>
                <option value="cathode">Катод</option>
                <option value="anode">Анод</option>
              </select>

              <label>Рецепт</label>
              <select v-model="tapeRecipeId" class="field-medium">
                <option value="">— выбрать рецепт —</option>
                <option v-for="r in recipes" :key="r.tape_recipe_id" :value="r.tape_recipe_id">
                  {{ r.variant_label ? `${r.name} — ${r.variant_label}` : r.name }}
                </option>
              </select>

              <label>Расчёт по</label>
              <select v-model="calcMode" class="field-medium">
                <option value="from_active_mass">массе активного материала</option>
                <option value="from_slurry_mass">общей массе суспензии</option>
              </select>

              <label>{{ massLabel }}</label>
              <input v-model="targetMassG" type="number" step="0.0001" min="0" placeholder="например 10.0000" class="field-short" />
            </fieldset>

            <!-- Recipe lines -->
            <Panel v-if="currentTapeId && currentRecipeLines.length" header="Рецепт ленты" toggleable collapsed class="mt-panel">
              <div class="recipe-lines-list">
                <div class="recipe-line-row recipe-line-header">
                  <div>Роль</div><div>Материал</div><div>Экземпляр</div>
                  <div class="numeric">% сухой</div><div class="numeric">Масса сухого</div><div class="numeric">Масса экз.</div>
                </div>
                <div v-for="line in currentRecipeLines" :key="line.recipe_line_id" class="recipe-line-row">
                  <div>{{ roleLabel(line.recipe_role) }}</div>
                  <div>{{ line.material_name }}</div>
                  <div>
                    <select :value="selectedInstanceByLineId[line.recipe_line_id] || ''" @change="onInstanceChange(line.recipe_line_id, $event.target.value)">
                      <option value="">— выбрать —</option>
                      <option v-for="inst in instancesByLineId[line.recipe_line_id] || []" :key="inst.material_instance_id" :value="inst.material_instance_id">{{ inst.name || `ID ${inst.material_instance_id}` }}</option>
                    </select>
                  </div>
                  <div class="numeric">{{ line.include_in_pct && line.slurry_percent != null ? `${Number(line.slurry_percent).toFixed(2)} %` : '' }}</div>
                  <div class="numeric">{{ targetDryFor(line.recipe_line_id) }}</div>
                  <div class="numeric">{{ plannedMassFor(line.recipe_line_id) }}</div>
                </div>
              </div>
            </Panel>

            <div class="form-actions">
              <Button
                :label="currentTapeId ? 'Сохранить и далее →' : 'Создать ленту и далее →'"
                icon="pi pi-save" :loading="saving"
                @click="saveGeneralInfo().then(() => { if (currentTapeId) activeStep = 'weighing' })"
              />
            </div>
          </div>
        </StepPanel>

        <!-- ═══ Step 2: Weighing + Mixing ═══ -->
        <StepPanel value="weighing">
          <div class="form-body">
            <!-- Drying AM -->
            <Panel toggleable collapsed>
              <template #header>
                <span class="panel-header-text">Этап 0: Сушка активного материала</span>
                <span v-if="dirtySteps.drying_am" class="dirty-marker">● не сохранено</span>
              </template>
              <fieldset @input="setDirty('drying_am')" @change="setDirty('drying_am')">
                <label>Оператор</label>
                <select v-model="dryAm.operator" class="field-medium">
                  <option value="">— выбрать —</option>
                  <option v-for="u in users" :key="u.user_id" :value="u.user_id">{{ u.name }}</option>
                </select>
                <label>Дата/время</label>
                <div class="datetime-row">
                  <input v-model="dryAm.date" type="date" />
                  <input v-model="dryAm.time" type="time" />
                  <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow(dryAm, 'date', 'time')" />
                </div>
                <label>Примечания</label>
                <textarea v-model="dryAm.notes" class="field-wide"></textarea>
                <hr />
                <label>Температура, °C</label>
                <input v-model="dryAm.temperature" type="number" step="1" class="field-short" />
                <label>Атмосфера</label>
                <select v-model="dryAm.atmosphere" class="field-medium">
                  <option value="">— не выбрано —</option>
                  <option v-for="a in atmospheres" :key="a.code" :value="a.code">{{ a.display }}</option>
                </select>
                <label>Плановая длительность, мин</label>
                <input v-model="dryAm.targetDuration" type="number" step="1" min="0" class="field-short" />
                <label>Дополнительные параметры</label>
                <textarea v-model="dryAm.otherParam" class="field-wide"></textarea>
                <Button label="Сохранить сушку" @click="saveDryingStep('drying_am', dryAm)" />
              </fieldset>
            </Panel>

            <!-- Weighing -->
            <Panel toggleable>
              <template #header>
                <span class="panel-header-text">Этап I.1: Замес пасты</span>
                <span v-if="dirtySteps.weighing" class="dirty-marker">● не сохранено</span>
              </template>
              <fieldset @input="setDirty('weighing')" @change="setDirty('weighing')">
                <div v-if="weighingDelay" class="time-since">{{ weighingDelay }}</div>
                <label>Оператор</label>
                <select v-model="weighing.operator" class="field-medium">
                  <option value="">— выбрать —</option>
                  <option v-for="u in users" :key="u.user_id" :value="u.user_id">{{ u.name }}</option>
                </select>
                <label>Дата/время</label>
                <div class="datetime-row">
                  <input v-model="weighing.date" type="date" />
                  <input v-model="weighing.time" type="time" />
                  <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow(weighing, 'date', 'time')" />
                </div>
                <label>Примечания</label>
                <textarea v-model="weighing.notes" class="field-wide"></textarea>
                <hr />
                <!-- Actuals -->
                <table v-if="currentRecipeLines.length" class="actuals-table">
                  <thead><tr><th>Роль</th><th>Экземпляр</th><th>К добавлению</th><th>Факт</th></tr></thead>
                  <tbody>
                    <tr v-for="line in currentRecipeLines" :key="line.recipe_line_id">
                      <td>{{ roleLabel(line.recipe_role) }}</td>
                      <td>
                        <select :value="selectedInstanceByLineId[line.recipe_line_id] || ''" @change="onInstanceChange(line.recipe_line_id, $event.target.value)">
                          <option value="">— выбрать —</option>
                          <option v-for="inst in instancesByLineId[line.recipe_line_id] || []" :key="inst.material_instance_id" :value="inst.material_instance_id">{{ inst.name || `ID ${inst.material_instance_id}` }}</option>
                        </select>
                      </td>
                      <td class="numeric">{{ plannedMassFor(line.recipe_line_id) }}</td>
                      <td>
                        <select :value="(slurryActuals[line.recipe_line_id] || {}).mode || 'mass'" @change="onActualChange(line.recipe_line_id, 'mode', $event.target.value)">
                          <option value="mass">m (г)</option><option value="volume">V (мкл)</option>
                        </select>
                        <input type="number" step="0.0001" :value="(slurryActuals[line.recipe_line_id] || {}).value || ''" @input="onActualChange(line.recipe_line_id, 'value', $event.target.value)" />
                      </td>
                    </tr>
                  </tbody>
                </table>
                <Button label="Сохранить замес" @click="saveWeighing" />
              </fieldset>
            </Panel>

            <!-- Mixing -->
            <Panel toggleable collapsed>
              <template #header>
                <span class="panel-header-text">Этап I.2: Перемешивание</span>
                <span v-if="dirtySteps.mixing" class="dirty-marker">● не сохранено</span>
              </template>
              <fieldset @input="setDirty('mixing')" @change="setDirty('mixing')">
                <div v-if="mixingDelay" class="time-since">{{ mixingDelay }}</div>
                <label>Оператор</label>
                <select v-model="mixing.operator" class="field-medium">
                  <option value="">— выбрать —</option>
                  <option v-for="u in users" :key="u.user_id" :value="u.user_id">{{ u.name }}</option>
                </select>
                <label>Дата/время</label>
                <div class="datetime-row">
                  <input v-model="mixing.date" type="date" />
                  <input v-model="mixing.time" type="time" />
                  <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow(mixing, 'date', 'time')" />
                </div>
                <label>Примечания</label>
                <textarea v-model="mixing.notes" class="field-wide"></textarea>
                <hr />
                <label>Объём пасты, мл</label>
                <input v-model="mixing.slurryVolumeMl" type="number" step="0.1" min="0" class="field-short" />
                <label>Сухая смесь — метод</label>
                <select v-model="mixing.dryMixingId" class="field-medium">
                  <option value="">— не выбрано —</option>
                  <option v-for="m in dryMixingMethods" :key="m.dry_mixing_id" :value="m.dry_mixing_id">{{ m.description || m.name }}</option>
                </select>
                <div v-if="showDryParams" class="mix-params">
                  <label>Дата/время запуска</label>
                  <div class="datetime-row">
                    <input v-model="mixing.dryStartDate" type="date" /><input v-model="mixing.dryStartTime" type="time" />
                    <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow(mixing, 'dryStartDate', 'dryStartTime')" />
                  </div>
                  <label>Длительность, мин</label><input v-model="mixing.dryDurationMin" type="number" min="0" class="field-short" />
                  <label>RPM</label><input v-model="mixing.dryRpm" type="text" class="field-short" />
                </div>
                <label>Электродная паста — метод</label>
                <select v-model="mixing.wetMixingId" class="field-medium">
                  <option value="">— не выбрано —</option>
                  <option v-for="m in wetMixingMethods" :key="m.wet_mixing_id" :value="m.wet_mixing_id">{{ m.description || m.name }}</option>
                </select>
                <div v-if="showWetParams" class="mix-params">
                  <label>Дата/время запуска</label>
                  <div class="datetime-row">
                    <input v-model="mixing.wetStartDate" type="date" /><input v-model="mixing.wetStartTime" type="time" />
                    <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow(mixing, 'wetStartDate', 'wetStartTime')" />
                  </div>
                  <label>Длительность, мин</label><input v-model="mixing.wetDurationMin" type="number" min="0" class="field-short" />
                  <label>RPM</label><input v-model="mixing.wetRpm" type="text" class="field-short" />
                </div>
                <label>Вязкость, cP</label><input v-model="mixing.viscosityCp" type="number" step="0.1" min="0" class="field-short" />
                <Button label="Сохранить перемешивание" @click="saveMixing" />
              </fieldset>
            </Panel>

            <div class="form-actions">
              <Button label="← Назад" severity="secondary" @click="activeStep = 'general'" />
              <Button label="Далее →" icon="pi pi-arrow-right" iconPos="right" @click="activeStep = 'coating'" />
            </div>
          </div>
        </StepPanel>

        <!-- ═══ Step 3: Coating ═══ -->
        <StepPanel value="coating">
          <div class="form-body">
            <Panel toggleable>
              <template #header>
                <span class="panel-header-text">Этап II.1: Нанесение</span>
                <span v-if="dirtySteps.coating" class="dirty-marker">● не сохранено</span>
              </template>
              <fieldset @input="setDirty('coating')" @change="setDirty('coating')">
                <div v-if="coatingDelay" class="time-since">{{ coatingDelay }}</div>
                <label>Оператор</label>
                <select v-model="coating.operator" class="field-medium">
                  <option value="">— выбрать —</option>
                  <option v-for="u in users" :key="u.user_id" :value="u.user_id">{{ u.name }}</option>
                </select>
                <label>Дата/время</label>
                <div class="datetime-row">
                  <input v-model="coating.date" type="date" /><input v-model="coating.time" type="time" />
                  <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow(coating, 'date', 'time')" />
                </div>
                <label>Примечания</label>
                <textarea v-model="coating.notes" class="field-wide"></textarea>
                <hr />
                <label>Фольга</label>
                <select v-model="coating.foilId" class="field-medium">
                  <option value="">— выбрать —</option>
                  <option v-for="f in foils" :key="f.foil_id" :value="f.foil_id">{{ f.type }}</option>
                </select>
                <label>Метод нанесения</label>
                <select v-model="coating.coatingId" class="field-medium">
                  <option value="">— выбрать —</option>
                  <option v-for="m in coatingMethods" :key="m.coating_id" :value="m.coating_id">{{ m.comments || m.name }}</option>
                </select>
                <div v-if="coatingMethodPreview" class="method-preview">
                  <h4>Параметры метода (справочник)</h4>
                  <label>Зазор, мкм</label><input :value="coatingMethodPreview.gap_um" type="number" readonly class="field-short" />
                  <label>Температура, °C</label><input :value="coatingMethodPreview.temp_c" type="number" readonly class="field-short" />
                  <label>Время, мин</label><input :value="coatingMethodPreview.time_min" type="number" readonly class="field-short" />
                  <label>Комментарий</label><textarea :value="coatingMethodPreview.comments" readonly class="field-wide"></textarea>
                </div>
                <Button label="Сохранить нанесение" @click="saveCoating" />
              </fieldset>
            </Panel>

            <!-- Drying Tape -->
            <Panel toggleable collapsed>
              <template #header>
                <span class="panel-header-text">Этап II.2: Сушка ленты</span>
                <span v-if="dirtySteps.drying_tape" class="dirty-marker">● не сохранено</span>
              </template>
              <fieldset @input="setDirty('drying_tape')" @change="setDirty('drying_tape')">
                <div v-if="dryingTapeDelay" class="time-since">{{ dryingTapeDelay }}</div>
                <label>Оператор</label>
                <select v-model="dryingTape.operator" class="field-medium">
                  <option value="">— выбрать —</option>
                  <option v-for="u in users" :key="u.user_id" :value="u.user_id">{{ u.name }}</option>
                </select>
                <label>Дата/время</label>
                <div class="datetime-row">
                  <input v-model="dryingTape.date" type="date" /><input v-model="dryingTape.time" type="time" />
                  <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow(dryingTape, 'date', 'time')" />
                </div>
                <label>Примечания</label><textarea v-model="dryingTape.notes" class="field-wide"></textarea>
                <hr />
                <label>Температура, °C</label><input v-model="dryingTape.temperature" type="number" class="field-short" />
                <label>Атмосфера</label>
                <select v-model="dryingTape.atmosphere" class="field-medium">
                  <option value="">— не выбрано —</option>
                  <option v-for="a in atmospheres" :key="a.code" :value="a.code">{{ a.display }}</option>
                </select>
                <label>Плановая длительность, мин</label><input v-model="dryingTape.targetDuration" type="number" class="field-short" />
                <label>Дополнительные параметры</label><textarea v-model="dryingTape.otherParam" class="field-wide"></textarea>
                <Button label="Сохранить сушку" @click="saveDryingStep('drying_tape', dryingTape)" />
              </fieldset>
            </Panel>

            <div class="form-actions">
              <Button label="← Назад" severity="secondary" @click="activeStep = 'weighing'" />
              <Button label="Далее →" icon="pi pi-arrow-right" iconPos="right" @click="activeStep = 'calendering'" />
            </div>
          </div>
        </StepPanel>

        <!-- ═══ Step 4: Calendering ═══ -->
        <StepPanel value="calendering">
          <div class="form-body">
            <Panel toggleable>
              <template #header>
                <span class="panel-header-text">Этап II.3: Каландрирование</span>
                <span v-if="dirtySteps.calendering" class="dirty-marker">● не сохранено</span>
              </template>
              <fieldset @input="setDirty('calendering')" @change="setDirty('calendering')">
                <div v-if="calenderingDelay" class="time-since">{{ calenderingDelay }}</div>
                <label>Оператор</label>
                <select v-model="calendering.operator" class="field-medium">
                  <option value="">— выбрать —</option>
                  <option v-for="u in users" :key="u.user_id" :value="u.user_id">{{ u.name }}</option>
                </select>
                <label>Дата/время</label>
                <div class="datetime-row">
                  <input v-model="calendering.date" type="date" /><input v-model="calendering.time" type="time" />
                  <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow(calendering, 'date', 'time')" />
                </div>
                <label>Примечания</label><textarea v-model="calendering.notes" class="field-wide"></textarea>
                <hr />
                <label>Температура валков, °C</label><input v-model="calendering.tempC" type="number" step="0.1" class="field-short" />
                <label>Давление</label>
                <div class="inline-row">
                  <input v-model="calendering.pressureValue" type="number" step="0.1" class="field-short" />
                  <select v-model="calendering.pressureUnits">
                    <option value="">— единицы —</option>
                    <option value="bar">bar</option><option value="MPa">MPa</option><option value="kN">kN</option>
                  </select>
                </div>
                <label>Скорость протяжки, м/мин</label><input v-model="calendering.drawSpeedMMin" type="number" step="0.01" class="field-short" />
                <label>Начальная толщина, мкм</label><input v-model="calendering.initThicknessMicrons" type="number" step="0.1" class="field-short" />
                <label>Конечная толщина, мкм</label><input v-model="calendering.finalThicknessMicrons" type="number" step="0.1" class="field-short" />
                <label>Количество проходов</label><input v-model="calendering.noPasses" type="number" class="field-short" />
                <label>Дополнительные параметры</label><textarea v-model="calendering.otherParams" class="field-wide"></textarea>
                <h5>Внешний вид</h5>
                <div class="checkbox-group">
                  <label><input type="checkbox" v-model="calendering.shine" /> Блеск</label>
                  <label><input type="checkbox" v-model="calendering.curl" /> Закрутка</label>
                  <label><input type="checkbox" v-model="calendering.dots" /> Точечки</label>
                  <label>
                    <input type="checkbox" v-model="calendering.otherCheck" /> Другое:
                    <input v-model="calendering.otherText" type="text" :disabled="!calendering.otherCheck" class="inline-text" />
                  </label>
                </div>
                <Button label="Сохранить каландрирование" @click="saveCalendering" />
              </fieldset>
            </Panel>

            <!-- Drying Pressed Tape -->
            <Panel toggleable collapsed>
              <template #header>
                <span class="panel-header-text">Этап II.4: Сушка готовой ленты</span>
                <span v-if="dirtySteps.drying_pressed_tape" class="dirty-marker">● не сохранено</span>
              </template>
              <fieldset @input="setDirty('drying_pressed_tape')" @change="setDirty('drying_pressed_tape')">
                <div v-if="dryingPressedTapeDelay" class="time-since">{{ dryingPressedTapeDelay }}</div>
                <label>Оператор</label>
                <select v-model="dryingPressedTape.operator" class="field-medium">
                  <option value="">— выбрать —</option>
                  <option v-for="u in users" :key="u.user_id" :value="u.user_id">{{ u.name }}</option>
                </select>
                <label>Дата/время</label>
                <div class="datetime-row">
                  <input v-model="dryingPressedTape.date" type="date" /><input v-model="dryingPressedTape.time" type="time" />
                  <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow(dryingPressedTape, 'date', 'time')" />
                </div>
                <label>Примечания</label><textarea v-model="dryingPressedTape.notes" class="field-wide"></textarea>
                <hr />
                <label>Температура, °C</label><input v-model="dryingPressedTape.temperature" type="number" class="field-short" />
                <label>Атмосфера</label>
                <select v-model="dryingPressedTape.atmosphere" class="field-medium">
                  <option value="">— не выбрано —</option>
                  <option v-for="a in atmospheres" :key="a.code" :value="a.code">{{ a.display }}</option>
                </select>
                <label>Плановая длительность, мин</label><input v-model="dryingPressedTape.targetDuration" type="number" class="field-short" />
                <label>Дополнительные параметры</label><textarea v-model="dryingPressedTape.otherParam" class="field-wide"></textarea>
                <Button label="Сохранить сушку" @click="saveDryingStep('drying_pressed_tape', dryingPressedTape)" />
              </fieldset>
            </Panel>

            <div class="form-actions">
              <Button label="← Назад" severity="secondary" @click="activeStep = 'coating'" />
              <Button label="Далее →" icon="pi pi-arrow-right" iconPos="right" @click="activeStep = 'summary'" />
            </div>
          </div>
        </StepPanel>

        <!-- ═══ Step 5: Summary ═══ -->
        <StepPanel value="summary">
          <div class="form-body">
            <Panel header="Итоговая информация">
              <div class="summary-section">
                <h4>Общая информация</h4>
                <p><strong>Название:</strong> {{ tapeName || '—' }}</p>
                <p><strong>Проект:</strong> {{ projects.find(p => String(p.project_id) === String(projectId))?.name || '—' }}</p>
                <p><strong>Тип:</strong> {{ tapeType === 'cathode' ? 'Катод' : tapeType === 'anode' ? 'Анод' : '—' }}</p>
                <p><strong>Рецепт:</strong> {{ recipes.find(r => String(r.tape_recipe_id) === String(tapeRecipeId))?.name || '—' }}</p>
                <p v-if="targetMassG"><strong>Масса:</strong> {{ targetMassG }} г</p>
                <p v-if="tapeNotes"><strong>Примечания:</strong> {{ tapeNotes }}</p>
              </div>
              <div v-if="weighing.date" class="summary-section">
                <h4>Замес</h4>
                <p><strong>Дата/время:</strong> {{ weighing.date }} {{ weighing.time }}</p>
              </div>
              <div v-if="coating.date" class="summary-section">
                <h4>Нанесение</h4>
                <p><strong>Дата/время:</strong> {{ coating.date }} {{ coating.time }}</p>
              </div>
              <div v-if="calendering.date" class="summary-section">
                <h4>Каландрирование</h4>
                <p><strong>Дата/время:</strong> {{ calendering.date }} {{ calendering.time }}</p>
              </div>
            </Panel>

            <div class="form-actions">
              <Button label="← Назад" severity="secondary" @click="activeStep = 'calendering'" />
              <Button label="К списку лент" icon="pi pi-list" severity="success" @click="router.push('/tapes')" />
            </div>
          </div>
        </StepPanel>
      </StepPanels>
    </Stepper>
  </div>
</template>

<style scoped>
.tape-form-page { max-width: 960px; margin: 0 auto; padding: 1.5rem; }

.tape-name-block { margin-bottom: 1rem; }
.tape-title { cursor: pointer; margin: 0; }
.tape-title:hover { text-decoration: underline; }
.tape-name-input {
  font-size: 1.4rem; font-weight: 700; padding: 0.2rem 0.4rem;
  width: 100%; border: 1px solid #2ECC94; border-radius: 6px;
}

/* Stepper */
.tape-stepper { margin-bottom: 1.5rem; }

.step-btn {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 1rem; background: none; border: none;
  cursor: pointer; font-size: 0.9rem; font-family: inherit;
  color: var(--p-surface-600); transition: color 0.15s;
}
.step-btn:hover { color: var(--p-primary-color); }
.step-btn.active { color: var(--p-primary-color); font-weight: 700; }
.step-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.step-indicator {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--p-surface-200); font-size: 0.85rem; font-weight: 600;
}
.step-indicator.complete { background: #D1FAE5; }

/* Form fields */
fieldset { border: none; padding: 0.8rem; display: flex; flex-direction: column; gap: 0.4rem; }
label { font-weight: 500; font-size: 0.9rem; margin-top: 0.3rem; }

select, input[type="text"], input[type="number"], input[type="date"], input[type="time"], textarea {
  padding: 0.4rem 0.5rem; border: 1px solid #D1D7DE; border-radius: 6px; font-size: 0.9rem;
}
select:focus, input:focus, textarea:focus {
  border-color: #003366; outline: none; box-shadow: 0 0 0 2px rgba(0, 51, 102, 0.15);
}
textarea { min-height: 2.5rem; resize: vertical; }
hr { margin: 0.5rem 0; border: none; border-top: 1px solid #E8ECF0; }

.datetime-row { display: flex; gap: 0.5rem; align-items: center; }
.inline-row { display: flex; gap: 0.5rem; align-items: center; }

/* Markers */
.panel-header-text { font-weight: 600; font-size: 0.95rem; }
.dirty-marker { color: #e74c3c; font-size: 0.8rem; margin-left: 8px; }
.time-since { color: #8A939D; font-size: 0.85rem; margin-bottom: 0.4rem; }

/* Time badge */
.time-badge { font-size: 13px; margin-right: 0.5rem; }
.time-ok { color: var(--p-green-600); }
.time-warn { color: var(--p-yellow-600); }
.time-danger { color: var(--p-red-500); font-weight: 700; }

/* Recipe lines */
.recipe-lines-list { padding: 0.8rem; }
.recipe-line-row {
  display: grid; grid-template-columns: 1fr 1fr 1.5fr 1fr 1fr 1fr;
  gap: 0.5rem; align-items: start; padding: 0.25rem 0; font-size: 0.9rem;
}
.recipe-line-row:nth-child(even):not(.recipe-line-header) { background: #F4F6F8; }
.recipe-line-header { font-weight: 600; border-bottom: 1px solid #D1D7DE; padding-bottom: 0.25rem; margin-bottom: 0.25rem; }
.recipe-line-row select { width: 100%; font-size: 0.85rem; }
.numeric { text-align: right; font-variant-numeric: tabular-nums; }

/* Actuals */
.actuals-table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.9rem; }
.actuals-table th, .actuals-table td { padding: 0.3rem 0.4rem; border-bottom: 1px solid #E8ECF0; text-align: left; }
.actuals-table th { font-weight: 600; }
.actuals-table select, .actuals-table input { font-size: 0.85rem; }

/* Mix params */
.mix-params {
  margin-left: 1rem; padding-left: 0.75rem; border-left: 3px solid #2ECC94;
  display: flex; flex-direction: column; gap: 0.3rem;
}
.method-preview {
  margin-top: 0.5rem; padding: 0.5rem; background: #F4F6F8;
  border: 1px solid #E8ECF0; border-radius: 6px;
}
.method-preview input, .method-preview textarea { background: #E8ECF0; }

/* Checkbox */
.checkbox-group { display: flex; flex-direction: column; gap: 0.3rem; }
.checkbox-group label { display: flex; align-items: center; gap: 0.4rem; font-weight: 400; }
.inline-text { margin-left: 0.3rem; }

/* Summary */
.summary-section { margin-bottom: 1rem; }
.summary-section h4 { margin: 0 0 0.25rem; color: var(--p-primary-color); }
.summary-section p { margin: 0.15rem 0; font-size: 0.9rem; }

/* Panel spacing */
.mt-panel { margin-top: 0.5rem; }
:deep(.p-panel) { margin-bottom: 0.5rem; }
:deep(.p-panel-header) { padding: 0.6rem 0.8rem; }
:deep(.p-panel-content) { padding: 0; }

/* Stepper overrides */
:deep(.p-steplist) {
  display: flex; gap: 0; border-bottom: 2px solid var(--p-surface-200);
  margin-bottom: 1.5rem; padding: 0;
}
:deep(.p-step) { flex: 1; }
:deep(.p-steppanels) { padding: 0; }
:deep(.p-steppanel) { padding: 0; }
</style>
