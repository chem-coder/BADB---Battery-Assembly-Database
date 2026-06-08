# Vanilla API Auth And Ownership Policy

Created: 2026-05-06
Edited: 2026-06-08
Status: rule
Verified against code: light check 2026-06-08
Source paths: `server.js`, `routes/auth.js`, `middleware/auth.js`, `public/js/auth.js`, `routes/batteries.js`, `routes/tapes.js`, `routes/projects.js`, `routes/users.js`, `contracts/vanilla_api_endpoints.json`, `scripts/smoke_vanilla_api.js`

Scope: the vanilla app under `public/` and the Express routes it calls.

## Browser Session Sharing

The backend is stateless JWT (Bearer token); there is no server-side session or
auth cookie. The vanilla frontend (`public/js/auth.js`) owns session state in the
browser, and the policy is: **one browser profile = one active shared session.**

- The active token is stored in `localStorage` (shared by every normal tab of the
  same browser profile/origin) and mirrored into `sessionStorage` for same-origin
  readers such as print/report windows.
- Login in one tab makes the same logged-in user available in other tabs without a
  second login; new normal tabs reuse the shared session instead of prompting.
- Logout (or a user switch) in one tab propagates to the other tabs via the
  browser `storage` event: a cleared token logs the other tabs out (login overlay),
  and a new/changed token reloads them so they adopt the active identity.
- Cross-tab sync is authoritative on the shared `localStorage` store only; it must
  not fall back to the per-tab `sessionStorage` mirror, or a remote logout (which
  clears `localStorage`) would be masked by a tab's own stale mirror and that tab
  would stay logged in. On a detected remote logout each other tab also clears its
  own `sessionStorage` mirror. Tabs never write the token in response to a
  `storage` event, so logout does not loop between tabs.
- Identity is never derived from IP address.
- Different users for dev/testing require **separate browser profiles, a different
  browser, or an incognito/private window** (each has its own `localStorage`).
- Dev auth bypass (`config.authBypass`) is unchanged: no token is issued, `/me`
  returns the bypass user, and cross-tab token events are ignored.
- The local logout button still runs the page unsaved-change/logout guard before
  clearing the session; remote (other-tab) logout shows the login overlay rather
  than silently discarding in-progress edits.

## Rules

- `created_by` and `updated_by` audit fields are server-owned.
- Browser-sent `created_by` and `updated_by` values are ignored on create/update
  routes that write ownership metadata.
- Workflow operator fields that describe lab work, such as
  `tape_process_steps.performed_by`, remain explicit payload fields.
- Auth bypass is development-only. `server.js` refuses to start in production
  when `AUTH_BYPASS=true`.
- Guided battery delete is intentionally `auth`-only: any authenticated user can
  run the approved delete workflow after preflight, hard-block checks, typed
  confirmation, electrode disposition selection, and audit logging.
- Auth bootstrap endpoints such as login and public password-change routes are
  intentionally unauthenticated. Vanilla workflow/report endpoints listed below
  are authenticated unless this document says otherwise.

## Server-Owned Audit Fields

| Route family | Methods | Server-owned fields |
| --- | --- | --- |
| `/api/projects` | `POST`, `PUT` | `created_by`, `updated_by` |
| `/api/recipes` | `POST`, `POST /:id/duplicate`, `PUT` | `created_by`, `updated_by` |
| `/api/separators` | `POST`, `PUT` | `created_by`, `updated_by` |
| `/api/electrolytes` | `POST`, `PUT` | `created_by`, `updated_by` |
| `/api/tapes` | `POST`, `PUT` | `created_by`, `updated_by` |
| `/api/tapes/:id/dry-box-state` | `PUT`, `POST return/remove/deplete` | `updated_by` |
| `/api/electrodes/electrode-cut-batches` | `POST`, `PUT` | `created_by`, `updated_by` |
| `/api/batteries` | `POST`, `PATCH /:id` | `created_by`, `updated_by` |
| `/api/materials` and material detail routes | `POST`, `PUT` | `updated_by` |
| `/api/users` | `POST`, `PUT`, `DELETE` | auth role gates decide who can write |

## Browser-Owned Domain Fields

| Field | Meaning | Notes |
| --- | --- | --- |
| `performed_by` | Lab operator who performed a tape workflow step | Kept as explicit payload because it is domain data, not auth metadata. |
| `lead_id` | Project lead | Kept as explicit payload because assigning a project lead is business data. |
| battery electrode/source IDs | Selected physical inventory | Kept as explicit payload and validated by route logic. |

## Auth Requirements

| Route family | Policy |
| --- | --- |
| Reference/read lists used by vanilla forms | Auth required unless documented otherwise in `contracts/vanilla_api_endpoints.json`. |
| Mutating vanilla routes | Auth required. |
| `/api/tapes/:id/dry-box-state*` | Auth required; `updated_by` is now derived from `req.user`. |
| `/api/batteries/:id/delete-check` and `DELETE /api/batteries/:id` | Auth required; no `admin`/`lead` role gate by approved design. |
| `/api/tapes/:id/report` | Auth required. |
| `/api/electrodes/electrode-cut-batches/:id/report` | Auth required. |
| `/api/batteries/:id/report` | Auth required. |
| `/api/batteries/:id/electrode-cut-batches` | Auth required compatibility/read endpoint. |

## Smoke Coverage

`npm run smoke:vanilla` attempts to forge `created_by` / `updated_by` with a
different valid user and asserts that the API records the authenticated bypass
user instead.
