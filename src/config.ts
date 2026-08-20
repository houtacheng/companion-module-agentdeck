import type { SomeCompanionConfigField } from '@companion-module/base'
import { Regex } from '@companion-module/base'
import { BRIDGE_WS_PORT } from './agentdeck/protocol.js'

export interface ModuleConfig {
  host: string
  port: number
  token: string
  reconnect: boolean
}

export const DEFAULT_CONFIG: ModuleConfig = {
  host: '127.0.0.1',
  port: BRIDGE_WS_PORT,
  token: '',
  reconnect: true,
}

export function getConfigFields(): SomeCompanionConfigField[] {
  return [
    {
      type: 'static-text',
      id: 'info',
      width: 12,
      label: 'AgentDeck daemon',
      value:
        'Connects to a running AgentDeck daemon (default port 9120). ' +
        'On the same machine no token is needed. For a remote daemon, enter the pairing token.',
    },
    {
      type: 'textinput',
      id: 'host',
      width: 6,
      label: 'Host',
      default: DEFAULT_CONFIG.host,
      regex: Regex.HOSTNAME,
    },
    {
      type: 'number',
      id: 'port',
      width: 3,
      label: 'Port',
      default: DEFAULT_CONFIG.port,
      min: 1,
      max: 65535,
    },
    {
      type: 'checkbox',
      id: 'reconnect',
      width: 3,
      label: 'Auto-reconnect',
      default: DEFAULT_CONFIG.reconnect,
    },
    {
      type: 'textinput',
      id: 'token',
      width: 12,
      label: 'Auth Token (remote daemons only — leave blank for localhost)',
      default: DEFAULT_CONFIG.token,
    },
  ]
}

export function normalizeConfig(raw: Partial<ModuleConfig> | undefined): ModuleConfig {
  return {
    host: (raw?.host ?? DEFAULT_CONFIG.host) || DEFAULT_CONFIG.host,
    port: Number(raw?.port) > 0 ? Number(raw?.port) : DEFAULT_CONFIG.port,
    token: (raw?.token ?? '').trim(),
    reconnect: raw?.reconnect ?? DEFAULT_CONFIG.reconnect,
  }
}
