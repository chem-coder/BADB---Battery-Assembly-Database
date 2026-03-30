<template>
  <div v-if="stages.length" class="gantt-wrap glass-card">
    <div v-for="stage in stages" :key="stage.name" class="gantt-row">
      <span class="gantt-label">{{ stage.name }}</span>
      <div class="gantt-track">
        <div
          class="gantt-bar"
          :class="stage.status"
          :style="barStyle(stage)"
        />
      </div>
      <span class="gantt-meta">
        <i :class="statusIcon(stage.status)" class="gantt-icon"></i>
        <span class="gantt-operator">{{ stage.operator || '—' }}</span>
        <span class="gantt-date">{{ formatDate(stage.startedAt) }}</span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  stages: {
    type: Array, // [{ name, operator, startedAt, completedAt, status }]
    default: () => []
  }
})

// Compute time range for bar positioning
const timeRange = computed(() => {
  const times = props.stages
    .filter(s => s.startedAt)
    .map(s => new Date(s.startedAt).getTime())
    .filter(t => Number.isFinite(t))
  if (!times.length) return { min: 0, max: 0, span: 0 }
  const min = Math.min(...times)
  const max = Math.max(...times)
  // Add 10% padding to the right
  const span = (max - min) || 86400000 // at least 1 day
  return { min, max, span: span * 1.1 }
})

function barStyle(stage) {
  if (!stage.startedAt || !timeRange.value.span) {
    return { left: '0%', width: '0%' }
  }
  const t = new Date(stage.startedAt).getTime()
  if (!Number.isFinite(t)) return { left: '0%', width: '0%' }

  const left = ((t - timeRange.value.min) / timeRange.value.span) * 100
  // Bar width: completed stages get width to next stage or 15%, active gets 10%
  const width = stage.status === 'done' ? 15 : stage.status === 'active' ? 10 : 0
  return { left: `${Math.max(0, left)}%`, width: `${width}%` }
}

function statusIcon(status) {
  if (status === 'done') return 'pi pi-check-circle'
  if (status === 'active') return 'pi pi-bolt'
  return 'pi pi-circle'
}

function formatDate(dt) {
  if (!dt) return '—'
  const d = new Date(dt)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}
</script>

<style scoped>
.gantt-wrap {
  padding: 0.5rem 0.75rem;
  margin-bottom: 1rem;
}

.gantt-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 26px;
}

.gantt-label {
  width: 180px;
  flex-shrink: 0;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--p-surface-700);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gantt-track {
  flex: 1;
  height: 10px;
  background: var(--p-surface-100);
  border-radius: 5px;
  position: relative;
  overflow: hidden;
}

.gantt-bar {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 5px;
  transition: left 0.3s, width 0.3s;
}

.gantt-bar.done { background: #2ECC94; }
.gantt-bar.active { background: #F39C12; }
.gantt-bar.pending { background: var(--p-surface-200); }

.gantt-meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  width: 180px;
  font-size: 0.8rem;
  color: var(--p-surface-600);
}

.gantt-icon { font-size: 0.85rem; }
.gantt-icon.pi-check-circle { color: #2ECC94; }
.gantt-icon.pi-bolt { color: #F39C12; }
.gantt-icon.pi-circle { color: var(--p-surface-300); }

.gantt-operator {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.gantt-date {
  color: var(--p-surface-400);
  white-space: nowrap;
}
</style>
