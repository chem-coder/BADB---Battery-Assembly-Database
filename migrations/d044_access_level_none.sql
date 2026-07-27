-- d044_access_level_none.sql
-- Adds a fourth member access level: 'none' (explicit deny).
--
-- Part of the finalised 4-level project access model
-- (admin / edit / view / none). 'none' means "no access" — an explicit deny
-- that overrides even an open/public project, so a departing or disabled member
-- can be cut off from everything. Expiry auto-downgrades a member to the
-- project's baseline (open → view, restricted → none) instead of deleting them.
-- See docs/future/project_member_flow.md and docs/future/project_access_control.md.
--
-- Forward-only and additive: widens the CHECK to allow one more value; existing
-- view/edit/admin rows remain valid. project_department_access is legacy
-- (department access removed) and is intentionally left unchanged.

ALTER TABLE user_project_access
  DROP CONSTRAINT IF EXISTS user_project_access_access_level_check;

ALTER TABLE user_project_access
  ADD CONSTRAINT user_project_access_access_level_check
  CHECK (access_level IN ('view', 'edit', 'admin', 'none'));
