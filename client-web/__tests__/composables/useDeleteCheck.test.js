// Unit tests for src/composables/useDeleteCheck.js
//
// The composable wraps GET /api/<entityType>/:id/delete-check. We mock
// the api service so the test does not require a server.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from '@/services/api';
import { useDeleteCheck } from '@/composables/useDeleteCheck';

describe('useDeleteCheck', () => {
  beforeEach(() => {
    api.get.mockReset();
  });

  it('throws if entityType is missing at construction', async () => {
    const { check } = useDeleteCheck();
    await expect(check(1)).rejects.toThrow(/entityType is required/);
  });

  it('throws if id is missing at call time', async () => {
    const { check } = useDeleteCheck('recipes');
    await expect(check(null)).rejects.toThrow(/id is required/);
    await expect(check(undefined)).rejects.toThrow(/id is required/);
  });

  it('returns canDelete=true when backend says so', async () => {
    api.get.mockResolvedValue({ data: { can_delete: true, message: '', dependencies: [] } });
    const { check } = useDeleteCheck('recipes');
    const result = await check(42);

    expect(api.get).toHaveBeenCalledWith('/api/recipes/42/delete-check');
    expect(result.canDelete).toBe(true);
    expect(result.blockedMessage).toBe(null);
  });

  it('formats blockedMessage when canDelete=false', async () => {
    api.get.mockResolvedValue({
      data: {
        can_delete: false,
        message: 'Нельзя удалить: используется в лентах.',
        dependencies: [{ records: [{ id: 1, name: 'tape-A' }] }],
      },
    });
    const { check } = useDeleteCheck('recipes');
    const result = await check(7);

    expect(result.canDelete).toBe(false);
    expect(result.blockedMessage).toContain('Нельзя удалить: используется в лентах.');
    expect(result.blockedMessage).toContain('#1: tape-A');
  });

  it('exposes dependencies array verbatim', async () => {
    const deps = [{ records: [{ id: 5 }] }];
    api.get.mockResolvedValue({ data: { can_delete: false, dependencies: deps } });
    const { check } = useDeleteCheck('tapes');
    const result = await check(99);

    expect(result.dependencies).toEqual(deps);
  });

  it('propagates backend errors (e.g. 404, 5xx) to caller', async () => {
    const apiError = new Error('Network error');
    api.get.mockRejectedValue(apiError);
    const { check } = useDeleteCheck('recipes');
    await expect(check(1)).rejects.toThrow('Network error');
  });

  it('uses the configured entityType in the URL', async () => {
    api.get.mockResolvedValue({ data: { can_delete: true } });
    const { check: checkElectrolytes } = useDeleteCheck('electrolytes');
    await checkElectrolytes(8);
    expect(api.get).toHaveBeenCalledWith('/api/electrolytes/8/delete-check');

    api.get.mockResolvedValue({ data: { can_delete: true } });
    const { check: checkSeparators } = useDeleteCheck('separators');
    await checkSeparators(11);
    expect(api.get).toHaveBeenCalledWith('/api/separators/11/delete-check');
  });

  it('supports a custom check-URL builder for nested entity paths (electrode batches)', async () => {
    api.get.mockResolvedValue({ data: { can_delete: true, dependencies: [] } });
    const { check } = useDeleteCheck('electrodes', {
      checkUrl: (id) => `/api/electrodes/electrode-cut-batches/${id}/delete-check`,
    });
    const result = await check(7);
    expect(api.get).toHaveBeenCalledWith('/api/electrodes/electrode-cut-batches/7/delete-check');
    expect(result.canDelete).toBe(true);
  });
});
