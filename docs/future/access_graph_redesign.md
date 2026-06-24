# Access Graph Redesign — Constellation View

Created: 2026-06-24
Edited: 2026-06-24
Status: design approved — implementation pending
Verified against code: light check 2026-06-24
Source paths: `client-web/src/components/AccessGraph.vue`, `routes/access.js` (`GET /api/access/graph`), `client-web/src/pages/AccessPage.vue`, `client-web/src/utils/projectAccess.js`

Design agreed with Dalia 2026-06-24. This replaces the current dagre (hierarchical)
graph on the «Управление доступом» → **Граф** tab. To be built on its own branch
(`dalia/access-graph-redesign`), separate from the F1 access-model cleanup.

## Why

The current graph uses **dagre**, a top-down hierarchy layout. With only two node
ranks (users on top, projects below) every project fans to every user — the
"broom." It reads as 1D and says little. Dima asked for a 2D, force-directed
"constellation" like Obsidian's graph view; that is the goal here. (The earlier
"stack projects by access level" idea is explicitly **dropped** — stacked lanes
are a hierarchy and bring the broom back.)

## The model this visualizes

Access is project-based (see `utils/projectAccess.js`). Departments confer no
access and are **removed** from this graph entirely (nodes + all dept edges).
Sources of access, drawn as edges user → project:

- `grant_lead` — project lead (admin)
- `grant_owner` — creator (admin), skipped when creator == lead
- `grant_user` — explicit grant, coloured by level (view / edit / admin)
- `project_participant` — team member (view)

Blanket sources (public visibility, admin role, director by position) are **not**
drawn — they connect to everyone / everything and would saturate the map.

## Visual encoding

- **Node color** = project confidentiality: open `#52C9A6`, restricted `#D3A754`,
  confidential `#E74C3C`. Legacy `department` confidentiality → restricted
  (mirror `normalizeAccess`). Users stay blue `#6CACE4`.
- **Node size** = exposure, via a toggle (see below). Users render small/uniform.
- **The payoff read:** a large *red* (confidential) node = a restricted project a
  surprising number of people can reach. That outlier is the thing an admin
  scanning the access map wants to catch.

### Size toggle (exposure metrics — NOT productivity)

Sizing by raw "people with access" is broken for **public** projects, where the
answer is trivially *everyone* — every green node would max out and drown the
signal. So size counts **named ties only** (an explicit relationship), never the
implicit "all users see public":

- **Причастные** (default) — distinct people who are lead, owner, direct grantee,
  or participant.
- **Только выдачи** — direct grants only (the manually-managed slice).
- **Off / uniform** — all project nodes equal size.

> Open question: whether these two framings are the right pair, or whether
> "Причастные" alone + uniform is enough. Default chosen for now; easy to revise.

## Layouts (a switcher, like the tab pattern)

1. **Созвездие** (default) — force-directed `fcose` (or `cose-bilkent`). Projects
   sharing people pull into clusters; isolated projects drift to the edges. This
   is the Obsidian-style constellation.
2. **Орбиты** — `concentric` layout, radius = access level: confidential in the
   core, restricted mid-ring, public on the outer ring. Keeps a sense of "level"
   without the hierarchy feel, and can order nodes within a ring by the size
   metric. A welcome bonus, not the main goal.

Both share the same nodes, colors, sizing, and info panel — only the Cytoscape
layout config differs, so the second mode is cheap.

### Hide-users toggle (bipartite ⇄ projection-lite)

Default is **bipartite** (users + projects). A **«Скрыть пользователей»** toggle
hides user nodes so only project nodes remain — a quick way to read the project
clusters without the user clutter. (A true project↔project *projection* with
edges weighted by shared people is a possible later step; for v1 the hide toggle
gives most of the benefit for little cost.)

## Implementation sketch

**Backend** — `GET /api/access/graph` (`routes/access.js`):
- Remove department query, department nodes, `member_of` edges, and the legacy
  `project_department_access` query + `grant_dept_legacy` edges.
- Add `lead_id` to the projects query; emit `grant_lead` / `grant_owner` edges
  (skip owner when creator == lead) alongside existing `grant_user` /
  `project_participant`.
- Add per-project counts to project node `data`: `named_people` (distinct lead +
  owner + active grantees + participants) and `direct_grants` (active rows in
  `user_project_access`). Cheap `COUNT` subqueries; all source tables carry
  `project_id`.

**Frontend** — `AccessGraph.vue`:
- Swap dagre → `fcose`; register the layout plugin.
- Add a layout switcher (Созвездие / Орбиты) and the `concentric` config keyed on
  confidentiality.
- Add the size-by toggle; map the chosen count → node width/height (clamped
  min/max so small projects stay visible and big ones don't dominate).
- Add the «Скрыть пользователей» toggle (filter user nodes + their edges).
- Drop the department node type (colors / shapes / labels / filter) and dept edge
  styles; rework the legend to color = confidentiality, edges = access sources,
  size = exposure.
- Keep the existing click-to-highlight neighborhood + info panel.

Estimated ~half a day. No new dependencies if `fcose`/`cose-bilkent` is already
bundled with cytoscape; otherwise add the one layout extension.

## Parked: project-output / physical-entity view (good idea, wrong tab)

Dalia's idea to size/arrange projects by **physical work products** (tapes,
electrode batches, batteries, modules — all carry `project_id`) is deliberately
**kept out of the access tab**: that's an output/productivity axis, not an access
concern, and mixing them muddies the map. Its natural home is the **Dashboard**
(`client-web/src/pages/HomePage.vue` + `DashboardGraph.vue`) as a project-output
or activity view. Revisit once the app is running and collecting real data — or
when a better home presents itself during testing. Do not lose this. See also
[Dashboard Future Work](dashboard_next.md).
