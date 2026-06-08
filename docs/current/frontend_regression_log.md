# Frontend Regression Log

Created: 2026-06-08
Edited: 2026-06-08
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
