<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Panel from 'primevue/panel'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import DatePicker from 'primevue/datepicker'
import RadioButton from 'primevue/radiobutton'
import Stepper from 'primevue/stepper'
import StepList from 'primevue/steplist'
import Step from 'primevue/step'
import StepPanels from 'primevue/steppanels'
import StepPanel from 'primevue/steppanel'
import PageHeader from '@/components/PageHeader.vue'
import {
  TARGET_FORM_FACTOR_OPTIONS,
  TARGET_CONFIG_CODE_OPTIONS_BY_FORM_FACTOR,
  shapeForFormFactor,
  isConfigCodeValidFor,
} from '@/config/electrodeStages'

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
const isNew = computed(() => route.path === '/electrodes/new')
const batchId = computed(() => isNew.value ? null : Number(route.params.id))

// ── Stepper ──
const activeStep = ref('cutting')

// ── Reference data ──
const users = ref([])
const tapes = ref([])
const projects = ref([])

// ── Batch data ──
const currentBatchId = ref(null)
const selectedTapeId = ref('')
const hasChanges = ref(false)
const createdBy = ref('')
const batchComments = ref('')

// ── Target form factor / config (drives shape + validation) ──
const targetFormFactor = ref('')
const targetConfigCode = ref('')
const targetConfigOther = ref('')

// ── Geometry ──
// PrimeVue InputNumber returns null on empty input (not '') so refs start at null.
const shape = ref('')
const diameterMm = ref(null)
const lengthMm = ref(null)
const widthMm = ref(null)

// ── Target config cascade ──
const targetConfigOptions = computed(() => {
  if (!targetFormFactor.value) return []
  return TARGET_CONFIG_CODE_OPTIONS_BY_FORM_FACTOR[targetFormFactor.value] || []
})

// ── Tape select options (flat list for PrimeVue Select) ──
const tapeOptions = computed(() =>
  tapes.value.map(t => ({
    value: t.tape_id,
    label: `#${t.tape_id} | ${t.name} (${t.role})`,
  }))
)

function onFormFactorChange() {
  // Auto-set shape
  const autoShape = shapeForFormFactor(targetFormFactor.value)
  if (autoShape) shape.value = autoShape
  // Clear config_code if it no longer fits
  if (targetConfigCode.value && !isConfigCodeValidFor(targetFormFactor.value, targetConfigCode.value)) {
    targetConfigCode.value = ''
    targetConfigOther.value = ''
  }
  markChanged()
}

function onConfigCodeChange() {
  if (targetConfigCode.value !== 'other') {
    targetConfigOther.value = ''
  }
  markChanged()
}

// ── Electrodes ──
const electrodes = ref([])

// ── Foil mass ──
const foilRows = ref([])
let foilCounter = 0

// ── Drying ──
// Consolidated date+time into single DatePicker Date objects per boundary,
// replacing the legacy dryingStart{Date,Time}/dryingEnd{Date,Time} split.
// PrimeVue DatePicker with showTime returns/accepts a native Date object.
const dryingStart = ref(null)
const dryingEnd = ref(null)
const dryingTemperature = ref(null)
const dryingOtherParams = ref('')
const dryingComments = ref('')

// ── Computed ──
const electrodeArea = computed(() => {
  if (shape.value === 'circle' && diameterMm.value) {
    const d = Number(diameterMm.value)
    if (d > 0) return (Math.PI * Math.pow(d / 2, 2)).toFixed(2)
  }
  if (shape.value === 'rectangle' && lengthMm.value && widthMm.value) {
    const l = Number(lengthMm.value)
    const w = Number(widthMm.value)
    if (l > 0 && w > 0) return (l * w).toFixed(2)
  }
  return ''
})

const foilMassAverage = computed(() => {
  const values = foilRows.value
    .map(r => Number(r.mass_g))
    .filter(v => Number.isFinite(v) && v > 0)
  if (!values.length) return ''
  return (values.reduce((s, v) => s + v, 0) / values.length).toFixed(4)
})

const step1Complete = computed(() => !!selectedTapeId.value && !!shape.value)
const step2Complete = computed(() => electrodes.value.some(e => e.electrode_id || e.electrode_mass_g))
const batchTitle = computed(() => currentBatchId.value ? `Партия #${currentBatchId.value}` : 'Новая партия')

// ── Route leave guard ──
onBeforeRouteLeave((to, from, next) => {
  if (hasChanges.value) {
    if (!confirm('Есть несохранённые изменения. Уйти без сохранения?')) return next(false)
  }
  next()
})

function markChanged() { hasChanges.value = true }

// ── API: load references ──
async function loadUsers() { try { users.value = (await api.get('/api/users')).data } catch {} }
async function loadTapes() { try { tapes.value = (await api.get('/api/tapes/for-electrodes')).data } catch {} }
async function loadProjects() { try { projects.value = (await api.get('/api/projects?project_id=0')).data } catch {} }

// ── Electrodes ──
async function loadElectrodes(cutBatchId) {
  const { data } = await api.get(`/api/electrodes/electrode-cut-batches/${cutBatchId}/electrodes`)
  electrodes.value = data
}

function appendElectrodeRow() {
  electrodes.value.push({
    _new: true,
    electrode_mass_g: '',
    cup_number: '',
    comments: '',
    status_code: null,
  })
}

function removeNewElectrodeRow(index) {
  electrodes.value.splice(index, 1)
  if (!electrodes.value.length) appendElectrodeRow()
}

async function updateElectrode(e, field, value) {
  if (!e.electrode_id) return
  try {
    await api.put(`/api/electrodes/${e.electrode_id}`, { [field]: value || null })
    await loadElectrodes(currentBatchId.value)
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка обновления электрода', true)
  }
}

async function deleteElectrode(e, index) {
  if (e._new) { removeNewElectrodeRow(index); return }
  if (!confirm(`Удалить электрод ${e.electrode_id}?`)) return
  try {
    await api.delete(`/api/electrodes/${e.electrode_id}`)
    await loadElectrodes(currentBatchId.value)
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка удаления', true)
  }
}

async function scrapElectrode(e) {
  const reason = prompt('Причина списания')
  if (!reason) return
  try {
    await api.put(`/api/electrodes/${e.electrode_id}/status`, {
      status_code: 3,
      scrapped_reason: reason,
      used_in_battery_id: null,
    })
    await loadElectrodes(currentBatchId.value)
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка списания', true)
  }
}

function renderStatus(e) {
  if (e._new) return 'новый'
  if (e.status_code === 1) return 'доступен'
  if (e.status_code === 2) return `использован в батарее ${e.used_in_battery_id}`
  if (e.status_code === 3) return `списан: ${e.scrapped_reason}`
  return ''
}

// ── Foil mass ──
async function loadFoilMasses(cutBatchId) {
  try {
    const { data } = await api.get(`/api/electrodes/electrode-cut-batches/${cutBatchId}/foil-masses`)
    if (data.length) {
      foilRows.value = data.map(m => ({ _key: foilCounter++, mass_g: m.mass_g ?? '' }))
    } else {
      foilRows.value = [{ _key: foilCounter++, mass_g: '' }]
    }
  } catch {
    foilRows.value = [{ _key: foilCounter++, mass_g: '' }]
  }
}

function addFoilRow() {
  foilRows.value.push({ _key: foilCounter++, mass_g: '' })
}

function removeFoilRow(index) {
  foilRows.value.splice(index, 1)
  if (!foilRows.value.length) addFoilRow()
}

// ── Drying ──
async function loadDrying(cutBatchId) {
  try {
    const { data } = await api.get(`/api/electrodes/electrode-cut-batches/${cutBatchId}/drying`)
    if (!data) return
    dryingStart.value = data.start_time ? new Date(data.start_time) : null
    dryingEnd.value = data.end_time ? new Date(data.end_time) : null
    dryingTemperature.value = data.temperature_c ?? null
    dryingOtherParams.value = data.other_parameters ?? ''
    dryingComments.value = data.comments ?? ''
  } catch {}
}

// Combined date+time DatePicker takes a Date object. "Сейчас" sets both
// boundaries — start to this moment, or end to this moment.
function setNow(target) {
  const now = new Date()
  if (target === 'start') dryingStart.value = now
  else dryingEnd.value = now
}

// Convert a Date back to a wire format the backend accepts.
// Existing code sent "YYYY-MM-DDTHH:MM" — keep the same slice for
// bit-for-bit compatibility with Dalia's drying route.
function _formatWire(dt) {
  if (!dt) return null
  const year = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  const hh = String(dt.getHours()).padStart(2, '0')
  const mi = String(dt.getMinutes()).padStart(2, '0')
  return `${year}-${mm}-${dd}T${hh}:${mi}`
}

// ── Save batch ──
async function saveBatch() {
  const tapeId = Number(selectedTapeId.value)
  const operator = Number(createdBy.value)
  if (!tapeId || !operator) {
    showStatus('Не выбрана лента или оператор', true)
    return
  }

  try {
    const targetPayload = {
      target_form_factor: targetFormFactor.value || null,
      target_config_code: targetConfigCode.value || null,
      target_config_other: targetConfigCode.value === 'other'
        ? (targetConfigOther.value || null)
        : null,
    }

    if (!currentBatchId.value) {
      const { data } = await api.post('/api/electrodes/electrode-cut-batches', {
        tape_id: tapeId,
        created_by: operator,
        comments: batchComments.value || null,
        ...targetPayload,
        shape: shape.value || null,
        diameter_mm: diameterMm.value || null,
        length_mm: lengthMm.value || null,
        width_mm: widthMm.value || null,
      })
      currentBatchId.value = data.cut_batch_id
      if (isNew.value) router.replace(`/electrodes/${data.cut_batch_id}`)
    } else {
      await api.put(`/api/electrodes/electrode-cut-batches/${currentBatchId.value}`, {
        ...targetPayload,
        shape: shape.value || null,
        diameter_mm: diameterMm.value || null,
        length_mm: lengthMm.value || null,
        width_mm: widthMm.value || null,
        comments: batchComments.value || null,
      })
    }

    // Save new electrodes
    for (const e of electrodes.value) {
      if (!e._new) continue
      const mass = e.electrode_mass_g
      if (!mass) continue
      await api.post('/api/electrodes', {
        cut_batch_id: currentBatchId.value,
        electrode_mass_g: mass,
        cup_number: e.cup_number || null,
        comments: e.comments || null,
      })
    }

    // Save foil masses
    await api.delete(`/api/electrodes/electrode-cut-batches/${currentBatchId.value}/foil-masses`)
    for (const row of foilRows.value) {
      if (!row.mass_g) continue
      await api.post(`/api/electrodes/electrode-cut-batches/${currentBatchId.value}/foil-masses`, {
        cut_batch_id: currentBatchId.value,
        mass_g: row.mass_g,
      })
    }

    // Save drying
    const startTime = _formatWire(dryingStart.value)
    const endTime = _formatWire(dryingEnd.value)
    if (startTime || endTime || dryingTemperature.value != null) {
      await api.post(`/api/electrodes/electrode-cut-batches/${currentBatchId.value}/drying`, {
        cut_batch_id: currentBatchId.value,
        start_time: startTime,
        end_time: endTime,
        temperature_c: dryingTemperature.value ?? null,
        other_parameters: dryingOtherParams.value || null,
        comments: dryingComments.value || null,
      })
    }

    hasChanges.value = false
    showStatus('Партия сохранена')
    await loadElectrodes(currentBatchId.value)
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка сохранения', true)
  }
}

// ── Restore batch for edit ──
async function restoreBatch() {
  if (!batchId.value) return
  try {
    const { data } = await api.get(`/api/electrodes/electrode-cut-batches/${batchId.value}`)
    currentBatchId.value = data.cut_batch_id
    selectedTapeId.value = String(data.tape_id || '')
    createdBy.value = String(data.created_by || '')
    batchComments.value = data.comments || ''
    targetFormFactor.value = data.target_form_factor || ''
    targetConfigCode.value = data.target_config_code || ''
    targetConfigOther.value = data.target_config_other || ''
    shape.value = data.shape || ''
    diameterMm.value = data.diameter_mm ?? null
    lengthMm.value = data.length_mm ?? null
    widthMm.value = data.width_mm ?? null

    await Promise.all([
      loadElectrodes(data.cut_batch_id),
      loadFoilMasses(data.cut_batch_id),
      loadDrying(data.cut_batch_id),
    ])
  } catch {
    showStatus('Партия не найдена', true)
    router.push('/electrodes')
  }
}

// ── Delete ──
async function confirmDelete() {
  if (!confirm(`Удалить партию #${currentBatchId.value}?`)) return
  try {
    await api.delete(`/api/electrodes/electrode-cut-batches/${currentBatchId.value}`)
    hasChanges.value = false
    showStatus('Удалено')
    router.push('/electrodes')
  } catch { showStatus('Ошибка удаления', true) }
}

// ── Init ──
onMounted(async () => {
  await Promise.all([loadUsers(), loadTapes(), loadProjects()])

  if (isNew.value) {
    const tapeFromQuery = route.query.tape
    if (tapeFromQuery) selectedTapeId.value = String(tapeFromQuery)
    if (authStore.user) createdBy.value = String(authStore.user.userId)
    foilRows.value = [{ _key: foilCounter++, mass_g: '' }]
    appendElectrodeRow()
  } else {
    await restoreBatch()
  }
})
</script>

<template>
  <div class="electrode-form-page">
    <PageHeader
      :title="batchTitle"
      icon="pi pi-stop-circle"
      back-to="/electrodes"
    >
      <template #actions>
        <Button v-if="currentBatchId"
          label="Удалить" icon="pi pi-trash" severity="danger" outlined size="small"
          @click="confirmDelete" />
      </template>
    </PageHeader>

    <!-- ════════ STEPPER ════════ -->
    <Stepper v-model:value="activeStep" class="electrode-stepper">
      <StepList>
        <Step value="cutting">
          <template #default="{ activateCallback, active }">
            <button class="step-btn" :class="{ active }" @click="activateCallback">
              <span class="step-indicator" :class="step1Complete ? 'complete' : ''">
                {{ step1Complete ? '✅' : '1' }}
              </span>
              Нарезка
            </button>
          </template>
        </Step>
        <Step value="weighing">
          <template #default="{ activateCallback, active }">
            <button class="step-btn" :class="{ active }" @click="currentBatchId && activateCallback()" :disabled="!currentBatchId">
              <span class="step-indicator" :class="step2Complete ? 'complete' : ''">
                {{ step2Complete ? '✅' : '2' }}
              </span>
              Взвешивание
            </button>
          </template>
        </Step>
        <Step value="summary">
          <template #default="{ activateCallback, active }">
            <button class="step-btn" :class="{ active }" @click="currentBatchId && activateCallback()" :disabled="!currentBatchId">
              <span class="step-indicator">3</span>
              Итог
            </button>
          </template>
        </Step>
      </StepList>

      <StepPanels>
        <!-- ═══ Step 1: Нарезка ═══ -->
        <StepPanel value="cutting">
          <div class="form-body">
            <Panel header="Оператор и параметры нарезки">
              <fieldset @input="markChanged" @change="markChanged">
                <label>Кто добавил</label>
                <InputText :model-value="authStore.user?.name || ''" disabled class="field-medium" />

                <label>Лента</label>
                <Select
                  v-model="selectedTapeId"
                  :options="tapeOptions"
                  option-label="label"
                  option-value="value"
                  placeholder="— выбрать ленту —"
                  :disabled="!!currentBatchId"
                  show-clear
                  class="field-medium"
                />

                <label>Комментарии</label>
                <Textarea v-model="batchComments" class="field-wide" rows="2" placeholder="Комментарии о вырезании электродов" />
              </fieldset>
            </Panel>

            <Panel header="Целевая конфигурация элемента" toggleable>
              <fieldset @change="markChanged">
                <label>Семейство элемента</label>
                <Select
                  v-model="targetFormFactor"
                  :options="TARGET_FORM_FACTOR_OPTIONS"
                  option-label="label"
                  option-value="value"
                  placeholder="— выбрать —"
                  show-clear
                  class="field-medium"
                  @change="onFormFactorChange"
                />

                <label>Конфигурация</label>
                <Select
                  v-model="targetConfigCode"
                  :options="targetConfigOptions"
                  option-label="label"
                  option-value="value"
                  :placeholder="targetFormFactor ? '— выбрать —' : '— выбрать семейство —'"
                  :disabled="!targetFormFactor"
                  show-clear
                  class="field-medium"
                  @change="onConfigCodeChange"
                />

                <div v-if="targetConfigCode === 'other'">
                  <label>Другая конфигурация:</label>
                  <InputText
                    v-model="targetConfigOther"
                    placeholder="Например: 14500"
                    class="field-medium"
                    @input="markChanged"
                  />
                </div>
              </fieldset>
            </Panel>

            <Panel header="Геометрия электродов" toggleable>
              <fieldset @change="markChanged">
                <p>
                  Форма электродов:
                  <span v-if="targetFormFactor" class="auto-hint">
                    (автоматически из семейства — {{ shape === 'circle' ? 'круг' : 'прямоугольник' }})
                  </span>
                </p>
                <div class="radio-row">
                  <label class="radio-label">
                    <RadioButton v-model="shape" input-id="shape-circle" value="circle" :disabled="!!targetFormFactor" />
                    <span>Круг (монета)</span>
                  </label>
                  <label class="radio-label">
                    <RadioButton v-model="shape" input-id="shape-rect" value="rectangle" :disabled="!!targetFormFactor" />
                    <span>Прямоугольник (пауч, цилиндр)</span>
                  </label>
                </div>

                <div v-if="shape === 'circle'">
                  <label>Диаметр электрода, мм:</label>
                  <InputNumber v-model="diameterMm" :min="0" :max-fraction-digits="2" class="field-short" @input="markChanged" />
                </div>

                <div v-if="shape === 'rectangle'">
                  <label>Длина электрода, мм:</label>
                  <InputNumber v-model="lengthMm" :min="0" :max-fraction-digits="2" class="field-short" @input="markChanged" />
                  <label>Ширина электрода, мм:</label>
                  <InputNumber v-model="widthMm" :min="0" :max-fraction-digits="2" class="field-short" @input="markChanged" />
                </div>

                <label>Площадь электрода, мм²: <span class="computed-field">{{ electrodeArea }}</span></label>
              </fieldset>
            </Panel>

            <Panel header="Масса фольги" toggleable>
              <fieldset>
                <label>Средняя масса фольги одного электрода, г:</label>
                <InputText :model-value="foilMassAverage" disabled class="field-short" />

                <table class="data-table">
                  <thead><tr><th>#</th><th>Масса, г</th><th></th></tr></thead>
                  <tbody>
                    <tr v-for="(row, idx) in foilRows" :key="row._key">
                      <td class="row-index">{{ idx + 1 }}</td>
                      <td>
                        <InputNumber
                          v-model="row.mass_g"
                          :min="0"
                          :max-fraction-digits="4"
                          class="cell-input"
                          @input="markChanged"
                          @keydown.enter.prevent="addFoilRow"
                        />
                      </td>
                      <td>
                        <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="removeFoilRow(idx)" />
                      </td>
                    </tr>
                  </tbody>
                </table>
                <Button icon="pi pi-plus" severity="secondary" text size="small" label="Добавить" @click="addFoilRow" />
              </fieldset>
            </Panel>

            <div class="form-actions">
              <Button
                :label="currentBatchId ? 'Сохранить и далее →' : 'Создать партию и далее →'"
                icon="pi pi-save"
                @click="saveBatch().then(() => { if (currentBatchId) activeStep = 'weighing' })"
              />
            </div>
          </div>
        </StepPanel>

        <!-- ═══ Step 2: Взвешивание ═══ -->
        <StepPanel value="weighing">
          <div class="form-body">
            <Panel header="Масса электродов">
              <div class="electrodes-table-wrapper">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th class="row-index"></th>
                      <th>№</th>
                      <th>Масса, г</th>
                      <th>Стаканчик №</th>
                      <th>Комментарии</th>
                      <th>Статус</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(e, idx) in electrodes" :key="e.electrode_id || ('new-' + idx)">
                      <td class="row-index">{{ idx + 1 }}</td>
                      <td>{{ e.number_in_batch ?? '' }}</td>
                      <td>
                        <InputNumber
                          v-model="e.electrode_mass_g"
                          :min="0"
                          :max-fraction-digits="4"
                          class="cell-input"
                          @input="e._new ? markChanged() : null"
                          @blur="e._new ? null : updateElectrode(e, 'electrode_mass_g', e.electrode_mass_g)"
                          @keydown.enter.prevent="e._new ? appendElectrodeRow() : null"
                        />
                      </td>
                      <td>
                        <InputNumber
                          v-model="e.cup_number"
                          :min="0"
                          :use-grouping="false"
                          class="cell-input"
                          @input="e._new ? markChanged() : null"
                          @blur="e._new ? null : updateElectrode(e, 'cup_number', e.cup_number)"
                        />
                      </td>
                      <td>
                        <InputText
                          v-model="e.comments"
                          class="cell-input"
                          @input="e._new ? markChanged() : null"
                          @blur="e._new ? null : updateElectrode(e, 'comments', e.comments)"
                        />
                      </td>
                      <td>{{ renderStatus(e) }}</td>
                      <td>
                        <Button v-if="!e._new && e.status_code === 1"
                          icon="pi pi-ban" severity="warning" text rounded size="small"
                          title="Списать" @click="scrapElectrode(e)" />
                        <Button icon="pi pi-trash" severity="danger" text rounded size="small"
                          title="Удалить" @click="deleteElectrode(e, idx)" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <Button icon="pi pi-plus" severity="secondary" text size="small" label="Добавить" @click="appendElectrodeRow" />
            </Panel>

            <div class="form-actions">
              <Button label="← Назад" severity="secondary" @click="activeStep = 'cutting'" />
              <Button label="Сохранить" icon="pi pi-save" @click="saveBatch" />
              <Button label="Далее →" icon="pi pi-arrow-right" iconPos="right" @click="activeStep = 'summary'" />
            </div>
          </div>
        </StepPanel>

        <!-- ═══ Step 3: Итог ═══ -->
        <StepPanel value="summary">
          <div class="form-body">
            <Panel header="Сушка готовой партии электродов" toggleable>
              <fieldset @change="markChanged">
                <label>Начало:</label>
                <div class="datetime-row">
                  <DatePicker
                    v-model="dryingStart"
                    show-time
                    hour-format="24"
                    show-icon
                    placeholder="— дата и время —"
                    class="field-medium"
                    @date-select="markChanged"
                  />
                  <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow('start'); markChanged()" />
                </div>

                <label>Окончание:</label>
                <div class="datetime-row">
                  <DatePicker
                    v-model="dryingEnd"
                    show-time
                    hour-format="24"
                    show-icon
                    placeholder="— дата и время —"
                    class="field-medium"
                    @date-select="markChanged"
                  />
                  <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow('end'); markChanged()" />
                </div>

                <label>Температура, °C:</label>
                <InputNumber v-model="dryingTemperature" :min="-273" :max-fraction-digits="1" class="field-short" @input="markChanged" />

                <label>Дополнительные параметры:</label>
                <Textarea v-model="dryingOtherParams" class="field-wide" rows="2" placeholder="Например: вакуум, сухая комната" />

                <label>Комментарии:</label>
                <Textarea v-model="dryingComments" class="field-wide" rows="2" placeholder="Комментарии по сушке" />
              </fieldset>
            </Panel>

            <Panel header="Итоговая информация">
              <div class="summary-section">
                <p><strong>Форма:</strong> {{ shape === 'circle' ? 'Круг' : shape === 'rectangle' ? 'Прямоугольник' : '—' }}</p>
                <p v-if="electrodeArea"><strong>Площадь:</strong> {{ electrodeArea }} мм²</p>
                <p><strong>Электродов:</strong> {{ electrodes.filter(e => e.electrode_id || e.electrode_mass_g).length }}</p>
                <p v-if="foilMassAverage"><strong>Средняя масса фольги:</strong> {{ foilMassAverage }} г</p>
              </div>
            </Panel>

            <div class="form-actions">
              <Button label="← Назад" severity="secondary" @click="activeStep = 'weighing'" />
              <Button label="Сохранить" icon="pi pi-save" @click="saveBatch" />
              <Button label="К списку" icon="pi pi-list" severity="success" @click="router.push('/electrodes')" />
            </div>
          </div>
        </StepPanel>
      </StepPanels>
    </Stepper>
  </div>
</template>

<style scoped>
.electrode-form-page { max-width: 960px; margin: 0 auto; padding: 1.5rem; }

/* Stepper */
.electrode-stepper { margin-bottom: 1.5rem; }

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

/* Form layout */
fieldset { border: none; padding: 0.8rem; display: flex; flex-direction: column; gap: 0.4rem; }
label { font-weight: 500; font-size: 0.9rem; margin-top: 0.3rem; }

/* PrimeVue input sizing — width classes .field-short / .field-medium / .field-wide
   now apply to the outer PrimeVue component wrapper, which we then pass to the
   inner input via :deep(). InputNumber/DatePicker/Select wrap their real <input>
   in multiple divs; the :deep rules below target the rendered input width. */
.field-short  { max-width: 180px; }
.field-medium { max-width: 360px; }
.field-wide   { max-width: 600px; }

:deep(.p-inputnumber.field-short),
:deep(.p-inputnumber.field-medium),
:deep(.p-datepicker.field-medium),
:deep(.p-select.field-medium),
:deep(.p-inputtext.field-short),
:deep(.p-inputtext.field-medium),
:deep(.p-textarea.field-wide) {
  width: 100%;
}
:deep(.p-inputnumber.field-short .p-inputtext),
:deep(.p-inputtext.field-short),
:deep(.p-datepicker-input) {
  width: 100%;
}

/* Radio button rows — PrimeVue RadioButton + label side-by-side */
.radio-row { display: flex; flex-direction: column; gap: 0.35rem; }
.radio-label {
  display: inline-flex; align-items: center; gap: 0.5rem;
  font-weight: 400; margin-top: 0; cursor: pointer;
}

/* In-table inputs — compact, fill the cell */
.cell-input { width: 100%; min-width: 80px; }
:deep(.cell-input .p-inputtext),
:deep(.cell-input.p-inputtext) {
  width: 100%; padding: 0.25rem 0.4rem; font-size: 0.85rem;
}

.datetime-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.computed-field { font-weight: bold; color: #003274; }

.electrodes-table-wrapper { overflow-x: auto; }

.data-table {
  width: 100%; border-collapse: collapse; font-size: 0.9rem; margin: 0.5rem 0;
}
.data-table th, .data-table td {
  padding: 0.3rem 0.5rem; border-bottom: 1px solid #E8ECF0; text-align: left;
}
.data-table th { font-weight: 600; background: #F4F6F8; }

.row-index {
  color: #8A939D; text-align: right; padding-right: 8px; user-select: none; width: 32px;
}

.summary-section { margin-bottom: 1rem; }
.summary-section p { margin: 0.15rem 0; font-size: 0.9rem; }

.auto-hint {
  font-size: 0.8rem;
  color: #8A939D;
  font-weight: 400;
  margin-left: 0.3rem;
}

:deep(.p-panel) { margin-bottom: 0.5rem; }
:deep(.p-panel-header) { padding: 0.6rem 0.8rem; }
:deep(.p-panel-content) { padding: 0; }
</style>
