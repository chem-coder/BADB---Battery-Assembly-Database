<script setup>
/**
 * SaveIndicator — reusable "unsaved / saved" indicator for PageHeader #actions slot.
 * Extracted 1-to-1 from DesignSystemPage.
 *
 * Props:
 *   visible  — show the indicator
 *   saved    — true = green "Изменения сохранены", false = ochre "Изменения не сохранены"
 *
 * Events:
 *   @save    — user clicked "Сохранить"
 *   @cancel  — user clicked "Отмена"
 */
import Button from 'primevue/button'

defineProps({
  visible: { type: Boolean, default: false },
  saved:   { type: Boolean, default: false },
})

defineEmits(['save', 'cancel'])
</script>

<template>
  <Transition name="si-fade">
    <div v-if="visible" class="si"
         :class="saved ? 'si--saved' : 'si--unsaved'">
      <span class="si-label">
        <i v-if="saved" class="pi pi-check si-check-anim"></i>
        {{ saved ? 'Изменения сохранены' : 'Изменения не сохранены' }}
      </span>
      <div v-if="!saved" class="si-actions">
        <Button label="Сохранить" size="small" @click="$emit('save')" />
        <Button label="Отмена" size="small" severity="secondary" outlined @click="$emit('cancel')" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ── Save/unsaved indicator — pixel-exact copy from DesignSystemPage ── */
.si {
  position: absolute;
  right: 1.5rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  border-radius: 8px;
  padding: 8px 10px;
  transition: background 0.4s ease;
}
.si--unsaved {
  background: rgba(211, 167, 84, 0.12);
}
.si--saved {
  background: rgba(82, 201, 166, 0.12);
}
.si-label {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: color 0.4s ease;
}
.si--unsaved .si-label {
  color: #D3A754;
}
.si--saved .si-label {
  color: #2E9E7E;
}
.si-actions {
  display: flex;
  gap: 0;
}
.si-actions :deep(.p-button) {
  flex: 1;
  font-size: 12px;
  height: 28px;
  border-radius: 0;
  border: 1px solid rgba(0, 50, 116, 0.25) !important;
}
.si-actions :deep(.p-button:first-child) {
  border-radius: 5px 0 0 5px;
}
.si-actions :deep(.p-button:last-child) {
  border-radius: 0 5px 5px 0;
}
/* Checkmark animation */
.si-check-anim {
  animation: si-check-pop 0.4s ease-out;
}
@keyframes si-check-pop {
  0%   { transform: scale(0); opacity: 0; }
  50%  { transform: scale(1.4); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
/* Fade in/out */
.si-fade-enter-active { transition: opacity 0.25s ease; }
.si-fade-leave-active { transition: opacity 0.5s ease; }
.si-fade-enter-from,
.si-fade-leave-to { opacity: 0; }
</style>
