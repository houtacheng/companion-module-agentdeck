#!/usr/bin/env node
/**
 * embed-codex-pet — slice a Codex custom avatar ("pet") spritesheet into the
 * poses this module renders and embed them (gzip+base64) into
 * src/companion/baimi-frames.generated.ts.
 *
 * Usage:
 *   node scripts/embed-codex-pet.mjs [petId|path] [--from-config]
 *
 *   node scripts/embed-codex-pet.mjs baimi        # ~/.codex/pets/baimi
 *   node scripts/embed-codex-pet.mjs ~/.codex/pets/mimi
 *   node scripts/embed-codex-pet.mjs --from-config # read selected-avatar-id
 *
 * Requires macOS `sips` for WebP decode (Codex spritesheets are .webp). If you
 * are not on macOS, convert spritesheet.webp → spritesheet.png yourself first
 * (e.g. `dwebp`/`cwebp` or ImageMagick) and the script will pick up the PNG.
 *
 * Grid: Codex spriteVersion-2 sheets are a fixed 8-col grid of 192×208 cells.
 * The pose→cell map below matches that layout; adjust POSES if a future sprite
 * version reorders its rows.
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'
import { inflateSync, gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const OUT = 72 // button pixels
const ALPHA_T = 24 // alpha threshold for content detection
// pose name → [rowIndex, colIndex] into the sheet's DETECTED content grid
// (spriteVersion 2). Cells are found by alpha gaps, not a fixed pitch, so
// irregular row heights don't cause mis-slicing.
const POSES = {
  idle: [0, 0], // sitting
  working: [4, 3], // prowling / catching
  approval: [6, 0], // holding a sign (awaiting you)
  done: [8, 3], // paw up / wave
}

const here = fileURLToPath(new URL('.', import.meta.url))
const GEN_FILE = join(here, '..', 'src', 'companion', 'baimi-frames.generated.ts')

function expandHome(p) {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p
}

function resolvePetDir(arg) {
  if (arg === '--from-config') {
    const cfg = join(homedir(), '.codex', 'config.toml')
    const txt = existsSync(cfg) ? readFileSync(cfg, 'utf-8') : ''
    const m = txt.match(/selected-avatar-id\s*=\s*"custom:([^"]+)"/)
    if (!m) throw new Error('No custom avatar selected in ~/.codex/config.toml (selected-avatar-id).')
    return join(homedir(), '.codex', 'pets', m[1])
  }
  if (!arg) return join(homedir(), '.codex', 'pets', 'baimi')
  const p = expandHome(arg)
  if (isAbsolute(p) || p.includes('/')) return p
  return join(homedir(), '.codex', 'pets', p)
}

// ---- minimal PNG decoder (8-bit, colortype 2/6, filters 0–4) ----
function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}
function decodePng(buf) {
  let p = 8
  let w = 0
  let h = 0
  let ct = 0
  let bd = 0
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      bd = data[8]
      ct = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    p += 12 + len
  }
  if (bd !== 8) throw new Error('unsupported bit depth ' + bd)
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0
  if (!ch) throw new Error('unsupported colour type ' + ct)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(w * h * 4)
  const cur = Buffer.alloc(stride)
  const prev = Buffer.alloc(stride)
  let o = 0
  for (let y = 0; y < h; y++) {
    const ft = raw[o++]
    for (let x = 0; x < stride; x++) {
      const rv = raw[o + x]
      const a = x >= ch ? cur[x - ch] : 0
      const b = prev[x]
      const c = x >= ch ? prev[x - ch] : 0
      let v
      switch (ft) {
        case 0: v = rv; break
        case 1: v = rv + a; break
        case 2: v = rv + b; break
        case 3: v = rv + ((a + b) >> 1); break
        case 4: v = rv + paeth(a, b, c); break
        default: throw new Error('unsupported filter ' + ft)
      }
      cur[x] = v & 0xff
    }
    o += stride
    for (let x = 0; x < w; x++) {
      const s = x * ch
      const d = (y * w + x) * 4
      if (ch === 4) {
        out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; out[d + 3] = cur[s + 3]
      } else {
        out[d] = cur[s]; out[d + 1] = cur[s + 1] ?? cur[s]; out[d + 2] = cur[s + 2] ?? cur[s]; out[d + 3] = 255
      }
    }
    cur.copy(prev)
  }
  return { w, h, rgba: out }
}

function haveSips() {
  try { execFileSync('sips', ['--help'], { stdio: 'ignore' }); return true } catch { return false }
}

/** Contiguous runs of `true` in a boolean array → [start,end] inclusive. */
function bands(mask) {
  const b = []
  let s = null
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && s === null) s = i
    if (!mask[i] && s !== null) { b.push([s, i - 1]); s = null }
  }
  if (s !== null) b.push([s, mask.length - 1])
  return b
}

/** Detect the sheet's content grid from alpha: row bands, and per-row col bands. */
function detectGrid(w, h, rgba) {
  const rowHas = new Array(h).fill(false)
  const colHas = new Array(w).fill(false)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > ALPHA_T) { rowHas[y] = true; colHas[x] = true }
    }
  }
  return { rows: bands(rowHas), cols: bands(colHas) }
}

/** Tight content box for one cell of a row band (re-scan that row's columns). */
function cellBox(w, rgba, rowBand, colBand) {
  const [y0, y1] = rowBand
  const [cx0, cx1] = colBand
  let minX = cx1, maxX = cx0, minY = y1, maxY = y0
  for (let y = y0; y <= y1; y++) {
    for (let x = cx0; x <= cx1; x++) {
      if (rgba[(y * w + x) * 4 + 3] > ALPHA_T) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Area-average downscale of a sub-region → dw×dh RGBA (alpha-weighted). */
function downscale(src, sw, box, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4)
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = box.y + Math.floor((dy * box.h) / dh)
    const sy1 = box.y + Math.max(sy0 - box.y + 1, Math.floor(((dy + 1) * box.h) / dh))
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = box.x + Math.floor((dx * box.w) / dw)
      const sx1 = box.x + Math.max(sx0 - box.x + 1, Math.floor(((dx + 1) * box.w) / dw))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
          const s = (y * sw + x) * 4
          const al = src[s + 3]
          r += src[s] * al; g += src[s + 1] * al; b += src[s + 2] * al; a += al; n++
        }
      }
      const d = (dy * dw + dx) * 4
      if (a > 0) { out[d] = Math.round(r / a); out[d + 1] = Math.round(g / a); out[d + 2] = Math.round(b / a) }
      out[d + 3] = n > 0 ? Math.round(a / n) : 0
    }
  }
  return out
}

function main() {
  const arg = process.argv[2]
  const petDir = resolvePetDir(arg)
  if (!existsSync(petDir)) throw new Error('Pet directory not found: ' + petDir)

  const meta = existsSync(join(petDir, 'pet.json'))
    ? JSON.parse(readFileSync(join(petDir, 'pet.json'), 'utf-8'))
    : {}
  const displayName = meta.displayName || meta.id || 'Custom Codex avatar'

  let sheetPng = join(petDir, 'spritesheet.png')
  const tmp = mkdtempSync(join(tmpdir(), 'codexpet-'))
  try {
    if (!existsSync(sheetPng)) {
      const webp = join(petDir, meta.spritesheetPath || 'spritesheet.webp')
      if (!existsSync(webp)) throw new Error('No spritesheet.png or spritesheet.webp in ' + petDir)
      if (!haveSips()) {
        throw new Error(
          'WebP spritesheet needs decoding but macOS `sips` was not found.\n' +
            'Convert it to PNG first, e.g.:  dwebp "' + webp + '" -o "' + sheetPng + '"',
        )
      }
      sheetPng = join(tmp, 'sheet.png')
      execFileSync('sips', ['-s', 'format', 'png', webp, '--out', sheetPng], { stdio: 'ignore' })
    }

    // Decode the whole sheet once and detect its content grid from alpha.
    const sheet = decodePng(readFileSync(sheetPng))
    const grid = detectGrid(sheet.w, sheet.h, sheet.rgba)
    console.log(`  sheet ${sheet.w}x${sheet.h} — ${grid.rows.length} rows × ${grid.cols.length} cols`)

    const frames = {}
    for (const [pose, [row, col]] of Object.entries(POSES)) {
      const rowBand = grid.rows[row]
      const colBand = grid.cols[col]
      if (!rowBand || !colBand) throw new Error(`pose ${pose}: cell [r${row} c${col}] outside detected grid`)
      const box = cellBox(sheet.w, sheet.rgba, rowBand, colBand)
      // Fit longest side to OUT, preserve aspect, center on OUT×OUT.
      const scale = Math.min(OUT / box.w, OUT / box.h)
      const dw = Math.max(1, Math.round(box.w * scale))
      const dh = Math.max(1, Math.round(box.h * scale))
      const small = downscale(sheet.rgba, sheet.w, box, dw, dh)
      const canvas = Buffer.alloc(OUT * OUT * 4)
      const ox = Math.floor((OUT - dw) / 2)
      const oy = Math.floor((OUT - dh) / 2)
      for (let y = 0; y < dh; y++) {
        for (let x = 0; x < dw; x++) {
          const cx = x + ox
          const cy = y + oy
          if (cx < 0 || cy < 0 || cx >= OUT || cy >= OUT) continue
          const s = (y * dw + x) * 4
          const d = (cy * OUT + cx) * 4
          canvas[d] = small[s]; canvas[d + 1] = small[s + 1]; canvas[d + 2] = small[s + 2]; canvas[d + 3] = small[s + 3]
        }
      }
      frames[pose] = gzipSync(canvas).toString('base64')
      console.log(`  ${pose.padEnd(9)} box ${box.w}x${box.h}@(${box.x},${box.y}) → ${dw}x${dh} gz ${frames[pose].length}`)
    }

    const ts =
      `// AUTO-GENERATED by scripts/embed-codex-pet.mjs — DO NOT EDIT.\n` +
      `// Source: Codex custom avatar "${displayName}" (${petDir}).\n` +
      `// Each value is gzip(base64) of a ${OUT}x${OUT} RGBA buffer (pet on transparent bg).\n` +
      `export const BAIMI_SIZE = ${OUT}\n` +
      `export const BAIMI_NAME = ${JSON.stringify(displayName)}\n` +
      `export const BAIMI_FRAMES: Record<string, string> = {\n` +
      Object.keys(POSES).map((s) => `  ${s}: '${frames[s]}',`).join('\n') +
      `\n}\n`
    writeFileSync(GEN_FILE, ts)
    console.log(`\nEmbedded "${displayName}" → ${GEN_FILE}`)
    console.log('Now rebuild:  npm run build && npm run package')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

try {
  main()
} catch (err) {
  console.error('embed-codex-pet failed:', err.message)
  process.exit(1)
}
