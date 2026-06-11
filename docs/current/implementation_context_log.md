# Implementation Context Log

Created: 2026-06-08
Edited: 2026-06-08
Status: current

This log records resolved implementation and adoption context: cases where a
feature or documentation effort was useful and requested, but required
substantial follow-up work before it matched real use.

This is not a bug log and not a blame document. Use it to preserve product
lessons, hidden follow-up work, and definition-of-done improvements.

Each entry should preserve:

- what was intentionally built;
- what adoption gap appeared in real use;
- what follow-up work closed the gap;
- what the future definition of done should include.

## Summary

| Date | Area | Initial Work | Adoption Gap | Follow-Up Outcome |
|---|---|---|---|---|
| 2026-06-08 | Auth | Auth was requested and implemented as a useful foundation | The app still needed operational frontend surfaces so users could stop relying on bypass | Vanilla auth/session/admin/user/access pages and docs made auth practical for real use |
| 2026-06-08 | Documentation | Project docs were proposed/generated during divergent app versions | Docs needed restructuring, verification, and consolidation before becoming source of truth | Docs were refactored into current/rules/instructions/future/archive structure with indexes |

## 2026-06-08: Auth Became Useful After Operational Frontend Completion

Source paths:

- `routes/auth.js`
- `middleware/auth.js`
- `public/js/auth.js`
- `public/reference/users.html`
- `public/js/users.js`
- `public/reference/departments.html`
- `public/js/departments.js`
- `public/reference/projects.html`
- `public/js/projects.js`
- `docs/rules/auth_policy.md`
- `docs/current/users.md`
- `docs/current/departments.md`
- `docs/current/projects.md`

### Initial Work

Authentication was intentionally requested and implemented. The current auth
foundation is valuable and should be kept:

- JWT-based login;
- password hashing and reset/change flows;
- auth middleware;
- role checks;
- auth log;
- development bypass for local work.

### Adoption Gap

For a long time the app was usable without auth, and development often relied on
auth bypass. That made it possible to keep building, but it also hid operational
gaps:

- real user/session switching was awkward compared with bypass;
- user and role management needed proper frontend surfaces;
- project access management needed practical UI, not only backend concepts;
- departments/divisions needed reference pages and clearer boundaries;
- missing or incomplete menus made it harder to find the auth-related workflows;
- inconsistencies surfaced only when using the app as an authenticated user.

The auth backend was not the core problem. The gap was that authentication is not
fully adopted until real users can manage accounts, roles, sessions, and access
without relying on development bypass.

### Follow-Up Work

The follow-up work made auth operational:

- vanilla auth/session behavior was clarified and documented;
- Users page behavior was expanded for account/admin workflows;
- Departments page behavior was added/clarified;
- Projects page access/team workflows were made practical;
- auth ownership rules were documented in `docs/rules/auth_policy.md`;
- current feature docs were updated for users, departments, and projects.

### Future Definition Of Done

For auth or permission work, "implemented" should mean more than working backend
endpoints:

- users can log in, log out, recover/change passwords, and understand their
  session state;
- admins can create/edit/deactivate users and reset passwords from the UI;
- role and access effects can be inspected from the UI;
- bypass remains a development tool, not the normal way to operate the app;
- smoke/manual checks cover the authenticated user path, not only bypass.

## 2026-06-08: Documentation Needed Verification And Systematization

Source paths:

- `docs/INDEX.md`
- `docs/current/README.md`
- `docs/current/architecture.md`
- `docs/current/repo_map.md`
- `docs/instructions/HOW_TO_SYSTEMATIZE_DOCS.md`
- `docs/rules/`
- `docs/instructions/`
- `docs/future/`
- `docs/archive/`

### Initial Work

Documentation was proposed and generated during a period when app versions and
implementation directions were starting to diverge. Creating docs was the right
instinct: the project needed written context.

### Adoption Gap

The initial docs were not enough to act as a reliable source of truth until they
were checked against the actual code, migrations, tests, and current UI.

The main gaps were:

- current behavior, future ideas, rules, and historical notes were mixed
  together;
- generated or older claims needed verification against the active repo;
- docs did not yet clearly separate active source of truth from archive context;
- agents and collaborators needed a predictable place to look before making
  changes.

### Follow-Up Work

The docs were substantially refactored and expanded into a maintainable system:

- `docs/current/` for verified current feature behavior;
- `docs/rules/` for constraints agents and collaborators must follow;
- `docs/instructions/` for recurring workflows;
- `docs/future/` for ideas and planned work;
- `docs/archive/` for superseded, generated, or inbox material;
- `docs/INDEX.md` and folder READMEs for navigation.

### Future Definition Of Done

Generated or collaborator-written docs should not become authoritative until
they are triaged:

- verify current-behavior claims against code, migrations, tests, and UI;
- split future ideas away from implemented behavior;
- archive stale/generated material instead of letting it compete with current
  docs;
- update indexes so the verified docs are discoverable.

## Entry Template

```text
## YYYY-MM-DD: Short Implementation Context

Source paths:

- `path/to/code-or-doc.md`

### Initial Work

What was intentionally built or written.

### Adoption Gap

What real use showed was still missing.

### Follow-Up Work

What closed the gap.

### Future Definition Of Done

What future work should include before being considered complete.
```
