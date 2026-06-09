# Frontend Regression Log

Created: 2026-06-08
Edited: 2026-06-09
Status: current

This log records verified bugs where the user-visible failure was caused by
frontend behavior rather than by backend validation or database rules.

Use it as an evidence log, not as a blame document. Each entry should preserve:

- user-facing symptom;
- affected page and files;
- root cause;
- why the backend/database behavior was or was not at fault;
- fix made;
- checks run;
- prevention or follow-up.

## Summary

| Date | Area | Symptom | Root Cause | Status |
|---|---|---|---|---|
| 2026-06-09 | Batteries | No list duplicate action; users had to re-enter setup manually | Batteries page never implemented the restore-to-draft duplicate path used on Tapes | Fixed with client-side unsaved create-mode duplicate draft |
| 2026-06-09 | Tapes | Duplicate opened a thin starter copy instead of a useful workflow draft | Frontend duplicate state used only the list row object and April 3 state reset removed accidental restored-form carryover | Fixed with explicit restore-to-draft duplicate path |
| 2026-06-08 | Tapes | Today's creation date could be rejected as future on a Windows lab PC | Frontend parsed a date-only `YYYY-MM-DD` value as a JavaScript timestamp, then re-serialized it using local getters | Fixed in tapes; related frontend patterns flagged |

## 2026-06-08: Tape Creation Date Shifted By Frontend Timezone Parsing

Source paths:

- `public/js/1-tapes.js`
- `services/tapeCatalogService.js`
- `docs/instructions/vanilla_ui_patterns.md`

### Symptom

On the Windows lab PC, creating or saving a tape with `Дата создания` set to
today could fail with:

```text
Дата создания не может быть в будущем
```

The same workflow could appear to work from the Mac, which made the issue look
environment-specific.

### Backend Finding

The error message came from backend validation in
`services/tapeCatalogService.js`, inside `normalizeOptionalItemCreatedAtDate()`.

The backend validation was correct and stayed unchanged:

- accepts only date-only values in `YYYY-MM-DD` form;
- compares the normalized date string to server-local today from
  `getTodayDateString()`;
- rejects true future dates.

The backend was detecting a bad value sent by the client; it was not the source
of the bad value.

### Root Cause

The frontend helper `formatDateInputValue()` in `public/js/1-tapes.js`
converted date-only values through `new Date(value)`.

In JavaScript, a plain `YYYY-MM-DD` string parses as UTC midnight. Reading it
back through local getters such as `getFullYear()`, `getMonth()`, and
`getDate()` can shift the calendar day on devices or timezones where UTC
midnight is not the same local date. That made a user-selected "today" value
serialize as a different calendar date on some machines.

### Fix

The tape frontend now treats date-only values as date-only strings:

- `formatDateInputValue()` takes the leading `YYYY-MM-DD` portion verbatim when
  the value is a date string or ISO timestamp;
- `new Date()` is kept only as a fallback for non-ISO inputs such as a `Date`
  object;
- `getTodayDateInputValue()` builds local today directly from local calendar
  components, matching the backend's date-only helper.

Future-date validation remains intact:

- the UI still sets the date input `max` to local today;
- the backend remains authoritative and still rejects future dates.

### Checks

Checks reported for this fix:

- `node --check public/js/1-tapes.js` - OK
- `npm test` - 27 passed
- `npm run contract:vanilla` - PASS
- `npm run smoke:vanilla` - 279 checks, 0 failures

### Follow-Up

The same backend string-check pattern is already correct in:

- `services/electrodeCutBatchService.js`
- `services/batteryCatalogService.js`

The same frontend date formatting pattern may also exist in:

- `public/js/2-electrodes.js`
- `public/js/3-batteries.js`

Those frontend pages should be audited in a separate, scoped follow-up instead
of mixing unrelated changes into the tape fix.

### Prevention

`docs/instructions/vanilla_ui_patterns.md` now includes a Date-Only Fields rule:

- preserve `YYYY-MM-DD` as a string;
- compare normalized date strings;
- do not validate date-only fields by converting them through timezone-sensitive
  JavaScript timestamps.

## 2026-06-09: Tape Duplicate No Longer Preserves Restored Workflow Draft Fields

Source paths:

- `public/js/1-tapes.js`
- `docs/current/tapes.md`
- `docs/current/vanilla_reference_pages.md`

### Symptom

Duplicating a tape from the vanilla Tapes list opened an unsaved create-mode
draft that copied only name, notes, and project links. Useful source tape setup
and workflow fields such as recipe, material instances, actual weighed values,
operators, timestamps, comments, and technical parameters were not restored into
the duplicate draft.

### Backend Finding

The backend restore, create, and section-save endpoints behaved as designed:

- source tape edit restore data was already available through existing GET
  endpoints;
- `POST /api/tapes` correctly creates only a new tape header/general row;
- recipe actuals and workflow steps correctly require a real `tape_id` and are
  saved through their section endpoints.

The failure was frontend duplicate state construction, not backend validation or
database behavior.

### Root Cause

The duplicate button used only the already-loaded list row object. That list row
does not contain the full workflow payload.

Git history shows no committed deterministic full duplicate implementation.
Before `8e432fc01454530c9c1656c511a153a728e953c6` on 2026-04-03, duplicate did
not explicitly reset the whole restored form, so users could benefit from
accidental restored-form carryover after opening a source tape. The April 3
state reset made the form state cleaner but removed that accidental carryover;
duplicate never gained an explicit restore-to-draft path.

### Fix

Tape duplicate now loads source restore data, normalizes it into a sanitized
create-mode draft, and renders copied values visibly without writing anything to
the database.

The duplicate draft:

- clears `currentTapeId`;
- stores the source tape id only as frontend debug/draft metadata;
- copies useful setup/workflow fields where available;
- clears tape identity and audit metadata;
- starts dry-box availability as `out_of_dry_box`;
- leaves copied recipe/workflow sections dirty until the user saves them.

Creating the duplicated tape row marks only General Info saved. Copied material
instances, actuals, and workflow steps remain unsaved because they can only be
persisted safely after the new `tape_id` exists.

### Checks

Checks reported for this fix:

- `node --check public/js/1-tapes.js` - PASS
- `npm run contract:vanilla` - PASS
- `git diff --check` - PASS
- `npm run smoke:vanilla` - PASS, 279 checks, 0 failures
- manual browser verification - not completed in this pass; the first browser
  run hit an old/thin duplicate state from the already-running server, and the
  server stopped responding before the updated asset could be verified

### Follow-Up

The current duplicate implementation intentionally reuses existing edit restore
normalization. Any save/restore mismatches in edit restore, such as fields that
are displayed but not saved by a section endpoint, should be audited separately
from this duplicate fix.

### Prevention

When a list action promises duplication of nested workflow data, it should load
the same restore payload used by edit/open behavior and then sanitize identity,
audit, lifecycle, and downstream-link fields explicitly.

## Entry Template

```text
## YYYY-MM-DD: Short Bug Title

Source paths:

- `path/to/frontend.js`
- `path/to/backend-or-rule.js`

### Symptom

What the user saw, including exact error messages when useful.

### Backend Finding

Whether backend/database behavior was correct, wrong, or only exposed the
frontend bug.

### Root Cause

The frontend behavior that produced the failure.

### Fix

What changed.

### Checks

Commands and manual checks run.

### Follow-Up

Related patterns to audit later.

### Prevention

Rule, test, smoke check, or UI pattern added to reduce recurrence.
```
