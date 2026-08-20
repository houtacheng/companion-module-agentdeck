import { EventEmitter } from 'events'
import WebSocket from 'ws'
import type { SessionInfo, OutgoingCommand, BridgeEnvelope, UsageEvent } from './protocol.js'
import { Backoff } from '../util/reconnect.js'

export interface ConnectionConfig {
  host: string
  port: number
  /** Auth token — only required for REMOTE peers. Local (loopback/own-LAN) peers
   *  need none (verified against upstream bridge/src/auth.ts + ws-server.ts). */
  token?: string
  reconnect: boolean
}

export type LogFn = (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void

// Mirrors upstream client watchdog windows (shared/src/protocol.ts).
const PING_ACTIVITY_TIMEOUT_MS = 30_000
const STALE_TIMEOUT_MS = 20_000
const WATCHDOG_INTERVAL_MS = 5_000

/**
 * AgentDeck daemon WebSocket client (spec §6). Owns: connect, auth, reconnect,
 * message parsing, connection status. Emits parsed domain events only — no other
 * component touches raw frames (spec §26).
 *
 * Events:
 *   'connected'                    — socket open + registered
 *   'disconnected'                 — socket closed (was connected)
 *   'sessions_list'  (SessionInfo[])
 *   'daemon_connection' (status)   — the daemon's own `connection` event
 *   'stale-changed'  (boolean)
 *   'usage_update'   (UsageEvent)  — Claude 5h/7d/scoped + Codex rate limits
 */
export class AgentDeckConnection extends EventEmitter {
  private ws: WebSocket | null = null
  private config: ConnectionConfig
  private log: LogFn
  private connected = false
  private stale = false
  private closing = false
  private generation = 0
  private backoff = new Backoff()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private watchdog: ReturnType<typeof setInterval> | null = null
  private lastActivityAt = 0

  constructor(config: ConnectionConfig, log: LogFn) {
    super()
    this.config = config
    this.log = log
  }

  isConnected(): boolean {
    return this.connected
  }

  isStale(): boolean {
    return this.connected && this.stale
  }

  /** Build the ws URL. Token is appended only when provided (remote peers). */
  private buildUrl(): string {
    const base = `ws://${this.config.host}:${this.config.port}`
    const token = (this.config.token ?? '').trim()
    // clientType tag helps the daemon attribute this surface (ws-server.ts).
    const params = new URLSearchParams({ clientType: 'companion' })
    if (token) params.set('token', token)
    return `${base}?${params.toString()}`
  }

  start(): void {
    this.closing = false
    this.generation++
    this.backoff.reset()
    this.attempt(this.generation)
  }

  /** Reconnect with (possibly) new config — invalidates any in-flight socket. */
  restartWith(config: ConnectionConfig): void {
    this.config = config
    this.stop(false)
    this.start()
  }

  stop(emitDisconnect = true): void {
    this.closing = true
    this.generation++
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopWatchdog()
    if (this.ws) {
      this.ws.removeAllListeners()
      try {
        this.ws.close()
      } catch {
        /* already gone */
      }
      this.ws = null
    }
    const was = this.connected
    this.connected = false
    this.setStale(false)
    if (was && emitDisconnect) this.emit('disconnected')
  }

  send(command: OutgoingCommand): boolean {
    if (this.ws && this.connected) {
      try {
        this.ws.send(JSON.stringify(command))
        this.log('debug', `sent ${command.type}`)
        return true
      } catch (err) {
        this.log('warn', `send(${command.type}) failed: ${String(err)}`)
        return false
      }
    }
    this.log('warn', `send(${command.type}) dropped — not connected`)
    return false
  }

  private scheduleReconnect(gen: number): void {
    if (this.closing || !this.config.reconnect) return
    if (gen !== this.generation) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    const delay = this.backoff.next()
    this.log('debug', `reconnect in ${delay}ms`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (gen !== this.generation || this.closing) return
      this.attempt(gen)
    }, delay)
  }

  private attempt(gen: number): void {
    if (gen !== this.generation || this.closing) return
    const url = this.buildUrl()
    // Never log the token.
    this.log('debug', `connecting ws://${this.config.host}:${this.config.port}`)
    try {
      const ws = new WebSocket(url)
      this.ws = ws

      ws.on('open', () => {
        if (gen !== this.generation) return
        this.connected = true
        this.backoff.reset()
        this.markActivity()
        this.startWatchdog(gen)
        // Announce ourselves so the daemon rosters this surface (spec/protocol
        // ClientRegisterCommand).
        this.send({
          type: 'client_register',
          clientType: 'companion',
          clientLabel: 'Bitfocus Companion — AgentDeck',
        })
        // Mirrors the official Stream Deck+ usage dial's fireUsageRefresh() on
        // connect — without this the usage gauges stay blank until the daemon's
        // own poll cycle happens to push one.
        this.send({ type: 'query_usage' })
        this.log('info', 'AgentDeck connected')
        this.emit('connected')
      })

      ws.on('ping', () => this.markActivity())
      ws.on('pong', () => this.markActivity())

      ws.on('message', (data) => {
        if (gen !== this.generation) return
        this.markActivity()
        this.handleMessage(data)
      })

      ws.on('close', (code) => {
        if (gen !== this.generation) return
        const was = this.connected
        this.connected = false
        this.setStale(false)
        this.stopWatchdog()
        if (code === 4001) {
          this.log('error', 'AgentDeck rejected the connection (4001 Unauthorized) — check the Auth Token')
        }
        if (was) {
          this.log('info', 'AgentDeck disconnected')
          this.emit('disconnected')
        }
        this.ws = null
        this.scheduleReconnect(gen)
      })

      ws.on('error', (err) => {
        if (gen !== this.generation) return
        this.log('debug', `ws error: ${err.message}`)
        // 'close' follows and drives reconnect.
      })
    } catch (err) {
      this.log('debug', `connect exception: ${String(err)}`)
      this.scheduleReconnect(gen)
    }
  }

  private handleMessage(data: WebSocket.RawData): void {
    // Any malformed event is logged and ignored — never crash the module (spec §36).
    let msg: BridgeEnvelope
    try {
      msg = JSON.parse(data.toString()) as BridgeEnvelope
    } catch (err) {
      this.log('warn', `dropped malformed frame: ${String(err)}`)
      return
    }
    if (!msg || typeof msg.type !== 'string') {
      this.log('warn', 'dropped frame with no type')
      return
    }

    switch (msg.type) {
      case 'sessions_list': {
        const rawSessions = (msg as { sessions?: unknown }).sessions
        const sessions = Array.isArray(rawSessions) ? (rawSessions as SessionInfo[]) : []
        this.emit('sessions_list', sessions)
        break
      }
      case 'connection': {
        this.emit('daemon_connection', (msg as { status?: string }).status)
        break
      }
      case 'usage_update': {
        this.emit('usage_update', msg as unknown as UsageEvent)
        break
      }
      default:
        // Every other event (timeline/esp32/voice/…) is intentionally ignored.
        break
    }
  }

  private markActivity(): void {
    this.lastActivityAt = Date.now()
    this.setStale(false)
  }

  private setStale(stale: boolean): void {
    if (this.stale === stale) return
    this.stale = stale
    this.emit('stale-changed', stale)
  }

  private startWatchdog(gen: number): void {
    this.stopWatchdog()
    this.watchdog = setInterval(() => {
      if (gen !== this.generation || !this.connected) return
      const elapsed = Date.now() - this.lastActivityAt
      if (elapsed > PING_ACTIVITY_TIMEOUT_MS) {
        this.log('warn', `no activity for ${elapsed}ms — terminating`)
        try {
          this.ws?.terminate()
        } catch {
          /* ignore */
        }
      } else if (elapsed > STALE_TIMEOUT_MS) {
        this.setStale(true)
      }
    }, WATCHDOG_INTERVAL_MS)
  }

  private stopWatchdog(): void {
    if (this.watchdog) {
      clearInterval(this.watchdog)
      this.watchdog = null
    }
  }
}
