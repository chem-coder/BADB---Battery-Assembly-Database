# Mapping Plan

Created: 2026-05-06
Edited: 2026-05-06
Status: raw inbox
Converted from: `Mapping_Plan.docx`

For tapes only, create a single sheet (paper or one document) with four columns:

UI element
Example: “Save tape button”, “Add drying step”, “Select recipe”, etc.

JS function
What function handles it? If none exists, mark “MISSING”.

API endpoint
GET /api/tapes
POST /api/tape-steps
etc.

Database target
Table name
Columns touched

Nothing else. No redesign notes. No improvements. Only mapping.

The objective is to answer one question:

Can a tape be created and fully logged from start to finish without undefined handlers or missing routes?

Once that is mapped:

Identify missing server routes.

Implement only those.

Test end-to-end.

Freeze tapes.

Then repeat for electrodes.
Then repeat for coin assembly.

Important constraint:

Mapping must stop at behavior. Do not start rewriting structure while mapping. If something is awkward but functional, it stays.
