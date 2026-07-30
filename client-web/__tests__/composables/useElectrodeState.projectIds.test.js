// Regression tests for the electrode cut-batch project-link wipe.
//
// DSMultiSelect (show-clear) can emit [] for `general.project_ids`. The
// save path used to PUT `project_ids: []` (+ `project_id: null`), which
// strips every M:N link in electrode_cut_batch_projects — silent data
// loss that vanilla makes impossible.
//
// Pinned contract (see services/electrodeBatchProjectService.js →
// getPayloadProjectIds): an OMITTED key preserves the current links
// server-side, so when the selection is empty BOTH `project_ids` and
// `project_id` must be absent from the PUT body.

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('useElectrodeState — project_ids in the cutting PUT payload', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    api.post.mockReset();
    api.put.mockResolvedValue({ data: {} });
  });

  it('empty project_ids → BOTH project keys omitted (existing links preserved)', async () => {
    const state = useElectrodeState({ batchId: BATCH_ID });
    state.general.project_ids = []; // cleared via show-clear

    await state.saveStep('cutting');

    expect(api.put).toHaveBeenCalledTimes(1);
    const [url, body] = api.put.mock.calls[0];
    expect(url).toBe(`/api/electrodes/electrode-cut-batches/${BATCH_ID}`);
    expect(body).not.toHaveProperty('project_ids');
    expect(body).not.toHaveProperty('project_id');
  });

  it('non-empty project_ids → sent as numbers, with legacy project_id echo', async () => {
    const state = useElectrodeState({ batchId: BATCH_ID });
    state.general.project_ids = ['3', 5];

    await state.saveStep('cutting');

    const [, body] = api.put.mock.calls[0];
    expect(body.project_ids).toEqual([3, 5]);
    expect(body.project_id).toBe(3);
  });

  it('no batch id → no PUT at all', async () => {
    const state = useElectrodeState({});
    state.general.project_ids = [];

    await state.saveStep('cutting');

    expect(api.put).not.toHaveBeenCalled();
  });
});
