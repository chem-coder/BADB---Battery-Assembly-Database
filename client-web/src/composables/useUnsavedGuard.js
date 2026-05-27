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

import { watch, onBeforeUnmount, getCurrentInstance } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { askToContinue } from '@/services/unsavedConfirm';

const DEFAULT_MESSAGE = 'Есть несохранённые изменения. Выйти без сохранения?';

export function useUnsavedGuard({ isDirty, message = DEFAULT_MESSAGE } = {}) {
  if (!isDirty) {
    throw new Error('useUnsavedGuard: { isDirty } ref is required');
  }
  // Must run inside a setup() so lifecycle hooks can register. Explicit
  // check lets the caller's try/catch fall back to a sync confirm path
  // in non-component contexts (isolated unit tests).
  if (!getCurrentInstance()) {
    throw new Error('useUnsavedGuard: must be called from setup()');
  }

  function beforeUnloadHandler(event) {
    if (!isDirty.value) return undefined;
    event.preventDefault();
    event.returnValue = '';
    return '';
  }

  // Attach/detach beforeunload listener tied to isDirty state, so we don't
  // hold a global listener when the form is clean.
  // The browser-rendered confirm here is the only confirm flow we cannot
  // replace with a Vue dialog — beforeunload must be synchronous.
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

  // Vue Router guard. Async — returns the user's choice from the Vue
  // dialog. Vue Router 4 supports promise-returning navigation guards.
  onBeforeRouteLeave(async () => {
    if (!isDirty.value) return true;
    return await askToContinue(message);
  });

  /**
   * Async exit-confirmation gate. Resolves to true if it is safe to
   * proceed with the exit (either no dirty state, or the user confirmed
   * in the Vue dialog).
   *
   * Used by in-page "Выйти" buttons, record switches, and any other
   * imperative path that the router/beforeunload do not cover.
   */
  async function confirmExit() {
    if (!isDirty.value) return true;
    return await askToContinue(message);
  }

  return { confirmExit };
}
