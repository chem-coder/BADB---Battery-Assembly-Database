# Dashboard Future Work

Created: 2026-05-06
Edited: 2026-05-06
Status: future idea
Verified against code: light check 2026-05-06
Source paths: `docs/archive/superseded/2026-05-06-root-doc-transition/DASHBOARD_SPEC.md`, `routes/dashboard.js`, `client-web/src/pages/HomePage.vue`

This file preserves dashboard product direction without treating it as implemented behavior.

## Product Direction

The dashboard can grow into a coordination center for:

- production status;
- project and battery pipeline visibility;
- material usage;
- recent activity;
- workflow bottlenecks;
- traceability summaries.

## Possible Future Improvements

Candidate improvements:

- richer filtering by project, date, owner, status, and workflow area;
- graph exploration that makes dependencies easier to inspect;
- pipeline drill-downs from dashboard cards into source workflow pages;
- clearer empty/error/loading states;
- trend views that compare periods without hiding raw counts;
- caching or precomputed views if dashboard queries become slow.

## Guardrails

- Do not make the dashboard a parallel write workflow.
- Do not duplicate lifecycle or stack rules in dashboard code.
- Do not treat visual/design notes in the archived spec as release requirements until a task explicitly scopes them.
- Keep links from dashboard cards to the canonical workflow pages where users actually edit records.
