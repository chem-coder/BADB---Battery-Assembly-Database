<script setup>
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'

const route = useRoute()

// Build breadcrumb trail from route meta.crumbs + current page title
const crumbs = computed(() => {
  const parents = route.meta.crumbs ?? []
  return [...parents, { label: route.meta.title }]
})
</script>

<template>
  <header class="app-header">
    <nav class="breadcrumb" aria-label="Навигация">
      <template v-for="(crumb, i) in crumbs" :key="i">
        <span v-if="i > 0" class="breadcrumb-sep">›</span>
        <RouterLink v-if="crumb.to" :to="crumb.to" class="breadcrumb-link">
          {{ crumb.label }}
        </RouterLink>
        <span
          v-else
          :class="i === crumbs.length - 1 ? 'breadcrumb-current' : 'breadcrumb-text'"
        >
          {{ crumb.label }}
        </span>
      </template>
    </nav>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  padding: 0 1.5rem;
  height: 44px;
  background: #ffffff;
  border-bottom: 1px solid #E8ECF0;
  flex-shrink: 0;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.breadcrumb-sep {
  color: #A8B0B8;
  font-size: 11px;
}

.breadcrumb-link {
  color: #003366;
  text-decoration: none;
  transition: color 0.15s;
}
.breadcrumb-link:hover {
  color: #0055AA;
  text-decoration: underline;
}

.breadcrumb-text {
  color: #6B7280;
}

.breadcrumb-current {
  color: #1A1A2E;
  font-weight: 600;
}
</style>
