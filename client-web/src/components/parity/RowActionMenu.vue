<!--
  RowActionMenu — config-driven row-action icons with an overflow ⋮ menu.

  Fifth Phase A primitive. Replaces the older hardcoded
  `RowActionIcons.vue` (which only knew about print / duplicate) with a
  generic primitive that lets each page describe its own actions.

  Behaviour
  ---------
  - Up to `overflowAfter` actions render as inline icon buttons.
  - Anything beyond that count collapses into a ⋮ overflow menu.
  - Clicking any action emits `action` with the action's `key` and the
    `rowId` prop. Row-click is `stopPropagation`'d so the parent
    CrudTable doesn't also open the row.
  - Each action can carry either a PrimeIcon class (`icon: 'pi-print'`)
    or an emoji (`emoji: '🖨️'`) — emoji wins when both are set.

  Props
  -----
  - `rowId`         identifier passed back in the `action` event
  - `actions`       array of { key, label, icon?, emoji?, hidden? }
  - `overflowAfter` how many actions to show as inline icons before
                    collapsing the rest into the ⋮ menu (default 3)

  Emits
  -----
  - `action` ({ key, rowId })   fired on any click

  See also
  --------
  - `RowActionIcons.vue` — older hardcoded variant; will be migrated
    to use this primitive in Phase C.
  - `docs/instructions/vue-frontend-architecture.md` §3.
-->

<template>
  <span ref="rootEl" class="ram" @click.stop>
    <button
      v-for="a in inlineActions"
      :key="a.key"
      type="button"
      class="ram-btn"
      :title="a.label"
      :aria-label="a.label"
      @click="onAction(a.key)"
    >
      <span v-if="a.emoji" class="ram-emoji">{{ a.emoji }}</span>
      <i v-else-if="a.icon" class="pi" :class="a.icon" />
      <span v-else class="ram-fallback">{{ a.label?.[0] || '?' }}</span>
    </button>

    <span v-if="overflowActions.length > 0" class="ram-overflow-wrap">
      <button
        type="button"
        class="ram-btn ram-btn--overflow"
        :class="{ 'ram-btn--active': menuOpen }"
        title="Ещё"
        aria-label="Ещё действия"
        :aria-expanded="menuOpen"
        @click="toggleMenu"
      >
        <i class="pi pi-ellipsis-v" />
      </button>
      <ul v-if="menuOpen" class="ram-menu" role="menu">
        <li v-for="a in overflowActions" :key="a.key" role="none">
          <button
            type="button"
            class="ram-menu-item"
            role="menuitem"
            @click="onAction(a.key)"
          >
            <span v-if="a.emoji" class="ram-menu-icon">{{ a.emoji }}</span>
            <i v-else-if="a.icon" class="pi ram-menu-icon" :class="a.icon" />
            <span class="ram-menu-label">{{ a.label }}</span>
          </button>
        </li>
      </ul>
    </span>
  </span>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  rowId:         { type: [Number, String], required: true },
  actions:       { type: Array, required: true },
  overflowAfter: { type: Number, default: 3 },
});

const emit = defineEmits(['action']);

/**
 * Drop hidden actions (lets pages keep a stable config and toggle by
 * row state via `hidden: rowIsReadonly`).
 */
const visibleActions = computed(() =>
  (props.actions || []).filter((a) => a && !a.hidden && a.key)
);

const inlineActions = computed(() =>
  visibleActions.value.slice(0, props.overflowAfter)
);

const overflowActions = computed(() =>
  visibleActions.value.slice(props.overflowAfter)
);

const menuOpen = ref(false);

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function onAction(key) {
  emit('action', { key, rowId: props.rowId });
  closeMenu();
}

/**
 * Close the overflow menu on outside click / escape so it doesn't
 * linger when the user clicks elsewhere in the table.
 */
function onDocClick(e) {
  if (!menuOpen.value) return;
  const root = rootEl.value;
  if (root && !root.contains(e.target)) closeMenu();
}
function onDocKey(e) {
  if (e.key === 'Escape') closeMenu();
}

const rootEl = ref(null);
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onDocKey);
});

// Exposed for tests.
defineExpose({ _toggleMenu: toggleMenu, _menuOpen: menuOpen });
</script>

<style scoped>
.ram {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.ram-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  color: rgba(0, 50, 116, 0.65);
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.ram-btn:hover {
  background: rgba(0, 50, 116, 0.06);
  border-color: rgba(0, 50, 116, 0.20);
  color: #003274;
}
.ram-btn:focus-visible {
  outline: 2px solid rgba(0, 50, 116, 0.30);
  outline-offset: 1px;
}
.ram-btn--active {
  background: rgba(0, 50, 116, 0.10);
  border-color: rgba(0, 50, 116, 0.25);
  color: #003274;
}

.ram-btn i.pi { font-size: 12px; }
.ram-emoji { font-size: 13px; line-height: 1; }
.ram-fallback {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.ram-overflow-wrap {
  position: relative;
  display: inline-block;
}

.ram-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  background: rgba(248, 252, 255, 0.97);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(180, 210, 255, 0.4);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 50, 116, 0.12);
  padding: 0.3rem;
  min-width: 160px;
  margin: 0;
  list-style: none;
}
.ram-menu li { margin: 0; padding: 0; }

.ram-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0.45rem 0.75rem;
  border: none;
  background: transparent;
  font-size: 13px;
  color: #003274;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  transition: background 0.12s;
}
.ram-menu-item:hover {
  background: rgba(0, 50, 116, 0.06);
}

.ram-menu-icon {
  width: 18px;
  text-align: center;
  font-size: 14px;
  color: rgba(0, 50, 116, 0.6);
  line-height: 1;
}
.ram-menu-label { line-height: 1.2; }
</style>
