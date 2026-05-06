# Battery Electrode Stack Design

Source of truth: `/Users/Dalia/Developer/RENERA/prompts_and_logic/electrodes mess/electrodes-logic.txt`.

## Purpose

The Batteries page is a workflow page. Electrode source selection and electrode stack selection must happen in the correct order because later calculations and locks depend on earlier choices.

This page must not treat the stack checkboxes as ordinary independent form inputs. The stack is controlled state:

1. The battery form factor and cell configuration determine the valid source roles.
2. The selected electrode source batches determine which electrodes may be displayed.
3. The target electrode counts determine how many checkboxes may be selected.
4. The selected stack is saved once, then becomes read-only.

## Phase 1: Battery Identity

Phase 1 creates or updates the battery record and its identity-defining fields:

- operator / creator, filled from auth and read-only;
- form factor;
- cell configuration;
- electrode source batch or batches;
- battery project or projects;
- comments.

For electrode sources:

- coin half-cell: exactly one source, either cathode or anode;
- coin full-cell: exactly one cathode source and one anode source;
- pouch/cylindrical: exactly one cathode source and one anode source.

Compatible source batches are filtered by:

- expected shape: circles for coin cells, rectangles for pouch/cylindrical cells;
- expected target form factor;
- sidedness: coin cells require one-sided electrodes; pouch/cylindrical cells may use one-sided or two-sided electrodes;
- project intersection rules already enforced by the project linkage code.

Compatible source batches are not filtered by electrode size code.

## Phase 2: Stack Selection

Phase 2 is available after the battery record exists.

Target counts:

- coin half-cell cathode-vs-Li: cathodes = 1, anodes = 0;
- coin half-cell anode-vs-Li: cathodes = 0, anodes = 1;
- coin full-cell: cathodes = 1, anodes = 1;
- pouch/cylindrical: user specifies cathodes/anodes; anodes must equal cathodes or cathodes + 1.

The target counts are shown in the stack section. For coin cells they are automatically filled and read-only. For pouch/cylindrical cells they are user-editable.

The electrode checkboxes are state-controlled:

- clicking a checkbox toggles stack state directly;
- the DOM checkbox is then rendered from stack state;
- form-level input/change handlers must ignore stack checkbox events;
- once the selected count reaches the target count for a role, remaining unselected electrodes in that role are disabled;
- deselecting an electrode re-enables the remaining available electrodes for that role.

The stack summary displays the selected electrodes ordered by mass and layered from anode first.

## Save Stack

Before saving the stack, the UI validates that the selected stack matches the target counts. The user must confirm that the stack is final.

After the stack is saved:

- selected electrodes are marked used by the backend;
- the stack becomes read-only;
- the source tape and batch selections are frozen;
- comments and project assignment may remain editable;
- lower assembly/QC/electrochem sections remain editable according to their own save rules.

## Backend Enforcement

The backend must reject invalid stack saves even if the UI is bypassed.

It validates:

- only `cathode` and `anode` roles are accepted;
- the same electrode cannot appear twice;
- half-cell/full-cell/pouch/cylindrical role counts match the battery configuration;
- each electrode belongs to the source batch saved for that role;
- unavailable electrodes cannot be taken because the existing status update only succeeds for available electrodes or electrodes already assigned to the same battery.

## Important Anti-Pattern

Do not use the page-level form mutation handler to re-render stack checkboxes during a checkbox click.

That causes this failure:

1. browser click temporarily checks the box;
2. form-level input/change handler re-renders from still-empty stack state;
3. checkbox becomes unchecked before the stack handler can add the electrode.

The stack section must handle its own events and update stack state directly.
