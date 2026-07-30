// departmentHeadFilter — unit tests for the DepartmentsPage «Руководитель»
// pre-filter (numeric-id / null-sentinel type contract).
//
// Regression context: the filter options used to carry String(user_id)
// values while rows carry numeric head_user_id; RowOpenPage's generic
// strict compare then matched nothing and the list went empty. The helper
// (and these tests) pin the value types down.
import { describe, it, expect } from 'vitest';
import {
  NO_HEAD_FILTER,
  filterDepartmentsByHead,
} from '@/utils/departmentHeadFilter';

const DEPARTMENTS = [
  { department_id: 1, name: 'Синтез', head_user_id: 3 },
  { department_id: 2, name: 'Сборка', head_user_id: 7 },
  { department_id: 3, name: 'Аналитика', head_user_id: null },
  { department_id: 4, name: 'Испытания', head_user_id: 3 },
];

describe('filterDepartmentsByHead', () => {
  it('returns the full list untouched for "" (empty option)', () => {
    expect(filterDepartmentsByHead(DEPARTMENTS, '')).toBe(DEPARTMENTS);
  });

  it('returns the full list untouched for undefined (filter not yet registered)', () => {
    expect(filterDepartmentsByHead(DEPARTMENTS, undefined)).toBe(DEPARTMENTS);
  });

  it('matches rows by numeric head id', () => {
    const out = filterDepartmentsByHead(DEPARTMENTS, 3);
    expect(out.map((d) => d.department_id)).toEqual([1, 4]);
  });

  it('does NOT match a stringified id (strict-compare type contract)', () => {
    // Option values must stay numeric — this is the regression the helper
    // exists to prevent.
    expect(filterDepartmentsByHead(DEPARTMENTS, '3')).toEqual([]);
  });

  it('NO_HEAD_FILTER sentinel returns only departments without a head', () => {
    const out = filterDepartmentsByHead(DEPARTMENTS, NO_HEAD_FILTER);
    expect(out.map((d) => d.department_id)).toEqual([3]);
  });

  it('sentinel is null so RowOpenPage generic select match skips it', () => {
    // RowOpenPage skips filter values where `v == null || v === ''` — the
    // sentinel must fall in that bucket or the second (generic) filter pass
    // would strict-compare it against numeric rows and empty the list.
    expect(NO_HEAD_FILTER).toBeNull();
  });

  it('a nonexistent numeric id yields an empty list', () => {
    expect(filterDepartmentsByHead(DEPARTMENTS, 999)).toEqual([]);
  });
});
