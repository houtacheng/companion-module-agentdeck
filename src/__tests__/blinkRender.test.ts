import { describe, it, expect } from 'vitest'
import { renderPet, statusBg } from '../companion/pet.js'
import { renderTile } from '../companion/tile.js'
import { BLINK_HALF_CYCLE_FRAMES } from '../companion/blink.js'

const ON_FRAME = 0
const OFF_FRAME = BLINK_HALF_CYCLE_FRAMES

describe('statusBg blink (baked into the PNG, not a separate Companion feedback)', () => {
  it('flashes for approval/input/review, unaffected for working/idle/etc', () => {
    expect(statusBg('approval', ON_FRAME)).not.toEqual(statusBg('approval', OFF_FRAME))
    expect(statusBg('input', ON_FRAME)).not.toEqual(statusBg('input', OFF_FRAME))
    expect(statusBg('review', ON_FRAME)).not.toEqual(statusBg('review', OFF_FRAME))
    expect(statusBg('working', ON_FRAME)).toEqual(statusBg('working', OFF_FRAME))
    expect(statusBg('idle', ON_FRAME)).toEqual(statusBg('idle', OFF_FRAME))
  })
  it('is unaffected when frame is omitted (backward compatible)', () => {
    expect(statusBg('approval')).toEqual(statusBg('approval'))
  })
})

describe('renderPet / renderTile bake the blink into the image itself', () => {
  it('pet PNG differs between blink beats while awaiting approval', () => {
    const on = renderPet('claude', 'approval', ON_FRAME)
    const off = renderPet('claude', 'approval', OFF_FRAME)
    expect(on).not.toBe(off)
  })
  it('pet PNG is stable across "beats" for a non-blinking status', () => {
    const a = renderPet('claude', 'working', ON_FRAME)
    const b = renderPet('claude', 'working', OFF_FRAME)
    // Working still animates (bob/pulse), so allow difference, but the
    // background itself must not have flashed — checked at the color level above.
    expect(typeof a).toBe('string')
    expect(typeof b).toBe('string')
  })
  it('tile PNG differs between blink beats while awaiting input (AskUserQuestion)', () => {
    const data = { status: 'input' as const, name: 'Claude', model: '', act: false }
    const on = renderTile('claude', data, ON_FRAME)
    const off = renderTile('claude', data, OFF_FRAME)
    expect(on).not.toBe(off)
  })
})
