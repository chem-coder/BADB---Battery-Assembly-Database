// Unit tests for src/composables/useDirtyTracking.js
//
// State machine: snapshot baseline → modify → isDirty true → reset →
// form restored, isDirty false.

import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import { useDirtyTracking } from '@/composables/useDirtyTracking';

describe('useDirtyTracking', () => {
  it('isDirty is false right after construction', () => {
    const form = ref({ name: 'a', notes: '' });
    const { isDirty } = useDirtyTracking(form);
    expect(isDirty.value).toBe(false);
  });

  it('isDirty becomes true after form mutation', async () => {
    const form = ref({ name: 'a' });
    const { isDirty } = useDirtyTracking(form);

    form.value.name = 'b';
    await nextTick();
    expect(isDirty.value).toBe(true);
  });

  it('isDirty becomes true after form replacement', async () => {
    const form = ref({ name: 'a' });
    const { isDirty } = useDirtyTracking(form);

    form.value = { name: 'c' };
    await nextTick();
    expect(isDirty.value).toBe(true);
  });

  it('snapshot() captures current state as new baseline', async () => {
    const form = ref({ name: 'a' });
    const { isDirty, snapshot } = useDirtyTracking(form);

    form.value.name = 'b';
    await nextTick();
    expect(isDirty.value).toBe(true);

    snapshot();
    await nextTick();
    expect(isDirty.value).toBe(false);
  });

  it('reset() restores form to last snapshot', async () => {
    const form = ref({ name: 'a', notes: 'x' });
    const { isDirty, reset } = useDirtyTracking(form);

    form.value.name = 'b';
    form.value.notes = 'y';
    await nextTick();
    expect(isDirty.value).toBe(true);

    reset();
    await nextTick();
    expect(form.value).toEqual({ name: 'a', notes: 'x' });
    expect(isDirty.value).toBe(false);
  });

  it('handles nested objects', async () => {
    const form = ref({ outer: { inner: 1 } });
    const { isDirty } = useDirtyTracking(form);

    form.value.outer.inner = 2;
    await nextTick();
    expect(isDirty.value).toBe(true);
  });

  it('handles arrays', async () => {
    const form = ref({ tags: ['a', 'b'] });
    const { isDirty, snapshot } = useDirtyTracking(form);

    form.value.tags.push('c');
    await nextTick();
    expect(isDirty.value).toBe(true);

    snapshot();
    await nextTick();
    expect(isDirty.value).toBe(false);
  });

  it('reset() does not break dirty tracking on subsequent edits', async () => {
    const form = ref({ name: 'a' });
    const { isDirty, reset } = useDirtyTracking(form);

    form.value.name = 'b';
    await nextTick();
    reset();
    await nextTick();
    expect(isDirty.value).toBe(false);

    form.value.name = 'c';
    await nextTick();
    expect(isDirty.value).toBe(true);
  });
});
