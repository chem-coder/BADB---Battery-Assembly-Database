// Unit tests for src/utils/batteryDelete.js
//
// Pins the guided-battery-delete contract from
// docs/rules/battery_lifecycle_rules.md + services/batteryLifecycleService.js:
//   - typed phrase `DELETE BATTERY <id>` is ALWAYS sent
//   - electrode_disposition (available|scrapped) is sent ONLY when linked
//     electrodes exist; scrapped may add a trimmed scrapped_reason
//   - hard blockers disable confirmation
//
// This is the exact contract whose absence made the old Vue delete fail —
// the body builder is the regression guard.

import { describe, it, expect } from 'vitest'
import {
  batteryDeletePhrase,
  mapBatteryDeleteCheck,
  batteryDeleteConfirmEnabled,
  buildBatteryDeletePayload,
} from '@/utils/batteryDelete'

describe('batteryDeletePhrase', () => {
  it('matches the backend-validated phrase exactly', () => {
    expect(batteryDeletePhrase(19)).toBe('DELETE BATTERY 19')
    expect(batteryDeletePhrase('42')).toBe('DELETE BATTERY 42')
  })
})

describe('mapBatteryDeleteCheck', () => {
  it('maps hard blockers to readable strings with counts, and marks canDelete=false', () => {
    const raw = {
      can_delete: false,
      hard_blockers: [
        { key: 'cycling_sessions', label: 'циклирование аккумулятора', count: 3 },
        { key: 'module_batteries', label: 'модуль, в который входит аккумулятор', count: 1 },
      ],
      confirmable_owned_data: [],
      linked_electrodes: [],
    }
    const m = mapBatteryDeleteCheck(raw)
    expect(m.canDelete).toBe(false)
    expect(m.blockers).toEqual([
      'циклирование аккумулятора (3)',
      'модуль, в который входит аккумулятор (1)',
    ])
  })

  it('exposes owned data and linked electrodes when delete is allowed', () => {
    const raw = {
      can_delete: true,
      hard_blockers: [],
      confirmable_owned_data: [
        { key: 'battery_coin_config', label: 'конфигурация монеточного аккумулятора', count: 1 },
        { key: 'battery_projects', label: 'связи с проектами', count: 2 },
      ],
      linked_electrodes: [{ electrode_id: 5 }, { electrode_id: 6 }],
    }
    const m = mapBatteryDeleteCheck(raw)
    expect(m.canDelete).toBe(true)
    expect(m.blockers).toEqual([])
    expect(m.ownedData).toEqual([
      { label: 'конфигурация монеточного аккумулятора', count: 1 },
      { label: 'связи с проектами', count: 2 },
    ])
    expect(m.linkedElectrodes).toHaveLength(2)
  })

  it('tolerates a missing / empty response', () => {
    const m = mapBatteryDeleteCheck(null)
    expect(m).toEqual({ canDelete: true, blockers: [], ownedData: [], linkedElectrodes: [] })
  })
})

describe('batteryDeleteConfirmEnabled', () => {
  it('is enabled when there are no linked electrodes', () => {
    expect(batteryDeleteConfirmEnabled([], 'available')).toBe(true)
    expect(batteryDeleteConfirmEnabled([], '')).toBe(true)
  })

  it('requires a valid disposition when electrodes are linked', () => {
    const linked = [{ electrode_id: 1 }]
    expect(batteryDeleteConfirmEnabled(linked, 'available')).toBe(true)
    expect(batteryDeleteConfirmEnabled(linked, 'scrapped')).toBe(true)
    expect(batteryDeleteConfirmEnabled(linked, '')).toBe(false)
    expect(batteryDeleteConfirmEnabled(linked, 'bogus')).toBe(false)
  })
})

describe('buildBatteryDeletePayload', () => {
  it('always includes the typed confirmation phrase', () => {
    const body = buildBatteryDeletePayload({ batteryId: 7, linkedElectrodes: [] })
    expect(body).toEqual({ confirmation: 'DELETE BATTERY 7' })
  })

  it('omits electrode_disposition when no electrodes are linked', () => {
    const body = buildBatteryDeletePayload({
      batteryId: 7,
      linkedElectrodes: [],
      disposition: 'scrapped',
      scrappedReason: 'whatever',
    })
    expect(body.electrode_disposition).toBeUndefined()
    expect(body.scrapped_reason).toBeUndefined()
  })

  it('sends available disposition (no reason) when electrodes are linked', () => {
    const body = buildBatteryDeletePayload({
      batteryId: 9,
      linkedElectrodes: [{ electrode_id: 1 }],
      disposition: 'available',
      scrappedReason: 'ignored for available',
    })
    expect(body).toEqual({ confirmation: 'DELETE BATTERY 9', electrode_disposition: 'available' })
  })

  it('sends scrapped disposition with a trimmed reason', () => {
    const body = buildBatteryDeletePayload({
      batteryId: 9,
      linkedElectrodes: [{ electrode_id: 1 }],
      disposition: 'scrapped',
      scrappedReason: '  бракованная сборка  ',
    })
    expect(body).toEqual({
      confirmation: 'DELETE BATTERY 9',
      electrode_disposition: 'scrapped',
      scrapped_reason: 'бракованная сборка',
    })
  })

  it('omits a blank scrapped reason so the backend can apply its default', () => {
    const body = buildBatteryDeletePayload({
      batteryId: 9,
      linkedElectrodes: [{ electrode_id: 1 }],
      disposition: 'scrapped',
      scrappedReason: '   ',
    })
    expect(body).toEqual({ confirmation: 'DELETE BATTERY 9', electrode_disposition: 'scrapped' })
    expect('scrapped_reason' in body).toBe(false)
  })

  it('defaults an unknown disposition to available when electrodes are linked', () => {
    const body = buildBatteryDeletePayload({
      batteryId: 1,
      linkedElectrodes: [{ electrode_id: 1 }],
      disposition: undefined,
    })
    expect(body.electrode_disposition).toBe('available')
  })
})
