/**
 * Battery guided-delete helpers — the contract-critical pieces of the
 * battery delete flow, kept pure and testable.
 *
 * Mirrors vanilla `public/js/3-batteries.js` and the backend contract in
 * `services/batteryLifecycleService.js` / `docs/rules/battery_lifecycle_rules.md`:
 *
 *   - Physical delete requires the typed phrase `DELETE BATTERY <id>`
 *     (validateBatteryDeleteOptions throws 400 otherwise).
 *   - When linked electrodes exist, the request MUST include an
 *     `electrode_disposition` of `available` or `scrapped`; `scrapped` may
 *     carry a `scrapped_reason` (backend fills a default when blank).
 *   - Hard blockers (cycling_sessions, module_batteries) make delete
 *     impossible until cleared — the UI must not offer confirmation.
 */

export const ELECTRODE_DISPOSITIONS = ['available', 'scrapped']

/** The exact typed-confirmation phrase the backend validates. */
export function batteryDeletePhrase(batteryId) {
  return `DELETE BATTERY ${batteryId}`
}

/**
 * Normalize a `GET /api/batteries/:id/delete-check` response into the shape
 * the dialog needs. `hard_blockers` / `confirmable_owned_data` are
 * dependency-conflict rows ({ label, count, records }); `linked_electrodes`
 * is the list whose presence requires an electrode disposition.
 */
export function mapBatteryDeleteCheck(raw) {
  const r = raw || {}
  const hardBlockers = Array.isArray(r.hard_blockers) ? r.hard_blockers : []
  const ownedData = Array.isArray(r.confirmable_owned_data) ? r.confirmable_owned_data : []
  const linkedElectrodes = Array.isArray(r.linked_electrodes) ? r.linked_electrodes : []
  return {
    canDelete: r.can_delete !== false && hardBlockers.length === 0,
    blockers: hardBlockers
      .map((b) => (b && b.count ? `${b.label} (${b.count})` : b && b.label) || '')
      .filter(Boolean),
    ownedData: ownedData.map((d) => ({ label: d.label, count: d.count })),
    linkedElectrodes,
  }
}

/**
 * Whether the «Удалить» button may be enabled (independent of the typed
 * phrase, which TypedDeleteConfirm checks separately). Disposition is only
 * required when linked electrodes exist.
 */
export function batteryDeleteConfirmEnabled(linkedElectrodes, disposition) {
  if (!Array.isArray(linkedElectrodes) || linkedElectrodes.length === 0) return true
  return ELECTRODE_DISPOSITIONS.includes(disposition)
}

/**
 * Build the DELETE request body. Always sends the typed `confirmation`.
 * Adds `electrode_disposition` (+ optional `scrapped_reason`) only when the
 * battery has linked electrodes — matching what the backend requires.
 */
export function buildBatteryDeletePayload({ batteryId, linkedElectrodes, disposition, scrappedReason }) {
  const body = { confirmation: batteryDeletePhrase(batteryId) }
  if (Array.isArray(linkedElectrodes) && linkedElectrodes.length > 0) {
    const disp = disposition === 'scrapped' ? 'scrapped' : 'available'
    body.electrode_disposition = disp
    if (disp === 'scrapped') {
      const reason = String(scrappedReason || '').trim()
      if (reason) body.scrapped_reason = reason
    }
  }
  return body
}
