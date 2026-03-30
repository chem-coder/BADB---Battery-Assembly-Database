<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import Toast from 'primevue/toast'

const contentEl = ref(null)
const isScrolled = ref(false)
let rafId = null

/* ── Scroll handler ──
   1. Toggle isScrolled for PageHeader shadow
   2. Per-element pixel-precise mask: each card is masked based on
      how many pixels of it are behind the header.
      Fade zone = from header bottom to midpoint(headerTop, containerTop).
      Cards fully above that midpoint → 100% transparent.
      Cards fully below header bottom → 100% visible, no mask.
      PageHeader is NEVER touched.                                    */
function handleScroll () {
  const el = contentEl.value
  if (!el) return

  isScrolled.value = el.scrollTop > 2

  const header = el.querySelector('.page-header')
  if (!header) return

  const containerTop = el.getBoundingClientRect().top
  const headerRect = header.getBoundingClientRect()

  // Line where fade begins (100% opaque below this)
  const fadeStartY = headerRect.bottom
  // Line where objects are 100% transparent: slightly above the blue frame.
  // Extends fade zone beyond the container for an even softer gradient.
  const fullyHiddenY = containerTop - 20
  // Gradient zone size in pixels
  const fadeZone = fadeStartY - fullyHiddenY

  // Select only top-level cards (not nested .glass-card inside card demos)
  const allEls = el.querySelectorAll('.glass-card, section, .p-card')
  for (const card of allEls) {
    // Skip header
    if (card.classList.contains('page-header')) continue
    // Skip nested glass-cards (inside another glass-card, e.g. card demos)
    if (card.parentElement && card.parentElement.closest('.glass-card')) continue

    const rect = card.getBoundingClientRect()

    if (rect.top >= fadeStartY) {
      // Fully below header — visible, clear mask
      card.style.removeProperty('mask-image')
      card.style.removeProperty('-webkit-mask-image')
      continue
    }

    if (rect.bottom <= fullyHiddenY) {
      // Fully above the hidden line — completely invisible
      card.style.maskImage = 'linear-gradient(transparent, transparent)'
      card.style.webkitMaskImage = 'linear-gradient(transparent, transparent)'
      continue
    }

    // How many pixels of the card's top are above the fade start (header bottom)
    const overlap = fadeStartY - rect.top
    if (overlap <= 0) {
      card.style.removeProperty('mask-image')
      card.style.removeProperty('-webkit-mask-image')
      continue
    }

    // Fully transparent zone: pixels that have scrolled past the gradient
    const solidHidden = Math.max(0, overlap - fadeZone)
    // Mask: transparent from 0→solidHidden, gradient from solidHidden→overlap, black after
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
  // РЭНЕРА pattern — randomised on each load
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
    <AppSidebar />
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

/* ── Scroll container — cards untouched by default, JS handles masks ── */
.app-content {
  flex: 1;
  padding: var(--inset);
  background: transparent;
  height: 100%;
  overflow-y: auto;
  position: relative;
  z-index: 1;
}

/* ── PageHeader: pinned in place, NEVER affected by fade ── */
.app-content :deep(.page-header) {
  top: var(--inset);
  transition: box-shadow 0.4s ease;
}
.app-content.scrolled :deep(.page-header) {
  box-shadow:
    0 3px 12px rgba(0, 50, 116, 0.10),
    0 0 0 0.5px rgba(180, 210, 255, 0.35);
}
</style>
