# UI API DB Mapping

Created: 2026-05-06
Edited: 2026-05-06
Status: instruction
Source paths: `docs/archive/superseded/2026-05-06-inbox-cleanup/Mapping_Plan.md`, `docs/archive/superseded/2026-05-06-inbox-cleanup/Javascript_Outline.md`, `contracts/vanilla_api_endpoints.json`, `scripts/check_vanilla_api_contract.js`

Use this when a workflow page feels uncertain and needs a behavior map before implementation.

## Mapping Shape

Create a compact table with four columns:

```text
UI element | JS function/handler | API endpoint | DB target
```

Examples:

- save button;
- add row button;
- select recipe;
- generated table row input;
- print button.

Mark missing pieces explicitly as `MISSING`.

## Boundary

Mapping stops at behavior.

Do not redesign structure while mapping. If something is awkward but functional, record it and leave it alone until a scoped implementation task exists.

## Objective

Answer:

```text
Can this workflow be created and fully logged from start to finish without undefined handlers or missing routes?
```

After mapping:

1. identify missing handlers, routes, or DB targets;
2. implement only the approved missing pieces;
3. test end-to-end;
4. freeze that workflow before repeating the process for another workflow.

## Recommended JS Section Order

For page scripts, keep a clear order when practical:

- state and helpers;
- API helpers;
- rendering;
- status helpers;
- reference dropdowns;
- events;
- init.
