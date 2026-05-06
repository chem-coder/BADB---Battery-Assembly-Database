# Cycling Future Work

Created: 2026-05-06
Edited: 2026-05-06
Status: future idea
Verified against code: light check 2026-05-06
Source paths: `docs/archive/superseded/2026-05-06-root-doc-transition/CYCLING_SPEC.md`, `routes/cycling.js`, `scripts/parse_cycling.py`, `client-web/src/pages/CyclingPage.vue`

This file preserves future cycling ideas without treating them as current behavior.

## Parser And Import Ideas

Potential future work:

- broader vendor-format coverage after collecting real files;
- clearer parser diagnostics in the UI;
- duplicate handling that explains file hash conflicts to the user;
- background parsing for large uploads if synchronous parsing becomes slow.

## Analytics Ideas

Potential future charts or summaries:

- cycle-life comparison across selected batteries;
- normalized capacity and energy views;
- coulombic-efficiency trend flags;
- side-by-side session overlays;
- export presets for common analysis packages.

## Storage And Security Ideas

Cycling raw files should remain disk-backed if files are large, but download access should go through authenticated API routes once the upload-storage transition is implemented.

See `upload_storage_transition.md` for the shared upload policy direction.
