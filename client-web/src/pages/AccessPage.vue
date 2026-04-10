<script setup>
/**
 * AccessPage — admin-only page for visualizing project access.
 * Three tabs: Matrix / Graph / Timeline (like HomePage dashboard pattern).
 */
import { ref, defineAsyncComponent } from 'vue'
import PageHeader from '@/components/PageHeader.vue'

const AccessMatrix = defineAsyncComponent(() => import('@/components/AccessMatrix.vue'))
const AccessGraph = defineAsyncComponent(() => import('@/components/AccessGraph.vue'))
const AccessTimeline = defineAsyncComponent(() => import('@/components/AccessTimeline.vue'))

const activeTab = ref('matrix') // 'matrix' | 'graph' | 'timeline'
</script>

<template>
  <div class="access-page">
    <PageHeader title="Управление доступом" icon="pi pi-shield" />

    <!-- Tab switcher -->
    <div class="tab-switcher">
      <button :class="['tab-btn', activeTab === 'matrix' ? 'active' : '']" @click="activeTab = 'matrix'">
        <i class="pi pi-table"></i> Матрица
      </button>
      <button :class="['tab-btn', activeTab === 'graph' ? 'active' : '']" @click="activeTab = 'graph'">
        <i class="pi pi-sitemap"></i> Граф доступов
      </button>
      <button :class="['tab-btn', activeTab === 'timeline' ? 'active' : '']" @click="activeTab = 'timeline'">
        <i class="pi pi-history"></i> Timeline аудита
      </button>
    </div>

    <!-- Content -->
    <div class="tab-content">
      <AccessMatrix v-if="activeTab === 'matrix'" />
      <AccessGraph v-else-if="activeTab === 'graph'" />
      <AccessTimeline v-else-if="activeTab === 'timeline'" />
    </div>
  </div>
</template>

<style scoped>
.access-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.access-page :deep(.page-header) { margin-bottom: 3px !important; }

.tab-switcher {
  display: flex;
  gap: 0.25rem;
  background: rgba(0, 50, 116, 0.04);
  padding: 4px;
  border-radius: 10px;
  width: fit-content;
}
.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0.45rem 1rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #6B7280;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.tab-btn:hover { color: #003274; background: rgba(255, 255, 255, 0.5); }
.tab-btn.active {
  background: rgba(255, 255, 255, 0.85);
  color: #003274;
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 50, 116, 0.1);
}
.tab-btn i { font-size: 13px; }

.tab-content { min-height: 500px; }
</style>
