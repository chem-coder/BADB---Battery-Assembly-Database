// Unit tests for the electrode-sources (multi-row) model in
// src/composables/useBatteryState.js.
//
// Regression focus: the old flat-key PATCH collapsed each role's N
// source rows down to ONE and silently destroyed extra sources added
// in vanilla. These tests pin the array-mode contract:
//   - load maps ALL rows per role (is_primary DESC, sort_order ASC);
//   - save PATCHes { sources: [...] } with per-role sort_order and
//     is_primary, both roles always serialized;
//   - a load → save round-trip preserves every row.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

import api from '@/services/api';
import { useBatteryState, emptyElectrodeSourceRow } from '@/composables/useBatteryState';

const BATTERY_ID = 5;

function mockRestoreEndpoints({ sources } = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/api/batteries') {
      return Promise.resolve({
        data: [{
          battery_id: BATTERY_ID,
          form_factor: 'pouch',
          project_ids: [1],
          notes: '',
          item_created_at: null,
        }],
      });
    }
    if (url === `/api/batteries/battery_electrode_sources/${BATTERY_ID}`) {
      // Backend returns null when no rows exist.
      return Promise.resolve({ data: sources ?? null });
    }
    // Config / separator / electrolyte / qc — irrelevant here; the
    // composable swallows per-endpoint failures.
    return Promise.reject(new Error(`no mock for ${url}`));
  });
}

describe('useBatteryState — electrode sources (multi-row)', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.patch.mockReset();
    api.post.mockReset();
  });

  it('starts with one empty row per role', () => {
    const state = useBatteryState({ batteryId: BATTERY_ID });
    expect(state.steps.electrodes.cathodeSources).toEqual([emptyElectrodeSourceRow()]);
    expect(state.steps.electrodes.anodeSources).toEqual([emptyElectrodeSourceRow()]);
  });

  it('restore() maps ALL rows per role ordered is_primary DESC, sort_order ASC', async () => {
    mockRestoreEndpoints({
      sources: [
        // Deliberately shuffled: primary rows last, sort orders reversed.
        { role: 'cathode', tape_id: 11, cut_batch_id: 102, source_notes: 'extra-2', sort_order: 2, is_primary: false },
        { role: 'anode', tape_id: 20, cut_batch_id: 200, source_notes: null, sort_order: 0, is_primary: true },
        { role: 'cathode', tape_id: 11, cut_batch_id: 101, source_notes: 'extra-1', sort_order: 1, is_primary: false },
        { role: 'cathode', tape_id: 10, cut_batch_id: 100, source_notes: 'primary', sort_order: 0, is_primary: true },
      ],
    });

    const state = useBatteryState({ batteryId: BATTERY_ID });
    await state.restore();

    expect(state.steps.electrodes.cathodeSources).toEqual([
      { tape_id: 10, cut_batch_id: 100, source_notes: 'primary' },
      { tape_id: 11, cut_batch_id: 101, source_notes: 'extra-1' },
      { tape_id: 11, cut_batch_id: 102, source_notes: 'extra-2' },
    ]);
    expect(state.steps.electrodes.anodeSources).toEqual([
      { tape_id: 20, cut_batch_id: 200, source_notes: '' },
    ]);
  });

  it('restore() with no saved sources keeps one empty row per role', async () => {
    mockRestoreEndpoints({ sources: null });

    const state = useBatteryState({ batteryId: BATTERY_ID });
    await state.restore();

    expect(state.steps.electrodes.cathodeSources).toEqual([emptyElectrodeSourceRow()]);
    expect(state.steps.electrodes.anodeSources).toEqual([emptyElectrodeSourceRow()]);
  });

  it('saveStep("electrodes") PATCHes array mode with per-role sort_order / is_primary', async () => {
    api.patch.mockResolvedValue({ data: { success: true } });
    const state = useBatteryState({ batteryId: BATTERY_ID });

    state.setFieldValue('electrodes', 'cathodeSources', [
      { tape_id: 10, cut_batch_id: 100, source_notes: 'primary' },
      { tape_id: 11, cut_batch_id: 101, source_notes: '  ' }, // notes blank → null
    ]);
    state.setFieldValue('electrodes', 'anodeSources', [
      { tape_id: 20, cut_batch_id: 200, source_notes: 'anode note' },
    ]);

    await state.saveStep('electrodes');

    expect(api.patch).toHaveBeenCalledWith(
      `/api/batteries/battery_electrode_sources/${BATTERY_ID}`,
      {
        sources: [
          { role: 'cathode', tape_id: 10, cut_batch_id: 100, source_notes: 'primary', sort_order: 0, is_primary: true },
          { role: 'cathode', tape_id: 11, cut_batch_id: 101, source_notes: null, sort_order: 1, is_primary: false },
          { role: 'anode', tape_id: 20, cut_batch_id: 200, source_notes: 'anode note', sort_order: 0, is_primary: true },
        ],
      }
    );
  });

  it('saveStep("electrodes") drops fully-empty rows but always sends both roles', async () => {
    api.patch.mockResolvedValue({ data: { success: true } });
    const state = useBatteryState({ batteryId: BATTERY_ID });

    state.setFieldValue('electrodes', 'cathodeSources', [
      { tape_id: 10, cut_batch_id: 100, source_notes: '' },
      emptyElectrodeSourceRow(), // trailing blank row must not be sent
    ]);
    // anode untouched → single empty row → zero anode rows in payload
    await state.saveStep('electrodes');

    const payload = api.patch.mock.calls[0][1];
    expect(payload.sources).toEqual([
      { role: 'cathode', tape_id: 10, cut_batch_id: 100, source_notes: null, sort_order: 0, is_primary: true },
    ]);
  });

  it('round-trip: restore → save preserves every loaded row (no data loss)', async () => {
    const saved = [
      { role: 'cathode', tape_id: 10, cut_batch_id: 100, source_notes: 'p', sort_order: 0, is_primary: true },
      { role: 'cathode', tape_id: 11, cut_batch_id: 101, source_notes: null, sort_order: 1, is_primary: false },
      { role: 'cathode', tape_id: 12, cut_batch_id: 102, source_notes: null, sort_order: 2, is_primary: false },
      { role: 'anode', tape_id: 20, cut_batch_id: 200, source_notes: null, sort_order: 0, is_primary: true },
      { role: 'anode', tape_id: 21, cut_batch_id: 201, source_notes: 'x', sort_order: 1, is_primary: false },
    ];
    mockRestoreEndpoints({ sources: saved });
    api.patch.mockResolvedValue({ data: { success: true } });

    const state = useBatteryState({ batteryId: BATTERY_ID });
    await state.restore();
    await state.saveStep('electrodes');

    const payload = api.patch.mock.calls[0][1];
    // Every saved row survives the round-trip with role/tape/batch intact.
    expect(payload.sources).toHaveLength(saved.length);
    expect(payload.sources.map(r => [r.role, r.tape_id, r.cut_batch_id])).toEqual(
      saved.map(r => [r.role, r.tape_id, r.cut_batch_id])
    );
    // Exactly one primary per role, at index 0 of the role group.
    const primaries = payload.sources.filter(r => r.is_primary);
    expect(primaries.map(r => r.role).sort()).toEqual(['anode', 'cathode']);
  });

  it('setFieldValue deep-copies row arrays (no shared references)', () => {
    const state = useBatteryState({ batteryId: BATTERY_ID });
    const rows = [{ tape_id: 10, cut_batch_id: 100, source_notes: 'a' }];
    state.setFieldValue('electrodes', 'cathodeSources', rows);

    rows[0].cut_batch_id = 999; // mutate caller's array after set
    expect(state.steps.electrodes.cathodeSources[0].cut_batch_id).toBe(100);
  });

  it('stageStatus("electrodes") reflects any row with a tape or batch', () => {
    const state = useBatteryState({ batteryId: BATTERY_ID });
    expect(state.stageStatus('electrodes')).toBe('pending');

    state.setFieldValue('electrodes', 'anodeSources', [
      emptyElectrodeSourceRow(),
      { tape_id: '', cut_batch_id: 201, source_notes: '' },
    ]);
    expect(state.stageStatus('electrodes')).toBe('done');
  });
});
