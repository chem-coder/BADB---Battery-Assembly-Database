/**
 * Tape guided-delete helpers (frontend).
 *
 * Mirrors vanilla `public/js/1-tapes.js`: a delete-check preflight, then a typed
 * phrase `DELETE TAPE <id>` confirmation, then a plain DELETE. The typed phrase
 * is a UX confirmation guardrail. Tape delete is admin/lead-gated (the backend
 * `requireRole('admin','lead')` is the real control) and the backend enforces
 * the dependency blockers (electrode cut batches / battery links).
 */

/** The exact confirmation phrase vanilla uses. */
export function tapeDeletePhrase(tapeId) {
  return `DELETE TAPE ${tapeId}`
}

/**
 * Map delete-check `dependencies` rows ({ label, count }) to human-readable
 * blocker strings for TypedDeleteConfirm's `blockers` list.
 */
export function tapeDeleteBlockers(dependencies) {
  return (Array.isArray(dependencies) ? dependencies : [])
    .map((d) => (d && d.count ? `${d.label} (${d.count})` : d && d.label) || '')
    .filter(Boolean)
}
