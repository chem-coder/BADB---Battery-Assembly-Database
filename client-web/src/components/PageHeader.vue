<script setup>
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'

defineProps({
  title:    { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon:     { type: String, default: '' },
  backTo:   { type: String, default: '' },
})

const route = useRoute()

// Breadcrumbs: shown on all pages except root /
// Current page title is NOT added to crumbs — H1 below already shows it
const showCrumbs = computed(() => route.path !== '/')
const crumbs = computed(() => [
  { label: 'Главная', to: '/' },
  ...(route.meta.crumbs ?? []),
])
</script>

<template>
  <div class="page-header glass-card">

    <!-- Title row -->
    <div class="page-header-row">
      <div class="page-header-left">
        <RouterLink v-if="backTo" :to="backTo" class="page-back-btn" title="Назад">
          <i class="pi pi-arrow-left"></i>
        </RouterLink>
        <i v-if="icon" :class="icon" class="page-header-icon"></i>
        <div>
          <h1 class="page-header-title">{{ title }}</h1>
          <p v-if="subtitle" class="page-header-subtitle">{{ subtitle }}</p>
        </div>
      </div>
      <div class="page-header-actions">
        <slot name="actions" />
      </div>
    </div>

    <!-- Breadcrumbs — below the title, shown on all pages except / -->
    <nav v-if="showCrumbs" class="page-breadcrumb" aria-label="Навигация">
      <template v-for="(crumb, i) in crumbs" :key="i">
        <span v-if="i > 0" class="crumb-sep">›</span>
        <RouterLink v-if="crumb.to" :to="crumb.to" class="crumb-link">{{ crumb.label }}</RouterLink>
        <span v-else class="crumb-text">{{ crumb.label }}</span>
      </template>
      <span class="crumb-sep">›</span>
      <span class="crumb-current">{{ title }}</span>
    </nav>

  </div>
</template>

<style scoped>
.page-header {
  /* Sticky card — layout only. Visual styles come from .glass-card */
  position: sticky;
  top: 0;
  z-index: 20;
  margin: 0 0 1rem 0;
  padding: 1.1rem 1.5rem 0.875rem;
}

/* Breadcrumbs row */
.page-breadcrumb {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  margin-top: 5px;
}

.crumb-sep { color: #C0C7D0; font-size: 11px; margin: 0 1px; }

/* Pill-chip style — each parent crumb is a frosted glass pill */
.crumb-link {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 20px;
  background: rgba(0, 50, 116, 0.07);
  border: 0.5px solid rgba(0, 50, 116, 0.14);
  color: #003274;
  font-size: 11px;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}
.crumb-link:hover {
  background: rgba(0, 50, 116, 0.13);
  color: #025EA1;
  text-decoration: none;
}

.crumb-text    { color: #A8B0B8; font-size: 11px; } /* non-link crumb (section labels) */
.crumb-current { color: #6B7280; font-size: 11px; } /* active page — plain text, no pill */

/* Title row */
.page-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #003274;
  transition: background 0.15s;
  text-decoration: none;
  flex-shrink: 0;
}
.page-back-btn:hover { background: rgba(0, 50, 116, 0.07); }

.page-header-icon {
  font-size: 1.15rem;
  color: #003274;
  opacity: 0.55;
  flex-shrink: 0;
}

.page-header-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #003274;
}

.page-header-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--p-surface-600);
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
