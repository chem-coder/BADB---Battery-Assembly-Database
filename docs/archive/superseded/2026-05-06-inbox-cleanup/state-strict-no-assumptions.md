# Workflow Section State Prompt (Strict / No Assumptions)

Refactor this page into an explicit sequential workflow page with per-section state.

## Non-Negotiable Rule
Do not make workflow-rule assumptions.

If any workflow rule, lifecycle rule, locking rule, progression rule, or domain rule is unclear, ambiguous, incomplete, or seems “probably obvious,” stop and ask before coding.

Do not:
- fill in missing logic
- broaden an existing rule
- simplify an existing rule
- “generalize” a workflow rule
- infer intended behavior from your own intuition

Preserve existing workflow logic unless it is explicitly changed.

## Goal
Make the page behave as a true sequential workflow page, where each section has an explicit lifecycle and the UI is driven from section state, not ad hoc DOM checks.

## Required Architecture
Add explicit section state for each major section.

For each section, track at least:
- `isSaved`
- `isDirty`
- `isUnlocked`
- `isLockedByDownstream`

Use this section-state model as the source of truth for:
- progression
- editability
- downstream locking
- dirty markers
- section availability

## Dirty Tracking
Use explicit snapshot-based dirty tracking.

Each section must have:
- a current snapshot
- a saved snapshot
- `isDirty` derived from snapshot comparison

Do not use one loose page-level boolean as the main dirty-state mechanism.

## Separation of Concerns
Keep these concerns clearly separated:
- state
- sync from DOM
- render to DOM
- fetch/load/save
- dirty tracking
- section lifecycle / progression rules

## Progression Rules
A later section must not become editable until the required previous section is saved.

Once downstream work exists, upstream sections that would invalidate that downstream work must become frozen.

Do not decide these invalidation rules on your own.
If they are not already explicit in the page, ask before implementing them.

Comments may remain editable only if explicitly intended.
Do not assume comments should always stay editable.

## Process
Before writing code:

1. Inspect the page.
2. Report back with:
   - current section structure
   - current save/load flow
   - current dirty-state model
   - current progression/locking logic
   - inconsistencies, bugs, and risks
3. Propose the exact section-state model for this page.
4. List any workflow rules that are unclear and require confirmation.
5. Wait for explicit approval.
6. Only then implement.

## Restrictions
Do not:
- code immediately
- make “reasonable assumptions”
- invent missing workflow behavior
- silently overwrite stricter existing logic with broader logic
- extract shared abstractions unless explicitly requested

Prefer a page-local implementation first.
Shared abstraction can come later after the page behavior is proven correct.

## Deliverables
After approval, implement:
- explicit section state
- snapshot-based dirty tracking
- render/init orchestration
- progression and downstream locking driven by section state

But before approval, only inspect, analyze, propose, and ask clarifying questions where needed.