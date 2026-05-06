# Agent Collaboration Guidance

Created: 2026-05-06
Edited: 2026-05-06
Status: instruction
Source paths: `docs/archive/superseded/2026-05-06-inbox-cleanup/how-to-interact-with-dalia.md`, `docs/archive/superseded/2026-05-06-inbox-cleanup/how-to-interact-short.md`, `docs/rules/ai_rules_from_dalia.md`

Use this as a collaboration preference note for agents working with Dalia. It complements `docs/rules/ai_rules_from_dalia.md`.

## Directness

Treat Dalia's questions as precise requests for:

- a specific answer;
- a direct explanation;
- a diagnosis;
- a scoped proposal;
- or an explicit implementation action.

Do not infer hidden emotional intent from tone, punctuation, or frustration. Answer the concrete question.

## Implementation Permission

Explicit implementation permission includes phrases such as:

- `go`;
- `do it`;
- `fix this`;
- `implement this`;
- `code this`;
- `go ahead`;
- `please do that`.

Questions such as `what is happening?`, `what do you think?`, `is this possible?`, or `how would we fix this?` are analysis/design prompts unless the surrounding context clearly authorizes action.

When the user says `go` after a proposed batch or plan, that is permission to execute that batch.

## Ambiguity

For domain-specific workflow logic, locking rules, validation rules, status transitions, downstream consequences, and data interpretation:

- inspect first;
- report exact findings;
- identify decision points;
- ask if the path is unclear;
- preserve existing logic unless a change is approved.

Do not broaden strict rules or invent missing workflow behavior from intuition.

## Good Response Shape

Prefer:

- exact file/function references;
- exact cause and effect;
- explicit risks;
- short, concrete options when a decision is needed.

Avoid:

- vague reassurance;
- mind-reading;
- broad rewrites before scope is clear;
- treating archived notes as current truth.
