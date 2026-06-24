/**
 * Access graph model — builds the membership constellation's nodes + edges from
 * raw rows, for the «Управление доступом» → Граф tab.
 *
 * MEMBERSHIP map (not access-rights): a person connects to a project when they
 * belong to it — listed on its team (project_participants) or running it
 * (lead / owner / explicit admin grant; mirrors checkModifyPermission in
 * routes/projects.js). The strongest role wins per (person, project):
 *
 *   manager (lead | owner | admin) → red, thick edge
 *   member  (plain participant)    → normal edge
 *
 * A person node is sized by how many distinct projects they belong to; people on
 * nothing render at the floor size with no edges (force layout floats them to the
 * outskirts). Project nodes are uniform, coloured by confidentiality downstream.
 *
 * Pure functions so they unit-test in isolation (cf. utils/projectAccess.js).
 * Blanket access (global admin, director, public visibility) and departments are
 * intentionally NOT modelled here — they would saturate the map.
 */

const USER_PREFIX = 'user-';
const PROJECT_PREFIX = 'project-';

// Node sizing (px diameter). Floor keeps single-project and isolated people
// visible; ceiling stops a hyper-connected person from dominating the layout.
export const SIZE_MIN = 14;
export const SIZE_STEP = 6;
export const SIZE_MAX = 46;

/** Clamped node size for a person belonging to `degree` projects. */
export function sizeForDegree(degree) {
  const n = Number.isFinite(degree) && degree > 0 ? degree : 0;
  return Math.min(SIZE_MAX, SIZE_MIN + n * SIZE_STEP);
}

/**
 * Build { nodes, edges } for the constellation.
 *
 * @param {object} raw
 * @param {Array<{user_id:number, name:string}>} raw.users            active users
 * @param {Array<{project_id:number, name:string, confidentiality_level:string, lead_id:?number, created_by:?number}>} raw.projects
 * @param {Array<{user_id:number, project_id:number}>} raw.participants  team roster
 * @param {Array<{user_id:number, project_id:number}>} raw.adminGrants   active access_level='admin' grants
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildAccessGraph({ users = [], projects = [], participants = [], adminGrants = [] } = {}) {
  const userIds = new Set(users.map((u) => u.user_id));

  // Strongest role per (user, project). 'manager' always wins over 'member'.
  const roleByPair = new Map(); // key `${userId}:${projectId}` → 'manager' | 'member'
  const setRole = (userId, projectId, role) => {
    if (userId == null || projectId == null) return;
    if (!userIds.has(userId)) return; // skip ties to unknown/inactive users
    const key = `${userId}:${projectId}`;
    const existing = roleByPair.get(key);
    if (existing === 'manager') return; // already strongest
    if (role === 'manager' || !existing) roleByPair.set(key, role);
  };

  // Manager roles first so they win ties; members fill in the rest.
  for (const p of projects) {
    setRole(p.lead_id, p.project_id, 'manager');
    setRole(p.created_by, p.project_id, 'manager');
  }
  for (const g of adminGrants) setRole(g.user_id, g.project_id, 'manager');
  for (const pp of participants) setRole(pp.user_id, pp.project_id, 'member');

  // Degree = distinct projects per user; emit one edge per (user, project).
  const degree = new Map();
  const edges = [];
  for (const [key, role] of roleByPair) {
    const sep = key.indexOf(':');
    const userId = Number(key.slice(0, sep));
    const projectId = Number(key.slice(sep + 1));
    degree.set(userId, (degree.get(userId) || 0) + 1);
    edges.push({
      source: `${USER_PREFIX}${userId}`,
      target: `${PROJECT_PREFIX}${projectId}`,
      role,
    });
  }

  const nodes = [];
  for (const u of users) {
    const d = degree.get(u.user_id) || 0;
    nodes.push({
      id: `${USER_PREFIX}${u.user_id}`,
      type: 'user',
      label: u.name,
      data: { user_id: u.user_id, project_count: d },
      size: sizeForDegree(d),
    });
  }
  for (const p of projects) {
    nodes.push({
      id: `${PROJECT_PREFIX}${p.project_id}`,
      type: 'project',
      label: p.name,
      data: { project_id: p.project_id, confidentiality_level: p.confidentiality_level },
    });
  }

  return { nodes, edges };
}
