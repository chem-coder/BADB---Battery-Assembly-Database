# Access Graph Redesign — Constellation View

Created: 2026-06-24
Edited: 2026-06-24
Status: design approved — implementation pending (build core + tests first)
Verified against code: checked 2026-06-24 (`checkModifyPermission`, `project_participants`)
Source paths: `client-web/src/components/AccessGraph.vue`, `routes/access.js` (`GET /api/access/graph`), `routes/projects.js` (`checkModifyPermission`), `client-web/src/pages/AccessPage.vue`, `client-web/src/utils/projectAccess.js`

Design agreed with Dalia 2026-06-24. Replaces the dagre (hierarchical) "broom" on
the «Управление доступом» → **Граф** tab with a force-directed, person-centric
constellation. Built on its own branch (`dalia/access-graph-redesign`), separate
from the F1 access-model cleanup.

## Why

The current graph uses **dagre**, a top-down hierarchy layout. With two node ranks
(users over projects) every project fans to every user — the "broom." It reads as
1D and says little. Dima asked for a 2D, force-directed "constellation" like
Obsidian's graph view; that is the goal. (The earlier "stack projects by access
level" idea is **dropped** — stacked lanes are a hierarchy and bring the broom
back.)

## The model this visualizes — project MEMBERSHIP

This is a **membership** map, not an access-rights map. A person is a **node**; a
project is a **node**. A person connects to a project when they *belong* to it:

- **listed on the project's team** (`project_participants` roster) → **member**
  (edit-level), or
- they **run it**: the **lead** (`projects.lead_id`), the **owner**
  (`projects.created_by`), or a holder of an explicit **admin** grant
  (`user_project_access.access_level = 'admin'`).

The manager roles mirror `checkModifyPermission` in `routes/projects.js`
(owner / project-lead / project-admin).

Edge styling encodes the person's role on that project:

- **manager** (lead / owner / admin) → **red, thicker** connector,
- **member** (plain listed participant) → normal connector.

When a person is both (a participant who is also the lead), the manager role wins
→ one red edge.

Out of scope, on purpose:
- **Departments** — removed entirely (no dept nodes/edges).
- **Blanket access** — global admin role, director-by-position, and public
  visibility connect to everyone/everything; not drawn (they'd saturate the map).
- **Plain view/edit grants** that aren't roster membership — this map is about who
  is *on* a project, not who merely *can see* it. (Admin grants are the exception:
  they're a manager role, so they draw a red edge.)

## Visual encoding

- **Project node color** = confidentiality: open `#52C9A6`, restricted `#D3A754`,
  confidential `#E74C3C`. Legacy `department` confidentiality → restricted (mirror
  `normalizeAccess`). Projects are **uniform size**.
- **Person node** = blue `#6CACE4`, **sized by how many projects they belong to**
  (distinct connected projects, any role). One project → small; many → large.
- **People on no project** still appear — minimum-size dots with no edges, which
  the force layout pushes to the **outskirts** of the constellation.
- **Edge color** = role: red + thick for manager (lead/owner/admin), normal for
  member.

### Person size — single metric, no toggle

Size = count of **distinct projects the person belongs to** (member or manager).
No toggles in v1 — single view; a metric switch can come later if it earns its
place. Size is clamped (floor so single-project and isolated people stay visible;
ceiling so a hyper-connected person doesn't dominate) — `sizeForDegree()` in
`utils/accessGraphModel.js`.

**The payoff read:** the biggest blue dots = people wired into the most projects
(who's spread across everything?). If their connectors are mostly **red**, they
*run* many projects, not just sit on rosters. Red edges into confidential (red)
projects = sensitive reach worth a glance.

## Layout — single constellation view

Force-directed `fcose` (or `cose-bilkent`), the Obsidian-style constellation.
People who share projects pull together; people on nothing drift to the edges.
**One view, no switcher, no toggles** in v1 — keep it simple.

Deferred (spec'd, not built now):
- **Орбиты** — a `concentric` second layout, radius = confidentiality. Bonus.
- **Size-metric switch**, **hide low-degree people**, **project↔project
  projection** — later, only if testing shows a need.

## Implementation sketch

**Pure model builder (testable core)** — `client-web/src/utils/accessGraphModel.js`:
- `buildAccessGraph({ users, projects, participants, adminGrants })` → `{ nodes,
  edges }`. Pure function, mirrors the `projectAccess.js` pattern so it unit-tests
  in isolation. Computes per-person degree, the strongest per-(person, project)
  role (manager wins), isolated-person nodes, project nodes with confidentiality
  passthrough, and drops edges to users not in the active `users` set.
- `sizeForDegree(n)` → clamped node size. Exported + tested.
- **Built and unit-tested FIRST**, before any rendering/endpoint changes.

**Backend** — `GET /api/access/graph` (`routes/access.js`):
- Return the raw rows the builder needs: active `users`; `projects` (with
  `lead_id`, `created_by`, `confidentiality_level`); `participants`
  (`project_participants`); `adminGrants` (active `user_project_access` rows with
  `access_level='admin'`). Drop the department query/nodes/edges and the legacy
  dept-grant query.

**Frontend** — `AccessGraph.vue`:
- Swap dagre → `fcose` (register the extension; confirm it's bundled with our
  cytoscape, else add the one dep).
- Feed the API payload through `buildAccessGraph`; map node `size` → width/height,
  edge `role` → color/width (red+thick manager vs normal member).
- Drop the department node type + dept edge styles; remove the type-filter and any
  size/hide toggles. Rework the legend (person size = projects; red edge =
  manages; color = confidentiality). Keep click-to-highlight + info panel.

Estimated ~half a day after the core lands. No new deps if `fcose`/`cose-bilkent`
ships with our cytoscape; otherwise add the one layout extension.

## Parked: project-output / physical-entity view (good idea, wrong tab)

Sizing/arranging projects (or people) by **physical work products** (tapes,
electrode batches, batteries, modules — all carry `project_id`) is deliberately
**kept off the access tab**: that's an output/productivity axis, not membership,
and mixing them muddies the map. Natural home is the **Dashboard**
(`client-web/src/pages/HomePage.vue` + `DashboardGraph.vue`). Revisit once the app
is running and collecting real data. Do not lose this. See also
[Dashboard Future Work](dashboard_next.md).

### Also parked: contribution / activity sizing (handle with care)

Sizing people by **data input / activity volume** ("a tracker") is intentionally
**not** built. It's a productivity/surveillance metric, off-axis for an access
map, and a shared graph that ranks people by output is a morale hazard in a small
lab. If ever wanted, it belongs somewhere **private/admin-only** or as a personal
"your own activity" view — never a shared constellation. Recorded so the idea
isn't lost, with the caveat attached.
