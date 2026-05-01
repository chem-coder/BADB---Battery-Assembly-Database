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
  <!-- `is-mobile-open` is the single source of truth for "drawer is
       on screen" — both the sidebar transform AND the overlay key off
       this one class on the root, so there's no chance of the two
       getting out of sync via component-class fallthrough. -->
  <div class="app-layout" :class="{ 'is-mobile-open': sidebarOpen }">

    <!-- Mobile hamburger button -->
    <button
      class="hamburger-btn"
      :class="{ open: sidebarOpen }"
      :aria-label="sidebarOpen ? 'Закрыть меню' : 'Открыть меню'"
      :aria-expanded="sidebarOpen"
      @click="toggleSidebar"
    >
      <i :class="sidebarOpen ? 'pi pi-times' : 'pi pi-bars'" />
    </button>

    <!-- Sidebar overlay — visible only when sidebar is open AND the
         media query is mobile-active. Tap closes the drawer. -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="closeSidebar" />

    <AppSidebar @navigate="closeSidebar" />
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

/* ── Hamburger button (hidden on desktop) ──
   Glass-card styling — matches the rest of the design system
   (translucent white over the page-content background, soft border,
   subtle shadow). Closed state: cream-on-navy primary look that
   reads on top of the patterned content. Open state: inverts to
   solid navy so it pairs visually with the dark sidebar drawer
   that's now on screen. */
.hamburger-btn {
  display: none;
  position: fixed;
  top: 0.625rem;
  left: 0.625rem;
  z-index: 1100;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(0, 50, 116, 0.18);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #003274;
  font-size: 1rem;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 50, 116, 0.08), 0 1px 2px rgba(0, 50, 116, 0.06);
  transition:
    background 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.12s ease;
}
.hamburger-btn:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 50, 116, 0.32);
  box-shadow: 0 2px 6px rgba(0, 50, 116, 0.12), 0 1px 2px rgba(0, 50, 116, 0.08);
}
.hamburger-btn:active {
  transform: scale(0.96);
}
.hamburger-btn:focus-visible {
  outline: 2px solid rgba(0, 50, 116, 0.45);
  outline-offset: 2px;
}
.hamburger-btn.open {
  background: rgba(0, 50, 116, 0.92);
  color: #fff;
  border-color: rgba(0, 50, 116, 0.92);
  box-shadow: 0 2px 8px rgba(0, 50, 116, 0.25);
}
.hamburger-btn .pi {
  /* Icon weight: PrimeIcons render slightly thick at default size;
     16 px keeps the bars visually balanced inside a 40 px button. */
  font-size: 16px;
  transition: transform 0.18s ease;
}
.hamburger-btn.open .pi {
  /* Subtle quarter-turn entrance for the close (×) icon — feels
     more deliberate than a hard swap. */
  transform: rotate(90deg);
}

/* ── Sidebar overlay (hidden on desktop) ── */
.sidebar-overlay {
  display: none;
}

/* ══════════════════════════════════════════════════════════════
   MOBILE — ≤ 1024px (covers phones AND tablets in both
   orientations; modern laptops start ≥ 1280px so they keep the
   desktop layout). Single owner of the mobile sidebar drawer
   logic — AppSidebar.vue's old @media block was removed to avoid
   specificity wars between the two scoped CSS contexts.
   ══════════════════════════════════════════════════════════════ */
@media (max-width: 1024px) {
  .app-layout {
    --frame: 0;
    --inset: 1rem;
  }

  .hamburger-btn { display: flex; align-items: center; justify-content: center; }

  /* Sidebar: hidden off-screen by default, slides in when the root
     `.app-layout` carries `.is-mobile-open`. `:deep()` reaches into
     AppSidebar's scoped CSS so we don't need a chained class on the
     child component. */
  .app-layout :deep(.sidebar) {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1000;
    height: 100vh;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.3);
  }
  .app-layout.is-mobile-open :deep(.sidebar) {
    transform: translateX(0);
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 999;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
  }

  /* Main content card: full bleed, no margin/border. */
  .app-main {
    margin: 0;
    border-radius: 0;
    height: 100vh;
    border: none;
  }

  /* Reserve space for hamburger overlay so page content doesn't
     hide behind it. */
  .app-content {
    padding: 3.5rem 0.75rem 1rem;
  }

  /* Dialogs: fit to screen with margin. */
  :deep(.p-dialog) {
    max-width: calc(100vw - 1rem) !important;
    width: auto !important;
    margin: 0.5rem !important;
  }
  :deep(.p-dialog .p-dialog-content) {
    padding: 0.75rem 1rem;
  }
  :deep(.p-dialog .p-dialog-header),
  :deep(.p-dialog .p-dialog-footer) {
    padding: 0.75rem 1rem;
  }

  /* Glass-card padding tighten — desktop's 1rem+ is wasted space on phones. */
  :deep(.glass-card) {
    padding: 0.75rem;
  }

  /* CrudTable toolbar wraps; let column controls stack. */
  :deep(.ct-toolbar) {
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem;
  }
  /* PrimeVue DataTable — horizontal scroll instead of cropping/wrapping
     cells. PrimeVue already makes the inner table scroll inside its
     wrapper; we just make sure the wrapper's overflow is honored. */
  :deep(.p-datatable-wrapper) {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* HomePage grid: 2-up KPIs, single-column for the rest. */
  :deep(.kpi-grid) {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  :deep(.recent-grid) {
    grid-template-columns: 1fr !important;
  }

  /* Touch-target floor: 38 px on common controls (the strict 44 px
     iOS guideline produces oversized buttons next to compact rows
     in the lab UI; 38 px is still tap-friendly without dwarfing the
     rest of the layout). */
  :deep(.p-button) {
    min-height: 38px;
  }
  :deep(.p-inputtext),
  :deep(.p-select),
  :deep(.p-inputnumber-input),
  :deep(.p-textarea) {
    min-height: 38px;
  }

  /* PageHeader keeps its height but the inset content reflows
     naturally (already a flex container). */
  :deep(.page-header) {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* Body background: while the drawer is open, lock the scroll on
     the underlying main content so swipes inside the menu don't
     bleed into the page. */
}
.app-layout.is-mobile-open :deep(.app-content) {
  overflow: hidden;
}

/* ══════════════════════════════════════════════════════════════
   TABLET — narrow desktops 1025px-1279px keep the full sidebar
   but tighten the inset slightly so dense pages fit.
   ══════════════════════════════════════════════════════════════ */
@media (min-width: 1025px) and (max-width: 1279px) {
  .app-layout {
    --inset: 1.25rem;
  }
}
</style>
