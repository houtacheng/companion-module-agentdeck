/**
 * macOS system control — ports the official Stream Deck+ plugin's E1 Volume
 * dial and E4 Launcher dial, which are pure local OS actions (no daemon
 * round trip; see `plugin/src/system/darwin.ts` upstream). Companion runs on
 * the same Mac as the physical deck would, so `osascript`/`open` work the
 * same way here. Windows is not supported (this module targets macOS only).
 */
import { execFile } from 'node:child_process'

function osascript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 5000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout.trim())
    })
  })
}

export interface VolumeSettings {
  outputVolume: number
  outputMuted: boolean
}

export async function getVolumeSettings(): Promise<VolumeSettings> {
  const raw = await osascript('get volume settings')
  const num = (key: string): number | null => {
    const m = new RegExp(`${key}:(\\d+)`).exec(raw)
    return m ? parseInt(m[1], 10) : null
  }
  return {
    outputVolume: num('output volume') ?? 0,
    outputMuted: /output muted:true/.test(raw),
  }
}

export async function setVolumeNow(vol: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(vol)))
  await osascript(`set volume output volume ${clamped}`)
}

export async function setOutputMuted(muted: boolean): Promise<void> {
  await osascript(`set volume output muted ${muted}`)
}

/** Relative volume step (mirrors the E1 dial's rotate-to-adjust). */
export async function adjustVolume(deltaTicks: number): Promise<void> {
  const current = await getVolumeSettings()
  await setVolumeNow(current.outputVolume + deltaTicks)
}

/** Toggle mute (mirrors the E1 dial's press). */
export async function toggleMute(): Promise<void> {
  const current = await getVolumeSettings()
  await setOutputMuted(!current.outputMuted)
}

/** Open a URL (new tab) — simplified from upstream's existing-tab search. */
export function openUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('open', [url], { timeout: 3000 }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

/** Launch or focus a desktop app by name (`open -a`). Rejects if not installed. */
export function openApp(appName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('open', ['-a', appName], { timeout: 5000 }, (err) => {
      if (err) reject(new Error(`Cannot open "${appName}": ${err.message}`))
      else resolve()
    })
  })
}

export async function openAgentDeckAppOrGitHub(): Promise<void> {
  const opened = await new Promise<boolean>((resolve) => {
    execFile('open', ['-a', 'AgentDeck'], { timeout: 3000 }, (err) => resolve(!err))
  })
  if (opened) return
  await openUrl('https://puritysb.github.io/AgentDeck/')
}

/** E4 Launcher dial fallback chains — verbatim from upstream `launch-targets.ts`. */
export const LAUNCH_TARGETS: Record<string, string> = {
  claude: 'app:Claude|url:https://claude.ai',
  codex: 'app:Codex|url:https://chatgpt.com/codex/cloud',
  openclaw: 'url:http://127.0.0.1:18789',
}

async function runStep(step: string): Promise<void> {
  if (step.startsWith('url:')) return openUrl(step.slice(4))
  if (step.startsWith('app:')) return openApp(step.slice(4))
  throw new Error(`Unrecognized launch target: ${step}`)
}

/** Walk the `|`-separated fallback chain, surfacing the last failure if every step fails. */
export async function runLaunchTarget(target: string): Promise<void> {
  const steps = target.split('|').map((t) => t.trim()).filter(Boolean)
  if (steps.length === 0) throw new Error('Empty launch target')
  let lastErr: unknown
  for (const step of steps) {
    try {
      await runStep(step)
      return
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
