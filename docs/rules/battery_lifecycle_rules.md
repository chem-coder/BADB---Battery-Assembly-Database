# Battery Lifecycle Rules

Created: 2026-05-06
Edited: 2026-05-07
Status: rule
Verified against code: 2026-05-07

Source paths:

- `routes/batteries.js`
- `services/batteryLifecycleService.js`
- `services/batteryElectrochemService.js`
- `contracts/vanilla_api_endpoints.json`
- `scripts/smoke_vanilla_api.js`

These rules define the current battery lifecycle behavior that agents and
collaborators must preserve unless Dalia explicitly approves a change.

## Core Rule

Battery delete is for mistaken database records. Real lab outcomes belong in
status, history, disassembly, scrap, depletion, QC, electrochemistry, cycling,
or module records.

The guided delete workflow physically deletes the `batteries` row and
battery-owned child rows after preflight and typed confirmation. It must not
delete upstream lab records such as projects, tapes, electrode cut batches,
electrodes, separators, electrolytes, recipes, materials, or users.

## Status

`Открыт` is a derived incomplete/editable state represented by blank/`NULL`
`batteries.status`. It must not be offered as a user-selectable status value.
Legacy `disassembled` values must be displayed as `Открыт` for compatibility,
but new workflow code must not preserve `disassembled` as a normal long-term
current status.

Ordinary read/report endpoints must not mutate battery status. Status promotion
to `assembled` is allowed only in an explicit save/status workflow after the
required assembly records are complete:

- form-factor config;
- required electrode source roles;
- valid saved electrode stack;
- separator config with a separator;
- electrolyte config with electrolyte and total volume.

After assembly completion, user-selectable statuses are limited to:

- `assembled`
- `testing`
- `completed`
- `failed`

The API must reject user attempts to set `Открыт`/blank, `disassembled`, unknown
statuses, or any selectable status before assembly completion.

## Access

Guided battery delete is intentionally available to any authenticated user.

Current route contract:

- `GET /api/batteries/:id/delete-check`: `auth`
- `DELETE /api/batteries/:id`: `auth`

Do not restore an `admin` or `lead` role gate unless Dalia explicitly changes
the approved architecture.

## Delete Preflight

The delete workflow must run preflight before showing final confirmation.
Preflight separates:

- hard blockers;
- confirmable battery-owned data;
- linked electrodes.

The delete service reruns the hard-blocker and linked-electrode checks inside
the delete transaction. The backend must not trust an earlier UI preflight
response as proof that deletion is still safe.

## Hard Blockers

Battery deletion is blocked when the battery has preserved downstream history
or module context:

- `cycling_sessions`
- `module_batteries`

When blockers exist, the UI may show them, but it must not allow final typed
confirmation for physical delete.

## Confirmable Battery-Owned Data

These rows are battery-owned and may be deleted only after the user sees the
guided summary and completes typed confirmation:

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

Deletion of these rows is not a hidden cascade. The service deletes them
explicitly and records counts in the audit details.

## Typed Confirmation

Physical delete requires the exact phrase:

```text
DELETE BATTERY <battery_id>
```

Example:

```text
DELETE BATTERY 19
```

The backend validates this phrase in `validateBatteryDeleteOptions`.

## Linked Electrodes

Linked electrodes are detected from both:

- rows in `battery_electrodes`;
- `electrodes.used_in_battery_id`.

If linked electrodes exist, the delete request must include an electrode
disposition:

- `available`
- `scrapped`

For `available`, the service sets:

- `electrodes.status_code = 1`
- `electrodes.used_in_battery_id = NULL`
- `electrodes.scrapped_reason = NULL`

For `scrapped`, the service sets:

- `electrodes.status_code = 3`
- `electrodes.used_in_battery_id = NULL`
- `electrodes.scrapped_reason = selected/default reason`

The default scrap reason is generated from the deleted battery id. Do not
replace this with silent electrode deletion.

## Audit

Every successful physical delete writes an append-only `activity_log` row before
the battery row is deleted.

The audit event records at least:

- deleted battery snapshot;
- typed confirmation phrase;
- electrode disposition and reason;
- linked electrodes;
- affected electrode ids;
- hard-blocker result;
- confirmable owned data shown to the user;
- deleted row counts;
- electrochemistry filenames/links.

Electrochemistry file-link cleanup happens after commit as a best-effort file
operation. The database audit still records the links that were associated with
the deleted battery.

## Disassembly

The backend still contains a disassembly service and route for compatibility and
future product work. The vanilla guided delete flow is not the same thing as a
real lab disassembly workflow.

Do not use physical delete to record a real battery outcome.

Disassembly should remove owned assembly rows and leave the current displayed
state as derived `Открыт`. A legacy `disassembled` battery may be reassembled on
the same battery record. If it has no saved `battery_electrodes` rows, the stack
section must stay editable and must allow saving a new stack through the normal
stack endpoint.
