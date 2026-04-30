// Unit tests for src/utils/fieldLabels.js
//
// fieldLabel(entityType, fieldName) translates raw SQL column names from
// field_changelog (e.g. 'notes', 'project_id') into Russian UI labels
// (e.g. 'Примечания', 'Проект'). Used in audit-log / changelog displays.
//
// Lookup precedence (per the function's contract):
//   1. Entity-scoped label (LABELS_BY_ENTITY[entity][field])
//   2. Common label (COMMON_LABELS[field])
//   3. Raw fieldName as-is

import { describe, it, expect } from 'vitest';
import { fieldLabel } from '@/utils/fieldLabels';

describe('fieldLabel', () => {
  describe('common labels (fall back from any entity)', () => {
    it('returns Russian label for known common field', () => {
      expect(fieldLabel('any-entity', 'name')).toBe('Название');
      expect(fieldLabel('any-entity', 'notes')).toBe('Примечания');
      expect(fieldLabel('any-entity', 'project_id')).toBe('Проект');
    });

    it('returns common label even when entity has no scoped overrides', () => {
      expect(fieldLabel('made_up_entity', 'created_by')).toBe('Создал');
    });
  });

  describe('fallback to raw field name', () => {
    it('returns raw fieldName when not in any map', () => {
      expect(fieldLabel('any-entity', 'unknown_column_xyz')).toBe('unknown_column_xyz');
    });

    it('returns raw fieldName when entity is unknown AND field is unknown', () => {
      expect(fieldLabel('unknown_entity', 'unknown_field')).toBe('unknown_field');
    });
  });

  describe('empty/undefined fieldName', () => {
    it("returns '—' for empty fieldName", () => {
      expect(fieldLabel('tape', '')).toBe('—');
    });

    it("returns '—' for undefined fieldName", () => {
      expect(fieldLabel('tape', undefined)).toBe('—');
    });

    it("returns '—' for null fieldName", () => {
      expect(fieldLabel('tape', null)).toBe('—');
    });
  });

  describe('case sensitivity (raw column names are lowercase by convention)', () => {
    it('does NOT match case-insensitively (returns raw for "Name")', () => {
      expect(fieldLabel('tape', 'Name')).toBe('Name');
    });
  });
});
