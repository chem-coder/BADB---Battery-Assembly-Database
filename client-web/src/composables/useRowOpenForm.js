/**
 * useRowOpenForm — top-level composable for the vanilla v1 "row-open" page
 * pattern. Ties together dirty tracking, unsaved guards, delete-check, typed
 * delete confirmation, save, and list refresh.
 *
 * One composable per page. A page that adopts the row-open pattern should not
 * manage these flows manually; instead it provides the entity-specific bits
 * (API calls, empty form, validation, optional beforeDelete payload) and
 * wires the returned state to the foundation components.
 *
 * See `.local/vue_v2_parity_foundation.md` §4.1 for the full contract.
 *
 * Status messages
 * ---------------
 * Status is a single reactive object: `{ message: string, tone: 'ok'|'error'|'info' }`
 * or null. Tones map to timeout (ok/info: 5s, error: 12s). The page renders
 * status via `OpenedRecordHeader`'s `status` prop. Pages that also want
 * toast notifications can `watch(status, ...)` and forward.
 *
 * Race conditions
 * ---------------
 * Open operations use a token to discard stale loads when the user rapidly
 * switches records. Save and delete are sequential by construction.
 *
 * Delete flow extension (Batteries)
 * ----------------------------------
 * For surfaces that need extra payload at delete time (Batteries' electrode
 * disposition), provide `beforeDelete: async () => extraPayload`. The
 * returned object is sent as the DELETE request body. If undefined, DELETE
 * is sent without a body.
 */

import { ref, computed, shallowRef } from 'vue';
import api from '@/services/api';
import { formatDependency } from '@/utils/formatDependency';
import { useDirtyTracking } from './useDirtyTracking';
import { useDeleteCheck } from './useDeleteCheck';
import { useUnsavedGuard } from './useUnsavedGuard';

const STATUS_TIMEOUT = { ok: 5000, info: 5000, error: 12000 };

function nextToken() {
  return (nextToken._n = (nextToken._n ?? 0) + 1);
}

export function useRowOpenForm(options) {
  const {
    entityType,
    idField,
    emptyForm,
    validate = () => true,
    loadOne,
    saveOne,
    list,
    deletePhrase = null,
    hasDeleteCheck = false,
    beforeDelete = null,
    deleteMessages = {},
    // Optional extra unsaved-state signal (a ref/computed<boolean>). Lets a page
    // fold in state that lives OUTSIDE the form — e.g. a project's members table
    // that has its own Save — so the exit/navigation guard catches it too.
    extraDirty = null,
  } = options;

  // ── Required-args guard ────────────────────────────────────────────
  if (!entityType) throw new Error('useRowOpenForm: entityType is required');
  if (!idField) throw new Error('useRowOpenForm: idField is required');
  if (typeof emptyForm !== 'function') throw new Error('useRowOpenForm: emptyForm must be a function');
  if (typeof loadOne !== 'function') throw new Error('useRowOpenForm: loadOne must be a function');
  if (typeof saveOne !== 'function') throw new Error('useRowOpenForm: saveOne must be a function');
  if (!list?.ref || typeof list.load !== 'function') throw new Error('useRowOpenForm: list { ref, load } is required');

  // ── Reactive state ─────────────────────────────────────────────────
  const currentId = ref(null);
  const mode = ref(null); // 'create' | 'edit' | null
  const form = ref(emptyForm());
  const currentItem = shallowRef(null);
  const status = ref(null);
  let statusTimer = null;

  // ── Typed-delete modal state (owned by composable, bound by page) ──
  const deleteModalVisible = ref(false);
  const deleteModalPhrase = ref('');
  const deleteModalBlockers = ref([]);

  // ── Composables ────────────────────────────────────────────────────
  const dirty = useDirtyTracking(form);
  // Exit/navigation guard fires when the form OR any external surface
  // (extraDirty — e.g. the members table) has unsaved changes.
  const guardDirty = computed(() => dirty.isDirty.value || !!(extraDirty && extraDirty.value));
  const deleteCheckHook = hasDeleteCheck ? useDeleteCheck(entityType) : null;
  // useUnsavedGuard requires component context (onBeforeRouteLeave, onBeforeUnmount).
  // It is initialized below inside a guarded try so that consumers without a
  // router (e.g. isolated tests) can still use the composable.
  let unsavedGuardApi;
  try {
    unsavedGuardApi = useUnsavedGuard({ isDirty: guardDirty });
  } catch {
    // Fallback for environments without router context (e.g. isolated tests).
    // Mirrors the async signature so callers can await it uniformly.
    unsavedGuardApi = {
      confirmExit: async () =>
        !guardDirty.value ||
        window.confirm('Есть несохранённые изменения. Выйти без сохранения?'),
    };
  }

  // ── Status helpers ─────────────────────────────────────────────────
  function setStatus(message, tone = 'info') {
    if (statusTimer) clearTimeout(statusTimer);
    status.value = { message, tone };
    const timeout = STATUS_TIMEOUT[tone] ?? STATUS_TIMEOUT.info;
    statusTimer = setTimeout(() => {
      status.value = null;
      statusTimer = null;
    }, timeout);
  }

  function clearStatus() {
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = null;
    status.value = null;
  }

  // ── Reset & open ───────────────────────────────────────────────────
  function resetState() {
    currentId.value = null;
    mode.value = null;
    form.value = emptyForm();
    currentItem.value = null;
    dirty.snapshot();
  }

  async function openCreate(prefilledName = '') {
    if (!(await unsavedGuardApi.confirmExit())) return;
    clearStatus();
    currentId.value = null;
    mode.value = 'create';
    const fresh = emptyForm();
    if (prefilledName && 'name' in fresh) fresh.name = prefilledName;
    form.value = fresh;
    currentItem.value = null;
    dirty.snapshot();
  }

  let openToken = 0;
  async function openEdit(item) {
    if (!(await unsavedGuardApi.confirmExit())) return;
    clearStatus();
    const myToken = (openToken = nextToken());

    const id = item?.[idField];
    if (id == null) throw new Error(`useRowOpenForm.openEdit: missing ${idField}`);

    try {
      const result = await loadOne(id);
      // Discard if the user switched records before this load returned.
      if (openToken !== myToken) return;

      currentId.value = id;
      mode.value = 'edit';
      currentItem.value = result?.item ?? item;
      form.value = result?.form ?? emptyForm();
      dirty.snapshot();
    } catch (err) {
      if (openToken === myToken) {
        setStatus(err?.response?.data?.error || err.message || 'Ошибка загрузки записи', 'error');
      }
    }
  }

  async function openDuplicate(item) {
    if (!(await unsavedGuardApi.confirmExit())) return;
    clearStatus();
    const id = item?.[idField];
    if (id == null) throw new Error(`useRowOpenForm.openDuplicate: missing ${idField}`);

    try {
      const result = await loadOne(id);
      currentId.value = null;
      mode.value = 'create';
      currentItem.value = null;
      const seeded = result?.form ?? emptyForm();
      if ('name' in seeded && typeof seeded.name === 'string') {
        seeded.name = `${seeded.name} (копия)`;
      }
      form.value = seeded;
      dirty.snapshot();
      // Duplicate is unsaved by definition; mark dirty so save is encouraged.
      // (snapshot() above set the baseline to the copied state; we need to
      // re-snapshot the *empty* state to mark dirty. Cheap hack: mutate a
      // hidden field. Cleaner: take snapshot of empty form first.)
      // Actually, duplicate copies all the source fields into form, so the
      // user sees a pre-populated form they must save. Dirty starts false;
      // user edits → dirty true. This matches vanilla behaviour for the
      // "list-level duplicate" client-side starter copy.
    } catch (err) {
      setStatus(err?.response?.data?.error || err.message || 'Ошибка дублирования', 'error');
    }
  }

  // ── Save ────────────────────────────────────────────────────────────
  async function save() {
    if (mode.value == null) return;

    const validation = validate(form.value);
    if (validation !== true) {
      setStatus(typeof validation === 'string' ? validation : 'Ошибка валидации', 'error');
      return;
    }

    try {
      const savedItem = await saveOne(form.value, mode.value, currentId.value);
      const savedId = savedItem?.[idField];
      if (savedId != null) {
        currentId.value = savedId;
      }
      mode.value = 'edit';
      currentItem.value = savedItem;
      dirty.snapshot();
      setStatus(mode.value === 'edit' && currentId.value === savedId ? 'Сохранено' : 'Запись создана', 'ok');
      await list.load();
    } catch (err) {
      setStatus(err?.response?.data?.error || err.message || 'Ошибка сохранения', 'error');
    }
  }

  // ── Exit ────────────────────────────────────────────────────────────
  async function exit() {
    if (!(await unsavedGuardApi.confirmExit())) return;
    resetState();
    clearStatus();
  }

  // ── Delete flow ─────────────────────────────────────────────────────
  async function deleteRecord() {
    if (currentId.value == null) {
      setStatus('Сначала откройте запись', 'error');
      return;
    }

    // Step 1: delete-check preflight (only for surfaces that have one).
    if (deleteCheckHook) {
      try {
        const result = await deleteCheckHook.check(currentId.value);
        if (!result.canDelete) {
          setStatus(result.blockedMessage, 'error');
          return;
        }
      } catch (err) {
        setStatus(err?.response?.data?.error || err.message || 'Ошибка проверки удаления', 'error');
        return;
      }
    }

    // Step 2: dirty confirm (sync).
    if (dirty.isDirty.value) {
      const ok = window.confirm(deleteMessages.dirtyConfirm || 'Есть несохранённые изменения. Удалить без сохранения?');
      if (!ok) return;
    }

    // Step 3: typed phrase via modal — OR — plain confirm.
    if (deletePhrase) {
      deleteModalPhrase.value = deletePhrase(currentId.value);
      deleteModalBlockers.value = [];
      deleteModalVisible.value = true;
      // Caller wires the modal's `confirmed` event to confirmDelete().
      return;
    }

    if (!window.confirm(deleteMessages.plainConfirm || 'Удалить запись?')) return;
    await performDelete();
  }

  // Called by the typed-delete modal's `confirmed` event.
  async function confirmDelete() {
    deleteModalVisible.value = false;
    await performDelete();
  }

  async function performDelete() {
    if (currentId.value == null) return;

    let extraPayload;
    if (typeof beforeDelete === 'function') {
      try {
        extraPayload = await beforeDelete(currentId.value, currentItem.value);
      } catch (err) {
        setStatus(err?.message || 'Ошибка подготовки удаления', 'error');
        return;
      }
    }

    try {
      const config = extraPayload != null ? { data: extraPayload } : undefined;
      await api.delete(`/api/${entityType}/${currentId.value}`, config);
      setStatus(deleteMessages.success || 'Запись удалена', 'ok');
      resetState();
      await list.load();
    } catch (err) {
      // 409 dependency conflicts (Projects, Users): backend returns the same
      // shape as delete-check (dependencies array). Format same way.
      if (err?.response?.status === 409 && err.response?.data) {
        setStatus(formatDependency(err.response.data), 'error');
      } else {
        setStatus(err?.response?.data?.error || err.message || 'Ошибка удаления', 'error');
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────
  return {
    // State
    currentId,
    mode,
    form,
    currentItem,
    isDirty: dirty.isDirty,
    status,
    // Delete-modal state (bind to TypedDeleteConfirm in the template)
    deleteModalVisible,
    deleteModalPhrase,
    deleteModalBlockers,
    // Actions
    openCreate,
    openEdit,
    openDuplicate,
    save,
    exit,
    deleteRecord,
    confirmDelete,
    cancelDelete: () => { deleteModalVisible.value = false; },
    setStatus,
    clearStatus,
  };
}
