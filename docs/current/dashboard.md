# Dashboard

Created: 2026-05-06
Edited: 2026-05-06
Status: current
Verified against code: light check 2026-05-06
Source paths: `routes/dashboard.js`, `client-web/src/pages/HomePage.vue`, `client-web/src/components/DashboardGraph.vue`, `client-web/src/components/DashboardPipeline.vue`, `client-web/src/components/DashboardAnalytics.vue`, `client-web/src/router/index.js`

The dashboard is a Vue-facing coordination view backed by `/api/dashboard`.

## Current API

Current dashboard endpoints include:

- `/api/dashboard/kpi`
- `/api/dashboard/filter-options`
- `/api/dashboard/activity`
- `/api/dashboard/production`
- `/api/dashboard/graph`
- `/api/dashboard/funnel`
- `/api/dashboard/materials-usage`

These routes read from existing workflow, project, material, traceability, and activity data. They are not a separate source of truth.

## Current UI

`client-web/src/pages/HomePage.vue` is the dashboard entry page. It uses tabs/views for overview, pipeline, graph, and analytics.

Current dashboard components include:

- `DashboardGraph.vue`
- `DashboardPipeline.vue`
- `DashboardAnalytics.vue`

The dashboard is useful as a read-side coordination layer. It should not define workflow rules that contradict the workflow services or migrations.

## Boundary

The old dashboard specification included product direction and visual ambition. Current behavior is whatever is implemented in the route and Vue components listed above. Future dashboard ideas live in `../future/dashboard_next.md`.
