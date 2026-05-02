---
description: Run a deep self-review of the current branch's diff before opening or pushing a PR. Spawns an isolated subagent that checks for missed migrations, broken imports, version drift in techdoc, hardcoded ports, dead test fixtures, and other recurring issues.
allowed-tools: Bash(git diff:*) Bash(git log:*) Bash(git status:*) Bash(grep:*) Bash(find:*) Bash(node:*) Bash(npm run *)
---

# /self-review — pre-push review of the current branch

Spawn a `general-purpose` subagent in a forked context with this prompt. The subagent must produce a concise punch list, **not a rewrite of the diff**. The main session continues uninterrupted while it runs.

---

## Subagent prompt

You are reviewing a feature branch on the BADB project before it goes to PR. The author wants an independent second opinion on what's wrong, missing, or risky.

### What to read

1. `git rev-parse --abbrev-ref HEAD` — current branch.
2. `git fetch origin --quiet` then `git log --oneline origin/main..HEAD` — commits being added.
3. `git diff origin/main..HEAD --stat` — file-level summary.
4. `git diff origin/main..HEAD` — full diff. **Read it. Do not summarize.**

### What to check (categorized)

**A. Imports and module paths**
- For every `require('./X')` or `import ... from './X'` added in JS/Vue files: does file `X` exist in the diff or already in the repo? Run `find . -path ./node_modules -prune -o -name "X*" -print 2>/dev/null` to verify.
- For Vue: check `<script setup>` imports against actual file paths in `client-web/src/`.

**B. Database migrations**
- If new files in `migrations/`: are they following the `dXXX_` naming convention?
- Are `BEGIN;` and `COMMIT;` present?
- Are any existing migration files modified? (must be flagged as a violation — CLAUDE.md pre-commit hook blocks this.)
- If endpoints are added/changed in `routes/*.js`: are corresponding entries added to Doc 02 «Описание программы» Appendix A?

**C. Configuration drift**
- Is `node-version: '20'` anywhere in `.github/workflows/*.yml`? Must be `'22'` (Node 20 EOL was 2026-04-30).
- Hardcoded localhost ports in `client-web/src/` — `grep -r "localhost:[0-9]" client-web/src/` after the diff.
- New env vars in `process.env.X` that are not documented in Doc 05 «Руководство системного программиста» §3.1.6 or §5.1.

**D. Frontend invariants**
- `VITE_API_URL` set to anything non-empty? Must stay empty in dev.
- Direct cross-origin axios calls (e.g. `axios.get('http://localhost:3003/...')`)? Must go through Vite proxy.
- New API endpoint? Must be added to the proxy config in `vite.config.js`.

**E. Append-only journals**
- Any `UPDATE` or `DELETE` statement against `auth_log`, `raw_submissions`, `field_changelog`? Hard violation.

**F. Optimistic locking**
- New CRUD route on a versioned table (`tapes`, `electrodes`, `batteries`, `tape_recipes`, `projects`)? Does the UPDATE include `WHERE version = $expected`? Does it return 409 on `rowCount === 0`?

**G. Техдок sync (`Документация ЕСПД/`)**
- If migrations added: are ERD diagrams in Doc 03 §3.4.* updated? Is the table count in §3.5.1 synced?
- If endpoints changed: is Doc 02 Appendix A updated?
- Any mention of GitHub / Claude / ChatGPT / Anthropic / Cursor in techdoc files? Must be replaced with neutral terms (see `.claude/rules/techdoc.md`).
- Is the version journal in `Документация ЕСПД/README.md` updated for content changes?

**H. Tests and CI**
- New routes without tests? (Soft warning — not all routes tested.)
- Any `console.log` or `debugger` left in production code paths?
- Test fixtures in `tests/__fixtures__/` referenced from tests but missing on disk? `find tests/__fixtures__/`.

**I. Common false-positive patterns** (do NOT flag as bugs):
- A `users.js` route that does not hash passwords — it might only handle name/role updates.
- Template literals in SQL with `$1, $2` parameters — not injection.
- Missing 404 check at top of handler — read further; it might be at the end after the UPDATE.

### Output format

Return a single message structured as:

```
## /self-review — branch <branch-name>

### Hard violations (must fix before push)
- [file:line] description — why this is a violation
- ...

### Likely bugs (verify by reading)
- [file:line] description — what to check
- ...

### Documentation drift (techdoc out of sync with code)
- ...

### Soft observations (your call)
- ...

### Verdict: READY / FIX_REQUIRED / NEEDS_DECISION
```

Keep it under 400 words. If a category is empty, omit the heading. Do not pad with positive observations.

### Hard rules

1. **Verify every claim by reading the actual diff or grepping the repo.** Do not guess based on file names. Do not say "X looks suspicious" without a `git grep` or `find` showing it.
2. **No paraphrased summaries of code.** Quote the offending line.
3. **No style nags.** Tabs vs spaces, line length, naming opinions — drop unless explicitly violating an existing convention.
4. **Cite file paths and line numbers.** `routes/foo.js:142` is useful; "in some route file" is not.
