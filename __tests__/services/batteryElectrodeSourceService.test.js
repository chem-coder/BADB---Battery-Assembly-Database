// Unit tests for services/batteryElectrodeSourceService.js
//
// Scope: BatteryElectrodeSourceValidationError class — focused on the
// constructor contract that the route handlers in routes/batteries.js
// rely on (statusCode, missing_roles, updated). The route layer expects:
//   - default statusCode = 400 for plain validation errors
//   - explicit statusCode = 404 for "row not found" on PATCH
//   - details object exposes only missing_roles + updated, never
//     overwriting message / statusCode / name (security boundary —
//     prevents internal callers from accidentally clobbering the error
//     identity)
//
// We don't test the SQL paths here — those would need a real test DB,
// which is out of scope for this first testing-setup PR.

import { describe, it, expect } from 'vitest';
import {
  BatteryElectrodeSourceValidationError,
  normalizeBatteryElectrodeSourcePayload
} from '../../services/batteryElectrodeSourceService.js';

describe('BatteryElectrodeSourceValidationError', () => {
  describe('constructor — defaults', () => {
    it('sets statusCode = 400 by default (validation error)', () => {
      const err = new BatteryElectrodeSourceValidationError('bad input');
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('bad input');
      expect(err.name).toBe('BatteryElectrodeSourceValidationError');
    });

    it('is a real Error subclass (instanceof works)', () => {
      const err = new BatteryElectrodeSourceValidationError('x');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(BatteryElectrodeSourceValidationError);
    });
  });

  describe('constructor — custom statusCode', () => {
    it('accepts statusCode = 404 for "row not found" shape', () => {
      const err = new BatteryElectrodeSourceValidationError('not found', 404);
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe('not found');
    });

    it('accepts arbitrary statusCode (forward compat)', () => {
      const err = new BatteryElectrodeSourceValidationError('conflict', 409);
      expect(err.statusCode).toBe(409);
    });
  });

  describe('constructor — details allowlist', () => {
    it('exposes missing_roles when provided', () => {
      const err = new BatteryElectrodeSourceValidationError('msg', 404, {
        missing_roles: ['cathode'],
      });
      expect(err.missing_roles).toEqual(['cathode']);
    });

    it('exposes updated metadata when provided', () => {
      const err = new BatteryElectrodeSourceValidationError('msg', 404, {
        updated: { cathode: 0, anode: 1 },
      });
      expect(err.updated).toEqual({ cathode: 0, anode: 1 });
    });

    it('exposes both missing_roles and updated together', () => {
      const err = new BatteryElectrodeSourceValidationError('msg', 404, {
        missing_roles: ['anode'],
        updated: { cathode: 1, anode: 0 },
      });
      expect(err.missing_roles).toEqual(['anode']);
      expect(err.updated).toEqual({ cathode: 1, anode: 0 });
    });

    it('does NOT overwrite message via details (security boundary)', () => {
      // If details contains `message`, it should NOT clobber the constructor
      // message. The allowlist is explicit — only missing_roles + updated.
      const err = new BatteryElectrodeSourceValidationError('original', 400, {
        message: 'malicious override',
        missing_roles: ['cathode'],
      });
      expect(err.message).toBe('original');
      expect(err.missing_roles).toEqual(['cathode']);
    });

    it('does NOT overwrite statusCode via details', () => {
      const err = new BatteryElectrodeSourceValidationError('msg', 400, {
        statusCode: 999,
        missing_roles: [],
      });
      expect(err.statusCode).toBe(400);
    });

    it('does NOT overwrite name via details', () => {
      const err = new BatteryElectrodeSourceValidationError('msg', 400, {
        name: 'WrongError',
      });
      expect(err.name).toBe('BatteryElectrodeSourceValidationError');
    });

    it('ignores unknown details fields silently', () => {
      const err = new BatteryElectrodeSourceValidationError('msg', 400, {
        random_field: 'ignored',
        missing_roles: ['cathode'],
      });
      expect(err.random_field).toBeUndefined();
      expect(err.missing_roles).toEqual(['cathode']);
    });

    it('handles details = null gracefully', () => {
      const err = new BatteryElectrodeSourceValidationError('msg', 404, null);
      expect(err.statusCode).toBe(404);
      expect(err.missing_roles).toBeUndefined();
      expect(err.updated).toBeUndefined();
    });

    it('handles details omitted entirely', () => {
      const err = new BatteryElectrodeSourceValidationError('msg', 404);
      expect(err.missing_roles).toBeUndefined();
      expect(err.updated).toBeUndefined();
    });
  });

  describe('JSON serialization shape (for HTTP responses)', () => {
    it('toString includes name + message (standard Error behavior)', () => {
      const err = new BatteryElectrodeSourceValidationError('bad data');
      expect(err.toString()).toContain('BatteryElectrodeSourceValidationError');
      expect(err.toString()).toContain('bad data');
    });
  });
});

describe('normalizeBatteryElectrodeSourcePayload', () => {
  it('accepts multi-row array payloads and keeps one primary per role', () => {
    const normalized = normalizeBatteryElectrodeSourcePayload({
      sources: [
        { role: 'cathode', tape_id: 1, cut_batch_id: 10, is_primary: false },
        { role: 'cathode', tape_id: 2, cut_batch_id: 11, is_primary: true },
        { role: 'anode', tape_id: 3, cut_batch_id: 20 }
      ]
    });

    expect(normalized.mode).toBe('array');
    expect(normalized.rows).toHaveLength(3);
    expect(normalized.rows.filter(row => row.role === 'cathode' && row.is_primary)).toHaveLength(1);
    expect(normalized.rows.find(row => row.cut_batch_id === 11)?.is_primary).toBe(true);
    expect(normalized.rows.find(row => row.role === 'anode')?.is_primary).toBe(true);
  });

  it('maps legacy flat payloads to primary role rows', () => {
    const normalized = normalizeBatteryElectrodeSourcePayload({
      cathode_tape_id: '1',
      cathode_cut_batch_id: '10',
      cathode_source_notes: 'primary cathode'
    });

    expect(normalized.mode).toBe('legacy');
    expect(normalized.requestedRoles).toEqual(['cathode']);
    expect(normalized.rows).toEqual([
      expect.objectContaining({
        role: 'cathode',
        tape_id: 1,
        cut_batch_id: 10,
        source_notes: 'primary cathode',
        is_primary: true
      })
    ]);
  });

  it('allows cut-batch-first source rows without a tape filter', () => {
    const normalized = normalizeBatteryElectrodeSourcePayload({
      sources: [
        { role: 'cathode', tape_id: null, cut_batch_id: '10' }
      ]
    });

    expect(normalized.rows).toEqual([
      expect.objectContaining({
        role: 'cathode',
        tape_id: null,
        cut_batch_id: 10,
        is_primary: true
      })
    ]);
  });

  it('rejects duplicate cut batches within the same role', () => {
    expect(() => normalizeBatteryElectrodeSourcePayload({
      sources: [
        { role: 'cathode', tape_id: 1, cut_batch_id: 10 },
        { role: 'cathode', tape_id: 1, cut_batch_id: 10 }
      ]
    })).toThrow(BatteryElectrodeSourceValidationError);
  });
});
