/**
 * Project access (confidentiality) vocabulary.
 *
 * Mirrors vanilla `public/js/projects.js`: only `public` (открытый) and
 * `confidential` (ограниченный) are selectable; legacy `department` is treated
 * as ограниченный and is no longer offered as a new choice (the project-access
 * model was redone away from department-based visibility). Lowercase labels
 * match the app's option-label convention. Internal API values are unchanged.
 */

export const ACCESS_OPTIONS = [
  { value: 'public', label: 'открытый' },
  { value: 'confidential', label: 'ограниченный' },
]

const ACCESS_LABELS = {
  public: 'открытый',
  department: 'ограниченный', // legacy → restricted
  confidential: 'ограниченный',
}

/** Display label for a confidentiality level (incl. legacy `department`). */
export function accessLabel(level) {
  return ACCESS_LABELS[level] || level || 'открытый'
}

/**
 * Normalize a confidentiality level for filtering/grouping: legacy `department`
 * collapses to `confidential` so it filters under «ограниченный».
 */
export function normalizeAccess(level) {
  return level === 'department' ? 'confidential' : level
}
