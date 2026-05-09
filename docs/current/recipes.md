# Recipes

Created: 2026-05-09
Edited: 2026-05-09
Status: current
Verified against code: 2026-05-09

Source paths:

- `routes/recipes.js`
- `public/reference/recipes.html`
- `public/js/recipes.js`
- `public/workflow/recipe-print.html`
- `public/js/recipe-print.js`
- `public/js/badb-ui.js`

This document describes the current vanilla Recipes reference page and API
behavior. Recipes define formulation intent for tapes; tape execution selects
concrete material instances separately on the Tapes page.

## Data Model

Primary tables:

- `tape_recipes`;
- `tape_recipe_lines`.

Current user-facing recipe fields:

- `name`
- `variant_label`
- `role`
- `notes`

Allowed recipe roles:

- `cathode`
- `anode`

Current recipe line fields:

- `recipe_role`
- `material_id`
- `include_in_pct`
- `slurry_percent`
- `line_notes`

Current line roles:

- `cathode_active`
- `anode_active`
- `binder`
- `additive`
- `solvent`

The page filters available materials by the selected line role. `additive`
maps to material role `conductive_additive`. Solvent lines are excluded from
the required 100 percent dry-solids sum.

`created_by` is server-owned from the authenticated user on create.
`updated_by` and `updated_at` are set by the backend on update.

## API Behavior

All current recipe routes require `auth`, except the small `/test` route.

Current route families:

- `GET /api/recipes`
- `POST /api/recipes`
- `GET /api/recipes/:id`
- `PUT /api/recipes/:id`
- `DELETE /api/recipes/:id`
- `GET /api/recipes/:id/lines`
- `POST /api/recipes/:id/duplicate`
- `GET /api/recipes/:id/report`
- `GET /api/recipes/:id/delete-check`

Create and update require:

- non-empty `name`;
- recipe `role`;
- at least one line;
- every saved line to have a material and line role;
- every included line to have a percent between 0 and 100.

The vanilla page also checks that included non-solvent line percentages sum to
exactly 100 before save.

Update replaces all existing recipe lines for the recipe with the submitted
line set.

## Current Page Behavior

Current behavior:

- entering a name in the top add field opens a new recipe record;
- list row summary opens an existing recipe record and loads composition lines;
- list-level print opens the recipe report;
- list-level duplicate opens an unsaved client-side copy and loads source
  recipe lines into the form;
- the backend also has `POST /api/recipes/:id/duplicate`, but the current
  vanilla list duplicate button does not call it;
- an opened record has a sticky header with compact metadata, save, exit,
  print, delete, dirty flag, and inline status;
- the recipe name is edited by clicking the title;
- save keeps the record open;
- delete lives inside the opened record header;
- unsaved changes are guarded during in-page exit, logout, record switching,
  and browser unload.

The recipe `role` select is disabled in the form. The UI sets the recipe role
from active-material line choices:

- selecting `cathode_active` sets the recipe role to `cathode`;
- selecting `anode_active` sets the recipe role to `anode`.

Current list filters are client-side over the loaded list:

- text search across name, variant, notes, active material, material names, and
  created/updated user names;
- role;
- reset button.

## Print Report

The record print report lives at
`/workflow/recipe-print.html?recipe_id=<id>` and loads
`GET /api/recipes/:id/report`.

Report payload includes:

- recipe metadata;
- recipe composition lines;
- tape usage rows for tapes using the recipe.

Recipes currently do not have file attachments.

## Delete

Recipe delete uses a delete-check route before the destructive request.

Current behavior:

- `GET /api/recipes/:id/delete-check` verifies that the recipe exists and
  reports blocking tape usage;
- delete is blocked when any tape uses the recipe;
- when deletion is allowed, the UI requires typed confirmation
  `DELETE RECIPE <tape_recipe_id>`;
- `DELETE /api/recipes/:id` removes the recipe; recipe lines are removed by
  cascade.

The delete button is only visible in the opened record. List rows do not expose
delete.

## Current Boundaries

Recipes describe intended formulation. Do not store tape-specific material
instance selections or actual weighing values on recipe rows.
