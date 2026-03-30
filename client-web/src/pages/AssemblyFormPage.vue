<script setup>
import { ref, computed, watch, onMounted } from 'vue'
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
const isNew = computed(() => route.path === '/assembly/new')
const batteryIdParam = computed(() => isNew.value ? null : Number(route.params.id))

// ── Stepper ──
const activeStep = ref('general')

// ── Reference data ──
const projects = ref([])
const users = ref([])
const tapes = ref([])
const separators = ref([])
const electrolytes = ref([])

// ── Battery creation ──
const currentBatteryId = ref(null)
const projectId = ref('')
const createdBy = ref('')
const formFactor = ref('')
const batteryNotes = ref('')
const hasChanges = ref(false)

// ── Config: Coin ──
const coinCellMode = ref('')
const coinSizeCode = ref('2032')
const halfCellType = ref('')

// ── Config: Pouch ──
const pouchFormatCode = ref('')
const pouchParam1 = ref('')
const pouchParam2 = ref('')

// ── Config: Cylindrical ──
const cylSizeCode = ref('')
const cylParam1 = ref('')
const cylParam2 = ref('')

// ── Electrodes ──
const cathodeTapeId = ref('')
const cathodeCutBatchId = ref('')
const cathodeBatches = ref([])
const cathodeElectrodes = ref([])
const selectedCathodes = ref([])
const cathodeNotes = ref('')

const anodeTapeId = ref('')
const anodeCutBatchId = ref('')
const anodeBatches = ref([])
const anodeElectrodes = ref([])
const selectedAnodes = ref([])
const anodeNotes = ref('')

// ── Separator ──
const separatorId = ref('')
const separatorNotes = ref('')

// ── Electrolyte ──
const electrolyteId = ref('')
const electrolyteNotes = ref('')

// ── Assembly ──
const separatorLayout = ref('')
const separatorLayoutOther = ref('')
const dropCount = ref('')
const dropVolume = ref('')
const electrolyteAssemblyNotes = ref('')
const spacerThicknessMm = ref('')
const spacerCount = ref('')
const spacerNotes = ref('')
const liFoilNotes = ref('')

// ── QC ──
const ocvV = ref('')
const esrMohm = ref('')
const qcNotes = ref('')

// ── Electrochem ──
const electrochemNotes = ref('')

// ── Computed ──
const electrolyteVolume = computed(() => {
  const n = Number(dropCount.value)
  const v = Number(dropVolume.value)
  if (!n || !v) return ''
  return (n * v).toFixed(1)
})

const showLiFoil = computed(() =>
  formFactor.value === 'coin' && coinCellMode.value === 'half_cell'
)

const cathodeTapes = computed(() => tapes.value.filter(t => t.role === 'cathode'))
const anodeTapes = computed(() => tapes.value.filter(t => t.role === 'anode'))

const ffLabels = { coin: 'Монеточный', pouch: 'Пакетный', cylindrical: 'Цилиндрический' }
const pageTitle = computed(() => {
  if (!currentBatteryId.value) return 'Новый аккумулятор'
  return `Аккумулятор #${currentBatteryId.value}`
})

const step1Complete = computed(() => !!projectId.value && !!formFactor.value && !!currentBatteryId.value)
const step2Complete = computed(() => !!separatorId.value || !!electrolyteId.value)
const step3Complete = computed(() => !!separatorLayout.value)

const stackSummary = computed(() => {
  const rows = []
  selectedCathodes.value.forEach(e => {
    rows.push({ pos: rows.length + 1, electrode_id: e.electrode_id, role: 'катод', mass: e.electrode_mass_g ?? '' })
  })
  selectedAnodes.value.forEach(e => {
    rows.push({ pos: rows.length + 1, electrode_id: e.electrode_id, role: 'анод', mass: e.electrode_mass_g ?? '' })
  })
  return rows
})

// ── Route leave guard ──
onBeforeRouteLeave((to, from, next) => {
  if (hasChanges.value) {
    if (!confirm('Есть несохранённые изменения. Уйти без сохранения?')) return next(false)
  }
  next()
})

function markChanged() { hasChanges.value = true }

// ── API: load references ──
async function loadProjects() { try { projects.value = (await api.get('/api/projects?project_id=0')).data } catch {} }
async function loadUsers() { try { users.value = (await api.get('/api/users')).data } catch {} }
async function loadTapes() { try { tapes.value = (await api.get('/api/tapes/for-electrodes')).data } catch {} }
async function loadSeparators() { try { separators.value = (await api.get('/api/separators')).data } catch {} }
async function loadElectrolytes() { try { electrolytes.value = (await api.get('/api/electrolytes')).data } catch {} }

// ── Electrode cascading ──
watch(cathodeTapeId, async (tapeId) => {
  cathodeCutBatchId.value = ''
  cathodeBatches.value = []
  cathodeElectrodes.value = []
  selectedCathodes.value = []
  if (!tapeId) return
  const { data } = await api.get(`/api/tapes/${tapeId}/electrode-cut-batches`)
  cathodeBatches.value = data
})

watch(cathodeCutBatchId, async (batchId) => {
  cathodeElectrodes.value = []
  selectedCathodes.value = []
  if (!batchId) return
  const { data } = await api.get(`/api/electrodes/electrode-cut-batches/${batchId}/electrodes`)
  cathodeElectrodes.value = data
})

watch(anodeTapeId, async (tapeId) => {
  anodeCutBatchId.value = ''
  anodeBatches.value = []
  anodeElectrodes.value = []
  selectedAnodes.value = []
  if (!tapeId) return
  const { data } = await api.get(`/api/tapes/${tapeId}/electrode-cut-batches`)
  anodeBatches.value = data
})

watch(anodeCutBatchId, async (batchId) => {
  anodeElectrodes.value = []
  selectedAnodes.value = []
  if (!batchId) return
  const { data } = await api.get(`/api/electrodes/electrode-cut-batches/${batchId}/electrodes`)
  anodeElectrodes.value = data
})

// ── Electrode checkbox toggling ──
function toggleCathode(e, checked) {
  if (checked) {
    if (!selectedCathodes.value.find(x => x.electrode_id === e.electrode_id)) selectedCathodes.value.push(e)
  } else {
    selectedCathodes.value = selectedCathodes.value.filter(x => x.electrode_id !== e.electrode_id)
  }
  markChanged()
}

function toggleAnode(e, checked) {
  if (checked) {
    if (!selectedAnodes.value.find(x => x.electrode_id === e.electrode_id)) selectedAnodes.value.push(e)
  } else {
    selectedAnodes.value = selectedAnodes.value.filter(x => x.electrode_id !== e.electrode_id)
  }
  markChanged()
}

function isCathodeSelected(e) { return selectedCathodes.value.some(x => x.electrode_id === e.electrode_id) }
function isAnodeSelected(e) { return selectedAnodes.value.some(x => x.electrode_id === e.electrode_id) }
function userName(u) { return u.full_name || u.name }

// ── Create battery ──
async function createBattery() {
  if (!projectId.value || !formFactor.value) {
    showStatus('Заполните проект и форм-фактор', true)
    return
  }

  try {
    const { data } = await api.post('/api/batteries', {
      project_id: Number(projectId.value),
      created_by: Number(createdBy.value),
      form_factor: formFactor.value,
      notes: batteryNotes.value || null,
    })
    currentBatteryId.value = data.battery_id
    if (isNew.value) router.replace(`/assembly/${data.battery_id}`)
    hasChanges.value = false
    showStatus('Аккумулятор создан')
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка создания', true)
  }
}

// ── Save battery ──
async function saveBattery() {
  if (!currentBatteryId.value) return

  const payload = {
    project_id: Number(projectId.value),
    created_by: Number(createdBy.value),
    form_factor: formFactor.value,
    notes: batteryNotes.value || null,
    coin_cell_mode: formFactor.value === 'coin' ? coinCellMode.value || null : null,
    coin_size_code: formFactor.value === 'coin' ? coinSizeCode.value || null : null,
    half_cell_type: formFactor.value === 'coin' && coinCellMode.value === 'half_cell' ? halfCellType.value || null : null,
    pouch_format_code: formFactor.value === 'pouch' ? pouchFormatCode.value || null : null,
    pouch_param_1: formFactor.value === 'pouch' ? pouchParam1.value || null : null,
    pouch_param_2: formFactor.value === 'pouch' ? pouchParam2.value || null : null,
    cyl_size_code: formFactor.value === 'cylindrical' ? cylSizeCode.value || null : null,
    cyl_param_1: formFactor.value === 'cylindrical' ? cylParam1.value || null : null,
    cyl_param_2: formFactor.value === 'cylindrical' ? cylParam2.value || null : null,
    cathode_tape_id: cathodeTapeId.value ? Number(cathodeTapeId.value) : null,
    cathode_cut_batch_id: cathodeCutBatchId.value ? Number(cathodeCutBatchId.value) : null,
    cathode_notes: cathodeNotes.value || null,
    anode_tape_id: anodeTapeId.value ? Number(anodeTapeId.value) : null,
    anode_cut_batch_id: anodeCutBatchId.value ? Number(anodeCutBatchId.value) : null,
    anode_notes: anodeNotes.value || null,
    cathode_electrode_ids: selectedCathodes.value.map(e => e.electrode_id),
    anode_electrode_ids: selectedAnodes.value.map(e => e.electrode_id),
    separator_id: separatorId.value ? Number(separatorId.value) : null,
    separator_notes: separatorNotes.value || null,
    electrolyte_id: electrolyteId.value ? Number(electrolyteId.value) : null,
    electrolyte_notes: electrolyteNotes.value || null,
    separator_layout: separatorLayout.value === 'other' ? separatorLayoutOther.value || null : separatorLayout.value || null,
    drop_count: dropCount.value ? Number(dropCount.value) : null,
    drop_volume: dropVolume.value ? Number(dropVolume.value) : null,
    electrolyte_assembly_notes: electrolyteAssemblyNotes.value || null,
    spacer_thickness_mm: spacerThicknessMm.value ? Number(spacerThicknessMm.value) : null,
    spacer_count: spacerCount.value ? Number(spacerCount.value) : null,
    spacer_notes: spacerNotes.value || null,
    li_foil_notes: showLiFoil.value ? liFoilNotes.value || null : null,
    ocv_v: ocvV.value ? Number(ocvV.value) : null,
    esr_mohm: esrMohm.value ? Number(esrMohm.value) : null,
    qc_notes: qcNotes.value || null,
    electrochem_notes: electrochemNotes.value || null,
  }

  try {
    await api.put(`/api/batteries/${currentBatteryId.value}`, payload)
    hasChanges.value = false
    showStatus('Сохранено')
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка сохранения', true)
  }
}

// ── Load battery for edit ──
async function restoreBattery() {
  if (!batteryIdParam.value) return
  try {
    // No single-battery GET endpoint; fetch all and find
    const { data: all } = await api.get('/api/batteries')
    const b = all.find(x => x.battery_id === batteryIdParam.value)
    if (!b) { showStatus('Аккумулятор не найден', true); router.push('/assembly'); return }

    currentBatteryId.value = b.battery_id
    projectId.value = b.project_id || ''
    createdBy.value = b.created_by || ''
    formFactor.value = b.form_factor || ''
    batteryNotes.value = b.notes || ''

    coinCellMode.value = b.coin_cell_mode || ''
    coinSizeCode.value = b.coin_size_code || '2032'
    halfCellType.value = b.half_cell_type || ''
    pouchFormatCode.value = b.pouch_format_code || ''
    pouchParam1.value = b.pouch_param_1 || ''
    pouchParam2.value = b.pouch_param_2 || ''
    cylSizeCode.value = b.cyl_size_code || ''
    cylParam1.value = b.cyl_param_1 || ''
    cylParam2.value = b.cyl_param_2 || ''

    cathodeTapeId.value = b.cathode_tape_id || ''
    anodeTapeId.value = b.anode_tape_id || ''
    cathodeNotes.value = b.cathode_notes || ''
    anodeNotes.value = b.anode_notes || ''

    separatorId.value = b.separator_id || ''
    separatorNotes.value = b.separator_notes || ''
    electrolyteId.value = b.electrolyte_id || ''
    electrolyteNotes.value = b.electrolyte_notes || ''

    if (['SEE', 'ESE', 'EES', 'ES', 'SE'].includes(b.separator_layout)) {
      separatorLayout.value = b.separator_layout
    } else if (b.separator_layout) {
      separatorLayout.value = 'other'
      separatorLayoutOther.value = b.separator_layout
    }
    dropCount.value = b.drop_count ?? ''
    dropVolume.value = b.drop_volume ?? ''
    electrolyteAssemblyNotes.value = b.electrolyte_assembly_notes || ''
    spacerThicknessMm.value = b.spacer_thickness_mm ?? ''
    spacerCount.value = b.spacer_count ?? ''
    spacerNotes.value = b.spacer_notes || ''
    liFoilNotes.value = b.li_foil_notes || ''

    ocvV.value = b.ocv_v ?? ''
    esrMohm.value = b.esr_mohm ?? ''
    qcNotes.value = b.qc_notes || ''
    electrochemNotes.value = b.electrochem_notes || ''
  } catch (e) {
    showStatus('Ошибка загрузки', true)
    console.error(e)
  }
}

// ── Delete ──
async function confirmDelete() {
  if (!confirm(`Удалить аккумулятор #${currentBatteryId.value}?`)) return
  try {
    await api.delete(`/api/batteries/${currentBatteryId.value}`)
    hasChanges.value = false
    showStatus('Удалено')
    router.push('/assembly')
  } catch { showStatus('Ошибка удаления', true) }
}

// ── Init ──
onMounted(async () => {
  await Promise.all([
    loadProjects(), loadUsers(), loadTapes(),
    loadSeparators(), loadElectrolytes(),
  ])
  if (isNew.value) {
    if (authStore.user) createdBy.value = String(authStore.user.userId)
  } else {
    await restoreBattery()
  }
})
</script>

<template>
  <div class="assembly-form-page">
    <PageHeader
      :title="pageTitle"
      icon="pi pi-box"
      back-to="/assembly"
    >
      <template #actions>
        <Button v-if="currentBatteryId"
          label="Удалить" icon="pi pi-trash" severity="danger" outlined size="small"
          @click="confirmDelete" />
      </template>
    </PageHeader>

    <!-- ════════ STEPPER ════════ -->
    <Stepper v-model:value="activeStep" class="assembly-stepper">
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
        <Step value="separator">
          <template #default="{ activateCallback, active }">
            <button class="step-btn" :class="{ active }" @click="currentBatteryId && activateCallback()" :disabled="!currentBatteryId">
              <span class="step-indicator" :class="step2Complete ? 'complete' : ''">
                {{ step2Complete ? '✅' : '2' }}
              </span>
              Сепаратор + Электролит
            </button>
          </template>
        </Step>
        <Step value="assembly">
          <template #default="{ activateCallback, active }">
            <button class="step-btn" :class="{ active }" @click="currentBatteryId && activateCallback()" :disabled="!currentBatteryId">
              <span class="step-indicator" :class="step3Complete ? 'complete' : ''">
                {{ step3Complete ? '✅' : '3' }}
              </span>
              Закрытие
            </button>
          </template>
        </Step>
        <Step value="summary">
          <template #default="{ activateCallback, active }">
            <button class="step-btn" :class="{ active }" @click="currentBatteryId && activateCallback()" :disabled="!currentBatteryId">
              <span class="step-indicator">4</span>
              Итог
            </button>
          </template>
        </Step>
      </StepList>

      <StepPanels>
        <!-- ═══ Step 1: Общая информация + Конфигурация + Электроды ═══ -->
        <StepPanel value="general">
          <div class="form-body">
            <Panel header="1 Общая информация об аккумуляторе">
              <fieldset @input="markChanged" @change="markChanged">
                <label>Кто добавил</label>
                <input type="text" :value="authStore.user?.name || ''" disabled class="field-medium" />

                <label>Проект</label>
                <select v-model="projectId" required class="field-medium">
                  <option value="">— выбрать проект —</option>
                  <option v-for="p in projects" :key="p.project_id" :value="p.project_id">{{ p.name }}</option>
                </select>

                <label>Форм-фактор</label>
                <select v-model="formFactor" required class="field-medium">
                  <option value="">— выбрать —</option>
                  <option value="coin">Монеточный</option>
                  <option value="pouch">Пакетный</option>
                  <option value="cylindrical">Цилиндрический</option>
                </select>

                <label>Заметки</label>
                <textarea v-model="batteryNotes" class="field-wide" placeholder="Общие комментарии по сборке"></textarea>

                <Button v-if="!currentBatteryId" label="Создать аккумулятор" @click="createBattery" />
              </fieldset>
            </Panel>

            <!-- Config -->
            <Panel v-if="currentBatteryId" header="2 Конфигурация элемента" toggleable>
              <fieldset @input="markChanged" @change="markChanged">
                <div v-if="formFactor === 'coin'">
                  <label>Тип элемента</label>
                  <select v-model="coinCellMode" class="field-medium">
                    <option value="">— выбрать —</option>
                    <option value="half_cell">Полуячейка против Li</option>
                    <option value="full_cell">Полный элемент</option>
                  </select>
                  <label>Размер монетки</label>
                  <select v-model="coinSizeCode" class="field-medium">
                    <option value="2032">2032</option><option value="2025">2025</option><option value="2016">2016</option>
                  </select>
                  <div v-if="coinCellMode === 'half_cell'">
                    <label>Тип полуячейки</label>
                    <select v-model="halfCellType" class="field-medium">
                      <option value="">— выбрать —</option>
                      <option value="cathode_vs_li">Катод vs Li</option>
                      <option value="anode_vs_li">Анод vs Li</option>
                    </select>
                  </div>
                </div>
                <div v-if="formFactor === 'pouch'">
                  <label>Тип пакетного элемента</label>
                  <select v-model="pouchFormatCode" class="field-medium">
                    <option value="">— выбрать —</option>
                    <option value="single_stack">Одностековый</option>
                    <option value="multi_stack">Многостековый</option>
                  </select>
                  <label>Параметр 1</label><input v-model="pouchParam1" type="text" class="field-medium" />
                  <label>Параметр 2</label><input v-model="pouchParam2" type="text" class="field-medium" />
                </div>
                <div v-if="formFactor === 'cylindrical'">
                  <label>Типоразмер</label>
                  <select v-model="cylSizeCode" class="field-medium">
                    <option value="">— выбрать —</option>
                    <option value="18650">18650</option><option value="21700">21700</option>
                  </select>
                  <label>Параметр 1</label><input v-model="cylParam1" type="text" class="field-medium" />
                  <label>Параметр 2</label><input v-model="cylParam2" type="text" class="field-medium" />
                </div>
              </fieldset>
            </Panel>

            <!-- Electrodes -->
            <Panel v-if="currentBatteryId" header="3 Электроды" toggleable>
              <Panel header="Источник электродов" toggleable class="mb-panel">
                <fieldset @change="markChanged">
                  <div v-if="!(formFactor === 'coin' && coinCellMode === 'half_cell' && halfCellType === 'anode_vs_li')">
                    <label>Катодная лента</label>
                    <select v-model="cathodeTapeId" class="field-medium">
                      <option value="">— выбрать ленту —</option>
                      <option v-for="t in cathodeTapes" :key="t.tape_id" :value="t.tape_id">
                        #{{ t.tape_id }} | {{ t.name }} | {{ t.created_by }}
                      </option>
                    </select>
                    <label>Партия вырезанных электродов</label>
                    <select v-model="cathodeCutBatchId" class="field-medium">
                      <option value="">— выбрать партию —</option>
                      <option v-for="b in cathodeBatches" :key="b.cut_batch_id" :value="b.cut_batch_id">
                        #{{ b.cut_batch_id }} | {{ b.created_by }}
                      </option>
                    </select>
                    <label>Заметки</label>
                    <textarea v-model="cathodeNotes" class="field-wide" placeholder="Комментарии по катодной партии"></textarea>
                  </div>
                  <div v-if="!(formFactor === 'coin' && coinCellMode === 'half_cell' && halfCellType === 'cathode_vs_li')">
                    <label>Анодная лента</label>
                    <select v-model="anodeTapeId" class="field-medium">
                      <option value="">— выбрать ленту —</option>
                      <option v-for="t in anodeTapes" :key="t.tape_id" :value="t.tape_id">
                        #{{ t.tape_id }} | {{ t.name }} | {{ t.created_by }}
                      </option>
                    </select>
                    <label>Партия вырезанных электродов</label>
                    <select v-model="anodeCutBatchId" class="field-medium">
                      <option value="">— выбрать партию —</option>
                      <option v-for="b in anodeBatches" :key="b.cut_batch_id" :value="b.cut_batch_id">
                        #{{ b.cut_batch_id }} | {{ b.created_by }}
                      </option>
                    </select>
                    <label>Заметки</label>
                    <textarea v-model="anodeNotes" class="field-wide" placeholder="Комментарии по анодной партии"></textarea>
                  </div>
                </fieldset>
              </Panel>

              <Panel header="Формирование стека" toggleable class="mb-panel">
                <p>Выберите электроды для данного элемента.</p>
                <div v-if="cathodeElectrodes.length">
                  <h4>Катоды</h4>
                  <table class="stack-table">
                    <thead><tr><th>№</th><th>ID</th><th>m, g</th><th>Выбрать</th></tr></thead>
                    <tbody>
                      <tr v-for="(e, idx) in cathodeElectrodes" :key="e.electrode_id">
                        <td>{{ idx + 1 }}</td><td>{{ e.electrode_id }}</td><td>{{ e.electrode_mass_g ?? '' }}</td>
                        <td><input type="checkbox" :checked="isCathodeSelected(e)" :disabled="e.status_code !== 1" @change="toggleCathode(e, $event.target.checked)" /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-if="anodeElectrodes.length">
                  <h4>Аноды</h4>
                  <table class="stack-table">
                    <thead><tr><th>№</th><th>ID</th><th>m, g</th><th>Выбрать</th></tr></thead>
                    <tbody>
                      <tr v-for="(e, idx) in anodeElectrodes" :key="e.electrode_id">
                        <td>{{ idx + 1 }}</td><td>{{ e.electrode_id }}</td><td>{{ e.electrode_mass_g ?? '' }}</td>
                        <td><input type="checkbox" :checked="isAnodeSelected(e)" :disabled="e.status_code !== 1" @change="toggleAnode(e, $event.target.checked)" /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <h4>Электроды в элементе</h4>
                <table class="stack-table">
                  <thead><tr><th>Поз</th><th>ID</th><th>Роль</th><th>m, g</th></tr></thead>
                  <tbody>
                    <tr v-for="row in stackSummary" :key="row.pos + '-' + row.electrode_id">
                      <td>{{ row.pos }}</td><td>{{ row.electrode_id }}</td><td>{{ row.role }}</td><td>{{ row.mass }}</td>
                    </tr>
                  </tbody>
                </table>
              </Panel>
            </Panel>

            <div class="form-actions">
              <Button v-if="currentBatteryId" label="Сохранить" icon="pi pi-save" @click="saveBattery" />
              <Button v-if="currentBatteryId" label="Далее →" icon="pi pi-arrow-right" iconPos="right" @click="activeStep = 'separator'" />
            </div>
          </div>
        </StepPanel>

        <!-- ═══ Step 2: Сепаратор + Электролит ═══ -->
        <StepPanel value="separator">
          <div class="form-body">
            <Panel header="4 Сепаратор">
              <fieldset @change="markChanged">
                <label>Сепаратор</label>
                <select v-model="separatorId" class="field-medium">
                  <option value="">— выбрать сепаратор —</option>
                  <option v-for="s in separators" :key="s.sep_id" :value="s.sep_id">{{ s.name }}</option>
                </select>
                <label>Заметки</label>
                <textarea v-model="separatorNotes" class="field-wide" placeholder="Комментарии по сепаратору"></textarea>
              </fieldset>
            </Panel>

            <Panel header="5 Электролит">
              <fieldset @change="markChanged">
                <label>Электролит</label>
                <select v-model="electrolyteId" class="field-medium">
                  <option value="">— выбрать электролит —</option>
                  <option v-for="el in electrolytes" :key="el.electrolyte_id" :value="el.electrolyte_id">{{ el.name }}</option>
                </select>
                <label>Заметки</label>
                <textarea v-model="electrolyteNotes" class="field-wide" placeholder="Комментарии по электролиту"></textarea>
              </fieldset>
            </Panel>

            <div class="form-actions">
              <Button label="← Назад" severity="secondary" @click="activeStep = 'general'" />
              <Button label="Сохранить" icon="pi pi-save" @click="saveBattery" />
              <Button label="Далее →" icon="pi pi-arrow-right" iconPos="right" @click="activeStep = 'assembly'" />
            </div>
          </div>
        </StepPanel>

        <!-- ═══ Step 3: Закрытие (Assembly params) ═══ -->
        <StepPanel value="assembly">
          <div class="form-body">
            <Panel header="6 Параметры сборки">
              <Panel header="Схема расположения сепаратора" toggleable class="mb-panel">
                <fieldset @change="markChanged">
                  <label><input type="radio" v-model="separatorLayout" value="SEE" /> S-E-E</label>
                  <label><input type="radio" v-model="separatorLayout" value="ESE" /> E-S-E</label>
                  <label><input type="radio" v-model="separatorLayout" value="EES" /> E-E-S</label>
                  <label><input type="radio" v-model="separatorLayout" value="ES" /> E-S</label>
                  <label><input type="radio" v-model="separatorLayout" value="SE" /> S-E</label>
                  <label><input type="radio" v-model="separatorLayout" value="other" /> Другое</label>
                  <input v-if="separatorLayout === 'other'" v-model="separatorLayoutOther" type="text" placeholder="Введите схему" class="field-medium" />
                </fieldset>
              </Panel>

              <Panel header="Электролит" toggleable class="mb-panel">
                <fieldset @input="markChanged" @change="markChanged">
                  <label>Количество капель</label>
                  <input v-model="dropCount" type="number" step="0.1" min="0" class="field-short" />
                  <label>Объём одной капли, мкл</label>
                  <input v-model="dropVolume" type="number" step="0.1" min="0" class="field-short" />
                  <label>Общий объём (мкл): <span class="computed-field">{{ electrolyteVolume }}</span></label>
                  <label>Заметки</label>
                  <textarea v-model="electrolyteAssemblyNotes" class="field-wide" placeholder="Комментарии по внесению электролита"></textarea>
                </fieldset>
              </Panel>

              <Panel header="Спэйсер" toggleable class="mb-panel">
                <fieldset @input="markChanged">
                  <label>Толщина спэйсера, мм</label>
                  <input v-model="spacerThicknessMm" type="number" step="0.01" min="0" class="field-short" />
                  <label>Количество спэйсеров</label>
                  <input v-model="spacerCount" type="number" min="0" class="field-short" />
                  <label>Заметки</label>
                  <textarea v-model="spacerNotes" class="field-wide" placeholder="Комментарии по спэйсеру"></textarea>
                </fieldset>
              </Panel>

              <div v-if="showLiFoil">
                <label>Li-фольга (поставщик / партия / толщина / обработка)</label>
                <textarea v-model="liFoilNotes" rows="2" class="field-wide" @input="markChanged"></textarea>
              </div>
            </Panel>

            <div class="form-actions">
              <Button label="← Назад" severity="secondary" @click="activeStep = 'separator'" />
              <Button label="Сохранить" icon="pi pi-save" @click="saveBattery" />
              <Button label="Далее →" icon="pi pi-arrow-right" iconPos="right" @click="activeStep = 'summary'" />
            </div>
          </div>
        </StepPanel>

        <!-- ═══ Step 4: Итог (QC + Summary) ═══ -->
        <StepPanel value="summary">
          <div class="form-body">
            <Panel header="7 Выходной контроль">
              <fieldset @input="markChanged">
                <label>НРЦ, В</label>
                <input v-model="ocvV" type="number" step="0.001" class="field-short" />
                <label>ESR, мОм</label>
                <input v-model="esrMohm" type="number" step="0.001" class="field-short" />
                <label>Заметки</label>
                <textarea v-model="qcNotes" class="field-wide" placeholder="Комментарии по выходному контролю"></textarea>
              </fieldset>
            </Panel>

            <Panel header="8 Электрохимия" toggleable collapsed>
              <p class="hint-text">Здесь можно привязать файлы испытаний (циклирование, CV, EIS).</p>
              <fieldset @input="markChanged">
                <label>Заметки</label>
                <textarea v-model="electrochemNotes" class="field-wide" placeholder="Комментарии по электрохимическим испытаниям"></textarea>
              </fieldset>
            </Panel>

            <Panel header="Итоговая информация">
              <div class="summary-section">
                <p><strong>Проект:</strong> {{ projects.find(p => String(p.project_id) === String(projectId))?.name || '—' }}</p>
                <p><strong>Форм-фактор:</strong> {{ ffLabels[formFactor] || '—' }}</p>
                <p v-if="stackSummary.length"><strong>Электродов в стеке:</strong> {{ stackSummary.length }}</p>
                <p v-if="ocvV"><strong>НРЦ:</strong> {{ ocvV }} В</p>
                <p v-if="esrMohm"><strong>ESR:</strong> {{ esrMohm }} мОм</p>
              </div>
            </Panel>

            <div class="form-actions">
              <Button label="← Назад" severity="secondary" @click="activeStep = 'assembly'" />
              <Button label="Сохранить" icon="pi pi-save" @click="saveBattery" />
              <Button label="К списку" icon="pi pi-list" severity="success" @click="router.push('/assembly')" />
            </div>
          </div>
        </StepPanel>
      </StepPanels>
    </Stepper>
  </div>
</template>

<style scoped>
.assembly-form-page { max-width: 960px; margin: 0 auto; padding: 1.5rem; }

/* Stepper */
.assembly-stepper { margin-bottom: 1.5rem; }

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

select, input[type="text"], input[type="number"], textarea {
  padding: 0.4rem 0.5rem; border: 1px solid #D1D7DE; border-radius: 6px; font-size: 0.9rem;
}
select:focus, input:focus, textarea:focus {
  border-color: #003366; outline: none; box-shadow: 0 0 0 2px rgba(0, 51, 102, 0.15);
}
textarea { min-height: 2.5rem; resize: vertical; }

select, input[type="number"], input[type="text"] { max-width: 360px; }
textarea { max-width: 600px; }

.computed-field { font-weight: bold; color: #003366; }
.hint-text { font-size: 0.85rem; color: #6B7280; margin: 0 0 0.5rem 0; }

.stack-table {
  width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.9rem;
}
.stack-table th, .stack-table td {
  padding: 0.3rem 0.5rem; text-align: left; border-bottom: 1px solid #E8ECF0;
}
.stack-table th { font-weight: 600; background: #F4F6F8; }

.summary-section { margin-bottom: 1rem; }
.summary-section p { margin: 0.15rem 0; font-size: 0.9rem; }

.mb-panel { margin-bottom: 0.5rem; }
:deep(.p-panel) { margin-bottom: 0.5rem; }
:deep(.p-panel-header) { padding: 0.6rem 0.8rem; }
:deep(.p-panel-content) { padding: 0; }
</style>
