// Unit tests for src/composables/useRowOpenForm.js
//
// useRowOpenForm is the top-level state machine for the row-open page pattern.
// It composes useDirtyTracking, useDeleteCheck, useUnsavedGuard, and orchestrates
// loadOne/saveOne/list.load. These tests verify the state transitions and the
// delete flow branches.
//
// vue-router is mocked because useUnsavedGuard calls onBeforeRouteLeave which
// throws outside a router context — the composable already has a try/catch
// fallback for this, so the tests exercise the fallback path.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// useUnsavedGuard imports onBeforeRouteLeave from vue-router; mock to a no-op
// so the composable does not throw when used outside a router context.
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
}));

import api from '@/services/api';
import { useRowOpenForm } from '@/composables/useRowOpenForm';

function makeListRef() {
  const list = ref([
    { id: 1, name: 'one' },
    { id: 2, name: 'two' },
  ]);
  return list;
}

function buildOptions(overrides = {}) {
  const list = makeListRef();
  return {
    entityType: 'widgets',
    idField: 'id',
    emptyForm: () => ({ name: '', notes: '' }),
    validate: () => true,
    loadOne: vi.fn(async (id) => {
      const item = list.value.find((x) => x.id === id);
      return { item, form: { name: item?.name || '', notes: '' } };
    }),
    saveOne: vi.fn(async (form, mode, currentId) => {
      const newItem = { id: currentId ?? 99, ...form };
      return newItem;
    }),
    list: { ref: list, load: vi.fn(async () => {}) },
    hasDeleteCheck: false,
    ...overrides,
  };
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
  api.delete.mockReset();
  // Stub window.confirm to true by default; individual tests override.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('useRowOpenForm — required args', () => {
  it('throws if entityType missing', () => {
    expect(() => useRowOpenForm({ idField: 'id', emptyForm: () => ({}), loadOne: () => {}, saveOne: () => {}, list: { ref: ref([]), load: () => {} } }))
      .toThrow(/entityType is required/);
  });

  it('throws if idField missing', () => {
    expect(() => useRowOpenForm({ entityType: 'x', emptyForm: () => ({}), loadOne: () => {}, saveOne: () => {}, list: { ref: ref([]), load: () => {} } }))
      .toThrow(/idField is required/);
  });

  it('throws if emptyForm is not a function', () => {
    expect(() => useRowOpenForm({ entityType: 'x', idField: 'id', emptyForm: {}, loadOne: () => {}, saveOne: () => {}, list: { ref: ref([]), load: () => {} } }))
      .toThrow(/emptyForm must be a function/);
  });

  it('throws if list missing', () => {
    expect(() => useRowOpenForm({ entityType: 'x', idField: 'id', emptyForm: () => ({}), loadOne: () => {}, saveOne: () => {} }))
      .toThrow(/list \{ ref, load \} is required/);
  });
});

describe('useRowOpenForm — initial state', () => {
  it('starts with currentId null, mode null, empty form', () => {
    const ctx = useRowOpenForm(buildOptions());
    expect(ctx.currentId.value).toBe(null);
    expect(ctx.mode.value).toBe(null);
    expect(ctx.form.value).toEqual({ name: '', notes: '' });
    expect(ctx.isDirty.value).toBe(false);
    expect(ctx.status.value).toBe(null);
  });
});

describe('useRowOpenForm — openCreate', () => {
  it('sets mode=create and resets form', async () => {
    const ctx = useRowOpenForm(buildOptions());
    ctx.form.value.name = 'leftover';
    await ctx.openCreate();
    expect(ctx.mode.value).toBe('create');
    expect(ctx.currentId.value).toBe(null);
    expect(ctx.form.value.name).toBe('');
  });

  it('prefills name if provided and form has `name` key', async () => {
    const ctx = useRowOpenForm(buildOptions());
    await ctx.openCreate('seeded');
    expect(ctx.mode.value).toBe('create');
    expect(ctx.form.value.name).toBe('seeded');
  });

  it('isDirty is false right after openCreate', async () => {
    const ctx = useRowOpenForm(buildOptions());
    await ctx.openCreate('seeded');
    await nextTick();
    expect(ctx.isDirty.value).toBe(false);
  });
});

describe('useRowOpenForm — openEdit', () => {
  it('calls loadOne with id from item', async () => {
    const options = buildOptions();
    const ctx = useRowOpenForm(options);
    await ctx.openEdit({ id: 1, name: 'one' });
    expect(options.loadOne).toHaveBeenCalledWith(1);
  });

  it('populates form from loadOne result', async () => {
    const ctx = useRowOpenForm(buildOptions());
    await ctx.openEdit({ id: 1, name: 'one' });
    expect(ctx.mode.value).toBe('edit');
    expect(ctx.currentId.value).toBe(1);
    expect(ctx.form.value.name).toBe('one');
  });

  it('isDirty stays false after openEdit (snapshot is taken)', async () => {
    const ctx = useRowOpenForm(buildOptions());
    await ctx.openEdit({ id: 1, name: 'one' });
    await nextTick();
    expect(ctx.isDirty.value).toBe(false);
  });

  it('isDirty becomes true after form mutation', async () => {
    const ctx = useRowOpenForm(buildOptions());
    await ctx.openEdit({ id: 1, name: 'one' });
    ctx.form.value.name = 'edited';
    await nextTick();
    expect(ctx.isDirty.value).toBe(true);
  });

  it('throws when idField is missing on item', async () => {
    const ctx = useRowOpenForm(buildOptions());
    await expect(ctx.openEdit({ name: 'orphan' })).rejects.toThrow(/missing id/);
  });

  it('sets status on loadOne error', async () => {
    const options = buildOptions();
    options.loadOne = vi.fn().mockRejectedValue({ response: { data: { error: 'Not allowed' } } });
    const ctx = useRowOpenForm(options);
    await ctx.openEdit({ id: 1 });
    expect(ctx.status.value).toMatchObject({ message: 'Not allowed', tone: 'error' });
  });
});

describe('useRowOpenForm — save', () => {
  it('blocks save if validate fails', async () => {
    const options = buildOptions({ validate: () => 'Заполните название' });
    const ctx = useRowOpenForm(options);
    await ctx.openCreate();
    await ctx.save();
    expect(options.saveOne).not.toHaveBeenCalled();
    expect(ctx.status.value).toMatchObject({ message: 'Заполните название', tone: 'error' });
  });

  it('calls saveOne in create mode and flips to edit mode', async () => {
    const options = buildOptions();
    const ctx = useRowOpenForm(options);
    await ctx.openCreate('new');
    await ctx.save();
    expect(options.saveOne).toHaveBeenCalledWith(expect.objectContaining({ name: 'new' }), 'create', null);
    expect(ctx.mode.value).toBe('edit');
    expect(ctx.currentId.value).toBe(99);
  });

  it('calls saveOne with current id in edit mode', async () => {
    const options = buildOptions();
    const ctx = useRowOpenForm(options);
    await ctx.openEdit({ id: 1, name: 'one' });
    ctx.form.value.name = 'edited';
    await ctx.save();
    expect(options.saveOne).toHaveBeenCalledWith(expect.objectContaining({ name: 'edited' }), 'edit', 1);
  });

  it('reloads list after save', async () => {
    const options = buildOptions();
    const ctx = useRowOpenForm(options);
    await ctx.openCreate();
    await ctx.save();
    expect(options.list.load).toHaveBeenCalled();
  });

  it('keeps record open after save (mode=edit, currentId set)', async () => {
    const options = buildOptions();
    const ctx = useRowOpenForm(options);
    await ctx.openCreate();
    await ctx.save();
    expect(ctx.mode.value).toBe('edit');
    expect(ctx.currentId.value).not.toBe(null);
  });

  it('handles saveOne error and sets status', async () => {
    const options = buildOptions();
    options.saveOne = vi.fn().mockRejectedValue({ response: { data: { error: 'Conflict' } } });
    const ctx = useRowOpenForm(options);
    await ctx.openCreate();
    await ctx.save();
    expect(ctx.status.value).toMatchObject({ message: 'Conflict', tone: 'error' });
  });

  it('does nothing if mode is null', async () => {
    const options = buildOptions();
    const ctx = useRowOpenForm(options);
    await ctx.save();
    expect(options.saveOne).not.toHaveBeenCalled();
  });
});

describe('useRowOpenForm — exit', () => {
  it('resets state to initial', async () => {
    const ctx = useRowOpenForm(buildOptions());
    await ctx.openEdit({ id: 1, name: 'one' });
    await ctx.exit();
    expect(ctx.currentId.value).toBe(null);
    expect(ctx.mode.value).toBe(null);
  });

  it('respects confirm dialog when dirty', async () => {
    const ctx = useRowOpenForm(buildOptions());
    await ctx.openEdit({ id: 1, name: 'one' });
    ctx.form.value.name = 'edited';
    window.confirm.mockReturnValue(false);
    await ctx.exit();
    expect(ctx.currentId.value).toBe(1); // not reset
  });
});

describe('useRowOpenForm — delete flow', () => {
  it('does nothing if no record open', async () => {
    const options = buildOptions();
    const ctx = useRowOpenForm(options);
    await ctx.deleteRecord();
    expect(ctx.status.value).toMatchObject({ message: 'Сначала откройте запись', tone: 'error' });
  });

  it('plain confirm path (no deletePhrase, no delete-check)', async () => {
    const options = buildOptions();
    api.delete.mockResolvedValue({ data: {} });
    const ctx = useRowOpenForm(options);
    await ctx.openEdit({ id: 1, name: 'one' });
    await ctx.deleteRecord();
    expect(api.delete).toHaveBeenCalledWith('/api/widgets/1', undefined);
    expect(ctx.currentId.value).toBe(null);
  });

  it('plain confirm aborted by user', async () => {
    const options = buildOptions();
    const ctx = useRowOpenForm(options);
    await ctx.openEdit({ id: 1, name: 'one' });
    window.confirm.mockReturnValue(false);
    await ctx.deleteRecord();
    expect(api.delete).not.toHaveBeenCalled();
    expect(ctx.currentId.value).toBe(1);
  });

  it('opens typed-delete modal when deletePhrase provided', async () => {
    const options = buildOptions({ deletePhrase: (id) => `DELETE WIDGET ${id}` });
    const ctx = useRowOpenForm(options);
    await ctx.openEdit({ id: 1, name: 'one' });
    await ctx.deleteRecord();
    expect(ctx.deleteModalVisible.value).toBe(true);
    expect(ctx.deleteModalPhrase.value).toBe('DELETE WIDGET 1');
    expect(api.delete).not.toHaveBeenCalled(); // waiting for modal confirm
  });

  it('confirmDelete after modal performs delete', async () => {
    const options = buildOptions({ deletePhrase: (id) => `DELETE WIDGET ${id}` });
    api.delete.mockResolvedValue({ data: {} });
    const ctx = useRowOpenForm(options);
    await ctx.openEdit({ id: 1, name: 'one' });
    await ctx.deleteRecord();
    await ctx.confirmDelete();
    expect(api.delete).toHaveBeenCalledWith('/api/widgets/1', undefined);
    expect(ctx.deleteModalVisible.value).toBe(false);
    expect(ctx.currentId.value).toBe(null);
  });

  it('calls delete-check when hasDeleteCheck=true and shows blocker', async () => {
    api.get.mockResolvedValue({
      data: {
        can_delete: false,
        message: 'In use by 2 tapes',
        dependencies: [{ records: [{ id: 5, name: 'tape5' }] }],
      },
    });
    const options = buildOptions({ hasDeleteCheck: true });
    const ctx = useRowOpenForm(options);
    await ctx.openEdit({ id: 1, name: 'one' });
    await ctx.deleteRecord();
    expect(api.get).toHaveBeenCalledWith('/api/widgets/1/delete-check');
    expect(api.delete).not.toHaveBeenCalled();
    expect(ctx.status.value.tone).toBe('error');
    expect(ctx.status.value.message).toContain('In use by 2 tapes');
  });

  it('proceeds with delete when delete-check says canDelete=true', async () => {
    api.get.mockResolvedValue({ data: { can_delete: true } });
    api.delete.mockResolvedValue({ data: {} });
    const options = buildOptions({ hasDeleteCheck: true });
    const ctx = useRowOpenForm(options);
    await ctx.openEdit({ id: 1, name: 'one' });
    await ctx.deleteRecord();
    expect(api.delete).toHaveBeenCalled();
  });

  it('handles 409 dependency conflict from DELETE response', async () => {
    api.delete.mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Used elsewhere', dependencies: [{ records: [{ id: 7, name: 'foo' }] }] },
      },
    });
    const options = buildOptions();
    const ctx = useRowOpenForm(options);
    await ctx.openEdit({ id: 1, name: 'one' });
    await ctx.deleteRecord();
    expect(ctx.status.value.tone).toBe('error');
    expect(ctx.status.value.message).toContain('Used elsewhere');
    expect(ctx.status.value.message).toContain('#7: foo');
  });

  it('calls beforeDelete hook and sends payload as DELETE body', async () => {
    api.delete.mockResolvedValue({ data: {} });
    const beforeDelete = vi.fn().mockResolvedValue({ disposition: 'available' });
    const options = buildOptions({ beforeDelete });
    const ctx = useRowOpenForm(options);
    await ctx.openEdit({ id: 1, name: 'one' });
    await ctx.deleteRecord();
    expect(beforeDelete).toHaveBeenCalledWith(1, expect.any(Object));
    expect(api.delete).toHaveBeenCalledWith('/api/widgets/1', { data: { disposition: 'available' } });
  });
});

describe('useRowOpenForm — duplicate', () => {
  it('opens a new record with copied fields and "(копия)" name suffix', async () => {
    const options = buildOptions();
    const ctx = useRowOpenForm(options);
    await ctx.openDuplicate({ id: 1, name: 'one' });
    expect(ctx.mode.value).toBe('create');
    expect(ctx.currentId.value).toBe(null);
    expect(ctx.form.value.name).toBe('one (копия)');
  });
});
