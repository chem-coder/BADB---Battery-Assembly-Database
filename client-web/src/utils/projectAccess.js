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
 * Per-member GRANT level vocabulary (distinct from project confidentiality
 * above). The model has two member capabilities; `view` is the auto-filled
 * baseline for non-members on non-restricted projects, not a chooseable level:
 *
 *   обычный → `edit`  — a project member: can CRUD the project's data
 *   админ   → `admin` — can also edit the project itself (fields, members, access)
 *
 * Backend `user_project_access.access_level` enum (view/edit/admin) is unchanged;
 * the UI just narrows the picker to these two and shows legacy `view` grants as
 * «просмотр (устар.)». See docs/future/project_member_flow.md.
 */
export const GRANT_LEVEL_OPTIONS = [
  { label: 'обычный', value: 'edit' },
  { label: 'админ', value: 'admin' },
]

const GRANT_LEVEL_LABELS = {
  edit: 'обычный',
  admin: 'админ',
  view: 'просмотр (устар.)', // legacy/baseline — no longer offered in the picker
}

/** Display label for a member's grant level (incl. legacy `view`). */
export function grantLevelLabel(level) {
  return GRANT_LEVEL_LABELS[level] || level || 'обычный'
}

/**
 * Resolve a user's effective access to a project — 4-level model
 * (admin / edit / view / none). Pure function, called once per (user, project)
 * matrix cell. Strongest-access-first; the FIRST matching rule wins.
 *
 *   0. inactive user → no access (null) — defense beyond the auth login block
 *   1. admin role        → admin
 *   2. director (position contains «директор») → admin
 *   3. project lead      → admin
 *   4. project owner     (created_by) → admin
 *   5. usable explicit grant (not expired, or showExpired):
 *        - 'none' → explicit DENY → no access (null), even on a public project
 *        - else   → the grant's level (view/edit/admin)
 *   6. otherwise (no grant, expired grant, or non-member) → project BASELINE:
 *        - public project    → view
 *        - restricted project → no access (null)
 *
 * Expiry is an auto-downgrade, not a fall-through to membership: an expired
 * member on a restricted project drops to NONE (null), on an open project to
 * VIEW. Membership alone no longer grants access — a member's access IS their
 * grant. `isParticipant` only tags the baseline-view source as «participant»
 * (cosmetic, for the matrix legend). See docs/future/project_member_flow.md.
 *
 * Returns null for "no access" (incl. explicit `none`) so the matrix renders an
 * empty cell. A returned object always has level ∈ {view, edit, admin}.
 *
 * @param {object} user        - { user_id, role, position, active?, ... }
 * @param {object} project     - { project_id, confidentiality_level, lead_id, created_by, ... }
 * @param {object|null} grant  - the user's explicit grant ({ access_level, is_expired }) or null
 * @param {boolean} isParticipant - whether the user is on the project team
 * @param {boolean} showExpired   - whether expired grants are honoured
 * @returns {{ level: 'view'|'edit'|'admin', source: string, is_expired: boolean }|null}
 */
export function resolveProjectAccess(user, project, grant, isParticipant, showExpired) {
  // 0. Inactive user — no access anywhere (login is already blocked at auth).
  if (user.active === false) return null

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
    // 'none' is an explicit deny: no access even on a public project.
    if (grant.access_level === 'none') return null
    return { level: grant.access_level, source: 'direct', is_expired: !!grant.is_expired }
  }

  // 6. Baseline — covers non-members AND expired/none members. Expiry downgrades
  //    to the project type's baseline; membership does NOT grant access by itself.
  if (project.confidentiality_level === 'public') {
    return { level: 'view', source: isParticipant ? 'participant' : 'public', is_expired: false }
  }

  // Restricted project, no usable grant → no access.
  return null
}
