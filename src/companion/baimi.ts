import { gunzipSync } from 'node:zlib'
import type { ProviderStatus } from '../state/stateMapper.js'
import { encodePng, animFor, OUT, statusBg } from './pet.js'
import { BAIMI_FRAMES, BAIMI_SIZE } from './baimi-frames.generated.js'

/**
 * "白咪 (baimi)" — the user's custom Codex avatar/pet.
 *
 * Source: the Codex CLI custom-avatar feature. Art comes from
 * `~/.codex/pets/baimi/spritesheet.webp`; four representative poses were sliced,
 * downscaled to 72×72 RGBA and embedded (gzip+base64) in
 * `baimi-frames.generated.ts`. Rendered here on the same dark "water" ground as
 * the built-in pets, with a gentle bob + status glow so it reacts to Codex
 * state. One pose per state (spec decision) — offline/error reuse the idle pose
 * dimmed / red-tinted.
 */

type RGB = [number, number, number]
const HILITE: RGB = [0xa8, 0xc0, 0xd0] // cool highlight for the pulse brighten
const ERROR: RGB = [0xff, 0x52, 0x41]

/** ProviderStatus → which baked pose to show. */
function poseFor(status: ProviderStatus): keyof typeof BAIMI_FRAMES {
  switch (status) {
    case 'working':
      return 'working'
    case 'review':
      return 'working'
    case 'approval':
      return 'approval'
    case 'input':
      return 'approval'
    case 'done':
      return 'done'
    case 'idle':
    case 'offline':
    case 'error':
    default:
      return 'idle'
  }
}

// Decode each frame's RGBA once.
const frameCache = new Map<string, Buffer>()
function frameRgba(pose: string): Buffer | null {
  const cached = frameCache.get(pose)
  if (cached) return cached
  const b64 = BAIMI_FRAMES[pose]
  if (!b64) return null
  try {
    const rgba = gunzipSync(Buffer.from(b64, 'base64'))
    frameCache.set(pose, rgba)
    return rgba
  } catch {
    return null
  }
}

function lerp(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t))
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}

/** Per-pixel colour transform for one 白咪 frame pixel (dim + error tint),
 *  shared by the standalone pet render and the tile compositor. */
function tintPixel(r: number, g: number, b: number, a: ReturnType<typeof animFor>): [number, number, number] {
  if (a.dim !== 1) {
    r = Math.round(r * a.dim)
    g = Math.round(g * a.dim)
    b = Math.round(b * a.dim)
  }
  if (a.errorTint) {
    r = Math.round(r * 0.5 + ERROR[0] * 0.5)
    g = Math.round(g * 0.5 + ERROR[1] * 0.5)
    b = Math.round(b * 0.5 + ERROR[2] * 0.5)
  }
  return [r, g, b]
}

/** Render 白咪 for a Codex status + animation frame → base64 PNG (72×72). */
export function renderBaimi(status: ProviderStatus, frame: number): string {
  const a = animFor(status)
  const pose = poseFor(status)
  const cat = frameRgba(pose)
  const phase = frame * a.bobSpeed
  const bob = Math.round(Math.sin(phase) * a.bobAmp * 2) // px
  const pulseT = a.pulse * (0.5 + 0.5 * Math.sin(phase * 1.6))

  // Per-status key background (visibly changes on working/approval/…).
  const base = statusBg(status, frame)
  const bg: RGB = a.showGlow ? lerp(base, HILITE, 0.08 + 0.12 * pulseT) : base

  const out = Buffer.alloc(OUT * OUT * 4)
  for (let i = 0; i < OUT * OUT; i++) {
    out[i * 4] = bg[0]
    out[i * 4 + 1] = bg[1]
    out[i * 4 + 2] = bg[2]
    out[i * 4 + 3] = 255
  }

  if (cat && BAIMI_SIZE === OUT) {
    for (let y = 0; y < OUT; y++) {
      const sy = y - bob // sample from shifted source → visual bob
      if (sy < 0 || sy >= OUT) continue
      for (let x = 0; x < OUT; x++) {
        const s = (sy * OUT + x) * 4
        const alpha = cat[s + 3]
        if (!alpha) continue
        const [r, g, b] = tintPixel(cat[s], cat[s + 1], cat[s + 2], a)
        const d = (y * OUT + x) * 4
        const t = alpha / 255
        out[d] = Math.round(r * t + bg[0] * (1 - t))
        out[d + 1] = Math.round(g * t + bg[1] * (1 - t))
        out[d + 2] = Math.round(b * t + bg[2] * (1 - t))
      }
    }
  }

  return encodePng(out, OUT, OUT)
}

/**
 * Composite 白咪 into an EXISTING RGBA buffer (no background of its own) —
 * used by the "official look" rich tile so Codex's tile can show the user's
 * custom avatar instead of the built-in cloud creature. Scales the 72×72
 * source frame to `boxSize`×`boxSize`, alpha-blends it at (ox,oy), and applies
 * the same bob/dim/error-tint as the standalone pet.
 */
export function compositeBaimiInto(
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
  const cat = frameRgba(poseFor(status))
  if (!cat) return
  const phase = frame * a.bobSpeed
  const boxI = Math.round(boxSize)
  const oxI = Math.round(ox)
  const oyI = Math.round(oy)
  const bob = Math.round(Math.sin(phase) * a.bobAmp * (boxI / OUT) * 2)
  const scale = boxI / BAIMI_SIZE

  for (let dy = 0; dy < boxI; dy++) {
    const sy = Math.floor(dy / scale) - Math.round(bob / scale)
    if (sy < 0 || sy >= BAIMI_SIZE) continue
    const py = oyI + dy
    if (py < 0 || py >= dh) continue
    for (let dx = 0; dx < boxI; dx++) {
      const sx = Math.floor(dx / scale)
      if (sx < 0 || sx >= BAIMI_SIZE) continue
      const s = (sy * BAIMI_SIZE + sx) * 4
      const alpha = cat[s + 3]
      if (!alpha) continue
      const px = oxI + dx
      if (px < 0 || px >= dw) continue
      const [r, g, b] = tintPixel(cat[s], cat[s + 1], cat[s + 2], a)
      const d = (py * dw + px) * 4
      const t = alpha / 255
      dst[d] = Math.round(r * t + dst[d] * (1 - t))
      dst[d + 1] = Math.round(g * t + dst[d + 1] * (1 - t))
      dst[d + 2] = Math.round(b * t + dst[d + 2] * (1 - t))
      dst[d + 3] = Math.max(dst[d + 3], Math.round(255 * t))
    }
  }
}
