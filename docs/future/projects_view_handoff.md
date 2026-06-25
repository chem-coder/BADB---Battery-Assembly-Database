# Projects View — Session Handoff

Created: 2026-06-25
Status: handoff (work in progress)
Branch: `dalia/project-member-flow` (in sync with origin as of 2026-06-25)

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
  app-wide. Build + tests pass. **Visual confirmed on desktop (1440)** — nav bar
  thin (46px) + flush; on scroll the record toolbar pins flush at the nav bar's
  bottom edge (measured gap 0px, no overlap). `--page-header-h` 46px is correct.

## Verified 2026-06-25 — both prior PENDING items confirmed, NO code change needed

1. **Header — desktop visual confirm: DONE.** At 1440 wide the nav bar is thin
   (46px) and flush; on scroll the record toolbar (`OpenedRecordHeader`) pins
   flush at the nav bar's bottom edge — measured gap 0px, no overlap. The
   `80px`/`3.5rem` gap from last session was the MOBILE breakpoint only.
   `--page-header-h` (AppLayout `.app-layout`) stays 46px; no tweak needed.
2. **Role multi-save: DONE — no bug.** Opened project 5 (Мараулайте + Чудинов,
   the two rows with real participant records), set two distinct roles via the
   inline editor, Saved. Dirty count tracked both (`Сохранить (2)`); two
   independent PUTs fired (`/participants/5` + `/participants/11`); the DB
   persisted BOTH (same `updated_at`). The "only the last role saved" symptom is
   gone — current `save()` loops all changed rows and PUTs each role
   independently, and the backend PUT updates by `participant_id` (no cross-row
   clobber). Test roles were restored to their originals afterwards.

   Note: in project 5 only 2 of the 5 listed members have participant rows; the
   other 3 are grant-only (the test-data quirk below). Role edits only PUT for
   rows that have a `participant_id`.

**Next up: R1 route enforcement** (the Deferred item below) — separate,
security-sensitive; check with Dalia before starting.

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
