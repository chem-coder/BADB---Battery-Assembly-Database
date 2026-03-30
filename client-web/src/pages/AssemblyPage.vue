<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import PageHeader from '@/components/PageHeader.vue'

const router = useRouter()
const toast = useToast()

const batteries = ref([])
const loading = ref(false)

const ffLabels = { coin: 'Монеточный', pouch: 'Пакетный', cylindrical: 'Цилиндрический' }

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('ru-RU')
}

async function loadBatteries() {
  loading.value = true
  try {
    const { data } = await api.get('/api/batteries')
    batteries.value = data
  } catch {
    batteries.value = []
  } finally {
    loading.value = false
  }
}

async function confirmDelete(battery) {
  if (!confirm(`Удалить аккумулятор #${battery.battery_id}?`)) return
  try {
    await api.delete(`/api/batteries/${battery.battery_id}`)
    toast.add({ severity: 'success', summary: 'Удалено', life: 3000 })
    await loadBatteries()
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось удалить', life: 3000 })
  }
}

onMounted(loadBatteries)
</script>

<template>
  <div class="assembly-page">
    <PageHeader title="Сборка" icon="pi pi-box">
      <template #actions>
        <Button label="Новый аккумулятор" icon="pi pi-plus" @click="router.push('/assembly/new')" />
      </template>
    </PageHeader>

    <DataTable
      :value="batteries"
      :loading="loading"
      sortMode="multiple"
      removableSort
      paginator
      :rows="25"
      :rowsPerPageOptions="[25, 50, 100]"
      stateStorage="session"
      stateKey="assembly-list-state"
      rowHover
      @rowClick="e => router.push(`/assembly/${e.data.battery_id}`)"
      class="tvel-table"
      style="cursor: pointer"
    >
      <Column field="battery_id" header="ID" sortable style="width: 80px">
        <template #body="{ data }">#{{ data.battery_id }}</template>
      </Column>
      <Column field="form_factor" header="Форм-фактор" sortable>
        <template #body="{ data }">{{ ffLabels[data.form_factor] || data.form_factor || '' }}</template>
      </Column>
      <Column field="created_at" header="Создан" sortable style="width: 120px">
        <template #body="{ data }">{{ formatDate(data.created_at) }}</template>
      </Column>
      <Column field="notes" header="Заметки">
        <template #body="{ data }">{{ data.notes || '' }}</template>
      </Column>
      <Column header="" style="width: 80px; text-align: right">
        <template #body="{ data }">
          <div class="battery-actions">
            <Button icon="pi pi-pencil" text rounded size="small" severity="secondary"
              @click.stop="router.push(`/assembly/${data.battery_id}`)" title="Редактировать" />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger"
              @click.stop="confirmDelete(data)" title="Удалить" />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.assembly-page { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }

.battery-actions {
  display: flex;
  gap: 0.15rem;
  justify-content: flex-end;
}
</style>
