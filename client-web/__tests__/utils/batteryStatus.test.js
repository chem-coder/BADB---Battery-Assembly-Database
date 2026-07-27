// Unit tests for src/utils/batteryStatus.js
//
// Encodes the battery status display contract from
// docs/rules/battery_lifecycle_rules.md:
//   - blank/NULL/undefined  → derived «Открыт»
//   - legacy `disassembled` → displayed as «Открыт»
//   - `draft` / «Черновик»  is NOT a battery status and must never appear
//   - after assembly: assembled / testing / completed / failed are the only
//     selectable statuses

import { describe, it, expect } from 'vitest'
import {
  BATTERY_OPEN_STATUS_LABEL,
  BATTERY_SELECTABLE_STATUSES,
  isBatteryOpenStatus,
  batteryStatusCode,
  batteryStatusLabel,
} from '@/utils/batteryStatus'

describe('isBatteryOpenStatus', () => {
  it('treats blank / NULL / undefined / whitespace as open', () => {
    expect(isBatteryOpenStatus('')).toBe(true)
    expect(isBatteryOpenStatus(null)).toBe(true)
    expect(isBatteryOpenStatus(undefined)).toBe(true)
    expect(isBatteryOpenStatus('   ')).toBe(true)
  })

  it('treats legacy `disassembled` as open (compatibility)', () => {
    expect(isBatteryOpenStatus('disassembled')).toBe(true)
  })

  it('does not treat real selectable statuses as open', () => {
    for (const { value } of BATTERY_SELECTABLE_STATUSES) {
      expect(isBatteryOpenStatus(value)).toBe(false)
    }
  })

  it('does not treat `draft` as open (it is not a battery status at all)', () => {
    expect(isBatteryOpenStatus('draft')).toBe(false)
  })
})

describe('batteryStatusCode', () => {
  it('normalizes the open state to "open" (never "draft")', () => {
    expect(batteryStatusCode('')).toBe('open')
    expect(batteryStatusCode(null)).toBe('open')
    expect(batteryStatusCode(undefined)).toBe('open')
    expect(batteryStatusCode('disassembled')).toBe('open')
  })

  it('passes real statuses through unchanged', () => {
    expect(batteryStatusCode('assembled')).toBe('assembled')
    expect(batteryStatusCode('testing')).toBe('testing')
    expect(batteryStatusCode('completed')).toBe('completed')
    expect(batteryStatusCode('failed')).toBe('failed')
  })

  it('never emits the "draft" code for any open input', () => {
    for (const input of ['', null, undefined, '   ', 'disassembled']) {
      expect(batteryStatusCode(input)).not.toBe('draft')
    }
  })
})

describe('batteryStatusLabel', () => {
  it('renders the open state as «Открыт», never «Черновик»', () => {
    for (const input of ['', null, undefined, 'disassembled']) {
      expect(batteryStatusLabel(input)).toBe(BATTERY_OPEN_STATUS_LABEL)
      expect(batteryStatusLabel(input)).not.toBe('Черновик')
    }
  })

  it('renders canonical Russian labels for selectable statuses', () => {
    expect(batteryStatusLabel('assembled')).toBe('Собран')
    expect(batteryStatusLabel('testing')).toBe('На тестировании')
    expect(batteryStatusLabel('completed')).toBe('Завершён')
    expect(batteryStatusLabel('failed')).toBe('Брак')
  })

  it('falls back to the raw value for unknown statuses (mirrors vanilla)', () => {
    expect(batteryStatusLabel('some_future_status')).toBe('some_future_status')
  })

  it('exposes exactly the four post-assembly selectable statuses', () => {
    expect(BATTERY_SELECTABLE_STATUSES.map((s) => s.value)).toEqual([
      'assembled',
      'testing',
      'completed',
      'failed',
    ])
  })
})
