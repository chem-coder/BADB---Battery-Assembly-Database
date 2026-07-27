import { describe, expect, it } from 'vitest'
import {
  ballVolumeMl,
  formatBallSuggestion,
  formatOverfillWarning,
  suggestBalls
} from '../../src/utils/ballSuggestion.js'

describe('ballVolumeMl', () => {
  it('computes sphere volumes from lab diameters', () => {
    expect(ballVolumeMl(0.25)).toBeCloseTo(0.0082, 3)
    expect(ballVolumeMl(0.5)).toBeCloseTo(0.0654, 3)
    expect(ballVolumeMl(0.75)).toBeCloseTo(0.2209, 3)
    expect(ballVolumeMl(1.0)).toBeCloseTo(0.5236, 3)
  })
})

describe('suggestBalls', () => {
  it('targets 1/3 of the slurry volume, filling largest balls first', () => {
    const s = suggestBalls(20)
    expect(s.targetVolumeMl).toBeCloseTo(6.6667, 3)
    // 12 x 1.0 cm = 6.283 ml, remainder 0.384 -> 1 x 0.75 (0.221), then
    // remainder 0.163 -> round to 2 x 0.5 (0.131).
    expect(s.items[0]).toMatchObject({ diameter_cm: 1.0, ball_count: 12 })
    expect(s.totalBallVolumeMl).toBeGreaterThan(6.2)
    expect(s.totalBallVolumeMl).toBeLessThan(7.1)
  })

  it('suggests at least one smallest ball for tiny volumes', () => {
    const s = suggestBalls(0.002)
    expect(s.items).toEqual([
      { diameter_cm: 0.25, ball_count: 1, volume_ml: ballVolumeMl(0.25) }
    ])
  })

  it('returns null without a positive slurry volume', () => {
    expect(suggestBalls(0)).toBeNull()
    expect(suggestBalls('')).toBeNull()
    expect(suggestBalls(NaN)).toBeNull()
  })

  it('flags overfill against the container working volume', () => {
    const fits = suggestBalls(20, { maxWorkingVolumeMl: 30 })
    expect(fits.overfill).toBe(false)

    const tooMuch = suggestBalls(20, { maxWorkingVolumeMl: 25 })
    expect(tooMuch.overfill).toBe(true)
    expect(tooMuch.totalWithSlurryMl).toBeGreaterThan(25)
  })

  it('matches the lab example scale: ~6.6 ml of slurry for 10x0.5 + 3x1.0 balls', () => {
    // Her recorded combo was 2.23 ml of balls; inverse of the 1/3 rule puts
    // the corresponding slurry volume near 6.7 ml.
    const ballVolume = 10 * ballVolumeMl(0.5) + 3 * ballVolumeMl(1.0)
    expect(ballVolume).toBeCloseTo(2.225, 2)
    const s = suggestBalls(ballVolume * 3)
    expect(s.targetVolumeMl).toBeCloseTo(ballVolume, 2)
  })
})

describe('formatting', () => {
  it('formats the suggestion with the short explanation', () => {
    const s = suggestBalls(20)
    const text = formatBallSuggestion(s, 20)
    expect(text).toContain('Рекомендация')
    expect(text).toContain('⅓ объёма пасты')
    expect(text).toContain('×1 см')
  })

  it('formats the overfill warning only when overfilled', () => {
    const fits = suggestBalls(20, { maxWorkingVolumeMl: 30 })
    expect(formatOverfillWarning(fits, 30)).toBe('')

    const tooMuch = suggestBalls(20, { maxWorkingVolumeMl: 25 })
    expect(formatOverfillWarning(tooMuch, 25)).toContain('больше рабочего объёма')
  })
})
