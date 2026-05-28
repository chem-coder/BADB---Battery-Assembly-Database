<script setup>
/**
 * UnsavedConfirmDialog — global Vue Dialog that replaces native confirm()
 * for the unsaved-changes guard.
 *
 * Mounted once in App.vue. Mirrors service.isVisible into a local ref
 * (PrimeVue's Dialog transitions stall when the prop comes straight from
 * an imported reactive ref bound via Teleport + Vue's Transition system),
 * and forwards the dialog's user-driven close back through resolveDialog
 * so the pending askToContinue() promise resolves correctly.
 *
 * Design tokens used (see src/pages/DesignSystemPage.vue):
 *   - eyebrow:     11px / 700 / uppercase / 0.05em / #E74C3C (badge-8)
 *                  with pi-exclamation-circle icon
 *   - title:       Rosatom 15px 700 #003274
 *   - body:        14px 400 #333333
 *   - cancel btn:  primary brand blue — "Остаться" is the SAFE action so
 *                  it's the visual default; pressing Enter keeps the user
 *                  on the record
 *   - danger btn:  ghost text-style with #E74C3C — destructive action is
 *                  available but does not visually dominate
 *   - glass-card-style body with rounded corners and brand-toned shadow
 */
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { isVisible, message, resolveDialog } from '@/services/unsavedConfirm';

const localVisible = ref(false);
watch(isVisible, (v) => { localVisible.value = v; });

function onUpdateVisible(v) {
  localVisible.value = v;
  if (!v) resolveDialog(false);
}
function onCancel() { resolveDialog(false); }
function onConfirm() { resolveDialog(true); }
</script>

<template>
  <Dialog
    :visible="localVisible"
    :style="{ width: '480px' }"
    :pt="{ root: { class: 'uc-dialog-root' }, content: { class: 'uc-content' } }"
    modal
    :draggable="false"
    :closable="false"
    :show-header="false"
    @update:visible="onUpdateVisible"
  >
    <div class="uc-card">
      <div class="uc-eyebrow">
        <i class="pi pi-exclamation-circle" />
        <span>Внимание</span>
      </div>
      <h3 class="uc-title">Несохранённые изменения</h3>
      <p class="uc-body">{{ message }}</p>

      <div class="uc-actions">
        <Button
          label="Остаться"
          icon="pi pi-arrow-left"
          class="uc-btn-primary"
          autofocus
          @click="onCancel"
        />
        <Button
          label="Выйти без сохранения"
          icon="pi pi-sign-out"
          text
          class="uc-btn-danger"
          @click="onConfirm"
        />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
/* Card body — glass-card treatment in the dialog */
.uc-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-lg) var(--space-md);
}

/* Eyebrow: red exclamation + uppercase label */
.uc-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #E74C3C;
}
.uc-eyebrow i {
  font-size: 14px;
}

/* Title in Rosatom font, brand blue */
.uc-title {
  font-family: 'Rosatom', system-ui, sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: #003274;
  margin: 0;
  line-height: 1.25;
}

/* Body text */
.uc-body {
  margin: 0;
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 1.55;
}

/* Buttons row: safe action LEFT (primary), destructive RIGHT (ghost) */
.uc-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

/* Primary "stay" button — brand blue, solid */
.uc-btn-primary :deep(.p-button),
.uc-actions :deep(.uc-btn-primary) {
  background: #003274;
  border-color: #003274;
  color: white;
  font-weight: 600;
  padding: 8px 18px;
  border-radius: 6px;
}
.uc-actions :deep(.uc-btn-primary:hover) {
  background: #002558;
  border-color: #002558;
}

/* Danger "exit without saving" — ghost text-style, brand red */
.uc-actions :deep(.uc-btn-danger) {
  color: #E74C3C;
  background: transparent;
  border: none;
  font-weight: 500;
  padding: 8px 14px;
  border-radius: 6px;
}
.uc-actions :deep(.uc-btn-danger:hover) {
  background: rgba(231, 76, 60, 0.08);
  color: #C0392B;
}
</style>

<style>
/* Global overrides for the Dialog wrapper — picked up by `pt` slots above.
   Cannot be in scoped block because the Dialog is teleported to <body>. */
.uc-dialog-root {
  border: 1px solid rgba(0, 50, 116, 0.12);
  border-radius: 12px;
  background: white;
  box-shadow:
    0 12px 40px rgba(0, 50, 116, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.75);
  overflow: hidden;
}
.uc-content {
  padding: 0 !important;
}
</style>
