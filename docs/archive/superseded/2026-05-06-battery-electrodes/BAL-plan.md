# BAL plan

Created: 2026-05-06
Edited: 2026-05-06
Status: superseded
Converted from: `BAL-plan.docx`

Superseded by:

- `docs/current/batteries.md`

The assembly page should be built from the center outward, because everything attaches to battery_id. The workflow should therefore mirror the database dependency tree. If implemented in the wrong order the UI will constantly fight missing IDs.

The safest order of operations is therefore the following.

1. Battery record (root object)

First implement the base battery record.

Table: batteries

Fields:

project_id

form_factor

created_by

status

notes

This record must be created before anything else, because every other table requires battery_id.

UI block:

Battery metadata

----------------

Project

Form factor (coin / pouch / cylindrical)

Operator

Status

Notes

[Create Battery]

Behavior:

POST /api/batteries

→ returns battery_id

After this step the page switches to edit mode with a known battery_id.

Nothing else should be editable until this exists.

2. Configuration block (form factor specific)

Next implement exactly one configuration table depending on form_factor.

Tables:

battery_coin_config

battery_pouch_config

battery_cyl_config

UI logic:

if coin → show coin fields

if pouch → show pouch fields

if cyl → show cylindrical fields

Example UI:

Assembly configuration

----------------------

Half-cell type (coin)

OR

Pouch parameters

API pattern:

PUT /api/batteries/:id/config

This keeps the page logic simple.

3. Electrode stack

Next implement the core of the assembly log.

Table:

battery_electrodes

battery_id

electrode_id

role

position_index

UI table:

Stack

--------------------------------

#   electrode_id   role    position

1   234            cathode 1

2   517            anode   2

3   235            cathode 3

Key points:

electrode IDs come from /api/electrodes

role should auto-fill from electrode metadata

position_index defines stack order

API:

GET  /api/batteries/:id/electrodes

POST /api/batteries/:id/electrodes

DELETE /api/batteries/:id/electrodes/:eid

This is the largest block and should be built early.

4. Separator configuration

Table:

battery_sep_config

battery_id

separator_id

separator_layout

spacer_thickness_mm

spacer_count

notes

UI block:

Separator configuration

-----------------------

Separator

Layout

Spacer thickness

Spacer count

Notes

Dropdown source:

/api/separators

Only one row per battery.

5. Electrolyte

Table:

battery_electrolyte

battery_id

electrolyte_id

UI block:

Electrolyte

-----------

Electrolyte dropdown

Source:

/api/electrolytes

This is intentionally simple.

6. QC measurements

Table:

battery_qc

battery_id

ocv_v

esr_mohm

UI block:

Initial QC

----------

OCV (V)

ESR (mΩ)

API:

PUT /api/batteries/:id/qc

7. Assembly summary

Final read-only section showing everything assembled.

Assembly summary

----------------

Battery ID

Project

Electrode stack

Separator

Electrolyte

QC

This becomes the record dump feature mentioned earlier.

Correct development order

Follow this sequence exactly:

1. Battery create API

2. Assembly page metadata UI

3. Form-factor config block

4. Electrode stack block

5. Separator block

6. Electrolyte block

7. QC block

8. Final summary

One architectural recommendation

Treat the entire assembly page as:

battery_workspace

with state:

currentBatteryId

battery

electrodes[]

separator

electrolyte

qc

Exactly like the cut batch workspace on the electrodes page, which already follows this pattern .

Reusing that pattern will make the implementation dramatically easier.

If helpful, the ideal UI layout for 3-assembly.html can also be drawn (the current file structure is known). That design prevents the page from turning into a large unmanageable script.
