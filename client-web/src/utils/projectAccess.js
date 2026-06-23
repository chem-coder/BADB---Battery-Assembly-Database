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

/**
 * Resolve a user's effective access to a project (PROJECT-based model — there
 * is no department-based visibility any more).
 *
 * Pure function so it can be unit-tested in isolation and called once per
 * (user, project) cell. The branch order encodes strongest-access-first: the
 * FIRST matching rule wins.
 *
 *   1. admin role     → admin
 *   2. director (by position, contains «директор») → admin
 *   3. project lead   → admin
 *   4. project owner  (created_by) → admin
 *   5. explicit grant, if usable (not expired, or showExpired) → its level
 *   6. team participant → view
 *   7. public project   → view
 *   8. otherwise → no access (null)
 *
 * An expired grant with showExpired=false does NOT short-circuit: control
 * falls through to the participant / public rules below it.
 *
 * @param {object} user        - { user_id, role, position, ... }
 * @param {object} project     - { project_id, confidentiality_level, lead_id, created_by, ... }
 * @param {object|null} grant  - the user's explicit grant for this project, or null
 * @param {boolean} isParticipant - whether the user is on the project team
 * @param {boolean} showExpired   - whether expired grants are honoured
 * @returns {{ level: string, source: string, is_expired: boolean }|null}
 */
export function resolveProjectAccess(user, project, grant, isParticipant, showExpired) {
  // 1. Admin role override
  if (user.role === 'admin') return { level: 'admin', source: 'admin', is_expired: false }

  // 2. Director (by position)
  if ((user.position || '').toLowerCase().includes('директор')) {
    return { level: 'admin', source: 'director', is_expired: false }
  }

  // 3. Project lead
  if (project.lead_id != null && user.user_id === project.lead_id) {
    return { level: 'admin', source: 'lead', is_expired: false }
  }

  // 4. Project owner (creator)
  if (user.user_id === project.created_by) {
    return { level: 'admin', source: 'owner', is_expired: false }
  }

  // 5. Explicit grant — only if usable (not expired, or expired ones shown)
  if (grant && (!grant.is_expired || showExpired)) {
    return { level: grant.access_level, source: 'direct', is_expired: !!grant.is_expired }
  }

  // 6. Team participant
  if (isParticipant) return { level: 'view', source: 'participant', is_expired: false }

  // 7. Public project — everyone sees
  if (project.confidentiality_level === 'public') {
    return { level: 'view', source: 'public', is_expired: false }
  }

  // 8. No access
  return null
}
