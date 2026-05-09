# Departments

Created: 2026-05-09
Edited: 2026-05-09
Status: current
Verified against code: 2026-05-09

Source paths:

- `routes/departments.js`
- `public/reference/departments.html`
- `public/js/departments.js`
- `public/js/badb-ui.js`

This document describes the current vanilla Departments reference page and API
behavior.

## Data Model

Primary table:

- `departments`

Current user-facing fields:

- `name`
- `head_user_id`

Department list rows include head user name and position when a head is set.
`GET /api/departments/:id` also returns department members, although the current
vanilla list page does not render a members section.

## API Behavior

All current department routes require `auth`.

Current route families:

- `GET /api/departments`
- `POST /api/departments`
- `GET /api/departments/:id`
- `PUT /api/departments/:id`

Create and update require admin role.

Validation rules:

- department name is required;
- `head_user_id` is optional;
- when set, `head_user_id` must reference an active user.

There is no current department delete route.

## Current Page Behavior

Current behavior:

- the add button is visible only for admins;
- list row summary opens an existing department record;
- an opened record has a sticky header with compact metadata, save, exit, dirty
  flag, and inline status;
- non-admin users can view the page but cannot create or edit departments;
- save keeps the department record open;
- departments have no list-level print or duplicate action;
- departments have no delete action;
- unsaved changes are guarded during in-page exit, logout, record switching,
  and browser unload.

Current list filters are client-side over the loaded list:

- text search across department id, name, and head labels;
- head user, including `Без руководителя`;
- reset button.

## Current Boundaries

Departments currently have no print report, file attachments, duplicate action,
delete action, or delete-check route.
