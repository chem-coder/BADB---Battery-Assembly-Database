# Vanilla Auth Branch Test Checklist

## Login/session
- [x] Open app with normal auth, no token: login screen appears.
- [x] Login succeeds with valid user.
- [x] Wrong password shows an error.
- [x] Current user appears in upper-right corner.
- [x] Logout clears session and returns to login.
- [x] Refresh page after login: still authenticated.
- [x] Open another vanilla page: still authenticated.
- [x] AUTH_BYPASS=true mode shows bypass user and does not require login.

## Current user buttons
- [x] No user dropdown is auto-filled on page load.
- [x] Saved user values from database remain unchanged.
- [x] Blank user fields stay blank.
- [x] Clicking `Текущий пользователь` fills only that specific field.
- [x] User can still manually choose a different user.
- [x] Disabled audit fields do not get editable current-user buttons.

## Core tape workflow
- [x] Open tape page.
- [x] Create a new tape.
- [x] Save recipe/material selection.
- [x] Save weighing step.
- [x] Save mixing step.
- [x] Save coating step.
- [x] Save calendering step.
- [x] Save drying/storage step.
- [x] Reopen saved tape and confirm values persisted.

## Core electrode workflow
- [ ] Open electrode page.
- [ ] Load tapes/batches.
- [ ] Create or edit electrode cut batch.
- [ ] Save foil masses if relevant.
- [ ] Create/edit electrode rows.
- [ ] Reopen batch and confirm values persisted.

## Core battery workflow
- [ ] Open battery page.
- [ ] Create battery.
- [ ] Save sources.
- [ ] Save electrode stack.
- [ ] Save configuration.
- [ ] Save separator/electrolyte.
- [ ] Save QC.
- [ ] Reopen battery and confirm values persisted.

## Reference pages
- [ ] Projects page loads.
- [ ] Users page loads.
- [ ] Materials page loads.
- [ ] Recipes page loads.
- [ ] Separators page loads.
- [ ] Electrolytes page loads.
- [ ] Create/edit still works where expected.

## Print/report pages
- [ ] Tape print page loads.
- [ ] Electrode batch print page loads.
- [ ] Battery print page loads.

## Regression feel-check
- [ ] No page gets stuck behind login after successful login.
- [ ] No unexpected 401/403 errors during normal use.
- [ ] No field becomes dirty just because the page loaded.
- [ ] No obvious layout overlap from the upper-right user display.
