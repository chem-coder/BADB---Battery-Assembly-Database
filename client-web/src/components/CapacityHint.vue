<script setup>
/**
 * CapacityHint — clickable "?" icon next to a capacity / N-P cell that
 * shows "—". Replaces the previous bare `<i v-tooltip>` icon with a
 * button: hover → tooltip preview, click → popover with the full
 * message + a "Перейти" action button.
 *
 * Source of truth for both message and action is
 * `capacityIncompleteAction(summary, context, extra)` in
 * `utils/formatCapacity.js`. Pass `summary` + `context` here and the
 * component pulls the descriptor itself (so callers stay simple).
 *
 * Emits `go(action)` when the user clicks the button. The parent is
 * responsible for routing — open the constructor stage, navigate to
 * /tapes, etc. Action shape:
 *   { kind: 'open-battery-stage' | 'open-tape-recipe' |
 *           'open-electrode-batch' | 'open-materials',
 *     label: string,
 *     payload: object }
 *
 * If `capacityIncompleteAction()` returns an action-less hint (e.g.
 * unknown batteryId), the component still shows the message via
 * tooltip + popover but the action button is hidden.
 */
import { computed, ref } from 'vue'
import Popover from 'primevue/popover'
import Button from 'primevue/button'
import { capacityIncompleteAction } from '@/utils/formatCapacity'

const props = defineProps({
  summary:  { type: Object, default: null },
  context:  { type: String, default: 'electrode' },
  // Extra ids the helper may need (cathode/anode tape ids, batteryId,
  // cutBatchId) — passed through to capacityIncompleteAction.
  extra:    { type: Object, default: () => ({}) },
})

const emit = defineEmits(['go'])

const popoverRef = ref(null)

const descriptor = computed(() =>
  capacityIncompleteAction(props.summary, props.context, props.extra)
)
const message = computed(() => descriptor.value?.message || null)
const action  = computed(() => descriptor.value?.action  || null)

function onIconClick(event) {
  // Always open the popover (even action-less hints — they still show
  // the message in a clickable surface, no behaviour change vs old
  // tooltip).
  popoverRef.value?.toggle(event)
}

function onActionClick() {
  if (!action.value) return
  emit('go', action.value)
  popoverRef.value?.hide()
}
</script>

<template>
  <span v-if="message" class="ch-wrap" @click.stop>
    <button
      type="button"
      class="ch-btn"
      :class="{ 'ch-btn--actionable': !!action }"
      v-tooltip.top="message"
      @click="onIconClick"
    >
      <i class="pi pi-question-circle"></i>
    </button>
    <Popover ref="popoverRef" :pt="{ root: { class: 'ch-popover' } }">
      <div class="ch-popover-body">
        <p class="ch-popover-msg">{{ message }}</p>
        <Button
          v-if="action"
          :label="action.label"
          icon="pi pi-arrow-right"
          iconPos="right"
          size="small"
          severity="secondary"
          @click="onActionClick"
          class="ch-popover-go"
        />
      </div>
    </Popover>
  </span>
</template>

<style scoped>
.ch-wrap {
  display: inline-flex;
  align-items: center;
}
.ch-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: rgba(212, 164, 65, 0.80);
  border-radius: 50%;
  transition: background 0.15s, color 0.15s;
}
.ch-btn i {
  font-size: 12px;
}
.ch-btn:hover {
  background: rgba(212, 164, 65, 0.18);
  color: #b58626;
}
.ch-btn--actionable {
  /* Subtle visual affordance — actionable hints get a slightly
     stronger ochre to hint at click-through. */
  color: rgba(180, 130, 40, 0.95);
}
.ch-popover-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  max-width: 320px;
}
.ch-popover-msg {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: #003274;
}
.ch-popover-go {
  align-self: flex-start;
}
</style>
