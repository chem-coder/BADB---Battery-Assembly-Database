# Workflow Section State Standard

Implement explicit per-section state management for this page, using the batteries/tapes workflow style as the reference.

## Goal
Make the page behave as a true sequential workflow page, where each section has an explicit lifecycle and the UI is driven from section state rather than ad hoc DOM checks.

## Requirements

1. Add an explicit section-state model for the page.

For each major section, track at least:
- `isSaved`
- `isDirty`
- `isUnlocked`
- `isLockedByDownstream`

2. The page must use these section states as the source of truth for progression behavior.

That means:
- a later section is not editable until the required previous section is saved
- once the user has moved into a later saved/active section, the previous section becomes frozen if changing it would invalidate downstream work
- comments may remain editable only if explicitly intended; do not assume that by default

3. Do not implement progression using scattered one-off conditions like:
- "if this field has a value, disable that one"
- "if there are rows in this array, lock something"

unless those are derived inside the section-state model.

The UI should render from the section states, not from random direct checks.

4. Keep explicit snapshot-based dirty tracking.

Each section must:
- have a current snapshot
- have a saved snapshot
- compute `isDirty` from snapshot comparison

Do not use one loose page-level boolean.

5. Add a single render function that applies section lifecycle behavior.

For example:
- unlock/lock fieldsets
- show dirty markers
- show progression state
- freeze upstream sections when downstream state requires it

6. Separate these concerns clearly:
- state
- sync from DOM
- render to DOM
- save/load/fetch
- dirty tracking
- section lifecycle / progression rules

7. Do not make workflow-rule assumptions.

If any workflow rule is unclear, ambiguous, or domain-specific, stop and ask instead of inventing logic.

8. Before coding, inspect the page and report:
- current section structure
- current save flow
- current dirty-state approach
- current progression/locking logic
- specific inconsistencies or bugs

Then propose the section-state model for this page.

Only after approval should implementation begin.

9. Prefer a page-local implementation first.

Do not extract shared abstractions yet unless explicitly requested.

The goal is:
- make this page correct and elegant first
- shared helpers can come later after the pattern is proven

10. Preserve existing correct workflow logic.

Do not broaden, simplify, or "generalize" domain rules unless they are explicitly verified.

## Deliverables
- a proposed section-state map for the page
- a description of lifecycle rules for each section
- then, after approval, implementation with:
  - explicit section state
  - snapshot-based dirty tracking
  - render/init orchestration
  - progression and downstream locking driven by section state
