<script setup>
import { computed } from 'vue'
import Tag from 'primevue/tag'

const props = defineProps({ status: { type: String, default: '' } })

const MAP = {
  accepted:   { label: 'Принято',    severity: 'success'   },
  processing: { label: 'В работе',   severity: 'warn'      },
  draft:      { label: 'Черновик',   severity: 'secondary' },
  rejected:   { label: 'Отклонено', severity: 'danger'    },
  active:     { label: 'Активно',    severity: 'success'   },
  inactive:   { label: 'Неактивен', severity: 'secondary' },
}

const label    = computed(() => MAP[props.status]?.label    ?? props.status)
const severity = computed(() => MAP[props.status]?.severity ?? 'secondary')
</script>

<template>
  <Tag :value="label" :severity="severity" rounded class="status-tag" />
</template>

<style scoped>
/* Override PrimeVue Tag bold weight */
:deep(.p-tag.status-tag) {
  font-weight: 400;
  font-size: 12px;
}
</style>
