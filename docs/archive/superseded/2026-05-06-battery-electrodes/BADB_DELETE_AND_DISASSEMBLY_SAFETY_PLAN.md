# BADB Battery Delete Guided Workflow

Created: 2026-05-05
Edited: 2026-05-06
Status: superseded

Superseded by:

- `docs/rules/battery_lifecycle_rules.md`
- `docs/current/batteries.md`

This document describes the implemented safe battery-delete workflow in the
vanilla BADB app. The central rule remains:

> Delete removes mistaken database records. Disassembly/scrap/depletion records
> real lab outcomes.

The implemented workflow deletes only battery-owned rows and the battery row
itself. It does not delete upstream lab records such as projects, tapes,
electrode batches, electrodes, separators, electrolytes, recipes, materials, or
users.

## Implemented Scope

Implemented in this pass:

- vanilla battery delete now uses one guided `Удалить запись` flow;
- the visible vanilla `Разобрать аккумулятор` action is hidden;
- delete preflight distinguishes hard blockers, confirmable battery-owned data,
  and linked electrodes;
- any authenticated user can run battery delete preflight and guided deletion;
- the user selects whether linked electrodes return as available or scrapped;
- typed confirmation is shown only after blockers and the final summary;
- every successful battery delete writes an `activity_log` audit event;
- vanilla API contract and smoke coverage were updated for the new behavior.

Deferred follow-ups:

- real, non-delete `Разобрать аккумулятор` lab-history action;
- electrode batch delete redesign;
- reverse-scrap affordance for electrodes;
- tape delete redesign;
- Vue UI adoption;
- formal ЕСПД documentation updates.

## Files Changed

- `/Users/Dalia/Developer/RENERA/BADB_main/services/batteryLifecycleService.js`
- `/Users/Dalia/Developer/RENERA/BADB_main/routes/batteries.js`
- `/Users/Dalia/Developer/RENERA/BADB_main/public/workflow/3-batteries.html`
- `/Users/Dalia/Developer/RENERA/BADB_main/public/js/3-batteries.js`
- `/Users/Dalia/Developer/RENERA/BADB_main/public/css/styles.css`
- `/Users/Dalia/Developer/RENERA/BADB_main/contracts/vanilla_api_endpoints.json`
- `/Users/Dalia/Developer/RENERA/BADB_main/scripts/smoke_vanilla_api.js`
- `/Users/Dalia/Developer/RENERA/notes/BADB_DELETE_AND_DISASSEMBLY_SAFETY_PLAN.md`

## Backend Behavior

### Route Contract

Battery delete preflight:

```text
GET /api/batteries/:id/delete-check
```

Authentication: any authenticated user.

Response shape:

```json
{
  "can_delete": true,
  "error": null,
  "message": "Для удаления аккумулятора подтвердите действие и выберите, что сделать с электродами",
  "hard_blockers": [],
  "confirmable_owned_data": [],
  "linked_electrodes": [],
  "dependencies": []
}
```

`dependencies` is retained as a compatibility alias for hard blockers.

Battery delete:

```text
DELETE /api/batteries/:id
```

Authentication: any authenticated user.

Request body:

```json
{
  "confirmation": "DELETE BATTERY 19",
  "electrode_disposition": "available",
  "scrapped_reason": null
}
```

`electrode_disposition` is required only when linked electrodes exist. Allowed
values:

- `available`
- `scrapped`

If disposition is `scrapped` and `scrapped_reason` is blank, the service uses:

```text
возвращен из аккумулятора #<battery_id> при удалении записи
```

### Important Functions

`services/batteryLifecycleService.js`:

- `collectBatteryHardDeleteBlockers(queryable, batteryId)`
- `collectBatteryConfirmableOwnedData(queryable, batteryId)`
- `fetchLinkedBatteryElectrodes(queryable, batteryId)`
- `validateBatteryDeleteOptions(batteryId, linkedElectrodes, options)`
- `applyBatteryDeleteElectrodeDisposition(queryable, linkedElectrodes, disposition, scrappedReason)`
- `insertBatteryDeleteAudit(client, batteryId, userId, details)`
- `deleteBatteryRecord(pool, batteryId, userId, options)`
- `getBatteryDeleteCheck(pool, batteryId)`

`routes/batteries.js`:

- `GET /:id/delete-check`
- `DELETE /:id`

The existing backend `disassembleBattery` service and
`POST /api/batteries/:id/disassemble` route were left in place for compatibility
and future product work, but the vanilla UI no longer exposes that action.

### Hard Blockers

Battery deletion stops before typed confirmation when hard blockers exist:

- `cycling_sessions`
- `module_batteries`

These are treated as preserved downstream history or assembly context. The
delete service reruns hard-blocker checks inside the delete transaction and does
not trust the earlier preflight response alone.

### Confirmable Battery-Owned Data

The preflight lists battery-owned rows that may be deleted after the user sees
the final summary and types the confirmation phrase:

- `battery_coin_config`
- `battery_pouch_config`
- `battery_cyl_config`
- `battery_electrodes`
- `battery_electrode_sources`
- `battery_sep_config`
- `battery_electrolyte`
- `battery_projects`
- `battery_qc`
- `battery_electrochem`

These rows are explicitly deleted by `deleteBatteryRecord`. The service does not
delete upstream rows.

### Electrode Handling

When linked electrodes exist, the guided flow asks what to do with them.

If the user selects available:

- `electrodes.status_code = 1`
- `electrodes.used_in_battery_id = NULL`
- `electrodes.scrapped_reason = NULL`

If the user selects scrapped:

- `electrodes.status_code = 3`
- `electrodes.used_in_battery_id = NULL`
- `electrodes.scrapped_reason = selected/default reason`

The battery stack/source rows are then deleted as battery-owned rows.

### Audit Event

Every successful delete inserts an append-only row into `activity_log` before
the battery row is deleted:

- `action = 'delete'`
- `entity = 'battery'`
- `entity_id = <deleted battery_id>`
- `user_id = acting user`
- `details = structured JSON`

The JSON details include:

- deleted battery snapshot;
- typed confirmation phrase;
- electrode disposition and scrapped reason;
- linked electrodes;
- affected electrode IDs;
- hard-blocker result;
- confirmable owned data shown by the workflow;
- deleted row counts;
- deleted electrochemistry filenames/links.

No schema or migration changes were made by the guided delete workflow itself.
The separate battery stack trigger hardening migration
`d031_harden_battery_stack_validate_trigger.sql` has already been applied to
the local `badb_app_v1` database.

## Battery Stack Trigger Note

`d031` aligns the database trigger `validate_battery_stack()` with the current
application rule for pouch and cylindrical cells:

- valid: equal cathode/anode counts;
- valid: one extra anode;
- invalid: one extra cathode.

Because this is enforced by a row-level trigger, stack persistence must insert
rows in a trigger-safe order while preserving the user's saved
`position_index` values. `services/batteryElectrodeStackService.js` now orders
the insert operation as anode-before-cathode pairs internally; stored positions
remain the original positions. This means cathode-first valid API payloads for
pouch/cylindrical stacks are safe under `d031`.

## Vanilla UI Behavior

The sticky battery header now exposes:

```text
Печать    Выйти    Удалить запись
```

The visible `Разобрать аккумулятор` button is hidden in vanilla. The delete
button opens an in-page panel immediately below the sticky header.

Flow:

1. If there are unsaved changes, the existing unsaved-change confirmation is
   shown first.
2. The UI calls `GET /api/batteries/:id/delete-check`.
3. If hard blockers exist, the panel shows the blockers and no typed
   confirmation field.
4. If linked electrodes exist, the panel asks:
   - `Вернуть электроды в партию как доступные`
   - `Вернуть электроды в партию как списанные`
5. The final summary lists electrode handling and battery-owned rows to be
   deleted.
6. The final warning is bold red:

```text
Это действие нельзя отменить.
```

7. The user must type `DELETE BATTERY <id>`.
8. The UI submits `DELETE /api/batteries/:id` with JSON body.
9. On success, the form closes, the list reloads, and the page-level status says
   the battery was deleted.

The panel supports cancel/back before final confirmation.

## Validation Rules

Server-side validation:

- battery ID must exist;
- hard blockers must be absent inside the delete transaction;
- typed confirmation must exactly match `DELETE BATTERY <id>`;
- electrode disposition must be `available` or `scrapped` when linked
  electrodes exist;
- battery-owned rows are deleted explicitly and only after validation;
- electrochemistry file cleanup runs after commit as best effort.

UI validation:

- typed confirmation is not shown before preflight;
- hard blockers are shown as instructions instead of making the user type first;
- linked electrode disposition is chosen before the final summary;
- final delete is sent only through the guided panel.

## Smoke Coverage

`scripts/smoke_vanilla_api.js` now covers:

- application of `d031` to the throwaway smoke database restored from the old
  dump;
- cathode-first valid pouch/cylindrical stack payloads under the hardened
  trigger, with original positions preserved;
- cycling hard blocker before typed confirmation;
- hard blocker conflict from the delete route;
- guided delete preflight returning linked electrodes;
- confirmable owned data in preflight;
- rejection of incorrect typed confirmation;
- available electrode disposition;
- scrapped electrode disposition;
- durable `activity_log` event for successful delete;
- owned QC/electrochem cleanup;
- electrochem upload file cleanup;
- upstream project preservation after battery delete.

Module-membership hard blocker remains implemented in the service and route
contract but is not currently created through the smoke harness.

## Known Limitations And Follow-Ups

- A real, non-delete `Разобрать аккумулятор` lab-history action is intentionally
  deferred. It needs separate product design because it represents a real lab
  event, not delete preparation.
- The vanilla status dropdown still contains `Разобран`; this pass does not
  redefine all status transitions.
- Electrode batch delete, tape delete, and reverse-scrap workflows are still
  follow-up work.
- Formal ЕСПД docs were not updated in this pass.
- Vue UI was not changed.
