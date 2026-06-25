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
const showCrumbs = computed(() => route.path !== '/')
const crumbs = computed(() => [
  { label: 'Главная', to: '/' },
  ...(route.meta.crumbs ?? []),
])
</script>

<template>
  <div class="page-header glass-card">
    <div class="page-header-row">
      <div class="page-header-left">
        <RouterLink v-if="backTo" :to="backTo" class="page-back-btn" title="Назад">
          <i class="pi pi-arrow-left"></i>
        </RouterLink>
        <i v-if="icon" :class="icon" class="page-header-icon"></i>
        <h1 class="page-header-title">{{ title }}</h1>
        <span v-if="subtitle" class="page-header-subtitle">{{ subtitle }}</span>

        <!-- Breadcrumb on the SAME line as the title (one-line nav bar) -->
        <nav v-if="showCrumbs" class="page-breadcrumb" aria-label="Навигация">
          <template v-for="(crumb, i) in crumbs" :key="i">
            <RouterLink v-if="crumb.to" :to="crumb.to" class="crumb-link">{{ crumb.label }}</RouterLink>
            <span v-else class="crumb-text">{{ crumb.label }}</span>
            <span class="crumb-sep">›</span>
          </template>
          <span class="crumb-current">{{ title }}</span>
        </nav>
      </div>
      <div class="page-header-actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  /* Thin one-line nav bar pinned flush to the top. Visual styles (translucent
     glass) come from .glass-card. */
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: var(--page-header-h, 46px);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  margin: 0 0 0.75rem 0;
  padding: 0 1.25rem;
}

.page-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.page-header-left {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  flex: 1;
}

.page-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #003274;
  text-decoration: none;
  font-size: 15px;
  flex-shrink: 0;
}
.page-back-btn:hover { color: #025EA1; }

.page-header-icon { font-size: 16px; color: #003274; opacity: 0.7; flex-shrink: 0; }

.page-header-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #003274;
  white-space: nowrap;
}
.page-header-subtitle {
  font-size: 12px;
  color: #6B7280;
  white-space: nowrap;
}

/* Breadcrumb — plain inline text, muted, after the title */
.page-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  min-width: 0;
  overflow: hidden;
}
.crumb-sep { color: #C0C7D0; font-size: 11px; }
.crumb-link {
  color: rgba(0, 50, 116, 0.55);
  text-decoration: none;
  white-space: nowrap;
}
.crumb-link:hover { color: #003274; text-decoration: underline; }
.crumb-text { color: #A8B0B8; white-space: nowrap; }
.crumb-current { color: #6B7280; white-space: nowrap; }

.page-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
</style>
