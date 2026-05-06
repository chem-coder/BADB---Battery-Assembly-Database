# Schema And API Naming Rules

Created: 2026-04-26
Edited: 2026-05-06
Status: rule
Verified against code: light check 2026-05-06
Source paths: `services/materialInfoService.js`, `public/js/material-details.js`, `public/reference/separators.html`, `public/js/separators.js`, `public/js/serapators.js`, `contracts/vanilla_api_endpoints.json`, `scripts/smoke_vanilla_api.js`

This file records naming compatibility decisions between the PostgreSQL schema,
the Express API, and the vanilla `public/` UI.

## Material Specific Capacity

Canonical database column:

- `material_properties.specific_capacity_mah_g`

Accepted API request fields:

- `specific_capacity_mah_g` canonical
- `specific_capacity_mAh_g` compatibility alias

API response fields:

- `specific_capacity_mah_g` canonical
- `specific_capacity_mAh_g` compatibility alias for existing UI/report code

Implementation:

- `services/materialInfoService.js` normalizes both request spellings into the
  database-native `specific_capacity_mah_g`.
- `public/js/material-details.js` now sends `specific_capacity_mah_g`.
- `scripts/smoke_vanilla_api.js` still sends `specific_capacity_mAh_g` to keep
  the compatibility alias tested.

No schema migration is needed because the database already uses the canonical
lowercase column.

## Separator Script Name

Canonical UI script:

- `public/js/separators.js`

Compatibility shim:

- `public/js/serapators.js`

Implementation:

- `public/reference/separators.html` now loads `/js/separators.js`.
- `public/js/serapators.js` remains as a tiny loader for old links or cached
  references.
- `contracts/vanilla_api_endpoints.json` now names `public/js/separators.js`
  as the source for separator API calls.

No API or database migration is needed.
