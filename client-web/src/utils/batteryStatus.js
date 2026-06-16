/**
 * Battery status display helpers — single source of truth for the Vue
 * frontend, mirroring vanilla `public/js/3-batteries.js`
 * (`BATTERY_STATUS_LABELS` / `BATTERY_OPEN_STATUS_LABEL`).
 *
 * Rules (docs/rules/battery_lifecycle_rules.md):
 *  - `Открыт` is the DERIVED incomplete/editable state. It is represented by a
 *    blank/NULL `batteries.status` and is NEVER a user-selectable value.
 *  - Legacy `disassembled` must be DISPLAYED as `Открыт` for compatibility.
 *  - `draft` / «Черновик» is NOT a battery status and must never appear in the
 *    battery UI (it belongs to other domains, e.g. tapes / submissions).
 *
 * Use these helpers anywhere battery status is shown so the «Открыт»
 * normalization lives in exactly one place.
 */

export const BATTERY_OPEN_STATUS_LABEL = 'Открыт'

// The only statuses a user may select after assembly is complete. Labels here
// are the canonical (vanilla) forms; views with tight layouts may keep their
// own compact labels for these four, but must route the open/blank case
// through this module.
export const BATTERY_SELECTABLE_STATUSES = [
  { value: 'assembled', label: 'Собран' },
  { value: 'testing', label: 'На тестировании' },
  { value: 'completed', label: 'Завершён' },
  { value: 'failed', label: 'Брак' },
]

/**
 * True when `status` represents the derived «Открыт» state: blank, NULL,
 * undefined, whitespace, or the legacy `disassembled` value.
 */
export function isBatteryOpenStatus(status) {
  const key = String(status ?? '').trim()
  return key === '' || key === 'disassembled'
}

/**
 * Normalized status CODE for badge classes and pipeline grouping. Returns
 * `'open'` for the derived-open state, otherwise the trimmed status string
 * (e.g. `'assembled'`). Never returns `'draft'`.
 */
export function batteryStatusCode(status) {
  return isBatteryOpenStatus(status) ? 'open' : String(status).trim()
}

const SELECTABLE_LABELS = Object.fromEntries(
  BATTERY_SELECTABLE_STATUSES.map((s) => [s.value, s.label]),
)

/**
 * Canonical display LABEL for a battery status. Blank/NULL/`disassembled`
 * → «Открыт»; known statuses → their Russian label; anything unknown falls
 * back to the raw value (mirrors vanilla `BATTERY_STATUS_LABELS[s] || s`).
 */
export function batteryStatusLabel(status) {
  if (isBatteryOpenStatus(status)) return BATTERY_OPEN_STATUS_LABEL
  const key = String(status).trim()
  return SELECTABLE_LABELS[key] || key
}
