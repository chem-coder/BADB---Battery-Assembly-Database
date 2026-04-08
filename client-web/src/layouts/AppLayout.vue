<script setup>
import { ref, onMounted, onUnmounted, provide } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import Toast from 'primevue/toast'

const contentEl = ref(null)
const isScrolled = ref(false)
let rafId = null

// ── Mobile sidebar toggle ──
const sidebarOpen = ref(false)
provide('sidebarOpen', sidebarOpen)

function toggleSidebar() { sidebarOpen.value = !sidebarOpen.value }
function closeSidebar() { sidebarOpen.value = false }

/* ── Scroll handler ── */
function handleScroll () {
  const el = contentEl.value
  if (!el) return

  isScrolled.value = el.scrollTop > 2

  const header = el.querySelector('.page-header')
  if (!header) return

  const containerTop = el.getBoundingClientRect().top
  const headerRect = header.getBoundingClientRect()

  const fadeStartY = headerRect.bottom
  const fullyHiddenY = containerTop - 20
  const fadeZone = fadeStartY - fullyHiddenY

  const allEls = el.querySelectorAll('.glass-card, section, .p-card')
  for (const card of allEls) {
    if (card.classList.contains('page-header')) continue
    if (card.parentElement && card.parentElement.closest('.glass-card')) continue

    const rect = card.getBoundingClientRect()

    if (rect.top >= fadeStartY) {
      card.style.removeProperty('mask-image')
      card.style.removeProperty('-webkit-mask-image')
      continue
    }

    if (rect.bottom <= fullyHiddenY) {
      card.style.maskImage = 'linear-gradient(transparent, transparent)'
      card.style.webkitMaskImage = 'linear-gradient(transparent, transparent)'
      continue
    }

    const overlap = fadeStartY - rect.top
    if (overlap <= 0) {
      card.style.removeProperty('mask-image')
      card.style.removeProperty('-webkit-mask-image')
      continue
    }

    const solidHidden = Math.max(0, overlap - fadeZone)
    const mask = `linear-gradient(to bottom, transparent ${solidHidden}px, black ${overlap}px)`
    card.style.maskImage = mask
    card.style.webkitMaskImage = mask
  }
}

function onScrollThrottled () {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    handleScroll()
    rafId = null
  })
}

onMounted(() => {
  if (contentEl.value) {
    contentEl.value.addEventListener('scroll', onScrollThrottled, { passive: true })
  }
  const images = [
    "/assets/renera-pattern-1.webp",
    "/assets/renera-pattern-2.webp",
  ]
  const img = images[Math.floor(Math.random() * images.length)]
  const xSteps = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]
  const ySteps = [15, 30, 45, 60, 75]
  const x = xSteps[Math.floor(Math.random() * xSteps.length)]
  const y = ySteps[Math.floor(Math.random() * ySteps.length)]

  const root = document.documentElement
  root.style.setProperty('--pattern-img',   `url('${img}')`)
  root.style.setProperty('--pattern-pos-x', `${x}%`)
  root.style.setProperty('--pattern-pos-y', `${y}%`)
})

onUnmounted(() => {
  if (contentEl.value) {
    contentEl.value.removeEventListener('scroll', onScrollThrottled)
  }
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="app-layout">

    <!-- Mobile hamburger button -->
    <button class="hamburger-btn" :class="{ open: sidebarOpen }" @click="toggleSidebar">
      <i :class="sidebarOpen ? 'pi pi-times' : 'pi pi-bars'" />
    </button>

    <!-- Sidebar overlay (mobile) -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="closeSidebar" />

    <AppSidebar :class="{ 'sidebar--open': sidebarOpen }" @navigate="closeSidebar" />
    <div class="app-main">
      <Toast position="top-right" />
      <main ref="contentEl" class="app-content" :class="{ scrolled: isScrolled }">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ══════════════════════════════════════════════════════════════ */
.app-layout {
  --frame: 0.5rem;
  --inset: 1.75rem;
}

/* ── Outer frame ── */
.app-layout {
  display: flex;
  flex-direction: row;
  min-height: 100vh;
  background: #003274;
  position: relative;
}

/* ── Main content card ── */
.app-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: calc(100vh - var(--frame) * 2);
  margin: var(--frame);
  border-radius: 14px;
  border: 1px solid rgba(180, 210, 255, 0.4);
  box-shadow: inset 0 0 20px rgba(0, 50, 116, 0.2), inset 0 0 4px rgba(0, 50, 116, 0.15);
  background: linear-gradient(135deg, #D8E2EC 0%, #E8EDF5 50%, #F0F4F8 100%) fixed;
  overflow: hidden;
  position: relative;
}

/* РЭНЕРА pattern */
.app-main::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:   var(--pattern-img,   url('/assets/renera-pattern-1.webp'));
  background-position: var(--pattern-pos-x, 50%) var(--pattern-pos-y, 30%);
  background-size:    cover;
  background-repeat:  no-repeat;
  opacity: 0.19;
  pointer-events: none;
  z-index: 0;
}

/* ── Scroll container ── */
.app-content {
  flex: 1;
  padding: var(--inset);
  background: transparent;
  height: 100%;
  overflow-y: auto;
  position: relative;
  z-index: 1;
}

/* ── PageHeader: pinned in place ── */
.app-content :deep(.page-header) {
  top: var(--inset);
  transition: box-shadow 0.4s ease;
}
.app-content.scrolled :deep(.page-header) {
  box-shadow:
    0 3px 12px rgba(0, 50, 116, 0.10),
    0 0 0 0.5px rgba(180, 210, 255, 0.35);
}

/* ── Hamburger button (hidden on desktop) ── */
.hamburger-btn {
  display: none;
  position: fixed;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 1100;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 10px;
  background: #003274;
  color: #fff;
  font-size: 1.2rem;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 50, 116, 0.3);
  transition: background 0.15s;
}
.hamburger-btn:hover { background: #025EA1; }
.hamburger-btn.open { background: rgba(0, 50, 116, 0.8); }

/* ── Sidebar overlay (hidden on desktop) ── */
.sidebar-overlay {
  display: none;
}

/* ══════════════════════════════════════════════════════════════
   MOBILE — < 768px
   ══════════════════════════════════════════════════════════════ */
@media (max-width: 768px) {
  .app-layout {
    --frame: 0;
    --inset: 1rem;
  }

  .hamburger-btn { display: flex; align-items: center; justify-content: center; }

  /* Sidebar: hidden by default, slides in as overlay */
  .app-layout :deep(.sidebar) {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1000;
    height: 100vh;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
  }
  .app-layout :deep(.sidebar--open.sidebar),
  .app-layout .sidebar--open :deep(.sidebar) {
    transform: translateX(0);
  }
  /* Direct class on AppSidebar root */
  .sidebar--open {
    transform: translateX(0) !important;
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 999;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
  }

  /* Main takes full width */
  .app-main {
    margin: 0;
    border-radius: 0;
    height: 100vh;
    border: none;
  }

  .app-content {
    padding-top: 3.5rem; /* space for hamburger */
  }

  /* Dialogs: max-width instead of fixed width */
  :deep(.p-dialog) {
    max-width: calc(100vw - 2rem) !important;
    width: auto !important;
    margin: 1rem !important;
  }

  /* CrudTable toolbar: wrap on mobile */
  :deep(.ct-toolbar) {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* HomePage grid: single column */
  :deep(.kpi-grid) {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  :deep(.recent-grid) {
    grid-template-columns: 1fr !important;
  }
}

/* ══════════════════════════════════════════════════════════════
   TABLET — 769px to 1024px
   ══════════════════════════════════════════════════════════════ */
@media (min-width: 769px) and (max-width: 1024px) {
  .app-layout {
    --inset: 1.25rem;
  }

  :deep(.p-dialog) {
    max-width: calc(100vw - 4rem) !important;
  }
}
</style>
