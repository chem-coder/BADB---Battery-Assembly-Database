/**
 * useDeleteCheck — wrapper around GET /api/<entityType>/:id/delete-check.
 *
 * Returns the parsed response with a pre-formatted human-readable
 * blocked message (via `formatDependency`). The composable does NOT raise
 * on backend errors that come back as a structured response (e.g. 404
 * "Record not found" or backend 5xx returning JSON); those propagate to
 * the caller as axios errors.
 *
 * Surfaces with a delete-check route (per docs/current/vanilla_reference_pages.md):
 *   tapes, recipes, electrolytes, separators, batteries, electrode batches.
 *
 * Surfaces without a delete-check route (projects, users, departments) must
 * not call this composable; their delete flow surfaces 409 dependency
 * conflicts from the DELETE response directly.
 *
 * Usage:
 *   const { check } = useDeleteCheck('recipes');
 *   const result = await check(42);
 *   if (!result.canDelete) {
 *     status.value = { message: result.blockedMessage, tone: 'error' };
 *     return;
 *   }
 */

import api from '@/services/api';
import { formatDependency } from '@/utils/formatDependency';

export function useDeleteCheck(entityType) {
  async function check(id) {
    if (!entityType) {
      throw new Error('useDeleteCheck: entityType is required');
    }
    if (id == null) {
      throw new Error('useDeleteCheck: id is required');
    }

    const { data } = await api.get(`/api/${entityType}/${id}/delete-check`);

    // Backend response shape (verified against routes/recipes.js:430-446):
    //   { can_delete: boolean, message: string, dependencies: [{ records: [...] }] }
    return {
      canDelete: Boolean(data?.can_delete),
      blockedMessage: data?.can_delete ? null : formatDependency(data),
      dependencies: data?.dependencies ?? [],
      raw: data,
    };
  }

  return { check };
}
