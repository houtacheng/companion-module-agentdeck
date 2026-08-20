import { describe, it, expect } from 'vitest'
import { isBlinkOnBeat, BLINK_HALF_CYCLE_FRAMES, needsYourResponse } from '../companion/feedbacks.js'

describe('isBlinkOnBeat', () => {
  it('starts on the "on" beat at frame 0', () => {
    expect(isBlinkOnBeat(0)).toBe(true)
  })
  it('stays on through the whole first half-cycle', () => {
    for (let f = 0; f < BLINK_HALF_CYCLE_FRAMES; f++) expect(isBlinkOnBeat(f)).toBe(true)
  })
  it('flips off for the second half-cycle', () => {
    for (let f = BLINK_HALF_CYCLE_FRAMES; f < BLINK_HALF_CYCLE_FRAMES * 2; f++) expect(isBlinkOnBeat(f)).toBe(false)
  })
  it('flips back on for the third half-cycle (full period = 2 half-cycles)', () => {
    for (let f = BLINK_HALF_CYCLE_FRAMES * 2; f < BLINK_HALF_CYCLE_FRAMES * 3; f++) expect(isBlinkOnBeat(f)).toBe(true)
  })
})

describe('needsYourResponse', () => {
  it('blinks for a gated tool-permission request', () => {
    expect(needsYourResponse('approval')).toBe(true)
  })
  it('blinks for a live question/option prompt (e.g. AskUserQuestion)', () => {
    expect(needsYourResponse('input')).toBe(true)
  })
  it('blinks for a diff awaiting review', () => {
    expect(needsYourResponse('review')).toBe(true)
  })
  it('does not blink for working/idle/done/error/offline', () => {
    expect(needsYourResponse('working')).toBe(false)
    expect(needsYourResponse('idle')).toBe(false)
    expect(needsYourResponse('done')).toBe(false)
    expect(needsYourResponse('error')).toBe(false)
    expect(needsYourResponse('offline')).toBe(false)
  })
})
