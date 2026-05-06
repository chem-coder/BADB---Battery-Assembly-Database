## Tapes Page

- [x] Open `Протокол приготовления электродных лент`.
- [x] Open or create a tape.
- [x] Change a field in `Общая информация`.
- [x] Confirm `Не сохранено` appears as a small amber pill.
- [x] Save the section.
- [x] Confirm the save message appears briefly in green/neutral styling, then disappears.
- [x] Confirm the amber dirty flag disappears after save.
- [x] Check a disabled field, for example `Создал`.
- [x] Confirm disabled fields are plain grey, readable, and not visually alarming.

## Electrodes Page

- [x] Open `Электроды`.
- [x] Open or create an electrode batch.
- [x] Change a batch field.
- [x] Confirm `Не сохранено` appears as the same amber pill style.
- [x] Save the batch.
- [x] Confirm the inline save message uses the shared subtle green style.
- [x] Trigger or notice any inline error message if available.
- [ ] Confirm errors are red, but dirty flags are not red.
- [ ] Check disabled fields such as auto-filled creator/config fields.
- [ ] Confirm disabled fields match the grey treatment from tapes.

## Batteries Page

- [x] Open `Протокол сборки аккумулятора`.
- [x] Open or create a battery.
- [x] Change a section field.
- [ ] Confirm `Не сохранено` appears as the same amber pill, not pink/red.
- [ ] Save the section.
- [x] Confirm the saved message is subtle and transient.
- [ ] Check the locked assembly banner if you have a battery where electrode configuration is fixed.
- [ ] Confirm the banner is calm grey/blue-grey and consistent with the rest of the UI.
- [ ] Check disabled/readonly battery fields.
- [ ] Confirm they use the same plain grey disabled style.

## Cross-Page Consistency

- [ ] Compare dirty flags across tapes, electrodes, and batteries.
- [ ] Confirm the text is `Не сохранено`.
- [ ] Confirm dirty flags all feel like the same component.
- [ ] Compare saved messages across the three pages.
- [ ] Confirm saved messages are brief, quiet, and disappear.
- [ ] Compare disabled fields/buttons across the three pages.
- [ ] Confirm disabled states feel consistent and readable.
- [ ] Confirm print pages still look unchanged.
- [ ] Confirm Vue pages were not affected.

## Quick Regression Check

- [ ] Create, edit, and save one item on each page.
- [ ] Reload each page.
- [ ] Confirm saved data is still there.
- [ ] Confirm no dirty flag appears immediately after loading saved data.
- [ ] Open the browser console.
- [ ] Confirm there are no new red errors while testing.
