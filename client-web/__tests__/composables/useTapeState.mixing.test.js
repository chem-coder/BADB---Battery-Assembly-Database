// Unit tests for the d048 mixing additions in src/composables/useTapeState.js:
//
//  1. slurry volume → wet-mixing-method auto-selection (window match on
//     auto_min/auto_max_volume_ml; largest auto_min wins on overlap;
//     manual pick disarms the auto-override until the method is cleared)
//  2. saveMixing payload carries container_id + normalized balls[]
//
// The api service is mocked — no server required. The ball-suggestion
// MATH is covered separately in __tests__/utils/ballSuggestion.test.js.

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

// Mirrors the d048 reference rows: mag_stir has a NULL window
// (manual-only); by_hand 0–15 and vilitek 15–150 overlap at exactly 15,
// where the larger auto_min (vilitek) must win.
const WET_METHODS = [
  { wet_mixing_id: 1, name: 'mag_stir', auto_min_volume_ml: null, auto_max_volume_ml: null, uses_balls: false, uses_containers: false },
  { wet_mixing_id: 2, name: 'by_hand', auto_min_volume_ml: 0, auto_max_volume_ml: 15, uses_balls: false, uses_containers: false },
  { wet_mixing_id: 3, name: 'vilitek_vitt_300s', auto_min_volume_ml: 15, auto_max_volume_ml: 150, uses_balls: true, uses_containers: true },
  { wet_mixing_id: 4, name: 'gn_vm_7', auto_min_volume_ml: 150, auto_max_volume_ml: 450, uses_balls: false, uses_containers: false },
];

function makeState() {
  return useTapeState({
    tapeId: 42,
    refs: { wetMixingMethods: WET_METHODS, users: [], recipes: [], materials: [] },
  });
}

let ts;
beforeEach(() => {
  vi.clearAllMocks();
  ts = makeState();
});
afterEach(() => {
  ts.cleanup(); // clear pending auto-save/history timers
});

describe('slurry volume → wet mixing method auto-selection (d048)', () => {
  it('auto-sets the method while the field is empty', () => {
    ts.setFieldValue('mixing', 'slurryVolumeMl', '100');
    expect(ts.steps.mixing.wetMixingId).toBe(3); // vilitek 15–150
  });

  it('on overlapping windows the largest auto_min_volume_ml wins', () => {
    ts.setFieldValue('mixing', 'slurryVolumeMl', '15'); // by_hand AND vilitek match
    expect(ts.steps.mixing.wetMixingId).toBe(3);
  });

  it('never suggests methods with a NULL window, and leaves the field alone outside all windows', () => {
    ts.setFieldValue('mixing', 'slurryVolumeMl', '9999');
    expect(ts.steps.mixing.wetMixingId).toBe('');
  });

  it('keeps overriding its own previous auto-set value', () => {
    ts.setFieldValue('mixing', 'slurryVolumeMl', '100');
    expect(ts.steps.mixing.wetMixingId).toBe(3);
    ts.setFieldValue('mixing', 'slurryVolumeMl', '300');
    expect(ts.steps.mixing.wetMixingId).toBe(4); // gn_vm_7 150–450
  });

  it('a manual selection stops the auto-override', () => {
    ts.setFieldValue('mixing', 'wetMixingId', 1); // manual: mag_stir
    ts.setFieldValue('mixing', 'slurryVolumeMl', '100');
    expect(ts.steps.mixing.wetMixingId).toBe(1); // untouched
  });

  it('clearing the method re-arms auto-selection (but does not re-fill immediately)', () => {
    ts.setFieldValue('mixing', 'wetMixingId', 1);
    ts.setFieldValue('mixing', 'slurryVolumeMl', '100');
    expect(ts.steps.mixing.wetMixingId).toBe(1);
    ts.setFieldValue('mixing', 'wetMixingId', ''); // user clears
    expect(ts.steps.mixing.wetMixingId).toBe(''); // no instant re-fill
    ts.setFieldValue('mixing', 'slurryVolumeMl', '120');
    expect(ts.steps.mixing.wetMixingId).toBe(3); // auto again
  });

  it('a restored (saved) method is treated as manual — volume edits do not override it', () => {
    ts.steps.mixing.wetMixingId = 4; // as restore() would set it
    ts.setFieldValue('mixing', 'slurryVolumeMl', '20');
    expect(ts.steps.mixing.wetMixingId).toBe(4);
  });
});

describe('saveMixing payload (d048 container + balls)', () => {
  it('sends container_id and only complete ball rows; empty balls array is sent (replace-all)', async () => {
    ts.steps.mixing.containerId = 2;
    ts.steps.mixing.balls = [
      { diameter_cm: 1, ball_count: 12 },
      { diameter_cm: 0.5, ball_count: 0 },   // incomplete — dropped
      { diameter_cm: 0.75, ball_count: '3' }, // numeric string — normalized
    ];
    await ts.saveStep('mixing');
    const call = api.post.mock.calls.find(([url]) => url.includes('/steps/by-code/mixing'));
    expect(call).toBeTruthy();
    const payload = call[1];
    expect(payload.container_id).toBe(2);
    expect(payload.balls).toEqual([
      { diameter_cm: 1, ball_count: 12 },
      { diameter_cm: 0.75, ball_count: 3 },
    ]);

    // No container / no balls → null + [] (empty array clears saved rows)
    api.post.mockClear();
    ts.steps.mixing.containerId = '';
    ts.steps.mixing.balls = [];
    await ts.saveStep('mixing');
    const call2 = api.post.mock.calls.find(([url]) => url.includes('/steps/by-code/mixing'));
    expect(call2[1].container_id).toBeNull();
    expect(call2[1].balls).toEqual([]);
  });
});
