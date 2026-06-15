<script setup>
/**
 * TypedDeleteConfirm — modal requiring the user to type a confirmation phrase
 * before destructive action. Replaces vanilla's native `prompt()` with a
 * controlled Vue dialog (cancellable, accessible, styled).
 *
 * Behaviour:
 *   - Confirm button enabled only when typed input === phrase.
 *   - If `blockers` array is non-empty: blockers listed, confirm hidden,
 *     only Cancel shown. Use for situations where delete is impossible
 *     and the user must clear blockers first.
 *   - `extra-fields` slot allows Batteries to inject electrode-disposition
 *     selectors above the typed-phrase input. The parent's `confirmed`
 *     handler reads the disposition state directly; this component does
 *     not pass payload through.
 */
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';

const props = defineProps({
  visible: { type: Boolean, required: true },
  phrase: { type: String, default: '' },
  title: { type: String, default: 'Подтверждение удаления' },
  description: { type: String, default: '' },
  blockers: { type: Array, default: () => [] },
  // Allow the parent to disable confirm even when phrase matches.
  // Used by Batteries when electrode disposition is required but not selected.
  confirmEnabled: { type: Boolean, default: true },
});

const emit = defineEmits(['update:visible', 'confirmed', 'cancelled']);

const typed = ref('');

watch(
  () => props.visible,
  (v) => {
    if (v) typed.value = '';
  }
);

function onConfirm() {
  if (typed.value !== props.phrase) return;
  if (!props.confirmEnabled) return;
  emit('confirmed');
}

function onCancel() {
  emit('update:visible', false);
  emit('cancelled');
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="title"
    :style="{ width: '500px' }"
    modal
    :closable="true"
    :draggable="false"
    @update:visible="(v) => emit('update:visible', v)"
  >
    <div v-if="blockers.length > 0" class="blockers">
      <p class="blockers-intro">Нельзя удалить — есть связанные записи:</p>
      <ul>
        <li v-for="(b, i) in blockers" :key="i">{{ b }}</li>
      </ul>
    </div>

    <div v-else class="confirm-body">
      <p v-if="description" class="description">{{ description }}</p>

      <slot name="extra-fields" />

      <p class="phrase-prompt">
        Введите <code class="phrase">{{ phrase }}</code> для подтверждения:
      </p>
      <InputText
        v-model="typed"
        class="typed-input"
        :placeholder="phrase"
        autofocus
        @keydown.enter="onConfirm"
      />
    </div>

    <template #footer>
      <Button label="Отмена" severity="secondary" outlined @click="onCancel" />
      <Button
        v-if="blockers.length === 0"
        label="Удалить"
        severity="danger"
        :disabled="typed !== phrase || !confirmEnabled"
        @click="onConfirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.blockers {
  font-size: 14px;
}
.blockers-intro {
  margin: 0 0 8px;
  color: #b91c1c;
  font-weight: 500;
}
.blockers ul {
  margin: 0;
  padding-left: 20px;
  color: #4B5563;
}
.confirm-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.description {
  margin: 0;
  font-size: 14px;
  color: #4B5563;
}
.phrase-prompt {
  margin: 0;
  font-size: 14px;
}
.phrase {
  background: #FEF2F2;
  color: #b91c1c;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}
.typed-input {
  width: 100%;
  font-family: ui-monospace, monospace;
}
</style>
