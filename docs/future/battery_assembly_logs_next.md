# Battery Assembly Logs Future Reference

Created: 2026-05-06
Edited: 2026-05-06
Status: future idea
Verified against code: light check 2026-05-06
Source paths: `docs/archive/superseded/2026-05-06-future-backlog/BATTERY_ASSEMBLY_LOGS_REFERENCES.md`, `docs/current/batteries.md`, `services/batteryAssemblyService.js`, `public/js/battery-print.js`

This file preserves reference ideas for richer battery assembly logs. It is not a statement of current BADB behavior.

Current battery behavior is documented in `docs/current/batteries.md`.

## Reference Source Types

Useful outside references rarely appear as one complete public battery assembly log. Relevant structure is usually distributed across:

- academic supplementary information;
- open lab protocols;
- industrial traveler sheets and QC documents;
- patents;
- battery datasets and metadata files.

These sources can inspire structure, but they are not BADB source of truth.

## Ideal Log Structure To Consider

A richer future assembly log could include:

- metadata: battery id, date, operator, project, experiment;
- electrode sources: cathode/anode tape ids and cut-batch ids;
- electrode details: geometry, mass, drying/loading data;
- stack configuration: ordered layer sequence;
- separator details: type, structure, thickness, coating notes;
- electrolyte details: composition, total volume, dosing method;
- assembly parameters: spacer thickness, spacer count, spring type, crimp pressure if relevant;
- post-assembly QC: OCV, ESR, notes, pass/fail state.

Much of this is already partially represented by normalized BADB tables. Future work should identify only the missing fields scientists actually need.

## Future Use

Use this reference when evaluating:

- whether pouch/cylindrical assembly needs additional parameters;
- whether battery print reports should include richer traveler-style sections;
- whether QC records should become more structured;
- whether external lab protocols reveal a missing traceability relationship.

Do not add fields just because they appear in external documents. Add them only after checking current schema, current UI, current reports, and actual lab need.
