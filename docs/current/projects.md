# Projects

Created: 2026-05-09
Edited: 2026-05-09
Status: current
Verified against code: 2026-05-09

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
- `user_project_access`;
- `project_department_access`.

Current user-facing project fields:

- `name`
- `lead_id`
- `description`
- `start_date`
- `due_date`
- `status`
- `confidentiality_level`
- `department_id`

Allowed statuses:

- `active`
- `paused`
- `completed`
- `archived`

Allowed confidentiality values:

- `public` / `для всех`
- `department` / `для отдела`
- `confidential` / `выборочный доступ`

`created_by` is server-owned from the authenticated user on create.
`updated_by` and `updated_at` are set by the backend on update.

## Access Behavior

Project visibility is enforced by the API. Admins and directors see all
projects. Other users see projects through public access, project lead status,
matching department access, explicit user access, explicit department access,
or department-head visibility over projects created by department members.

Project modification is allowed for admins, directors, project creators,
project leads, and users with project-admin access.

Changing the project lead syncs an explicit access row:

- the new lead receives `admin` access;
- the previous lead is demoted to `view` when replaced.

Project access management supports:

- adding/removing department grants;
- adding/removing user grants;
- changing a visible user's personal access level;
- inherited access from project department, department grants, and lead role.

## API Behavior

All current project routes require `auth`, except the small `/test` route.

Current route families:

- `GET /api/projects`
- `POST /api/projects`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`
- `GET /api/projects/:id/report`
- `GET /api/projects/:id/access`
- `POST /api/projects/:id/access`
- `DELETE /api/projects/:id/access/user/:userId`
- `DELETE /api/projects/:id/access/department/:deptId`
- legacy `DELETE /api/projects/:id/access/:userId`
- access-copy and access-preset routes used by the API layer

Create requires `name`. Department access mode requires `department_id`.

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
- save keeps the record open;
- access tables are shown only for saved records;
- delete lives inside the opened record header;
- unsaved changes are guarded during in-page exit, logout, record switching,
  and browser unload.

Current list filters are client-side over the loaded list:

- text search across name, description, lead, creator, and department;
- status;
- access level;
- department;
- lead;
- reset button.

## Print Report

The record print report lives at
`/workflow/project-print.html?project_id=<id>` and loads
`GET /api/projects/:id/report`.

Report payload includes:

- project metadata;
- department access grants;
- user access grants;
- computed effective users;
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
