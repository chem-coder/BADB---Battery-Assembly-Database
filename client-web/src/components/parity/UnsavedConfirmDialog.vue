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
 *   - eyebrow / section meta: 11px / 700 / uppercase / 0.05em letter-spacing
 *   - card title:             Rosatom 15px 700 #003274
 *   - body text:              14px 400 #333333
 *   - badge-8 red (#E74C3C) for the warning eyebrow
 *
 * The default PrimeVue Dialog header is hidden; the layout below mirrors
 * the .glass-card pattern used elsewhere (eyebrow + Rosatom title + body).
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
    :style="{ width: '460px' }"
    modal
    :draggable="false"
    :closable="true"
    :show-header="false"
    @update:visible="onUpdateVisible"
  >
    <div class="uc-card">
      <div class="uc-eyebrow">
        <i class="pi pi-exclamation-triangle" />
        <span>Внимание</span>
      </div>
      <h3 class="uc-title">Несохранённые изменения</h3>
      <p class="uc-body">{{ message }}</p>
    </div>

    <template #footer>
      <Button
        label="Остаться"
        severity="secondary"
        outlined
        autofocus
        @click="onCancel"
      />
      <Button
        label="Выйти без сохранения"
        severity="danger"
        @click="onConfirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.uc-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-xs) 0 var(--space-sm);
}
.uc-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #E74C3C;
}
.uc-eyebrow i {
  font-size: 12px;
}
.uc-title {
  font-family: 'Rosatom', system-ui, sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #003274;
  margin: 0;
  line-height: 1.3;
}
.uc-body {
  margin: 0;
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 1.5;
}
</style>
