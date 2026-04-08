<script setup>
/**
 * DashboardPipeline — Kanban-style pipeline view for tape production stages.
 * Groups tapes by Dalia's workflow_status_code into columns.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  tapes: { type: Array, default: () => [] },
})

const router = useRouter()

const STAGES = [
  { code: 'recipe_materials', label: 'Экземпляры', icon: 'pi pi-list', color: '#6B7280' },
  { code: 'drying_am', label: 'Сушка АМ', icon: 'pi pi-sun', color: '#D3A754' },
  { code: 'weighing', label: 'Замес', icon: 'pi pi-chart-bar', color: '#025EA1' },
  { code: 'mixing', label: 'Перемешивание', icon: 'pi pi-sync', color: '#6CACE4' },
  { code: 'coating', label: 'Нанесение', icon: 'pi pi-palette', color: '#52C9A6' },
  { code: 'drying_tape', label: 'Сушка ленты', icon: 'pi pi-sun', color: '#D3A754' },
  { code: 'calendering', label: 'Каландр.', icon: 'pi pi-sliders-h', color: '#E74C3C' },
  { code: 'drying_pressed_tape', label: 'Сушка после', icon: 'pi pi-sun', color: '#D3A754' },
  { code: 'finished', label: 'Завершено', icon: 'pi pi-check-circle', color: '#1d7a5f' },
]

const columns = computed(() => {
  const grouped = {}
  for (const s of STAGES) grouped[s.code] = []

  for (const t of props.tapes) {
    const code = t.workflow_complete ? 'finished' : (t.workflow_status_code || 'recipe_materials')
    if (grouped[code]) grouped[code].push(t)
    else grouped['recipe_materials'].push(t)
  }

  return STAGES.map(s => ({
    ...s,
    items: grouped[s.code] || [],
    count: (grouped[s.code] || []).length,
  }))
})

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 86400000) return 'сегодня'
  if (diff < 172800000) return 'вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function goToTape(t) {
  router.push(`/tapes?select=${t.tape_id}`)
}
</script>

<template>
  <div class="pipeline-container">
    <div class="pipeline-scroll">
      <div v-for="col in columns" :key="col.code" class="pipeline-column">
        <div class="column-header" :style="{ borderTopColor: col.color }">
          <i :class="col.icon" :style="{ color: col.color }"></i>
          <span class="column-label">{{ col.label }}</span>
          <span class="column-count" :style="{ background: col.color + '18', color: col.color }">{{ col.count }}</span>
        </div>
        <div class="column-body">
          <div
            v-for="tape in col.items"
            :key="tape.tape_id"
            class="pipe-card glass-card"
            @click="goToTape(tape)"
          >
            <div class="pipe-card-name">{{ tape.name || `Лента #${tape.tape_id}` }}</div>
            <div class="pipe-card-meta">
              <span v-if="tape.project_name" class="pipe-badge">{{ tape.project_name }}</span>
              <span v-if="tape.role" class="pipe-role">{{ tape.role === 'cathode' ? 'К' : 'А' }}</span>
            </div>
            <div class="pipe-card-footer">
              <span class="pipe-operator">{{ tape.created_by_name || '' }}</span>
              <span class="pipe-date">{{ formatTime(tape.created_at) }}</span>
            </div>
          </div>
          <div v-if="col.items.length === 0" class="column-empty">—</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pipeline-container {
  width: 100%;
  overflow: hidden;
}
.pipeline-scroll {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  min-height: 300px;
}
.pipeline-scroll::-webkit-scrollbar { height: 6px; }
.pipeline-scroll::-webkit-scrollbar-track { background: transparent; }
.pipeline-scroll::-webkit-scrollbar-thumb { background: rgba(0, 50, 116, 0.15); border-radius: 3px; }

.pipeline-column {
  flex: 0 0 180px;
  display: flex;
  flex-direction: column;
}

.column-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0.6rem 0.75rem;
  font-size: 12px;
  font-weight: 700;
  color: #333;
  border-top: 3px solid;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8px 8px 0 0;
  backdrop-filter: blur(8px);
}
.column-label { flex: 1; white-space: nowrap; }
.column-count {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}

.column-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(0, 50, 116, 0.02);
  border-radius: 0 0 8px 8px;
  min-height: 100px;
}

.pipe-card {
  padding: 0.65rem 0.75rem;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
}
.pipe-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(0, 50, 116, 0.12);
}

.pipe-card-name {
  font-size: 13px;
  font-weight: 600;
  color: #003274;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pipe-card-meta {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}
.pipe-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}
.pipe-role {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
  background: rgba(82, 201, 166, 0.15);
  color: #1d7a5f;
  font-weight: 700;
}

.pipe-card-footer {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #6B7280;
}
.pipe-operator { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90px; }

.column-empty {
  text-align: center;
  color: #D1D7DE;
  font-size: 14px;
  padding: 2rem 0;
}

@media (max-width: 768px) {
  .pipeline-column { flex: 0 0 160px; }
}
</style>
