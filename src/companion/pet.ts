import { deflateSync } from 'node:zlib'
import type { ProviderStatus } from '../state/stateMapper.js'
import type { ProviderId } from '../agentdeck/mapper.js'
// Circular with antigravity.ts by design — see the note on renderPet() below.
import { renderAntigravityPet, drawAntigravityInto } from './antigravity.js'
import { withBlink } from './blink.js'

/**
 * Agent "pets" — the AgentDeck creatures, rendered to a PNG for a Companion
 * button and animated (bob + pulse) from ProviderStatus only (spec §39).
 *
 * Art source of truth: puritysb/AgentDeck `bridge/src/pixoo/pixoo-sprites.ts`.
 *   - Codex     = JELLYFISH_GRID_HD (cloud mascot)     · COLORS.jellyfish*
 *   - Claude    = OCTOPUS_GRID_HD                      · COLORS.octopus*
 *   - OpenClaw  = CRAYFISH_GRID_HD                      · COLORS.crayfish*
 *   - OpenCode  = OPENCODE_GRID_HD (nested ring)        · COLORS.opencode*
 *   - Antigravity = ANTIGRAVITY_GRID (rainbow peak/arc, a different multi-hue
 *     letter-grid format) — has its own module, see `./antigravity.ts`.
 *   - Gemini / Kiro = no upstream creature exists (no adapter, or upstream has
 *     only a vector brand mark with no pixel-art grid) — a neutral placeholder
 *     stands in until upstream ships pixel art. Intentionally generic, never
 *     presented as an official mascot.
 */

type RGB = [number, number, number]

type Role = 'body' | 'accent' | 'eye' | 'marking' | 'edge'

/** Providers rendered through the generic role/grid system below. Antigravity
 *  is excluded — its rainbow mark needs more than 5 roles, so it gets its own
 *  module (`./antigravity.ts`) and is special-cased in the two entry points
 *  at the bottom of this file. */
type GridProvider = Exclude<ProviderId, 'antigravity'>

interface PetSpec {
  grid: number[][]
  cols: number
  rows: number
  /** cell value → role (0 is always empty). */
  role: Record<number, Role>
  palette: {
    body: RGB
    accent: RGB
    eye: RGB
    marking: RGB
    edge: RGB
    glow: RGB
    pulse: RGB
    sleeping: RGB
    error: RGB
    bg: RGB
  }
}

export const DARK_WATER: RGB = [0x0b, 0x0e, 0x1a]

/** Bright flash color for the approval/input/review blink — see withBlink(). */
const ATTENTION_FLASH: RGB = [0xff, 0x3b, 0x30]

/**
 * Per-status button background colour, baked into the pet PNG (spec §25 colour
 * language). The pet image fills the whole key, so Companion's own bgcolor is
 * hidden behind it — this is what actually makes the key background change with
 * state (most visibly: teal while WORKING).
 *
 * `frame`, when given, bakes in the "needs your response" blink directly (the
 * pet image covers the whole key with only its rounded corners transparent, so
 * a separate boolean Companion feedback can only ever flash those four corner
 * triangles — baking it into this fill is what makes the whole key flash).
 */
export function statusBg(status: ProviderStatus, frame?: number): RGB {
  const base: RGB = (() => {
    switch (status) {
      case 'working':
        return [0x0a, 0x40, 0x4a] // teal — active
      case 'approval':
        return [0x60, 0x3c, 0x08] // amber — attention
      case 'input':
        return [0x2c, 0x24, 0x54] // indigo
      case 'review':
        return [0x1e, 0x32, 0x4a] // blue
      case 'done':
        return [0x10, 0x46, 0x28] // green
      case 'error':
        return [0x5a, 0x10, 0x10] // red
      case 'idle':
        return [0x12, 0x16, 0x22] // dim neutral
      case 'offline':
      default:
        return [0x0b, 0x0e, 0x1a] // near-black water
    }
  })()
  return frame === undefined ? base : withBlink(status, frame, base, ATTENTION_FLASH)
}

// ===== Codex — jellyfish/cloud (0 empty · 1 body · 2 marking `>_` · 3 edge) =====
const CODEX_GRID: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,1,1,1,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,1,1,1,1,0,0,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,1,1,1,1,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,1,1,1,1,1,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,1,1,1,1,1,1,2,2,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,1,1,1,1,1,1,1,2,2,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,1,1,1,1,1,1,1,2,2,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,1,1,1,1,1,1,2,2,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,1,1,1,1,1,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,1,1,1,1,2,2,1,1,1,1,2,2,2,2,2,2,1,1,1,1,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,1,1,1,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,0,0,0,0,3,3,3,3,3,1,1,1,1,3,3,3,3,3,0,0,0,0,0],
  [0,0,0,0,0,0,3,3,3,0,0,0,0,0,0,3,3,3,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
]

// ===== Claude — octopus (0 empty · 1 body · 2 eye · 3/4 arms · 5/6 legs) =====
const CLAUDE_GRID: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,1,1,1,2,2,1,1,1,1,1,1,1,1,2,2,1,1,1,0,0,0],
  [0,0,0,1,1,1,2,2,1,1,1,1,1,1,1,1,2,2,1,1,1,0,0,0],
  [0,0,0,1,1,1,2,2,1,1,1,1,1,1,1,1,2,2,1,1,1,0,0,0],
  [3,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4,4,4],
  [3,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4,4,4],
  [3,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4,4,4],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,5,5,0,0,5,5,0,0,0,0,6,6,0,0,6,6,0,0,0,0],
  [0,0,0,0,5,5,0,0,5,5,0,0,0,0,6,6,0,0,6,6,0,0,0,0],
  [0,0,0,0,5,5,0,0,5,5,0,0,0,0,6,6,0,0,6,6,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
]

// ===== Gemini — placeholder 4-point spark (0 empty · 1 body · 2 core) =====
const GEMINI_GRID: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,2,2,2,2,1,1,1,1,1,1,0,0,0,0],
  [0,0,1,1,1,1,1,1,1,2,2,2,2,2,2,1,1,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,2,2,2,2,2,2,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,2,2,2,2,2,2,1,1,1,1,1,1,1,1,0],
  [0,0,1,1,1,1,1,1,1,2,2,2,2,2,2,1,1,1,1,1,1,1,0,0],
  [0,0,0,0,1,1,1,1,1,1,2,2,2,2,1,1,1,1,1,1,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
]

// ===== OpenClaw — crayfish (0 empty · 1 body · 2 eye · 3/4 claws · 5/6 leg
// tips · 7 antenna). Eyes at [9][8]/[9][14] are injected manually — upstream
// draws them as a separate overlay rather than baking them into the grid. =====
const OPENCLAW_GRID: number[][] = (() => {
  const g: number[][] = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,7,7,0,0,0,0,0,0,0,0,7,7,0,0,0,0,0,0],
    [0,0,0,0,0,7,0,0,0,0,0,0,0,0,0,0,0,0,7,0,0,0,0,0],
    [0,0,0,0,7,0,0,0,0,0,1,1,1,1,0,0,0,0,0,7,0,0,0,0],
    [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,3,3,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,4,4,0],
    [3,3,3,3,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,4,4,4,4],
    [3,3,3,3,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,4,4,4,4],
    [0,3,3,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,4,4,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,5,5,1,1,1,1,6,6,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,5,5,1,1,1,1,6,6,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ]
  g[9][8] = 2
  g[9][14] = 2
  return g
})()

// ===== OpenCode — nested ring (0 empty · 8 outer frame · 9 inner core) =====
const OPENCODE_GRID: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,8,8,8,8,8,8,8,8,8,8,8,8,8,8,0,0,0,0,0,0],
  [0,0,0,0,8,8,8,8,8,8,8,8,8,8,8,8,8,8,0,0,0,0,0,0],
  [0,0,0,0,8,8,0,0,0,0,0,0,0,0,0,0,8,8,0,0,0,0,0,0],
  [0,0,0,0,8,8,0,0,0,0,0,0,0,0,0,0,8,8,0,0,0,0,0,0],
  [0,0,0,0,8,8,0,0,0,0,0,0,0,0,0,0,8,8,0,0,0,0,0,0],
  [0,0,0,0,8,8,0,0,0,0,0,0,0,0,0,0,8,8,0,0,0,0,0,0],
  [0,0,0,0,8,8,0,0,0,0,9,9,9,9,9,9,8,8,9,9,9,9,9,9],
  [0,0,0,0,8,8,0,0,0,0,9,9,9,9,9,9,8,8,9,9,9,9,9,9],
  [0,0,0,0,8,8,0,0,0,0,9,9,9,9,9,9,8,8,9,9,9,9,9,9],
  [0,0,0,0,8,8,0,0,0,0,9,9,9,9,9,9,8,8,9,9,9,9,9,9],
  [0,0,0,0,8,8,0,0,0,0,9,9,9,9,9,9,8,8,9,9,9,9,9,9],
  [0,0,0,0,8,8,0,0,0,0,9,9,9,9,9,9,8,8,9,9,9,9,9,9],
  [0,0,0,0,8,8,8,8,8,8,8,8,8,8,8,8,8,8,9,9,9,9,9,9],
  [0,0,0,0,8,8,8,8,8,8,8,8,8,8,8,8,8,8,9,9,9,9,9,9],
  [0,0,0,0,0,0,0,0,0,0,9,9,9,9,9,9,9,9,9,9,9,9,9,9],
  [0,0,0,0,0,0,0,0,0,0,9,9,9,9,9,9,9,9,9,9,9,9,9,9],
  [0,0,0,0,0,0,0,0,0,0,9,9,9,9,9,9,9,9,9,9,9,9,9,9],
  [0,0,0,0,0,0,0,0,0,0,9,9,9,9,9,9,9,9,9,9,9,9,9,9],
  [0,0,0,0,0,0,0,0,0,0,9,9,9,9,9,9,9,9,9,9,9,9,9,9],
  [0,0,0,0,0,0,0,0,0,0,9,9,9,9,9,9,9,9,9,9,9,9,9,9],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
]

// ===== Kiro — no upstream pixel-art grid exists (only a vector "ghost" brand
// mark). This is an honest, generic placeholder silhouette — a simple rounded
// ghost shape — not a claimed official mascot, same status as the Gemini spark.
const KIRO_GRID: number[][] = [
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,2,2,1,1,1,1,1,1,1,2,2,1,1,1,1,1,0,0],
  [0,0,1,1,1,1,2,2,1,1,1,1,1,1,1,2,2,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,3,0,1,1,3,0,1,1,3,0,1,1,3,0,1,1,3,0,1,1,0],
  [0,0,0,3,0,0,0,3,0,0,0,3,0,0,0,3,0,0,0,3,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
]

const SPECS: Record<GridProvider, PetSpec> = {
  codex: {
    grid: CODEX_GRID,
    cols: 24,
    rows: 24,
    role: { 1: 'body', 2: 'marking', 3: 'edge' },
    palette: {
      body: [0x63, 0x66, 0xf1],
      accent: [0x4f, 0x46, 0xe5],
      eye: [0x10, 0x08, 0x08],
      marking: [0xf5, 0xf7, 0xff],
      edge: [0x4f, 0x46, 0xe5],
      glow: [0x31, 0x33, 0x78],
      pulse: [0xa5, 0xb4, 0xfc],
      sleeping: [0x3a, 0x3c, 0x90],
      error: [0xff, 0x52, 0x41],
      bg: DARK_WATER,
    },
  },
  claude: {
    grid: CLAUDE_GRID,
    cols: 24,
    rows: 24,
    role: { 1: 'body', 2: 'eye', 3: 'accent', 4: 'accent', 5: 'accent', 6: 'accent' },
    palette: {
      body: [0xc0, 0x70, 0x58], // terracotta #C07058
      accent: [0xa0, 0x58, 0x40], // arms/legs
      eye: [0x10, 0x08, 0x08], // near-black dot eyes
      marking: [0xd0, 0x88, 0x70],
      edge: [0xa0, 0x58, 0x40],
      glow: [0x60, 0x38, 0x2c],
      pulse: [0xd0, 0x88, 0x70], // starburst highlight
      sleeping: [0x80, 0x50, 0x40],
      error: [0xff, 0x52, 0x41],
      bg: DARK_WATER,
    },
  },
  gemini: {
    grid: GEMINI_GRID,
    cols: 24,
    rows: 24,
    role: { 1: 'body', 2: 'marking' },
    palette: {
      body: [0x5b, 0x8d, 0xef], // Gemini blue
      accent: [0xa9, 0x70, 0xff], // violet
      eye: [0x10, 0x08, 0x08],
      marking: [0xe8, 0xf0, 0xff],
      edge: [0x6e, 0x56, 0xd6],
      glow: [0x2a, 0x33, 0x66],
      pulse: [0xc9, 0xb6, 0xff],
      sleeping: [0x33, 0x3a, 0x5a],
      error: [0xff, 0x52, 0x41],
      bg: DARK_WATER,
    },
  },
  openclaw: {
    grid: OPENCLAW_GRID,
    cols: 24,
    rows: 24,
    role: { 1: 'body', 2: 'eye', 3: 'accent', 4: 'accent', 5: 'accent', 6: 'accent', 7: 'marking' },
    palette: {
      body: [0xff, 0x4d, 0x4d], // crayfishBody
      accent: [0xcc, 0x44, 0x33], // crayfishClaw (claws + leg tips)
      eye: [0x00, 0xe5, 0xcc], // crayfishEye — teal, OpenClaw's signature colour
      marking: [0xdd, 0x55, 0x55], // crayfishAntenna
      edge: [0xcc, 0x33, 0x33], // crayfishLeg
      glow: [0x80, 0x20, 0x20], // crayfishGlow
      pulse: [0xff, 0x6b, 0x6b], // crayfishRouting
      sleeping: [0x88, 0x66, 0x66], // crayfishSick (desaturated — gateway error look upstream)
      error: [0xff, 0x52, 0x41],
      bg: DARK_WATER,
    },
  },
  opencode: {
    grid: OPENCODE_GRID,
    cols: 24,
    rows: 24,
    role: { 8: 'accent', 9: 'body' },
    palette: {
      body: [0x4b, 0x46, 0x46], // opencodeInner — dark core
      accent: [0xf1, 0xec, 0xec], // opencodeOuter — light frame
      eye: [0x10, 0x08, 0x08], // unused (no eye cells) — required by the shape
      marking: [0xf1, 0xec, 0xec],
      edge: [0xf1, 0xec, 0xec],
      glow: [0x30, 0x2c, 0x2c],
      pulse: [0xcf, 0xce, 0xcd], // opencodePulse
      sleeping: [0x8a, 0x84, 0x84], // opencodeSleeping
      error: [0xff, 0x52, 0x41],
      bg: DARK_WATER,
    },
  },
  kiro: {
    grid: KIRO_GRID,
    cols: 24,
    rows: 24,
    role: { 1: 'body', 2: 'eye', 3: 'accent' },
    palette: {
      // No official upstream colour exists (vector mark only) — a plausible,
      // clearly-generic teal/violet pair, same honesty level as Gemini's spark.
      body: [0x6a, 0x8f, 0xa0],
      accent: [0x4a, 0x6b, 0x7a],
      eye: [0x10, 0x08, 0x08],
      marking: [0xd8, 0xea, 0xef],
      edge: [0x4a, 0x6b, 0x7a],
      glow: [0x22, 0x36, 0x3d],
      pulse: [0xb0, 0xd8, 0xe5],
      sleeping: [0x38, 0x48, 0x4e],
      error: [0xff, 0x52, 0x41],
      bg: DARK_WATER,
    },
  },
}

function lerp(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t))
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}
function mul(a: RGB, k: number): RGB {
  return [Math.round(a[0] * k), Math.round(a[1] * k), Math.round(a[2] * k)]
}

export interface Anim {
  bobAmp: number
  bobSpeed: number
  pulse: number
  dim: number
  errorTint: boolean
  showGlow: boolean
}

export function animFor(status: ProviderStatus): Anim {
  switch (status) {
    case 'working':
      return { bobAmp: 0.9, bobSpeed: 0.42, pulse: 0.6, dim: 1, errorTint: false, showGlow: true }
    case 'approval':
      return { bobAmp: 0.7, bobSpeed: 0.7, pulse: 1, dim: 1, errorTint: false, showGlow: true }
    case 'input':
    case 'review':
      return { bobAmp: 0.6, bobSpeed: 0.3, pulse: 0.35, dim: 0.95, errorTint: false, showGlow: true }
    case 'done':
      return { bobAmp: 0.4, bobSpeed: 0.2, pulse: 0.2, dim: 1, errorTint: false, showGlow: true }
    case 'idle':
      return { bobAmp: 0.5, bobSpeed: 0.16, pulse: 0, dim: 0.92, errorTint: false, showGlow: false }
    case 'error':
      return { bobAmp: 0.2, bobSpeed: 0.25, pulse: 0.5, dim: 0.9, errorTint: true, showGlow: true }
    case 'offline':
    default:
      return { bobAmp: 0, bobSpeed: 0, pulse: 0, dim: 0.62, errorTint: false, showGlow: false }
  }
}

// ===== minimal pure-JS PNG encoder (RGBA, zlib) =====

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
export function encodePng(rgba: Buffer, w: number, h: number): string {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]).toString(
    'base64',
  )
}

// ===== render =====

export const OUT = 72
const CELL = 3

/**
 * Render a provider's pet for a status + frame → base64 PNG (72×72).
 * Antigravity's rainbow mark doesn't fit the 5-role system — delegate to its
 * own module. (The import at the top of this file is circular with
 * antigravity.ts, which is safe in ESM here: neither module calls the other's
 * exports at top-level/module-eval time, only from inside these functions.)
 */
export function renderPet(provider: ProviderId, status: ProviderStatus, frame: number): string {
  if (provider === 'antigravity') return renderAntigravityPet(status, frame)
  const spec = SPECS[provider]
  const pal = spec.palette
  const a = animFor(status)
  const phase = frame * a.bobSpeed
  const bobCells = Math.round(Math.sin(phase) * a.bobAmp)
  const pulseT = a.pulse * (0.5 + 0.5 * Math.sin(phase * 1.6))

  // Base is the per-status key colour (visibly changes on working/approval/…),
  // brightened a touch by the pulse on active states.
  const base = statusBg(status, frame)
  const bg: RGB = a.showGlow ? lerp(base, pal.pulse, 0.1 + 0.12 * pulseT) : base

  const rgba = Buffer.alloc(OUT * OUT * 4)
  for (let i = 0; i < OUT * OUT; i++) {
    rgba[i * 4] = bg[0]
    rgba[i * 4 + 1] = bg[1]
    rgba[i * 4 + 2] = bg[2]
    rgba[i * 4 + 3] = 255
  }

  const put = (px: number, py: number, col: RGB) => {
    if (px < 0 || py < 0 || px >= OUT || py >= OUT) return
    const idx = (py * OUT + px) * 4
    rgba[idx] = col[0]
    rgba[idx + 1] = col[1]
    rgba[idx + 2] = col[2]
  }

  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const v = spec.grid[gy][gx]
      if (!v) continue
      const drawY = gy + bobCells
      const role: Role = spec.role[v] ?? 'body'

      let col: RGB
      switch (role) {
        case 'eye':
          col = pal.eye // eyes stay dark, don't pulse
          break
        case 'marking':
          col = mul(pal.marking, a.dim)
          break
        case 'edge':
          col = mul(lerp(pal.edge, pal.pulse, pulseT * 0.6), a.dim)
          break
        case 'accent':
          col = mul(a.errorTint ? pal.error : pal.accent, a.dim)
          break
        case 'body':
        default:
          col = mul(lerp(a.errorTint ? pal.error : pal.body, pal.pulse, pulseT), a.dim)
          break
      }
      // Long-idle / offline desaturate toward the sleeping tone.
      if (status === 'offline') col = mul(lerp(col, pal.sleeping, 0.6), 1)

      for (let dy = 0; dy < CELL; dy++)
        for (let dx = 0; dx < CELL; dx++) put(gx * CELL + dx, drawY * CELL + dy, col)
    }
  }

  return encodePng(rgba, OUT, OUT)
}

/**
 * Draw a provider's creature into an existing RGBA buffer at (ox,oy) with the
 * given `cell` pixel size (grid is 24×24 cells). Used by the rich tile.
 * Draws creature pixels only (no background); alpha stays opaque.
 */
export function drawCreatureInto(
  dst: Buffer,
  dw: number,
  dh: number,
  provider: ProviderId,
  status: ProviderStatus,
  frame: number,
  ox: number,
  oy: number,
  cell: number,
): void {
  if (provider === 'antigravity') {
    drawAntigravityInto(dst, dw, dh, status, frame, ox, oy, 24 * cell)
    return
  }
  const spec = SPECS[provider]
  const pal = spec.palette
  const a = animFor(status)
  const phase = frame * a.bobSpeed
  const bob = Math.round(Math.sin(phase) * a.bobAmp)
  const pulseT = a.pulse * (0.5 + 0.5 * Math.sin(phase * 1.6))

  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const v = spec.grid[gy][gx]
      if (!v) continue
      const role = spec.role[v] ?? 'body'
      let col: RGB
      switch (role) {
        case 'eye':
          col = pal.eye
          break
        case 'marking':
          col = mul(pal.marking, a.dim)
          break
        case 'edge':
          col = mul(lerp(pal.edge, pal.pulse, pulseT * 0.6), a.dim)
          break
        case 'accent':
          col = mul(a.errorTint ? pal.error : pal.accent, a.dim)
          break
        default:
          col = mul(lerp(a.errorTint ? pal.error : pal.body, pal.pulse, pulseT), a.dim)
      }
      if (status === 'offline') col = lerp(col, pal.sleeping, 0.6)

      const px0 = Math.round(ox + gx * cell)
      const py0 = Math.round(oy + (gy + bob) * cell)
      const px1 = Math.round(ox + (gx + 1) * cell)
      const py1 = Math.round(oy + (gy + 1 + bob) * cell)
      for (let py = py0; py < py1; py++) {
        if (py < 0 || py >= dh) continue
        for (let px = px0; px < px1; px++) {
          if (px < 0 || px >= dw) continue
          const d = (py * dw + px) * 4
          dst[d] = col[0]
          dst[d + 1] = col[1]
          dst[d + 2] = col[2]
          dst[d + 3] = 255
        }
      }
    }
  }
}

/** Back-compat helper. */
export function renderCodexPet(status: ProviderStatus, frame: number): string {
  return renderPet('codex', status, frame)
}

export const PET_FRAME_MS = 150
