// Unit tests for src/utils/projectAccess.js
//
// Project access (confidentiality) vocabulary. Matches vanilla
// public/js/projects.js: only `public` (открытый) and `confidential`
// (ограниченный) are selectable; legacy `department` is treated as ограниченный
// and is NOT offered as a new choice. Labels are lowercase to match the app's
// option-label convention.

import { describe, it, expect } from 'vitest';
import {
  ACCESS_OPTIONS,
  accessLabel,
  normalizeAccess,
  resolveProjectAccess,
  GRANT_LEVEL_OPTIONS,
  grantLevelLabel,
} from '@/utils/projectAccess';

describe('GRANT_LEVEL_OPTIONS (per-member access level)', () => {
  it('offers exactly обычный=edit + админ=admin (no view in the picker)', () => {
    expect(GRANT_LEVEL_OPTIONS).toEqual([
      { value: 'edit', label: 'обычный' },
      { value: 'admin', label: 'админ' },
    ]);
    expect(GRANT_LEVEL_OPTIONS.map((o) => o.value)).not.toContain('view');
  });
});

describe('grantLevelLabel', () => {
  it('labels the two member levels', () => {
    expect(grantLevelLabel('edit')).toBe('обычный');
    expect(grantLevelLabel('admin')).toBe('админ');
  });
  it('marks legacy view as устар. and falls back gracefully', () => {
    expect(grantLevelLabel('view')).toBe('просмотр (устар.)');
    expect(grantLevelLabel(undefined)).toBe('обычный');
    expect(grantLevelLabel('weird')).toBe('weird');
  });
});

describe('ACCESS_OPTIONS', () => {
  it('offers exactly public + confidential (department dropped)', () => {
    expect(ACCESS_OPTIONS.map((o) => o.value)).toEqual(['public', 'confidential']);
  });
  it('uses the lowercase открытый / ограниченный labels', () => {
    expect(ACCESS_OPTIONS).toEqual([
      { value: 'public', label: 'открытый' },
      { value: 'confidential', label: 'ограниченный' },
    ]);
  });
});

describe('accessLabel', () => {
  it('maps public → открытый, confidential → ограниченный', () => {
    expect(accessLabel('public')).toBe('открытый');
    expect(accessLabel('confidential')).toBe('ограниченный');
  });
  it('maps legacy department → ограниченный (no longer a separate label)', () => {
    expect(accessLabel('department')).toBe('ограниченный');
  });
  it('falls back to открытый for blank/unknown', () => {
    expect(accessLabel('')).toBe('открытый');
    expect(accessLabel(null)).toBe('открытый');
    expect(accessLabel('weird')).toBe('weird');
  });
});

describe('normalizeAccess', () => {
  it('normalizes legacy department → confidential (so it groups under ограниченный)', () => {
    expect(normalizeAccess('department')).toBe('confidential');
  });
  it('leaves public and confidential unchanged', () => {
    expect(normalizeAccess('public')).toBe('public');
    expect(normalizeAccess('confidential')).toBe('confidential');
  });
});

describe('resolveProjectAccess', () => {
  // Minimal fixtures. A "plain" user/project triggers none of the override
  // rules, so each test can layer one signal on top to isolate that branch.
  const plainUser = { user_id: 1, role: 'employee', position: 'инженер' };
  const confidentialProject = {
    project_id: 10,
    confidentiality_level: 'confidential',
    lead_id: 999,
    created_by: 999,
  };
  const publicProject = { ...confidentialProject, confidentiality_level: 'public' };
  const grant = (access_level, is_expired = false) => ({ access_level, is_expired });

  it('admin role → admin/admin', () => {
    const u = { ...plainUser, role: 'admin' };
    expect(resolveProjectAccess(u, confidentialProject, null, false, false)).toEqual({
      level: 'admin',
      source: 'admin',
      is_expired: false,
    });
  });

  it('director by position → admin/director', () => {
    const u = { ...plainUser, position: 'Генеральный директор' };
    expect(resolveProjectAccess(u, confidentialProject, null, false, false)).toEqual({
      level: 'admin',
      source: 'director',
      is_expired: false,
    });
  });

  it('project lead → admin/lead', () => {
    const p = { ...confidentialProject, lead_id: 1 };
    expect(resolveProjectAccess(plainUser, p, null, false, false)).toEqual({
      level: 'admin',
      source: 'lead',
      is_expired: false,
    });
  });

  it('project owner (created_by) → admin/owner', () => {
    const p = { ...confidentialProject, lead_id: null, created_by: 1 };
    expect(resolveProjectAccess(plainUser, p, null, false, false)).toEqual({
      level: 'admin',
      source: 'owner',
      is_expired: false,
    });
  });

  it('direct grant of each level → that level, source direct', () => {
    for (const level of ['view', 'edit', 'admin']) {
      expect(
        resolveProjectAccess(plainUser, confidentialProject, grant(level), false, false),
      ).toEqual({ level, source: 'direct', is_expired: false });
    }
  });

  it('team participant → view/participant', () => {
    expect(resolveProjectAccess(plainUser, confidentialProject, null, true, false)).toEqual({
      level: 'view',
      source: 'participant',
      is_expired: false,
    });
  });

  it('public project → view/public', () => {
    expect(resolveProjectAccess(plainUser, publicProject, null, false, false)).toEqual({
      level: 'view',
      source: 'public',
      is_expired: false,
    });
  });

  it('no signal at all → null', () => {
    expect(resolveProjectAccess(plainUser, confidentialProject, null, false, false)).toBeNull();
  });

  // --- Priority ordering (strongest-access-first; first match wins) ---

  it('lead beats a view grant', () => {
    const p = { ...confidentialProject, lead_id: 1 };
    expect(
      resolveProjectAccess(plainUser, p, grant('view'), false, false).source,
    ).toBe('lead');
  });

  it('admin role beats participant/public', () => {
    const u = { ...plainUser, role: 'admin' };
    expect(resolveProjectAccess(u, publicProject, null, true, false).source).toBe('admin');
  });

  it('an admin grant beats participant and public', () => {
    const res = resolveProjectAccess(plainUser, publicProject, grant('admin'), true, false);
    expect(res).toEqual({ level: 'admin', source: 'direct', is_expired: false });
  });

  // --- Expiry fall-through ---

  it('expired grant + showExpired=false falls through to participant', () => {
    const res = resolveProjectAccess(plainUser, confidentialProject, grant('edit', true), true, false);
    expect(res).toEqual({ level: 'view', source: 'participant', is_expired: false });
  });

  it('expired grant + showExpired=false falls through to public', () => {
    const res = resolveProjectAccess(plainUser, publicProject, grant('edit', true), false, false);
    expect(res).toEqual({ level: 'view', source: 'public', is_expired: false });
  });

  it('expired grant + showExpired=false with no fallback → null', () => {
    const res = resolveProjectAccess(plainUser, confidentialProject, grant('edit', true), false, false);
    expect(res).toBeNull();
  });

  it('expired grant + showExpired=true → returns the grant with is_expired:true', () => {
    const res = resolveProjectAccess(plainUser, confidentialProject, grant('edit', true), false, true);
    expect(res).toEqual({ level: 'edit', source: 'direct', is_expired: true });
  });
});
