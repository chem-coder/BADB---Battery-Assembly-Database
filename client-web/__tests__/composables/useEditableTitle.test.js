// Unit tests for src/composables/useEditableTitle.js
//
// State machine only. The DOM event wiring is verified separately in
// the EditableTitle.vue component test.

import { describe, it, expect } from 'vitest';
import { useEditableTitle } from '@/composables/useEditableTitle';

describe('useEditableTitle', () => {
  it('starts in non-editing state', () => {
    const { editing } = useEditableTitle();
    expect(editing.value).toBe(false);
  });

  it('start() puts state into editing', () => {
    const { editing, start } = useEditableTitle();
    start();
    expect(editing.value).toBe(true);
  });

  it('commit() exits editing state', () => {
    const { editing, start, commit } = useEditableTitle();
    start();
    commit();
    expect(editing.value).toBe(false);
  });

  it('cancel() exits editing state', () => {
    const { editing, start, cancel } = useEditableTitle();
    start();
    cancel();
    expect(editing.value).toBe(false);
  });

  it('multiple start/commit cycles are supported', () => {
    const { editing, start, commit } = useEditableTitle();
    start(); commit();
    start(); commit();
    start(); commit();
    expect(editing.value).toBe(false);
  });
});
