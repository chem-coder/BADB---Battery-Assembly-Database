# Runbooks And Release Source Notes

Created: 2026-05-06
Edited: 2026-05-06
Status: superseded

These files were extracted into canonical instruction docs on 2026-05-06.

Canonical replacements:

- `docs/instructions/run_local.md`
- `docs/instructions/apply_migrations.md`
- `docs/instructions/backup_restore.md`
- `docs/instructions/testing_release.md`

Reason archived:

- launch and bypass notes were duplicated;
- old Windows notes suggested editing `config/index.js`, which is superseded by environment overrides;
- manual `pg_dump` notes are now fallback guidance because `scripts/backup.js` is the canonical backup workflow;
- the long hardening worklog was compressed into release-check instructions and current smoke/contract behavior.
