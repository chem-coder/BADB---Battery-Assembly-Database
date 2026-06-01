# Users

Created: 2026-05-09
Edited: 2026-06-01
Status: current
Verified against code: 2026-06-01

Source paths:

- `routes/users.js`
- `public/reference/users.html`
- `public/js/users.js`
- `public/js/badb-ui.js`
- `config/index.js`

This document describes the current vanilla Users reference page and API
behavior.

## Data Model

Primary table:

- `users`

Current user-facing fields:

- `name`
- `login`
- `role`
- `position`
- `department_id`
- `active`

Allowed roles come from `config.roles.list`. The current UI exposes:

- `employee`
- `lead`
- `admin`

Passwords are not returned to the page. The backend stores password hashes and
increments `token_version` when an explicit password reset succeeds.

The list endpoint joins department names and returns each user's last successful
login timestamp from `auth_log`.

## API Behavior

All current user routes require `auth`.

Current route families:

- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`

Create requires:

- name;
- login;
- password of at least 6 characters;
- boolean active status;
- valid role;
- position;
- explicit department field, which may be `null`.

Backend create allows admins and leads, but non-admin leads may create only
employees. The current vanilla page hides the add-user button unless the current
user is an admin.

Update rules:

- admins may edit any user;
- non-admin users may edit only themselves;
- only admins may change another user's role;
- password changes require `reset_password: true` and a new password of at
  least 6 characters.

Delete rules:

- admins may delete any user;
- non-admin users may request deletion only for themselves;
- dependency conflicts block deletion when existing records still reference the
  user.

## Current Page Behavior

Current behavior:

- the add button opens a new user record for admins;
- list row summary opens an existing user record;
- an opened record has a sticky header with compact metadata, save, exit,
  delete when allowed, dirty flag, and inline status;
- fields are disabled when the current user cannot manage the opened user;
- edit mode hides password fields until the reset-password action is chosen;
- save keeps the user record open;
- delete lives inside the opened record header;
- users have no list-level print or duplicate action;
- unsaved changes are guarded during in-page exit, logout, record switching,
  and browser unload.

Current list filters are client-side over the loaded list:

- text search across name, login, department, role, role label, and position;
- role;
- department, including `Не определено`;
- active/inactive status;
- reset button.

## Delete

The Users page does not have a standalone delete-check route. Delete uses
`DELETE /api/users/:id`; the backend returns dependency conflicts if the user is
still referenced.

Current dependency checks include:

- projects where the user is lead, creator, or updater;
- projects where the user is listed as a project participant;
- tapes created or updated by the user;
- batteries created or updated by the user;
- recipes created or updated by the user;
- inventory/reference rows with the user as creator or updater;
- tape process steps performed or updated by the user.

The UI uses ordinary confirmation. There is no typed delete phrase for users
currently.

## Current Boundaries

Users currently have no print report, file attachments, duplicate action, or
separate delete-check route.
