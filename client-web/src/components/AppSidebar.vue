<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { workflowSections, testSections, referenceSections, adminSections } from '@/config/navigation'
import tvelLogo from '@/assets/logo/TVEL_horizontal_light.svg'

const emit = defineEmits(['navigate'])
const router = useRouter()
const authStore = useAuthStore()

const isAdmin = computed(() => authStore.user?.role === 'admin')
const isLead  = computed(() => ['admin', 'lead'].includes(authStore.user?.role))

const roleLabel = computed(() => ({
  admin:    'Администратор',
  lead:     'Ведущий специалист',
  employee: 'Сотрудник',
}[authStore.user?.role] ?? ''))

// ── Per-user UI settings (localStorage keyed by userId) ──────────────────
function settingsKey() {
  return `badb-ui-${authStore.user?.userId ?? 'guest'}`
}
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(settingsKey()) ?? '{}') } catch { return {} }
}
function saveSettings(s) {
  localStorage.setItem(settingsKey(), JSON.stringify(s))
}

// ── Collapsible sections ──────────────────────────────────────────────────
const collapsed  = ref({})
const animating  = ref({})   // tracks which folder icon is mid-animation

// ── Desktop rail collapse (220px ↔ 64px icon rail) ─────────────────────────
// Persisted per user alongside the section state. Desktop-only: on mobile the
// sidebar is a full-width drawer (see AppLayout), so the rail rules are gated
// behind @media (min-width: 1025px) and the toggle is hidden on small screens.
const railCollapsed = ref(false)

onMounted(() => {
  const s = loadSettings()
  collapsed.value = s.collapsedSections ?? {}
  railCollapsed.value = s.railCollapsed ?? false
})

function toggleRail() {
  railCollapsed.value = !railCollapsed.value
  const s = loadSettings()
  s.railCollapsed = railCollapsed.value
  saveSettings(s)
}

function toggleSection(name) {
  collapsed.value = { ...collapsed.value, [name]: !collapsed.value[name] }
  const s = loadSettings()
  s.collapsedSections = collapsed.value
  saveSettings(s)

  // Trigger folder icon "pop" animation
  animating.value = { ...animating.value, [name]: true }
  setTimeout(() => {
    animating.value = { ...animating.value, [name]: false }
  }, 360)
}

// ── Menu definition — built from config/navigation.js (single source of truth) ──
const sections = computed(() => {
  const mapItem = s => ({ label: s.label, to: s.path, icon: s.icon, customIcon: s.customIcon ?? null })

  const list = [
    {
      section: 'СОЗДАНИЕ',
      items: workflowSections.map(mapItem),
    },
    {
      section: 'ИСПЫТАНИЯ',
      items: testSections.map(mapItem),
    },
    {
      section: 'СПРАВОЧНИКИ',
      items: referenceSections.map(mapItem),
    },
  ]

  if (isLead.value) {
    // Role hierarchy: admin > lead > employee. Admin sees everything.
    const userRole = authStore.user?.role
    const adminItems = adminSections
      .filter(s => {
        if (!s.role) return true                    // no role requirement
        if (userRole === 'admin') return true       // admin passes all
        return userRole === s.role                  // exact match for non-admin
      })
      .map(mapItem)
    list.push({ section: 'АДМИНИСТРИРОВАНИЕ', items: adminItems })
  }

  return list
})

function onNav() { emit('navigate') }

function logout() {
  authStore.logout()
  router.push('/login')
  emit('navigate')
}

// Hard refresh — everything a regular Cmd+Shift+R doesn't cover.
// Wipes Cache API (PWA / service-worker caches), unregisters service
// workers, then reloads the page with a cache-busting timestamp.
// Use after a CSS / JS / config update when stale assets are suspected.
async function hardRefresh() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch (err) {
    // Non-fatal — proceed to reload regardless.
    console.warn('hardRefresh cleanup failed:', err)
  }
  const url = new URL(window.location.href)
  url.searchParams.set('_t', String(Date.now()))
  window.location.replace(url.toString())
}
</script>

<template>
  <aside class="sidebar" :class="{ 'is-rail': railCollapsed }">

    <!-- Logo + rail toggle -->
    <div class="sidebar-header">
      <img :src="tvelLogo" alt="TVEL" class="sidebar-logo-img rail-hide" />
      <button
        class="sidebar-rail-toggle"
        @click="toggleRail"
        :title="railCollapsed ? 'Развернуть меню' : 'Свернуть меню'"
        :aria-label="railCollapsed ? 'Развернуть меню' : 'Свернуть меню'"
      >
        <i class="pi" :class="railCollapsed ? 'pi-angle-double-right' : 'pi-angle-double-left'"></i>
      </button>
    </div>

    <nav class="sidebar-nav">

      <!-- Главная — standalone at top -->
      <RouterLink to="/" class="sidebar-item" exact-active-class="active" @click="onNav" :title="railCollapsed ? 'Главная' : null">
        <i class="pi pi-home"></i>
        <span class="sidebar-item-label">Главная</span>
      </RouterLink>

      <!-- Sections with Arc-style folder animation -->
      <div v-for="group in sections" :key="group.section" class="sidebar-section">

        <button
          class="sidebar-section-title"
          :class="{ 'is-open': !collapsed[group.section] }"
          @click="toggleSection(group.section)"
        >
          <!-- Folder icon: closed ↔ open, with pop animation on toggle -->
          <i
            class="pi sidebar-folder-icon"
            :class="[
              collapsed[group.section] ? 'pi-folder' : 'pi-folder-open',
              animating[group.section]  ? 'sidebar-folder-icon--pop' : '',
            ]"
          />
          <span class="sidebar-section-label">{{ group.section }}</span>
        </button>

        <!-- Items — slide + fade out from under the folder -->
        <div
          class="section-items"
          :class="{ 'section-items--collapsed': collapsed[group.section] }"
        >
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="sidebar-item sidebar-item--nested"
            active-class="active"
            @click="onNav"
            :title="railCollapsed ? item.label : null"
          >
            <!-- Custom SVG: droplet -->
            <svg v-if="item.customIcon === 'droplet'" class="sidebar-custom-icon" viewBox="0 0 18 18">
              <path d="M9 1.5 C9 1.5, 3.5 8, 3.5 11.5 C3.5 14.8, 6 16.5, 9 16.5 C12 16.5, 14.5 14.8, 14.5 11.5 C14.5 8, 9 1.5, 9 1.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <!-- Custom: vertical line (separator) -->
            <span v-else-if="item.customIcon === 'vline'" class="sidebar-icon-vline"></span>
            <!-- Standard PrimeIcon -->
            <i v-else :class="item.icon"></i>
            <span class="sidebar-item-label">{{ item.label }}</span>
          </RouterLink>
        </div>

      </div>
    </nav>

    <!-- User block -->
    <div class="sidebar-user-block">
      <div class="sidebar-user-info">
        <span class="user-name">{{ authStore.user?.name }}</span>
        <span class="user-role">{{ roleLabel }}</span>
      </div>
      <RouterLink to="/profile" class="sidebar-item" active-class="active" @click="onNav" :title="railCollapsed ? 'Профиль' : null">
        <i class="pi pi-user"></i>
        <span class="sidebar-item-label">Профиль</span>
      </RouterLink>
      <button
        class="sidebar-item sidebar-refresh"
        @click="hardRefresh"
        :title="railCollapsed ? 'Обновить' : 'Полное обновление с очисткой кэша браузера'"
      >
        <i class="pi pi-refresh"></i>
        <span class="sidebar-item-label">Обновить</span>
      </button>
      <button class="sidebar-item sidebar-logout" @click="logout" :title="railCollapsed ? 'Выйти' : null">
        <i class="pi pi-sign-out"></i>
        <span class="sidebar-item-label">Выйти</span>
      </button>
    </div>

  </aside>
</template>

<style scoped>
/* ── Sidebar shell ─────────────────────────────────────────────────────── */
.sidebar {
  width: 220px;
  min-width: 220px;
  max-width: 220px;
  background: #003274;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: sticky;
  top: 0;
}

/* РЭНЕРА pattern — very subtle, must not shift #003274 hue */
.sidebar::before {
  content: '';
  position: absolute;
  inset: 0;
  background: url('/assets/renera-pattern-white.webp') center 40% / cover no-repeat;
  filter: blur(3px);
  opacity: 0.07;
  pointer-events: none;
  z-index: 0;
}

/* ── All content sits above ::before ── */
.sidebar-header,
.sidebar-nav,
.sidebar-user-block {
  position: relative;
  z-index: 1;
}

/* ── Header ────────────────────────────────────────────────────────────── */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 1.25rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}
.sidebar-logo-img { height: 28px; }

/* Rail toggle — collapse/expand the desktop sidebar to an icon rail */
.sidebar-rail-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.sidebar-rail-toggle:hover { background: rgba(255, 255, 255, 0.16); color: #fff; }
.sidebar-rail-toggle .pi { font-size: 0.85rem; }

/* ── Nav scroll ────────────────────────────────────────────────────────── */
.sidebar-nav {
  flex: 1;
  overflow-y: scroll;            /* always show — disables macOS overlay mode */
  padding: 0.5rem 6px 0.25rem 0;
}
/* Sidebar scrollbar — white, offset from edge */
.sidebar-nav::-webkit-scrollbar { width: 4px; }
.sidebar-nav::-webkit-scrollbar-track { background: transparent; }
.sidebar-nav::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.35); border-radius: 2px; }
.sidebar-nav::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.55); }
.sidebar-nav { scrollbar-color: rgba(255, 255, 255, 0.35) transparent; }

/* ── Section header — folder icon + label ─────────────────────────────── */
.sidebar-section { margin-bottom: 0.15rem; }

.sidebar-section-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.65rem 1rem 0.3rem;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s;
}
.sidebar-section-title:hover { color: rgba(255, 255, 255, 0.72); }
.sidebar-section-title.is-open { color: rgba(255, 255, 255, 0.6); }

/* ── Folder icon ─────────────────────────────────────────────────────── */
.sidebar-folder-icon {
  font-size: 0.9rem;
  width: 1rem;
  text-align: center;
  flex-shrink: 0;
  /* Smooth transition between pi-folder and pi-folder-open */
  transition: opacity 0.15s ease;
}

/* Calm folder open animation — gentle scale pulse, no rotation */
@keyframes folderPop {
  0%   { transform: scale(1);    }
  35%  { transform: scale(0.88); }
  70%  { transform: scale(1.08); }
  100% { transform: scale(1);    }
}

.sidebar-folder-icon--pop {
  animation: folderPop 0.28s ease-in-out forwards;
}

.sidebar-section-label {
  /* label text — keeps its own font size set on the button */
  line-height: 1;
}

/* ── Items container — smooth expand/collapse ─────────────────────────── */
.section-items {
  overflow: hidden;
  max-height: 600px;
  opacity: 1;
  /* expand: snappy start, soft landing */
  transition:
    max-height 0.30s cubic-bezier(0.4, 0, 0.2, 1),
    opacity    0.22s ease;

  /* Indent: items start where the folder label text starts.
     Folder title: 1rem padding + 1rem icon + 0.45rem gap = ~2.45rem from left.
     We push the section-items container so item left edges sit there. */
  position: relative;
  padding-left: 1.55rem;
}

/* Vertical connector line — shows items belong to this folder */
.section-items::before {
  content: '';
  position: absolute;
  left: 1.35rem;    /* aligns with left edge of item pills */
  top: 4px;
  bottom: 6px;
  width: 1.5px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 1px;
  pointer-events: none;
}

.section-items--collapsed {
  max-height: 0;
  opacity: 0;
  /* collapse: instant opacity, then height */
  transition:
    max-height 0.26s cubic-bezier(0.4, 0, 0.2, 1),
    opacity    0.14s ease;
}

/* ── Sidebar items — Arc pill style ───────────────────────────────────── */
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 1px 8px;
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  font-size: 0.85rem;
  background: none;
  border: none;
  width: calc(100% - 16px);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s ease, color 0.12s ease;
}
.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.09);
  color: #ffffff;
}

/* Active — fully opaque card pill */
.sidebar-item.active {
  background: #EEF2F7;
  color: #003274;
  font-weight: 600;
}

.sidebar-item i {
  font-size: 0.88rem;
  width: 1.1rem;
  text-align: center;
  flex-shrink: 0;
  opacity: 0.85;
}
.sidebar-item.active i {
  opacity: 1;
  color: #003274;
}

.sidebar-item-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* Nested items — margin already offset by container padding-left,
   make them visually lighter (slightly smaller font, slightly more transparent) */
.sidebar-item--nested {
  font-size: 0.83rem;
}
.sidebar-item--nested.active {
  font-size: 0.83rem;
}

/* ── Custom icons ─────────────────────────────────────────────────────── */
/* SVG droplet (Электролиты) */
.sidebar-custom-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  /* Center within the same 1.1rem slot as <i> icons */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  color: rgba(255, 255, 255, 0.85);
}
.sidebar-item.active .sidebar-custom-icon {
  color: #003274;
}

/* Vertical line (Сепараторы) */
.sidebar-icon-vline {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  flex-shrink: 0;
}
.sidebar-icon-vline::after {
  content: '';
  display: block;
  width: 2px;
  height: 14px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 1px;
}
.sidebar-item.active .sidebar-icon-vline::after {
  background: #003274;
}

/* ── User block ────────────────────────────────────────────────────────── */
.sidebar-user-block {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.4rem 0 0.5rem;
  flex-shrink: 0;
}
.sidebar-user-info {
  padding: 0.6rem 1rem 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.user-name { font-size: 0.85rem; font-weight: 600; color: #ffffff; }
.user-role { font-size: 0.68rem; color: rgba(255, 255, 255, 0.45); }

.sidebar-logout { color: rgba(255, 255, 255, 0.6); }
.sidebar-logout:hover { color: #ff6b6b; background: rgba(231, 76, 60, 0.12); }

/* Hard-refresh action — same muted resting state as logout but hover
   uses brand-friendly mint-green to distinguish it from the destructive
   logout action sitting right below it. */
.sidebar-refresh { color: rgba(255, 255, 255, 0.6); }
.sidebar-refresh:hover { color: #52C9A6; background: rgba(82, 201, 166, 0.12); }
.sidebar-refresh:active i { transform: rotate(360deg); transition: transform 0.5s; }

/* ── Desktop rail (collapsed) mode ──
   Only applies on real desktop widths. On mobile the sidebar is a
   full-width drawer (AppLayout), so rail collapse is disabled and the
   toggle is hidden — a rail makes no sense inside a slide-in drawer. */
@media (min-width: 1025px) {
  .sidebar.is-rail {
    width: 64px;
    min-width: 64px;
    max-width: 64px;
  }
  /* Smooth width animation on collapse/expand. */
  .sidebar { transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1); }

  /* Hide every text label + the full logo when railed. */
  .sidebar.is-rail .sidebar-item-label,
  .sidebar.is-rail .sidebar-section-label,
  .sidebar.is-rail .sidebar-user-info,
  .sidebar.is-rail .rail-hide {
    display: none;
  }

  /* Header: centre the toggle once the logo is hidden. */
  .sidebar.is-rail .sidebar-header {
    justify-content: center;
    padding: 1.25rem 0;
  }

  /* Icons centre in the rail, no gap/indent. */
  .sidebar.is-rail .sidebar-item {
    justify-content: center;
    gap: 0;
    padding: 0.5rem 0;
  }

  /* Section folders don't make sense without labels — hide the headers
     and force all items visible (ignore the accordion collapse state)
     so the rail shows a flat strip of icons. */
  .sidebar.is-rail .sidebar-section-title { display: none; }
  .sidebar.is-rail .section-items {
    max-height: none !important;
    opacity: 1 !important;
    padding-left: 0;
  }
  .sidebar.is-rail .section-items::before { display: none; } /* connector line */
  .sidebar.is-rail .sidebar-section { margin-bottom: 0; }
}

/* ── Mobile ──
   Drawer transform / position-fixed / overlay logic lives in
   AppLayout.vue under `@media (max-width: 1024px)`. Single owner —
   AppSidebar only adds the bits that are intrinsically about the
   sidebar's own internal layout (extra top padding to clear the
   hamburger overlay). */
@media (max-width: 1024px) {
  .sidebar-header {
    padding-top: 3.5rem; /* clear the hamburger button */
  }
  /* Rail collapse is a desktop-only affordance — hide its toggle here. */
  .sidebar-rail-toggle { display: none; }
  /* Slightly tighter spacing on small screens. */
  .sidebar-item {
    padding: 0.55rem 0.75rem;
  }
  .sidebar-section-title {
    padding: 0.55rem 1rem 0.25rem;
  }
}
</style>
