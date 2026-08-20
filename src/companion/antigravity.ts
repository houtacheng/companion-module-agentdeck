import type { ProviderStatus } from '../state/stateMapper.js'
import { encodePng, animFor, statusBg, OUT } from './pet.js'

/**
 * Antigravity — the "rainbow peak/arc" mark. Unlike every other AgentDeck
 * creature (a 1–2 colour body drawn from a small role palette), Antigravity's
 * upstream art is a 10-hue letter-coded grid (`ANTIGRAVITY_GRID` +
 * `antigravityCellColor` in `bridge/src/pixoo/pixoo-sprites.ts`), so it gets
 * its own module instead of forcing a 5-role `PetSpec` to grow ten palette
 * slots. Grid + letter→hue mapping transcribed verbatim from upstream; hues
 * are the *reference* tone (session-index 0) since Companion has no concept
 * of "which of several same-provider sessions is this swatch for".
 */

type RGB = [number, number, number]

// 11×11 letter grid, verbatim from upstream ANTIGRAVITY_GRID.
const GRID: string[] = [
  '....YOO....',
  '....YOO....',
  '...LYOOR...',
  '...LTORR...',
  '..LLTVPP...',
  '..TTKKVPP..',
  '.TQQK.KVU..',
  '.QQK...KUU.',
  'NQK.....KUU',
  'NN.......UU',
  '...........',
].map((row) => row.slice(0, 11)) // guard against any accidental trailing char
const COLS = 11
const ROWS = 11

// COLORS.antigravity* — reference (tone=1) hues.
const PALETTE: Record<string, RGB> = {
  L: [0x5c, 0xd6, 0x4d], // lime
  T: [0x1f, 0xc6, 0xb3], // teal
  Q: [0x3a, 0xc7, 0xeb], // cyan
  Y: [0xf5, 0xcb, 0x24], // yellow
  O: [0xff, 0x84, 0x10], // orange
  R: [0xff, 0x52, 0x41], // red
  P: [0xb7, 0x5c, 0xb6], // pink
  V: [0x66, 0x6f, 0xe1], // violet
  U: [0x24, 0x7e, 0xff], // blue
  N: [0x29, 0xb8, 0xee], // sky
  // 'K' = cutout (a hole in the mark — never drawn, background shows through)
  // '.' = empty
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

const SLEEPING: RGB = [0x3a, 0x3c, 0x48]
const ERROR: RGB = [0xff, 0x52, 0x41]

/** Per-status colour transform (dim, error tint, offline desaturation) applied
 *  uniformly to every hue cell so the whole mark still reads as "one status"
 *  rather than ten independently-animated chips. */
function tint(base: RGB, status: ProviderStatus, a: ReturnType<typeof animFor>): RGB {
  let col = a.errorTint ? lerp(base, ERROR, 0.6) : base
  col = mul(col, a.dim)
  if (status === 'offline') col = lerp(col, SLEEPING, 0.6)
  return col
}

/** Render the Antigravity pet for a status + frame → base64 PNG (72×72). */
export function renderAntigravityPet(status: ProviderStatus, frame: number): string {
  const a = animFor(status)
  const phase = frame * a.bobSpeed
  const bob = Math.round(Math.sin(phase) * a.bobAmp)
  const cell = OUT / COLS

  const bg = statusBg(status, frame)
  const rgba = Buffer.alloc(OUT * OUT * 4)
  for (let i = 0; i < OUT * OUT; i++) {
    rgba[i * 4] = bg[0]
    rgba[i * 4 + 1] = bg[1]
    rgba[i * 4 + 2] = bg[2]
    rgba[i * 4 + 3] = 255
  }

  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS; gx++) {
      const ch = GRID[gy][gx]
      const base = PALETTE[ch]
      if (!base) continue // '.' empty or 'K' cutout — both skip
      const col = tint(base, status, a)
      const px0 = Math.round(gx * cell)
      const px1 = Math.round((gx + 1) * cell)
      const py0 = Math.round((gy + bob) * cell)
      const py1 = Math.round((gy + 1 + bob) * cell)
      for (let py = py0; py < py1; py++) {
        if (py < 0 || py >= OUT) continue
        for (let px = px0; px < px1; px++) {
          if (px < 0 || px >= OUT) continue
          const d = (py * OUT + px) * 4
          rgba[d] = col[0]
          rgba[d + 1] = col[1]
          rgba[d + 2] = col[2]
        }
      }
    }
  }

  return encodePng(rgba, OUT, OUT)
}

/**
 * Draw the Antigravity mark into an EXISTING RGBA buffer at (ox,oy) sized to
 * `boxSize`×`boxSize` — used by the "official look" rich tile, mirroring
 * `drawCreatureInto`'s signature/contract (opaque pixels only, no background
 * of its own).
 */
export function drawAntigravityInto(
  dst: Buffer,
  dw: number,
  dh: number,
  status: ProviderStatus,
  frame: number,
  ox: number,
  oy: number,
  boxSize: number,
): void {
  const a = animFor(status)
  const phase = frame * a.bobSpeed
  const cell = boxSize / COLS
  const bob = Math.round(Math.sin(phase) * a.bobAmp)
  const oxI = Math.round(ox)
  const oyI = Math.round(oy)

  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS; gx++) {
      const ch = GRID[gy][gx]
      const base = PALETTE[ch]
      if (!base) continue
      const col = tint(base, status, a)
      const px0 = oxI + Math.round(gx * cell)
      const px1 = oxI + Math.round((gx + 1) * cell)
      const py0 = oyI + Math.round((gy + bob) * cell)
      const py1 = oyI + Math.round((gy + 1 + bob) * cell)
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
