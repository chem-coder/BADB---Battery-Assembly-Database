<!--
  CollapsibleSection — DS-styled eyebrow + chevron section with sticky
  open/closed state per user. Fourth Phase A primitive.

  Behaviour
  ---------
  - Header is an eyebrow (11px / 700 / uppercase / brand-blue family)
    with an optional pi-chevron-* icon that flips on toggle.
  - Click anywhere on the header to toggle. Header is a real `<button>`
    so keyboard activation (Space / Enter) works out of the box.
  - When `persistKey` is provided, the open/closed state is saved per
    user via `useUserPref` → survives reload + scoped to login.
  - When `persistKey` is null, state lives in a local ref only.
  - Content area gets a smooth max-height transition (capped at a
    generous value so most realistic sections animate; large content
    snaps after the transition finishes — acceptable for our forms).

  Props
  -----
  - `title`              eyebrow text (required)
  - `persistKey`         key for `useUserPref('section:<key>', ...)`
  - `collapsedByDefault` initial value when nothing is in storage (false)
  - `count`              optional small badge next to the title (e.g.
                         "3" items inside)
  - `icon`               optional pi-* icon shown before the title
  - `disabled`           hide the chevron / lock open (rare; mainly for
                         demo screens)

  See also
  --------
  - `composables/useUserPref.js` — drives the sticky state.
  - `docs/instructions/vue-frontend-architecture.md` §3, §4.
-->

<template>
  <section class="cs" :class="{ 'cs--open': !collapsed, 'cs--disabled': disabled }">
    <button
      type="button"
      class="cs-header"
      :aria-expanded="!collapsed"
      :disabled="disabled"
      @click="toggle"
    >
      <i v-if="icon" class="cs-icon pi" :class="icon" />
      <span class="cs-title">{{ title }}</span>
      <span v-if="count != null" class="cs-count">{{ count }}</span>
      <span class="cs-spacer" />
      <i
        v-if="!disabled"
        class="cs-chevron pi"
        :class="collapsed ? 'pi-chevron-right' : 'pi-chevron-down'"
      />
    </button>

    <div v-if="!collapsed" class="cs-body">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useUserPref } from '@/composables/useUserPref.js';

const props = defineProps({
  title:              { type: String, required: true },
  persistKey:         { type: String, default: '' },
  collapsedByDefault: { type: Boolean, default: false },
  count:              { type: [Number, String, null], default: null },
  icon:               { type: String, default: '' },
  disabled:           { type: Boolean, default: false },
});

const emit = defineEmits(['update:collapsed']);

/**
 * State source: persisted via useUserPref when persistKey is set, otherwise
 * an ephemeral local ref. The two paths are kept behind one `collapsed`
 * computed so the template doesn't care.
 */
const localCollapsed = ref(props.collapsedByDefault);
const persistedCollapsed = props.persistKey
  ? useUserPref(`section:${props.persistKey}`, props.collapsedByDefault)
  : null;

const collapsed = computed({
  get: () => (persistedCollapsed ? persistedCollapsed.value : localCollapsed.value),
  set: (v) => {
    if (persistedCollapsed) persistedCollapsed.value = v;
    else localCollapsed.value = v;
    emit('update:collapsed', v);
  },
});

function toggle() {
  if (props.disabled) return;
  collapsed.value = !collapsed.value;
}

// Exposed for unit tests so they can flip state without DOM clicks.
defineExpose({ _toggle: toggle, _collapsed: collapsed });
</script>

<style scoped>
.cs {
  border-top: 1px solid rgba(0, 50, 116, 0.06);
  background: transparent;
}
.cs:first-child { border-top: none; }

.cs-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 4px 7px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: background 0.15s;
}
.cs-header:hover:not(:disabled) {
  background: rgba(0, 50, 116, 0.03);
}
.cs-header:focus-visible {
  outline: 2px solid rgba(0, 50, 116, 0.30);
  outline-offset: 2px;
  border-radius: 4px;
}
.cs-header:disabled { cursor: default; }

.cs-icon {
  font-size: 12px;
  color: rgba(0, 50, 116, 0.55);
}

.cs-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
  line-height: 1.2;
}

.cs-count {
  font-size: 10.5px;
  font-weight: 600;
  color: #003274;
  background: rgba(0, 50, 116, 0.08);
  padding: 1px 6px;
  border-radius: 9px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}

.cs-spacer { flex: 1; }

.cs-chevron {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.50);
  transition: color 0.15s;
}
.cs-header:hover .cs-chevron {
  color: #003274;
}

.cs-body {
  padding: 4px 4px 12px;
}
</style>
