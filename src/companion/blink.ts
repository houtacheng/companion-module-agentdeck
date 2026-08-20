import type { ProviderStatus } from '../state/stateMapper.js'

/**
 * Shared blink-phase logic for the "needs your response" flash. Lives outside
 * feedbacks.ts (and outside pet.ts/tile.ts) so both the Companion boolean
 * feedback AND the baked-in PNG renderers (pet/tile/baimi/antigravity) can
 * share one definition without a circular import between feedbacks.ts (which
 * imports the renderers) and the renderers themselves.
 *
 * Baking the blink into the PNG matters because the pet/tile renderers paint
 * a full, rounded-corner image over the whole key — Companion's own feedback
 * bgcolor is hidden behind it everywhere except the tiny transparent corner
 * triangles left by the rounding, so a plain boolean feedback "blinks" only
 * in those four corners. See pet.ts's statusBg and tile.ts's tileBg.
 */

/** Pet frames per blink half-cycle. At PET_FRAME_MS=150 this is a ~900ms
 *  full on/off cycle — brisk enough to catch the eye, not epilepsy-fast. */
export const BLINK_HALF_CYCLE_FRAMES = 3

/** True on the "on" beat of the blink cycle for a given pet-animation frame. */
export function isBlinkOnBeat(frame: number): boolean {
  return Math.floor(frame / BLINK_HALF_CYCLE_FRAMES) % 2 === 0
}

/** Every provider status that means "this needs YOUR response right now" —
 *  a gated tool-permission gate (`approval`), a live question/option prompt
 *  like AskUserQuestion (`input`), or a diff awaiting review (`review`). */
const BLINK_STATUSES: ReadonlySet<ProviderStatus> = new Set(['approval', 'input', 'review'])

export function needsYourResponse(status: ProviderStatus): boolean {
  return BLINK_STATUSES.has(status)
}

/** Pick between a status's normal color and an attention flash color, baked
 *  directly into whatever's being rendered (a button background fill, a
 *  border stroke, …) so it survives being painted under a full-bleed PNG. */
export function withBlink<T>(status: ProviderStatus, frame: number, normal: T, attention: T): T {
  if (!needsYourResponse(status)) return normal
  return isBlinkOnBeat(frame) ? attention : normal
}
