// Regression tests for stale geometry on form-factor / shape switch.
//
// A batch created as coin (circle, diameter_mm) then switched to pouch
// (rectangle) used to keep the old diameter in the cutting PUT payload —
// contradictory dimensions the backend happily persisted. The fix
// mirrors BatchCreateDialog's null-by-shape rule (circle → length/width
// null; rectangle → diameter null) in BOTH the local shape cascade and
// the saveStep('cutting') payload.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

import api from '@/services/api';
import { useElectrodeState } from '@/composables/useElectrodeState';

const BATCH_ID = 42;

describe('useElectrodeState — null-by-shape geometry', () => {
  let state;

  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    api.post.mockReset();
    api.put.mockResolvedValue({ data: {} });
    state = useElectrodeState({ batchId: BATCH_ID });
  });

  afterEach(() => {
    // Drop pending auto-save timers scheduled by setFieldValue.
    state.cleanup();
  });

  it('rectangle batch → diameter_mm is null in the PUT even if stale locally', async () => {
    state.general.shape = 'rectangle';
    state.general.diameter_mm = 15;   // stale leftover from a coin past
    state.general.length_mm = 103;
    state.general.width_mm = 83;

    await state.saveStep('cutting');

    const [, body] = api.put.mock.calls[0];
    expect(body.shape).toBe('rectangle');
    expect(body.diameter_mm).toBeNull();
    expect(body.length_mm).toBe(103);
    expect(body.width_mm).toBe(83);
  });

  it('circle batch → length/width are null in the PUT even if stale locally', async () => {
    state.general.shape = 'circle';
    state.general.diameter_mm = 15;
    state.general.length_mm = 103;    // stale leftovers from a pouch past
    state.general.width_mm = 83;

    await state.saveStep('cutting');

    const [, body] = api.put.mock.calls[0];
    expect(body.shape).toBe('circle');
    expect(body.diameter_mm).toBe(15);
    expect(body.length_mm).toBeNull();
    expect(body.width_mm).toBeNull();
  });

  it('form-factor switch coin → pouch clears the local diameter', () => {
    state.general.target_form_factor = 'coin';
    state.general.shape = 'circle';
    state.general.diameter_mm = 15;

    state.setFieldValue('cutting', 'target_form_factor', 'pouch');

    expect(state.general.shape).toBe('rectangle');
    expect(state.general.diameter_mm).toBe('');
  });

  it('direct shape switch rectangle → circle clears local length/width', () => {
    state.general.shape = 'rectangle';
    state.general.length_mm = 103;
    state.general.width_mm = 83;

    state.setFieldValue('cutting', 'shape', 'circle');

    expect(state.general.length_mm).toBe('');
    expect(state.general.width_mm).toBe('');
  });
});
