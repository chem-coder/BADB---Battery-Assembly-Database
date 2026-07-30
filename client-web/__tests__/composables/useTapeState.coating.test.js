// Unit tests for the coating-step save in src/composables/useTapeState.js:
//
//  saveCoating payload carries method_comments («Комментарий к нанесению
//  и сушке» — parity with vanilla 1-tapes.js, column
//  tape_step_coating.method_comments), distinct from `comments` (notes).
//
// The api service is mocked — no server required.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: null })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('@/services/unsavedConfirm', () => ({
  askToContinue: vi.fn(() => Promise.resolve(true)),
}));

import api from '@/services/api';
import { useTapeState } from '@/composables/useTapeState';

let ts;
beforeEach(() => {
  vi.clearAllMocks();
  ts = useTapeState({
    tapeId: 42,
    refs: { users: [], recipes: [], materials: [] },
  });
});
afterEach(() => {
  ts.cleanup(); // clear pending auto-save/history timers
});

describe('saveCoating payload (method_comments parity)', () => {
  it('sends method_comments separately from the step-header comments', async () => {
    ts.steps.coating.notes = 'заметка шапки';
    ts.steps.coating.method_comments = 'сушили при открытой камере';
    await ts.saveStep('coating');
    const call = api.post.mock.calls.find(([url]) => url.includes('/steps/by-code/coating'));
    expect(call).toBeTruthy();
    const payload = call[1];
    expect(payload.comments).toBe('заметка шапки');
    expect(payload.method_comments).toBe('сушили при открытой камере');
  });

  it('empty method_comments is sent as null (clears the column)', async () => {
    ts.steps.coating.method_comments = '';
    await ts.saveStep('coating');
    const call = api.post.mock.calls.find(([url]) => url.includes('/steps/by-code/coating'));
    expect(call[1].method_comments).toBeNull();
  });
});
