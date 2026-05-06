# Workflow State Refactor Pattern

Created: 2026-05-06
Edited: 2026-05-06
Status: instruction
Source paths: `docs/archive/superseded/2026-05-06-inbox-cleanup/state-standard.md`, `docs/archive/superseded/2026-05-06-inbox-cleanup/state-strict-no-assumptions.md`, `docs/archive/superseded/2026-05-06-inbox-cleanup/state-working-prompt.md`

Use this when refactoring a workflow page into explicit sequential sections.

## Goal

Workflow pages should be driven by explicit per-section state, not scattered DOM checks.

For each major section, model at least:

- `isSaved`
- `isDirty`
- `isUnlocked`
- `isLockedByDownstream`

Use section state as the source of truth for:

- progression;
- editability;
- dirty markers;
- downstream locking;
- section availability.

## Dirty Tracking

Prefer snapshot-based dirty tracking per section:

- saved snapshot;
- current snapshot;
- `isDirty` derived from snapshot comparison.

Do not use one loose page-level dirty boolean as the main mechanism for a multi-section workflow.

## Separation Of Concerns

Keep these concerns distinct:

- state;
- sync from DOM;
- render to DOM;
- fetch/load/save;
- dirty tracking;
- progression and lifecycle rules.

Use one render path that applies lock/unlock state, dirty markers, availability, and downstream freeze state.

## No Workflow Assumptions

Do not invent workflow, locking, progression, or validation rules.

If a rule is unclear, inspect the current page and ask before implementation. Preserve existing stricter rules unless an approved change says otherwise.

## Investigation Before Coding

Before implementation, inspect and report:

- current section structure;
- current save/load flow;
- current dirty-state model;
- current progression and locking behavior;
- bugs, inconsistencies, and risks;
- proposed section-state map;
- unresolved decisions that need Dalia.

Prefer a page-local implementation first. Shared helpers can come later after the page behavior is proven.
