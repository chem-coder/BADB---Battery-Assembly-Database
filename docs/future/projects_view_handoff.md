# Projects View — Session Handoff

Created: 2026-06-25
Status: handoff (work in progress)
Branch: `dalia/project-member-flow` (pushed to origin; one commit `a2e2999` may be ahead — push it)

Snapshot of the projects-view / access-model work for the next chat. The arc:
access-model cleanup → constellation graph → project member flow → projects-view
polish. Specs: `project_member_flow.md`, `project_access_control.md` (R1),
`access_graph_redesign.md`, rule `docs/rules/frontend_state_rules.md`.

## Done & committed (verified live unless noted)

- **Member flow** (`ProjectMembersTable.vue`): two views — «Участники» (expanders
  → dept·title + inline role «Определить роль» + Dima's expiry chips) and «Выбор
  команды» (compact checkbox table, 4-level access dropdown, no row-jump). Save
  works; existing members + grant-only people show pre-checked; soft-disable;
  conditional admin hard-delete (delete-check). Unsaved member edits now hit the
  exit guard (`extraDirty`).
- **Access model**: 4 levels admin/edit/view/none (migration `d044` applied to the
  dev DB), `none` = explicit deny overriding public, expiry auto-downgrades
  (open→view, restricted→none), inactive user → none. Resolver + 28 tests.
- **Dates** (`a…` / `9bc75a8`): start/due now load as MSK calendar date (was
  off-by-one). Verified — form matches list (21.03 / 27.12).
- **Focus mode** (`b5b764b`): +Добавить, filters, and the project list hide while
  a record is open.
- **Header redesign** (`a2e2999`): one-line flush nav bar + sticky record toolbar,
  app-wide. Build + tests pass. **Visual confirm pending** (see below).

## PENDING — pick up here

1. **Header — desktop visual confirm.** Logic is right (desktop `.app-content`
   padding-top:0 = flush; the `80px`/`3.5rem` I measured was the MOBILE
   breakpoint because the preview was narrow). Resize preview to ~1440 wide, open
   a project, screenshot: confirm (a) nav bar flush + thin (~46px), (b) record
   toolbar (Save…) stays visible just below the nav when you scroll the form.
   Tweak `--page-header-h` (AppLayout `.app-layout`, currently 46px) if the
   toolbar overlaps or gaps.
2. **Role multi-save — confirm fixed.** Dalia saw "only the last role saved" on an
   EARLIER version. Current `save()` (`ProjectMembersTable.vue`) loops all changed
   rows and PUTs each role independently — looks correct. Verify: open a project
   (≥2 participants, e.g. project 5 or 13), set roles on two, Save, check DB:
   `SELECT user_id, role_in_team FROM project_participants WHERE project_id=X`.
   If only one persisted, debug the inline-edit commit / dirty detection.

## Deferred (own task, security-sensitive)
- **R1 route enforcement** — make `none`/expired/inactive actually BLOCK at the
  entity routes (`checkViewPermission`/`checkModifyPermission` across tapes,
  electrodes, batteries…). Model + UI are done; enforcement is not. Needed before
  any public deploy. See `project_access_control.md`.

## Dev environment gotchas (cost us time this session)
- **Postgres MUST be running** — if it's down, the auth middleware's DB query
  throws and surfaces as a misleading "Invalid or expired token" / login bounce.
- Run the backend standalone: `node server.js` (port 3003). The preview tool's
  `npm run dev` nodemon tends to wedge on a taken 3003 — Vite (5173) still serves
  and proxies to the standalone backend, so that's fine.
- Browser testing without a password: mint a JWT —
  `node -e "const jwt=require('jsonwebtoken');const c=require('./config');console.log(jwt.sign({userId:4,login:'dkmaraulayte',role:'admin',tokenVersion:1},c.jwt.secret,{expiresIn:c.jwt.expiresIn}))"`
  → `sessionStorage.setItem('badb_auth_token', '<token>')` then navigate. Tokens
  last 8h; re-mint if it bounces to /login.
- Test residue: user «ai» is a member of project 13 (has a tape there → hard-delete
  correctly blocked). Harmless; soft-disable if undesired.

## Test data quirk
- `project_participants` and `user_project_access` are out of sync in old data
  (grants without participant rows). The members table handles this (membership =
  participant OR grant), but be aware when reading raw tables.
