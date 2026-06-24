// Unit tests for src/utils/accessGraphModel.js
//
// Membership constellation model for the Граф tab: people + projects as nodes,
// edges from project membership (manager = lead/owner/admin → red; member =
// plain participant). Person node size grows with how many projects they belong
// to. See docs/future/access_graph_redesign.md.

import { describe, it, expect } from 'vitest';
import {
  buildAccessGraph,
  sizeForDegree,
  SIZE_MIN,
  SIZE_STEP,
  SIZE_MAX,
} from '@/utils/accessGraphModel';

const userNode = (g, id) => g.nodes.find((n) => n.id === `user-${id}`);
const edgeFor = (g, uid, pid) =>
  g.edges.find((e) => e.source === `user-${uid}` && e.target === `project-${pid}`);

describe('sizeForDegree', () => {
  it('floors isolated people and grows by step', () => {
    expect(sizeForDegree(0)).toBe(SIZE_MIN);
    expect(sizeForDegree(1)).toBe(SIZE_MIN + SIZE_STEP);
    expect(sizeForDegree(3)).toBe(SIZE_MIN + 3 * SIZE_STEP);
  });

  it('clamps at the ceiling and treats junk as zero', () => {
    expect(sizeForDegree(9999)).toBe(SIZE_MAX);
    expect(sizeForDegree(-2)).toBe(SIZE_MIN);
    expect(sizeForDegree(undefined)).toBe(SIZE_MIN);
  });
});

describe('buildAccessGraph — node set', () => {
  it('emits a node per user and per project', () => {
    const g = buildAccessGraph({
      users: [{ user_id: 1, name: 'Аня' }, { user_id: 2, name: 'Боря' }],
      projects: [{ project_id: 10, name: 'P10', confidentiality_level: 'public' }],
    });
    expect(g.nodes.filter((n) => n.type === 'user')).toHaveLength(2);
    expect(g.nodes.filter((n) => n.type === 'project')).toHaveLength(1);
  });

  it('passes project confidentiality through and leaves projects unsized', () => {
    const g = buildAccessGraph({
      projects: [{ project_id: 10, name: 'P10', confidentiality_level: 'confidential' }],
    });
    const proj = g.nodes.find((n) => n.id === 'project-10');
    expect(proj.data.confidentiality_level).toBe('confidential');
    expect(proj.size).toBeUndefined(); // projects are uniform size
  });
});

describe('buildAccessGraph — person size = projects belonged to', () => {
  it('sizes a person by their distinct project count', () => {
    const g = buildAccessGraph({
      users: [{ user_id: 1, name: 'Аня' }],
      projects: [
        { project_id: 10, name: 'P10', confidentiality_level: 'public' },
        { project_id: 11, name: 'P11', confidentiality_level: 'public' },
      ],
      participants: [
        { user_id: 1, project_id: 10 },
        { user_id: 1, project_id: 11 },
      ],
    });
    const u = userNode(g, 1);
    expect(u.data.project_count).toBe(2);
    expect(u.size).toBe(sizeForDegree(2));
  });

  it('keeps people on no project as floor-size floaters with no edges', () => {
    const g = buildAccessGraph({
      users: [{ user_id: 9, name: 'Один' }],
      projects: [{ project_id: 10, name: 'P10', confidentiality_level: 'public' }],
    });
    const u = userNode(g, 9);
    expect(u.data.project_count).toBe(0);
    expect(u.size).toBe(SIZE_MIN);
    expect(g.edges).toHaveLength(0);
  });
});

describe('buildAccessGraph — edge roles', () => {
  it('marks lead, owner, and admin-grant ties as manager; plain participants as member', () => {
    const g = buildAccessGraph({
      users: [
        { user_id: 1, name: 'Лид' },
        { user_id: 2, name: 'Овнер' },
        { user_id: 3, name: 'Админ' },
        { user_id: 4, name: 'Участник' },
      ],
      projects: [{ project_id: 10, name: 'P10', confidentiality_level: 'public', lead_id: 1, created_by: 2 }],
      adminGrants: [{ user_id: 3, project_id: 10 }],
      participants: [{ user_id: 4, project_id: 10 }],
    });
    expect(edgeFor(g, 1, 10).role).toBe('manager');
    expect(edgeFor(g, 2, 10).role).toBe('manager');
    expect(edgeFor(g, 3, 10).role).toBe('manager');
    expect(edgeFor(g, 4, 10).role).toBe('member');
  });

  it('collapses a participant-who-is-also-lead into one manager edge', () => {
    const g = buildAccessGraph({
      users: [{ user_id: 1, name: 'Аня' }],
      projects: [{ project_id: 10, name: 'P10', confidentiality_level: 'public', lead_id: 1 }],
      participants: [{ user_id: 1, project_id: 10 }],
    });
    const matching = g.edges.filter((e) => e.source === 'user-1' && e.target === 'project-10');
    expect(matching).toHaveLength(1);
    expect(matching[0].role).toBe('manager');
    expect(userNode(g, 1).data.project_count).toBe(1); // counted once
  });

  it('drops ties to users absent from the active set (e.g. inactive lead)', () => {
    const g = buildAccessGraph({
      users: [{ user_id: 1, name: 'Аня' }],
      // lead 99 is not in users → no dangling edge, no crash
      projects: [{ project_id: 10, name: 'P10', confidentiality_level: 'public', lead_id: 99 }],
      participants: [{ user_id: 1, project_id: 10 }],
    });
    expect(edgeFor(g, 99, 10)).toBeUndefined();
    expect(edgeFor(g, 1, 10).role).toBe('member');
    expect(g.edges).toHaveLength(1);
  });
});
