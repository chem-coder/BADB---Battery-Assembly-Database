/**
 * unsavedConfirm — promise-based service for the unsaved-changes dialog.
 *
 * Replaces native window.confirm() in useUnsavedGuard with a Vue Dialog
 * that integrates with the app's design tokens and respects the same modal
 * lifecycle as TypedDeleteConfirm.
 *
 * Usage:
 *   import { askToContinue } from '@/services/unsavedConfirm';
 *   const ok = await askToContinue('Есть несохранённые изменения. Выйти?');
 *
 * The <UnsavedConfirmDialog> component (mounted once at App level) reads
 * the shared state below and resolves the pending promise when the user
 * picks an answer or closes the dialog.
 *
 * Why module-level state instead of Pinia/provide-inject:
 *   - Need to call from non-component contexts (composables, router guards).
 *   - One dialog instance is the right cardinality for the app.
 *   - Simpler than wiring DI through every consumer.
 */
import { ref } from 'vue';

export const isVisible = ref(false);
export const message = ref('');

let pendingResolver = null;

/**
 * Show the dialog and return a Promise that resolves to true if the user
 * confirmed, false if they cancelled or closed it.
 *
 * If a previous prompt is still pending, the old one resolves as cancelled
 * (false) before this one starts. This is defensive — in practice, multiple
 * confirm flows should not overlap.
 */
export function askToContinue(promptMessage = 'Есть несохранённые изменения. Выйти без сохранения?') {
  if (pendingResolver) {
    pendingResolver(false);
    pendingResolver = null;
  }
  message.value = promptMessage;
  isVisible.value = true;
  return new Promise((resolve) => {
    pendingResolver = resolve;
  });
}

/**
 * Called by the dialog component when the user picks an answer.
 * `answer === true`  → proceed with the exit
 * `answer === false` → cancel; stay on the current record
 */
export function resolveDialog(answer) {
  isVisible.value = false;
  if (pendingResolver) {
    pendingResolver(!!answer);
    pendingResolver = null;
  }
}
