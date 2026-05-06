# AI Rules From Dalia

Created: 2026-05-06
Edited: 2026-05-06
Status: rule

These are standing rules for AI agents and collaborators working in `BADB_main`.

## Documentation Updates

Approved code changes must be followed by relevant documentation updates when they affect:

- system behavior;
- database schema or migrations;
- API contracts;
- workflows;
- setup, deployment, or release checks;
- user-facing behavior;
- source-of-truth assumptions for future agents.

Pure internal refactors do not require documentation churn if they do not change behavior, contracts, workflows, setup, or source-of-truth assumptions.

## Document Headers

Each maintained markdown document should start with:

```text
# Title

Created: YYYY-MM-DD
Edited: YYYY-MM-DD
Status: current | rule | instruction | future idea | raw inbox | superseded | external generated
```

Agents must update `Edited:` when editing a document.

## Markdown-Only Docs

All records kept in `BADB_main/docs/` must end up as Markdown (`.md`).

If Dalia drops `.docx`, `.txt`, `.pdf`, or another document format into
`docs/archive/inbox/`, agents should convert it to `.md`, verify the markdown
file exists and is nonempty, and remove the original non-md file.

Ignore gitignored operating-system metadata such as `.DS_Store`. Dalia and Dima
both use Macs, so these files may reappear and are not documentation records.

The converted markdown should include:

```text
Converted from: `original-file.ext`
```

Do not keep parallel `.docx`, `.txt`, `.pdf`, or other document copies in the
docs system after conversion.

## Source Of Truth

Use this order when sources disagree:

1. Current code.
2. Current migrations.
3. Tests, smoke checks, and contract checks.
4. Approved Dalia rules and working notes.
5. Canonical docs in `BADB_main/docs/current`, `BADB_main/docs/rules`, and `BADB_main/docs/instructions`.
6. `BADB_main/Документация ЕСПД` as a formal mirror.
7. Inbox, generated, archived, or historical material only after verification.

## Migrations

Migration files in `BADB_main/migrations/` must be duplicated in `BADB_main/migrations_ASCII/` for ASCII/Windows use.

The ASCII mirror is required for the Windows PC where the production database is used. It must stay and must be updated alongside the main migrations folder.

Migration logs must be updated when a migration is run:

- `BADB_main/migrations/migrations_log.txt`
- `BADB_main/migrations_ASCII/migrations_log.txt`

The log should identify who ran the migration as clearly as possible. Do not guess silently if the context is ambiguous.

## Approval Model

The default is approval by exception. Dalia should not have to approve every
small file move or every obvious cleanup step.

Agents may do without asking first:

- inventory files;
- classify files as inbox, future, superseded, or external generated;
- convert non-markdown inbox files to `.md` and remove the original non-md file;
- move unreviewed/raw files inside `docs/archive/`;
- extract verified facts into draft canonical docs;
- mark clearly stale content as superseded;
- update indexes and README files to reflect the triage state.

Agents must ask before:

- deleting files permanently;
- promoting a new or changed rule to `docs/rules/`;
- declaring a domain doc in `docs/current/` fully canonical when code
  verification is incomplete;
- changing approved behavior, migration policy, auth policy, or release gates;
- moving files outside `BADB_main/docs/` unless explicitly requested.

When in doubt, stage the cleanup and leave a short note in the final report
instead of blocking on approval.

## Cleanup And Archiving

When a reviewed file is probably no longer useful but may still have historical
value, move it to an archive category and record why. Permanent deletion needs
explicit approval.

Default destinations:

- Reviewed and still true: fold into `docs/current/`, `docs/rules/`, or `docs/instructions/`.
- Useful but future-facing: fold into `docs/future/`.
- Superseded but historically useful: `docs/archive/superseded/`.
- Untrusted colleague/AI output: `docs/archive/external_generated/`.
- Not yet reviewed: `docs/archive/inbox/`.

Do not treat archived material as source of truth.
