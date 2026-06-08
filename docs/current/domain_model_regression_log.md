# Domain Model Regression Log

Created: 2026-06-08
Edited: 2026-06-08
Status: current

This log records verified cases where a digital model, schema, or workflow was
designed from an incorrect assumption about the real laboratory or organizational
process.

Use it as an evidence and prevention log. The purpose is not personal blame; it
is to preserve the domain lesson so future schema/UI work starts from observed
physical reality, not from a diagram that only works on paper.

Each entry should preserve:

- assumed model;
- real-world finding;
- affected schema/API/UI areas;
- correction made;
- remaining legacy compatibility;
- prevention rule.

## Summary

| Date | Area | Assumption | Real Model | Status |
|---|---|---|---|---|
| 2026-06-08 | Projects / users / departments | Project access followed departments/divisions or department groups | Project access follows concrete project team membership, project lead/creator relationships, and explicit per-user grants; departments are organizational metadata | Corrected in current Projects behavior; legacy department access remains for compatibility |

## 2026-06-08: Project Access Was Modeled Around Departments Instead Of Real Project Teams

Source paths:

- `docs/current/projects.md`
- `docs/current/departments.md`
- `routes/projects.js`
- `migrations/011_project_confidentiality.sql`
- `migrations/016_project_department_access.sql`
- `migrations/d041_project_participants.sql`
- `migrations/d042_project_leads_as_team_members.sql`

### Assumed Model

An earlier design assumed that project visibility/access could be tied to
departments or division-like groups:

- `projects.department_id` represented an owner department;
- `confidentiality_level = department` meant visible to that department;
- `project_department_access` granted project access to an entire department.

This model can look coherent in a browser UI or architecture diagram, because
departments, users, and projects form a clean hierarchy on paper.

### Real-World Finding

The laboratory/project reality is not a strict departments-to-projects hierarchy.

Project access is not reliably determined by department membership. A project
team can cut across departments, and the important relationships are physical
and operational:

- who is actually assigned to the project;
- who is the project lead;
- who created or owns the project record;
- who has an explicit individual grant.

Departments remain useful organizational metadata for users and reporting, but
they are not the source of truth for project access.

### Impact

The department-based model created a mismatch between the digital structure and
the real organization:

- it implied access rules that did not match who actually works on projects;
- it made the UI/design appear reasonable while still being wrong for real use;
- it risked granting or hiding projects based on the wrong relationship;
- it required later cleanup and clarification around legacy department fields
  and grants.

### Correction

Current project access behavior is based on:

- `project_participants` for concrete team membership and functional role;
- `user_project_access` for explicit per-user view/edit/admin grants;
- project lead and creator relationships;
- public/open project visibility.

Current behavior documented in `docs/current/projects.md`:

- `project_department_access` is legacy only;
- legacy `department` confidentiality values are treated as limited/confidential;
- `projects.department_id` remains in the schema for legacy data, but the
  current Projects page does not expose department-based project access and
  sends `department_id = null` on create/update;
- team membership is a baseline view-access source.

### Remaining Legacy Compatibility

The backend still accepts and returns some legacy department-access data:

- old `project_department_access` rows can still exist;
- department grants can appear in API/report payloads for compatibility and
  historical cleanup;
- routes still include legacy department-access delete/copy behavior.

This should not be treated as endorsement of department-based access for new UI
or schema work.

### Prevention

Before adding schema or UI for relationships between projects, users,
departments, materials, tapes, electrodes, or batteries:

- verify the physical workflow with the person who tests/uses the process;
- map actual lab behavior before designing the digital abstraction;
- distinguish organizational metadata from access control;
- avoid turning a convenient hierarchy into a source-of-truth rule unless the
  real process truly works that way;
- document legacy compatibility separately from current product behavior.

## Entry Template

```text
## YYYY-MM-DD: Short Domain Model Correction

Source paths:

- `path/to/schema-or-migration.sql`
- `path/to/route-or-service.js`
- `path/to/current-doc.md`

### Assumed Model

What the digital design assumed.

### Real-World Finding

What testing, lab usage, or process review showed instead.

### Impact

Why the mismatch mattered.

### Correction

What code/schema/docs now do.

### Remaining Legacy Compatibility

What old fields, routes, or rows still exist.

### Prevention

The product/domain rule future work should follow.
```
