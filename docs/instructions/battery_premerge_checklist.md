# Battery Page Pre-Merge Checklist

Created: 2026-05-06
Edited: 2026-05-06
Status: instruction
Verified against code: light check 2026-05-06
Source paths: `public/workflow/3-batteries.html`, `public/js/3-batteries.js`, `routes/batteries.js`, `services/batteryCatalogService.js`, `services/batteryElectrodeStackService.js`, `scripts/smoke_vanilla_api.js`

Purpose: verify the vanilla Batteries page is stable enough to merge before adding more features.

Scope: `/public/workflow/3-batteries.html` through battery creation, project assignment, electrode source selection, electrode stack selection, stack save, and reload behavior.

Do not test future features here. If a new idea appears, write it down separately and keep this checklist focused.

## Setup

- [ ] Confirm you are on the feature branch being tested.
- [ ] Confirm the backend server was restarted after backend/service changes.
- [ ] Open the vanilla Batteries page: `/workflow/3-batteries.html`.
- [ ] Hard refresh the browser page.
- [ ] Confirm the current logged-in user is visible in the upper right.
- [ ] Confirm the Batteries page opens to the battery list, not directly to the new battery form.
- [ ] Confirm `+ Добавить аккумулятор` is visible.

## Existing Battery List

- [ ] Existing batteries load without console errors.
- [ ] Selecting an existing battery opens the form.
- [ ] The header shows the selected battery ID.
- [ ] The header shows the battery project or projects.
- [ ] The form factor/config values match the selected battery.
- [ ] If a battery already has a saved stack, the stack is displayed.
- [ ] If a saved stack is finalized, stack checkboxes are not editable.

## Start New Battery

- [ ] Click `+ Добавить аккумулятор`.
- [ ] The new battery form opens.
- [ ] `Создал` shows the current user name and remains disabled.
- [ ] No project is manually required at the very top of the page.
- [ ] The create/save button is located after electrode source and battery project selection.
- [ ] Unsaved-change marker appears only after actual changes.

## Coin Half-Cell: Cathode vs Li

- [ ] Select form factor `coin`.
- [ ] Select half-cell mode.
- [ ] Select half-cell type `cathode_vs_li`.
- [ ] Confirm the cathode source block is available.
- [ ] Confirm the anode source block is hidden or unavailable.
- [ ] Select a cathode tape.
- [ ] Select a compatible cathode cut batch.
- [ ] Confirm the battery project multi-select is populated from that selected batch.
- [ ] Select at least one allowed battery project.
- [ ] Click `Создать аккумулятор`.
- [ ] Confirm a battery ID is assigned.
- [ ] Confirm phase-two sections become visible after creation.
- [ ] In the stack section, target counts show cathodes = 1 and anodes = 0.
- [ ] Confirm target count fields are read-only/disabled for this coin cell.
- [ ] Select one cathode electrode.
- [ ] Confirm the selected checkbox visibly shows a checkmark.
- [ ] Confirm all other available cathode checkboxes become disabled.
- [ ] Uncheck the selected cathode.
- [ ] Confirm the other available cathode checkboxes become enabled again.
- [ ] Select one cathode again.
- [ ] Confirm the stack summary shows exactly one cathode electrode.
- [ ] Click `Сохранить стек электродов`.
- [ ] Confirm the final-stack confirmation appears.
- [ ] Confirm accepting the confirmation saves the stack.
- [ ] Confirm the stack becomes read-only after save.

## Coin Half-Cell: Anode vs Li

- [ ] Create or select a coin half-cell with type `anode_vs_li`.
- [ ] Confirm the anode source block is available.
- [ ] Confirm the cathode source block is hidden or unavailable.
- [ ] Select an anode tape.
- [ ] Select a compatible anode cut batch.
- [ ] Confirm the battery project multi-select is populated from that selected batch.
- [ ] Select at least one allowed battery project.
- [ ] Save/create the battery identity.
- [ ] In the stack section, target counts show cathodes = 0 and anodes = 1.
- [ ] Confirm target count fields are read-only/disabled.
- [ ] Select one anode electrode.
- [ ] Confirm the selected checkbox visibly shows a checkmark.
- [ ] Confirm all other available anode checkboxes become disabled.
- [ ] Uncheck the selected anode.
- [ ] Confirm the other available anode checkboxes become enabled again.
- [ ] Select one anode again.
- [ ] Confirm the stack summary shows exactly one anode electrode.
- [ ] Save the stack and confirm it becomes read-only.

## Coin Full Cell

- [ ] Create or select a coin full-cell.
- [ ] Confirm both cathode and anode source blocks are available.
- [ ] Select one cathode tape and compatible cathode cut batch.
- [ ] Select one anode tape and compatible anode cut batch.
- [ ] Confirm battery projects are limited to projects common to both selected batches.
- [ ] Select at least one allowed battery project.
- [ ] Save/create the battery identity.
- [ ] Confirm target counts show cathodes = 1 and anodes = 1.
- [ ] Select one cathode electrode.
- [ ] Confirm other cathodes become disabled.
- [ ] Select one anode electrode.
- [ ] Confirm other anodes become disabled.
- [ ] Confirm stack summary shows one cathode and one anode.
- [ ] Save the stack and confirm it becomes read-only.

## Pouch, Prism, Or Cylindrical Cell

- [ ] Create or select a pouch, prism, or cylindrical battery.
- [ ] Confirm both cathode and anode source blocks are available.
- [ ] Select one cathode tape and compatible cathode cut batch.
- [ ] Select one anode tape and compatible anode cut batch.
- [ ] Confirm battery projects are limited to projects common to both selected batches.
- [ ] Select at least one allowed battery project.
- [ ] Save/create the battery identity.
- [ ] Confirm stack target count inputs are editable.
- [ ] Enter invalid target counts where anodes are not equal to cathodes or cathodes + 1.
- [ ] Confirm electrode checkboxes remain disabled or validation prevents stack save.
- [ ] Enter valid target counts.
- [ ] If testing through API/dev tools, submit a valid cathode-first stack payload and confirm it saves.
- [ ] Confirm saved stack display preserves the original `position_index` order.
- [ ] Select electrodes until the target count is reached.
- [ ] Confirm remaining unselected electrodes become disabled after the target count is reached.
- [ ] Uncheck one selected electrode.
- [ ] Confirm the remaining available electrodes become enabled again.
- [ ] Confirm the stack summary updates after each selection/deselection.
- [ ] Save the stack and confirm it becomes read-only.

## Project Rules

- [ ] The battery project selector allows only projects tied to the selected source batch or batches.
- [ ] For half-cells, allowed projects come from the selected real electrode batch.
- [ ] For full cells, pouch cells, prism cells, and cylindrical cells, allowed projects are the intersection of cathode and anode batch projects.
- [ ] Deselecting/changing a source batch updates allowed battery projects.
- [ ] The UI prevents saving a battery with zero battery projects.
- [ ] The UI prevents saving unrelated battery projects.
- [ ] Backend rejects invalid project IDs if tested through API or smoke test.

## Reload And Persistence

- [ ] After saving a battery identity, reload the page.
- [ ] Select the saved battery from the list.
- [ ] Confirm form factor/config values reload correctly.
- [ ] Confirm selected source tape and cut batch reload correctly.
- [ ] Confirm saved battery projects reload correctly.
- [ ] If stack was saved, confirm stack summary reloads correctly.
- [ ] Confirm selected stack electrodes are no longer listed as available for a new battery.

## Unsaved Changes

- [ ] Make a small unsaved edit.
- [ ] Click `Выход`.
- [ ] Confirm the unsaved-changes warning appears.
- [ ] Cancel exit and confirm the page remains usable.
- [ ] Save the edit.
- [ ] Confirm the unsaved marker clears.
- [ ] Try logout after saving.
- [ ] Confirm logout does not leave a stale unsaved-changes warning behind.

## Browser Console

- [ ] Open DevTools Console.
- [ ] Repeat one stack selection flow.
- [ ] Confirm no new red JavaScript errors appear.
- [ ] Confirm no repeated API errors appear during normal interaction.

## Automated Checks Before Merge

- [ ] Run syntax checks:

```bash
node --check public/js/3-batteries.js
node --check services/batteryCatalogService.js
node --check services/batteryProjectService.js
node --check services/batteryElectrodeSourceService.js
node --check services/batteryElectrodeStackService.js
node --check scripts/smoke_vanilla_api.js
```

- [ ] Run contract check:

```bash
npm run contract:vanilla
```

- [ ] Run smoke test:

```bash
npm run smoke:vanilla
```

- [ ] Run diff whitespace check:

```bash
git diff --check
```

## Merge Readiness

- [ ] Half-cell cathode-vs-Li works through stack save.
- [ ] Half-cell anode-vs-Li works through stack save.
- [ ] Coin full-cell works through stack save, if test data exists.
- [ ] Pouch or cylindrical target-count behavior works, if test data exists.
- [ ] Cathode-first valid pouch/prism/cylindrical payloads save under `d031`/current trigger function; backend insert order is trigger-safe and saved positions are preserved.
- [ ] Saved batteries reload correctly.
- [ ] Unsaved-change guard behaves normally.
- [ ] No red console errors appear during the tested flows.
- [ ] `npm run smoke:vanilla` passes.
- [ ] Any new ideas discovered during testing are written separately and are not added to this branch.

If all applicable items pass, this branch is ready to merge into `main`.
