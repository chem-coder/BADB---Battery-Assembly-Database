# Projects

Created: 2026-05-09
Edited: 2026-06-08
Status: current
Verified against code: 2026-06-08

Source paths:

- `routes/projects.js`
- `public/reference/projects.html`
- `public/js/projects.js`
- `public/workflow/project-print.html`
- `public/js/project-print.js`
- `public/js/badb-ui.js`

This document describes the current vanilla Projects reference page and API
behavior. Project links from tapes, electrode cut batches, and batteries are
also summarized in `docs/current/project_links.md`.

## Data Model

Primary tables:

- `projects`;
- `project_participants`;
- `user_project_access`;
- `project_department_access` (legacy rows only).

Current user-facing project fields:

- `name`
- `lead_id`
- `description`
- `start_date`
- `due_date`
- `status`
- `confidentiality_level`

Allowed statuses:

- `active`
- `paused`
- `completed`
- `archived`

Allowed confidentiality values:

- `public` / `открытый`
- `confidential` / `ограниченный`

Legacy `department` values can still exist in older data and are treated as
confidential/limited by the current backend and UI. `projects.department_id`
also remains in the schema for legacy data, but the current Projects page does
not expose department-based project access and sends `department_id = null` on
create/update.

`created_by` is server-owned from the authenticated user on create.
`updated_by` and `updated_at` are set by the backend on update.

Project team membership is intentionally separate from access grants:

- `project_participants` stores the people assigned to work on a project;
- `role_in_team` stores the per-project functional role/job description;
- `display_order` stores the visible order for the participant list/report;
- adding a participant ensures a permanent `view` row in
  `user_project_access`, while preserving an existing active `edit` or `admin`
  grant;
- the project lead is automatically inserted into `project_participants` with
  `admin` access when a project is created or saved with a lead;
- removing a participant removes that user's direct grant for the project;
- the current project lead cannot be removed from the team until the project
  lead field is changed.

Team membership is a baseline view-access source. Deleting a participant removes
the team row and that user's direct project grant. Revoking a user access grant
removes only the explicit grant/elevation; if the user remains a participant,
they still retain view access through team membership. Public-project and creator
visibility rules may still allow visibility independently.

## Access Behavior

Project visibility is enforced by the API. Admins and directors see all
projects. Other users see projects when the project is open (`public`), when
they are the project lead or creator, when they are listed as a participant, or
when they have an active explicit user grant. Limited (`confidential`) projects
are invisible by default.

Full project management is allowed for admins, directors, project creators,
project leads, and users with `admin` access on that project. Users with `edit`
access may update ordinary project fields, but cannot change the project lead,
project visibility, participants, or access grants.

Changing the project lead syncs an explicit access row:

- the new lead receives `admin` access;
- the new lead is inserted into the team list when not already present;
- the previous lead is demoted to `view` when replaced.

Project access management supports:

- adding/removing explicit user grants with `view`, `edit`, or `admin` access;
- changing a participant's project permissions directly in the participant
  table;
- showing project participants as a view-access source;
- inherited access from participant membership, project lead, project creator,
  and open project visibility.

The current Projects page no longer creates temporary/date-limited grants. The
backend still accepts the legacy `expires_at` field on project access grant
routes for compatibility with existing data and older tooling. Legacy
department grants can still exist in data and API responses, but the current
page does not show or manage them.

## API Behavior

All current project routes require `auth`, except the small `/test` route.

Current route families:

- `GET /api/projects`
- `POST /api/projects`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`
- `GET /api/projects/:id/report`
- `GET /api/projects/:id/participants`
- `POST /api/projects/:id/participants`
- `PUT /api/projects/:id/participants/:participantId`
- `DELETE /api/projects/:id/participants/:participantId`
- `GET /api/projects/:id/access`
- `POST /api/projects/:id/access`
- `DELETE /api/projects/:id/access/user/:userId`
- `DELETE /api/projects/:id/access/department/:deptId`
- legacy `DELETE /api/projects/:id/access/:userId`
- access-copy and access-preset routes used by the API layer

Create requires `name`. The current UI exposes only open (`public`) and
limited (`confidential`) project access.

## Current Page Behavior

Current behavior:

- entering a name in the top add field opens a new project record;
- list row summary opens an existing project record;
- list-level print opens the project report;
- list-level duplicate opens an unsaved client-side copy;
- duplicate copies ordinary project fields but starts with no id and no access
  grants;
- an opened record has a sticky header with compact metadata, save, exit,
  print, delete, dirty flag, and inline status;
- the project name is edited by clicking the title;
- the visible project form has one details fieldset with the project name,
  a `создал` audit line with creator and creation date, lead, status, and
  open/limited project access;
- description and project dates remain preserved in hidden fields for existing
  records, but are not part of the visible Projects form;
- save keeps the record open;
- saved records show a second fieldset named `Команда`;
- the `Команда` add controls use a user dropdown, current-user button, required
  access dropdown, optional functional role input, and `+ Добавить в команду`;
- the team table is the primary place to manage per-project role/function and
  user access level;
- delete lives inside the opened record header;
- unsaved changes are guarded during in-page exit, logout, record switching,
  and browser unload.

Current list filters are client-side over the loaded list:

- text search across name, description, lead, and creator;
- status;
- project type/visibility default;
- lead;
- reset button.

## Print Report

The record print report lives at
`/workflow/project-print.html?project_id=<id>` and loads
`GET /api/projects/:id/report`.

Report page displays:

- project metadata;
- project participants;
- effective user access (level and source labels from the report API);
- downstream tapes;
- downstream electrode cut batches;
- downstream batteries;
- downstream counts.

Projects currently do not have file attachments.

## Delete

The Projects page does not have a standalone delete-check route. Delete uses
`DELETE /api/projects/:id`; the backend returns dependency conflicts if the
project is in use.

Delete is blocked when the project is linked to:

- tapes;
- electrode cut batches;
- batteries.

The UI uses ordinary confirmation, then surfaces backend dependency summaries
inline. There is no typed delete phrase for projects currently.

## Current Boundaries

Do not treat `projects.confidentiality_level` as only display metadata. It is
part of the current API authorization model.
