# BADB Documentation Hub

Created: 2026-05-06
Edited: 2026-05-10
Status: current

This folder is the working documentation hub for `BADB_main`.

## Source Of Truth

When documents disagree, use this priority order:

1. Current code in `BADB_main/`, including SQL migrations in `migrations/`
   and `migrations_ASCII/`.
2. Passing tests, smoke checks, contract checks, and live database state where
   relevant. `public.schema_migrations` is the authoritative applied-migration
   ledger for a target database.
3. `docs/current/` for verified existing behavior.
4. `docs/rules/` for approved rules and constraints.
5. `docs/instructions/` for recurring work instructions.
6. `Документация ЕСПД/`, which is a formal mirror and should be updated from
   the working docs.
7. `docs/future/` for ideas and proposals only, not current behavior.
8. `docs/archive/` for historical context only. Archived, generated, or inbox
   documents are never current source of truth until triaged into the working
   docs above.

## Folder Roles

| Folder | Purpose |
|---|---|
| `current/` | Existing system behavior, verified against code. |
| `rules/` | Hard rules for agents and colleagues. Breaking these needs explicit approval. |
| `instructions/` | How to do recurring work: tests, migrations, releases, doc updates. |
| `future/` | Ideas, proposals, and possible features. Not current behavior and not promises. |
| `archive/inbox/` | Raw documents Dalia wants reviewed and systematized. |
| `archive/superseded/` | Old documents kept for history after triage. |
| `archive/external_generated/` | AI/colleague-generated documents that are not trusted until verified. |

Only `README.md` and `INDEX.md` should normally live in the root of `docs/`. Working documentation belongs in `current/`, `rules/`, `future/`, or `instructions/`; historical sources belong in `archive/`.

## Status Labels

Every maintained document should include:

```text
Created: YYYY-MM-DD
Edited: YYYY-MM-DD
Status: current | rule | instruction | future idea | raw inbox | superseded | external generated
```

For `current` and `rule` documents, also include when useful:

```text
Verified against code: YYYY-MM-DD
Source paths: routes/example.js, services/exampleService.js
```

## Markdown-Only Rule

All documentation kept in this folder system must be Markdown.

Raw `.docx`, `.txt`, `.pdf`, and other document formats may temporarily appear
in `archive/inbox/`, but the first cleanup step is to convert them to `.md` and
remove the original non-md files. The markdown copy should record the original
filename in a `Converted from:` line.

Gitignored operating-system metadata such as `.DS_Store` is allowed to appear
locally and should be ignored by documentation audits.

## Where To Put New Material

Put documents for review in:

```text
BADB_main/docs/archive/inbox/
```

Do not put raw unreviewed notes directly into `current/`, `rules/`, or `Документация ЕСПД/`.
