/**
 * useUserPref — reactive localStorage value, namespaced by current user id.
 *
 * Generalises the per-user persistence pattern first introduced for
 * CrudTable column visibility. Use it for any UI preference that should
 * follow the user across sessions and reset on logout / re-login:
 *
 *   const collapsed = useUserPref('mixing-dry-collapsed', false)
 *   // collapsed.value reads from localStorage on mount and persists on
 *   // every change; reloads on auth user change.
 *
 * Storage key shape:  `badb:pref:<key>:<userId|guest>`
 *
 * Notes:
 *   - JSON-stored, so default value can be any serialisable shape.
 *   - localStorage write errors (quota, disabled) are swallowed — the
 *     reactive value still works for the session, just won't persist.
 *   - Listens for auth changes: switching users re-reads the value
 *     under the new namespace.
 */
import { ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';

const STORAGE_PREFIX = 'badb:pref';

export function useUserPref(key, defaultValue) {
  const authStore = useAuthStore();

  function storageKey() {
    const uid = authStore.user?.userId || 'guest';
    return `${STORAGE_PREFIX}:${key}:${uid}`;
  }

  function read() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (raw == null) return defaultValue;
      return JSON.parse(raw);
    } catch {
      return defaultValue;
    }
  }

  const value = ref(read());

  watch(value, (next) => {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(next));
    } catch {
      // quota / disabled — silent
    }
  }, { deep: true });

  // Re-read when the logged-in user changes.
  watch(() => authStore.user?.userId, () => {
    value.value = read();
  });

  return value;
}
