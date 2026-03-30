<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Panel from 'primevue/panel'
import Stepper from 'primevue/stepper'
import StepList from 'primevue/steplist'
import Step from 'primevue/step'
import StepPanels from 'primevue/steppanels'
import StepPanel from 'primevue/steppanel'
import PageHeader from '@/components/PageHeader.vue'

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

// ── Geometry ──
const shape = ref('')
const diameterMm = ref('')
const lengthMm = ref('')
const widthMm = ref('')

// ── Electrodes ──
const electrodes = ref([])

// ── Foil mass ──
const foilRows = ref([])
let foilCounter = 0

// ── Drying ──
const dryingStartDate = ref('')
const dryingStartTime = ref('')
const dryingEndDate = ref('')
const dryingEndTime = ref('')
const dryingTemperature = ref('')
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
    if (data.start_time) {
      const s = new Date(data.start_time)
      dryingStartDate.value = s.toISOString().slice(0, 10)
      dryingStartTime.value = s.toTimeString().slice(0, 5)
    }
    if (data.end_time) {
      const e = new Date(data.end_time)
      dryingEndDate.value = e.toISOString().slice(0, 10)
      dryingEndTime.value = e.toTimeString().slice(0, 5)
    }
    dryingTemperature.value = data.temperature_c ?? ''
    dryingOtherParams.value = data.other_parameters ?? ''
    dryingComments.value = data.comments ?? ''
  } catch {}
}

function setNow(target) {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const time = now.toTimeString().slice(0, 5)
  if (target === 'start') {
    dryingStartDate.value = date
    dryingStartTime.value = time
  } else {
    dryingEndDate.value = date
    dryingEndTime.value = time
  }
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
    if (!currentBatchId.value) {
      const { data } = await api.post('/api/electrodes/electrode-cut-batches', {
        tape_id: tapeId,
        created_by: operator,
        comments: batchComments.value || null,
        shape: shape.value || null,
        diameter_mm: diameterMm.value || null,
        length_mm: lengthMm.value || null,
        width_mm: widthMm.value || null,
      })
      currentBatchId.value = data.cut_batch_id
      if (isNew.value) router.replace(`/electrodes/${data.cut_batch_id}`)
    } else {
      await api.put(`/api/electrodes/electrode-cut-batches/${currentBatchId.value}`, {
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
    let startTime = null
    let endTime = null
    if (dryingStartDate.value && dryingStartTime.value) {
      startTime = `${dryingStartDate.value}T${dryingStartTime.value}`
    }
    if (dryingEndDate.value && dryingEndTime.value) {
      endTime = `${dryingEndDate.value}T${dryingEndTime.value}`
    }
    if (startTime || endTime || dryingTemperature.value) {
      await api.post(`/api/electrodes/electrode-cut-batches/${currentBatchId.value}/drying`, {
        cut_batch_id: currentBatchId.value,
        start_time: startTime,
        end_time: endTime,
        temperature_c: dryingTemperature.value || null,
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
    shape.value = data.shape || ''
    diameterMm.value = data.diameter_mm ?? ''
    lengthMm.value = data.length_mm ?? ''
    widthMm.value = data.width_mm ?? ''

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
                <input type="text" :value="authStore.user?.name || ''" disabled class="field-medium" />

                <label>Лента</label>
                <select v-model="selectedTapeId" class="field-medium" :disabled="!!currentBatchId">
                  <option value="">— выбрать ленту —</option>
                  <option v-for="t in tapes" :key="t.tape_id" :value="t.tape_id">
                    #{{ t.tape_id }} | {{ t.name }} ({{ t.role }})
                  </option>
                </select>

                <label>Комментарии</label>
                <textarea v-model="batchComments" class="field-wide" placeholder="Комментарии о вырезании электродов"></textarea>
              </fieldset>
            </Panel>

            <Panel header="Геометрия электродов" toggleable>
              <fieldset @input="markChanged" @change="markChanged">
                <p>Форма электродов:</p>
                <label>
                  <input type="radio" v-model="shape" value="circle" /> Круг (монета)
                </label>
                <label>
                  <input type="radio" v-model="shape" value="rectangle" /> Прямоугольник (пауч, цилиндр)
                </label>

                <div v-if="shape === 'circle'">
                  <label>Диаметр электрода, мм:</label>
                  <input v-model="diameterMm" type="number" step="0.01" min="0" class="field-short" />
                </div>

                <div v-if="shape === 'rectangle'">
                  <label>Длина электрода, мм:</label>
                  <input v-model="lengthMm" type="number" step="0.01" min="0" class="field-short" />
                  <label>Ширина электрода, мм:</label>
                  <input v-model="widthMm" type="number" step="0.01" min="0" class="field-short" />
                </div>

                <label>Площадь электрода, мм²: <span class="computed-field">{{ electrodeArea }}</span></label>
              </fieldset>
            </Panel>

            <Panel header="Масса фольги" toggleable>
              <fieldset @input="markChanged">
                <label>Средняя масса фольги одного электрода, г:</label>
                <input type="number" :value="foilMassAverage" disabled class="field-short" />

                <table class="data-table">
                  <thead><tr><th>#</th><th>Масса, г</th><th></th></tr></thead>
                  <tbody>
                    <tr v-for="(row, idx) in foilRows" :key="row._key">
                      <td class="row-index">{{ idx + 1 }}</td>
                      <td>
                        <input v-model="row.mass_g" type="number" step="0.0001" min="0"
                          @keydown.enter.prevent="addFoilRow" />
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
                        <input v-model="e.electrode_mass_g" type="number" step="0.0001" min="0"
                          @change="e._new ? markChanged() : updateElectrode(e, 'electrode_mass_g', e.electrode_mass_g)"
                          @keydown.enter.prevent="e._new ? appendElectrodeRow() : null" />
                      </td>
                      <td>
                        <input v-model="e.cup_number" type="number" step="1" min="0"
                          @change="e._new ? markChanged() : updateElectrode(e, 'cup_number', e.cup_number)" />
                      </td>
                      <td>
                        <input v-model="e.comments" type="text"
                          @change="e._new ? markChanged() : updateElectrode(e, 'comments', e.comments)" />
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
              <fieldset @input="markChanged" @change="markChanged">
                <label>Дата начала:</label>
                <div class="datetime-row">
                  <input v-model="dryingStartDate" type="date" />
                  <input v-model="dryingStartTime" type="time" />
                  <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow('start'); markChanged()" />
                </div>

                <label>Дата окончания:</label>
                <div class="datetime-row">
                  <input v-model="dryingEndDate" type="date" />
                  <input v-model="dryingEndTime" type="time" />
                  <Button size="small" severity="secondary" outlined label="Сейчас" @click="setNow('end'); markChanged()" />
                </div>

                <label>Температура, °C:</label>
                <input v-model="dryingTemperature" type="number" step="0.1" min="-273" class="field-short" />

                <label>Дополнительные параметры:</label>
                <textarea v-model="dryingOtherParams" class="field-wide" placeholder="Например: вакуум, сухая комната"></textarea>

                <label>Комментарии:</label>
                <textarea v-model="dryingComments" class="field-wide" placeholder="Комментарии по сушке"></textarea>
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

select, input[type="number"] { max-width: 360px; }
textarea { max-width: 600px; }

.datetime-row { display: flex; gap: 0.5rem; align-items: center; }
.computed-field { font-weight: bold; color: #003366; }

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

:deep(.p-panel) { margin-bottom: 0.5rem; }
:deep(.p-panel-header) { padding: 0.6rem 0.8rem; }
:deep(.p-panel-content) { padding: 0; }
</style>
