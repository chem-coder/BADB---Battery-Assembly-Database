/**
 * Electrode-cut-batch guided-delete helpers (frontend).
 *
 * Mirrors vanilla `public/js/2-electrodes.js`: a delete-check preflight, then a
 * typed phrase `DELETE BATCH <id>` confirmation, then a plain DELETE. The typed
 * phrase is a UX confirmation guardrail — the backend enforces the real control
 * (dependency blockers: electrodes still in the batch, or battery links). There
 * is no electrode-disposition step here (that is battery-specific).
 */

/** The exact confirmation phrase vanilla uses. */
export function electrodeBatchDeletePhrase(cutBatchId) {
  return `DELETE BATCH ${cutBatchId}`
}

/**
 * Map delete-check `dependencies` rows ({ label, count }) to human-readable
 * blocker strings for TypedDeleteConfirm's `blockers` list.
 */
export function electrodeDeleteBlockers(dependencies) {
  return (Array.isArray(dependencies) ? dependencies : [])
    .map((d) => (d && d.count ? `${d.label} (${d.count})` : d && d.label) || '')
    .filter(Boolean)
}
