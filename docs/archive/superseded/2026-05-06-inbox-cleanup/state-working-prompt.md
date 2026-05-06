# Workflow Section State Working Prompt

Refactor this page into an explicit sequential workflow page with per-section state.

## What to do
- add explicit section state for each major section:
  - `isSaved`
  - `isDirty`
  - `isUnlocked`
  - `isLockedByDownstream`
- use section state as the source of truth for progression and locking
- keep snapshot-based dirty tracking per section
- separate:
  - state
  - sync from DOM
  - render
  - fetch/load/save
  - progression rules
- add one render path that applies:
  - dirty markers
  - lock/unlock state
  - downstream freezing
  - progression availability

## Important rules
- do not make workflow-rule assumptions
- if a workflow rule is unclear, ask before coding
- do not generalize domain logic unless it is verified
- do not extract shared abstractions yet unless explicitly requested

## Process
1. inspect the page first
2. report:
   - current section structure
   - current save/load flow
   - current dirty-state model
   - current progression/locking behavior
   - bugs/inconsistencies
3. propose the section-state model
4. wait for approval
5. only then implement
