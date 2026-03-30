<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import Button from 'primevue/button'
import Panel from 'primevue/panel'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import PageHeader from '@/components/PageHeader.vue'

const router = useRouter()
const toast = useToast()

const roleRu = { cathode: 'Катод', anode: 'Анод' }

// --- Reference data ---
const tapes = ref([])
const projects = ref([])

// --- Selection ---
const selectedRole = ref('')
const selectedProjectId = ref('')
const selectedTapeId = ref('')

// --- Cut batches ---
const cutBatches = ref([])
const loading = ref(false)

// --- Computed ---
const filteredTapes = computed(() => {
  return tapes.value.filter(t =>
    (!selectedRole.value || t.role === selectedRole.value) &&
    (!selectedProjectId.value || String(t.project_id) === String(selectedProjectId.value))
  )
})

const cathodeTapes = computed(() => filteredTapes.value.filter(t => t.role === 'cathode'))
const anodeTapes = computed(() => filteredTapes.value.filter(t => t.role === 'anode'))

const workflowVisible = computed(() => !!selectedTapeId.value && !!selectedProjectId.value)

// --- API ---
async function loadTapes() {
  try {
    const { data } = await api.get('/api/tapes/for-electrodes')
    tapes.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить ленты', life: 3000 })
  }
}

async function loadProjects() {
  try {
    const { data } = await api.get('/api/projects?project_id=0')
    projects.value = data
  } catch {}
}

async function loadCutBatches(tapeId) {
  loading.value = true
  try {
    const { data } = await api.get(`/api/tapes/${tapeId}/electrode-cut-batches`)
    cutBatches.value = data
  } catch {
    cutBatches.value = []
  } finally {
    loading.value = false
  }
}

function onTapeChange() {
  const tape = tapes.value.find(t => String(t.tape_id) === String(selectedTapeId.value))
  if (tape) {
    selectedRole.value = tape.role || selectedRole.value
    selectedProjectId.value = String(tape.project_id) || selectedProjectId.value
  }
  if (selectedTapeId.value && selectedProjectId.value) {
    loadCutBatches(Number(selectedTapeId.value))
  } else {
    cutBatches.value = []
  }
}

function onRoleOrProjectChange() {
  selectedTapeId.value = ''
  cutBatches.value = []
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('ru-RU')
}

function batchStatus(batch) {
  if (batch.drying_end) return 'готово'
  if (batch.drying_start) return 'сушится'
  return 'в работе'
}

function electrodeCountWord(count) {
  const n = Number(count) || 0
  if (n % 10 === 1 && n % 100 !== 11) return 'электрод'
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'электрода'
  return 'электродов'
}

async function confirmDelete(batch) {
  if (!confirm(`Удалить партию #${batch.cut_batch_id}?`)) return
  try {
    await api.delete(`/api/electrodes/electrode-cut-batches/${batch.cut_batch_id}`)
    toast.add({ severity: 'success', summary: 'Удалено', life: 3000 })
    await loadCutBatches(Number(selectedTapeId.value))
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось удалить', life: 3000 })
  }
}

onMounted(async () => {
  await Promise.all([loadTapes(), loadProjects()])
})
</script>

<template>
  <div class="electrodes-page">
    <PageHeader title="Электроды" icon="pi pi-stop-circle">
      <template #actions>
        <Button
          v-if="selectedTapeId"
          label="Новая партия"
          icon="pi pi-plus"
          @click="router.push(`/electrodes/new?tape=${selectedTapeId}`)"
        />
      </template>
    </PageHeader>

    <!-- Tape selection -->
    <Panel header="Выбор ленты">
      <fieldset>
        <label>Тип электрода:</label>
        <select v-model="selectedRole" @change="onRoleOrProjectChange">
          <option value="">— выбрать —</option>
          <option value="cathode">Катоды</option>
          <option value="anode">Аноды</option>
        </select>

        <label>Проект:</label>
        <select v-model="selectedProjectId" @change="onRoleOrProjectChange">
          <option value="">— выбрать проект —</option>
          <option v-for="p in projects" :key="p.project_id" :value="p.project_id">{{ p.name }}</option>
        </select>

        <label>Лента:</label>
        <select v-model="selectedTapeId" @change="onTapeChange">
          <option value="">— выбрать ленту —</option>
          <optgroup v-if="cathodeTapes.length" label="Катоды">
            <option v-for="t in cathodeTapes" :key="t.tape_id" :value="t.tape_id">
              #{{ t.tape_id }} | {{ t.name }} ({{ roleRu[t.role] }}) | {{ t.finished_at || '—' }} | {{ t.created_by }}
            </option>
          </optgroup>
          <optgroup v-if="anodeTapes.length" label="Аноды">
            <option v-for="t in anodeTapes" :key="t.tape_id" :value="t.tape_id">
              #{{ t.tape_id }} | {{ t.name }} ({{ roleRu[t.role] }}) | {{ t.finished_at || '—' }} | {{ t.created_by }}
            </option>
          </optgroup>
        </select>
      </fieldset>
    </Panel>

    <!-- Batch list -->
    <div v-if="workflowVisible" class="batch-list-section">
      <div v-if="!cutBatches.length && !loading" class="empty-text">
        Пока нет вырезанных партий электродов
      </div>

      <DataTable
        v-if="cutBatches.length"
        :value="cutBatches"
        :loading="loading"
        stripedRows
        rowHover
        @rowClick="e => router.push(`/electrodes/${e.data.cut_batch_id}`)"
        style="cursor: pointer"
      >
        <Column header="Партия" style="width: 100px">
          <template #body="{ data }">#{{ data.cut_batch_id }}</template>
        </Column>
        <Column header="Дата">
          <template #body="{ data }">{{ formatDate(data.created_at) }}</template>
        </Column>
        <Column header="Электродов">
          <template #body="{ data }">{{ Number(data.electrode_count) || 0 }} {{ electrodeCountWord(data.electrode_count) }}</template>
        </Column>
        <Column header="Статус">
          <template #body="{ data }">{{ batchStatus(data) }}</template>
        </Column>
        <Column header="" style="width: 80px; text-align: right">
          <template #body="{ data }">
            <div class="batch-actions">
              <Button icon="pi pi-pencil" text rounded size="small" severity="secondary"
                @click.stop="router.push(`/electrodes/${data.cut_batch_id}`)" title="Редактировать" />
              <Button icon="pi pi-trash" text rounded size="small" severity="danger"
                @click.stop="confirmDelete(data)" title="Удалить" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.electrodes-page { max-width: 960px; margin: 0 auto; padding: 1.5rem; }

fieldset {
  border: none;
  padding: 0.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

label { font-weight: 500; font-size: 0.9rem; margin-top: 0.3rem; }

select {
  padding: 0.4rem 0.5rem;
  border: 1px solid #D1D7DE;
  border-radius: 6px;
  font-size: 0.9rem;
  max-width: 360px;
}
select:focus {
  border-color: #003366;
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 51, 102, 0.15);
}

.batch-list-section { margin-top: 1rem; }
.empty-text { color: #6B7280; font-size: 0.9rem; margin: 0.5rem 0; }

.batch-actions {
  display: flex;
  gap: 0.15rem;
  justify-content: flex-end;
}

:deep(.p-panel) { margin-bottom: 0.5rem; }
:deep(.p-panel-header) { padding: 0.6rem 0.8rem; }
</style>
