// Regression tests for the 2026-07-30 silent-data-loss incident.
//
// A battery created in Vue has NO battery_coin_config / battery_sep_config /
// battery_electrolyte rows yet (they appear only on first save). The stage
// auto-save used the PATCH endpoints, which 404 while the row is missing,
// and the auto-save catch logged to console only — every stage save failed
// silently and the user's data vanished on reload.
//
// Pinned contract:
//   - config (coin) / separator / electrolyte saves go through the POST
//     upsert endpoints (ON CONFLICT battery_id) with battery_id in the body;
//   - a failed auto-save calls onSaveError (visible toast), never only
//     console.error, and the stage stays dirty.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

import api from '@/services/api';
import { useBatteryState } from '@/composables/useBatteryState';

const BATTERY_ID = 7;

describe('useBatteryState — save endpoints (fresh battery, no child rows)', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.patch.mockReset();
    api.post.mockReset();
    api.post.mockResolvedValue({ data: {} });
    api.patch.mockResolvedValue({ data: {} });
  });

  it('coin config saves via POST upsert with battery_id in the body', async () => {
    const state = useBatteryState({ batteryId: BATTERY_ID });
    state.general.form_factor = 'coin';
    state.steps.config.coin_cell_mode = 'half_cell';
    state.steps.config.coin_size_code = '2032';

    await state.saveStep('config');

    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith(
      '/api/batteries/battery_coin_config',
      expect.objectContaining({
        battery_id: BATTERY_ID,
        coin_cell_mode: 'half_cell',
        coin_size_code: '2032',
      })
    );
  });

  it('prism config saves via the POUCH POST upsert (d036: prism reuses battery_pouch_config)', async () => {
    const state = useBatteryState({ batteryId: BATTERY_ID });
    state.general.form_factor = 'prism';
    state.steps.config.pouch_case_size_code = '103x83';
    state.steps.config.pouch_notes = 'призматическая ячейка';

    await state.saveStep('config');

    // The old routing had no prism branch, so prism fell into the coin
    // default and its config was silently written to battery_coin_config.
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      '/api/batteries/battery_pouch_config',
      expect.objectContaining({
        battery_id: BATTERY_ID,
        pouch_case_size_code: '103x83',
        pouch_notes: 'призматическая ячейка',
      })
    );
  });

  it('separator saves via POST upsert with battery_id in the body', async () => {
    const state = useBatteryState({ batteryId: BATTERY_ID });
    state.steps.separator.separator_id = '3';
    state.steps.separator.separator_notes = 'Celgard 2500';

    await state.saveStep('separator');

    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith(
      '/api/batteries/battery_sep_config',
      { battery_id: BATTERY_ID, separator_id: '3', separator_notes: 'Celgard 2500' }
    );
  });

  it('electrolyte saves via POST upsert; volume goes through toNum (0 preserved)', async () => {
    const state = useBatteryState({ batteryId: BATTERY_ID });
    state.steps.electrolyte.electrolyte_id = '2';
    state.steps.electrolyte.electrolyte_total_ul = '0';

    await state.saveStep('electrolyte');

    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith(
      '/api/batteries/battery_electrolyte',
      expect.objectContaining({
        battery_id: BATTERY_ID,
        electrolyte_id: '2',
        electrolyte_total_ul: 0,
      })
    );
  });

  it('failed auto-save calls onSaveError and keeps the stage dirty', async () => {
    vi.useFakeTimers();
    const onSaveError = vi.fn();
    const boom = new Error('404 Конфигурация не найдена');
    api.post.mockRejectedValue(boom);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const state = useBatteryState({ batteryId: BATTERY_ID, onSaveError });
      state.general.form_factor = 'coin';
      state.setFieldValue('config', 'coin_size_code', '2032');

      await vi.runAllTimersAsync(); // fire the debounced auto-save

      expect(onSaveError).toHaveBeenCalledWith('config', boom);
      expect(state.dirtySteps.config).toBe(true); // still unsaved, visibly
    } finally {
      consoleSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
