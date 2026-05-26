/**
 * useUnsavedGuard — block accidental data loss when the form is dirty.
 *
 * Three exit paths are guarded:
 *   1. Browser tab close / refresh / hard navigation → window.beforeunload.
 *   2. Vue Router navigation away from the current route → onBeforeRouteLeave.
 *   3. In-page "Выйти" button or other explicit exit → caller invokes confirmExit().
 *
 * The composable only attaches the beforeunload listener while
 * `isDirty.value === true`. This avoids unnecessary lifecycle noise and the
 * empty-prompt the browser shows for unused listeners.
 *
 * Usage:
 *   const { isDirty } = useDirtyTracking(form);
 *   const { confirmExit } = useUnsavedGuard({ isDirty });
 *
 *   function onExitClick() {
 *     if (!confirmExit()) return;
 *     currentId.value = null;
 *   }
 *
 * Notes:
 *   - The Vue Router guard is registered via onBeforeRouteLeave from
 *     vue-router 4. It requires the composable to be called from a
 *     component that is mounted inside the router context.
 *   - The browser's beforeunload UI message is no longer customizable in
 *     modern browsers; setting `event.returnValue` is enough to trigger
 *     the built-in confirm dialog.
 */

import { watch, onBeforeUnmount } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

const DEFAULT_MESSAGE = 'Есть несохранённые изменения. Выйти без сохранения?';

export function useUnsavedGuard({ isDirty, message = DEFAULT_MESSAGE } = {}) {
  if (!isDirty) {
    throw new Error('useUnsavedGuard: { isDirty } ref is required');
  }

  function beforeUnloadHandler(event) {
    if (!isDirty.value) return undefined;
    event.preventDefault();
    event.returnValue = '';
    return '';
  }

  // Attach/detach beforeunload listener tied to isDirty state, so we don't
  // hold a global listener when the form is clean.
  const stopWatcher = watch(
    isDirty,
    (dirty) => {
      if (dirty) {
        window.addEventListener('beforeunload', beforeUnloadHandler);
      } else {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
      }
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    stopWatcher();
  });

  // Vue Router guard. Returns false to cancel navigation if user does
  // not confirm. Caller does not need to wire this — registration is
  // automatic on composable use.
  onBeforeRouteLeave(() => {
    if (!isDirty.value) return true;
    return window.confirm(message);
  });

  /**
   * Synchronous exit-confirmation gate. Returns true if it is safe to
   * proceed with the exit (either no dirty state, or the user confirmed).
   *
   * Used by in-page "Выйти" buttons, record switches, and any other
   * imperative path that the router/beforeunload do not cover.
   */
  function confirmExit() {
    if (!isDirty.value) return true;
    return window.confirm(message);
  }

  return { confirmExit };
}
