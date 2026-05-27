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
    header="Несохранённые изменения"
    :style="{ width: '440px' }"
    modal
    :draggable="false"
    :closable="true"
    @update:visible="onUpdateVisible"
  >
    <p class="confirm-body">{{ message }}</p>

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
.confirm-body {
  margin: 0;
  padding: 4px 0 8px;
  font-size: 14px;
  color: #1f2937;
  line-height: 1.5;
}
</style>
