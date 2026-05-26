/**
 * useDirtyTracking — track whether a form ref differs from the last snapshot.
 *
 * Usage in a page:
 *   const form = ref({ name: '', notes: '' });
 *   const { isDirty, snapshot, reset } = useDirtyTracking(form);
 *
 *   // After loading data into form:
 *   form.value = loadedFromBackend;
 *   snapshot();                  // form is now considered "clean"
 *
 *   // User edits form → isDirty.value becomes true.
 *
 *   // After save succeeds:
 *   snapshot();                  // accept current form as new clean baseline.
 *
 *   // Cancel/exit without save:
 *   reset();                     // restore form to snapshot, isDirty = false.
 *
 * Deep equality via JSON.stringify is sufficient for the form shapes we use
 * (plain objects with primitives, strings, numbers, arrays of the same). If a
 * surface needs richer equality (e.g. Date objects, circular refs), it must
 * normalize the form before passing it in.
 *
 * Snapshot is stored as a deep clone (via structured clone if available,
 * JSON otherwise) so external mutations to the form do not leak into it.
 */

import { ref, computed, watch } from 'vue';

function deepClone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // structuredClone fails on functions, DOM nodes, etc.
      // Fall through to JSON.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useDirtyTracking(formRef) {
  const snapshotValue = ref(deepClone(formRef.value));

  const isDirty = computed(() => !deepEqual(formRef.value, snapshotValue.value));

  function snapshot() {
    snapshotValue.value = deepClone(formRef.value);
  }

  function reset() {
    formRef.value = deepClone(snapshotValue.value);
  }

  return { isDirty, snapshot, reset };
}
