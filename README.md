# companion-module-agentdeck

A [Bitfocus Companion](https://bitfocus.io/companion) module (Companion 5.x) that
puts your AgentDeck AI coding agents on a fixed **2×3 AI Control Surface** —
per-provider status for **Codex / Claude / Gemini**, a **global approval
queue**, animated status **pets**, and per-session info variables — plus full
support (status, approval, pets, tiles) for every other AgentDeck-supported
agent: **OpenClaw, OpenCode, Antigravity, Kiro**.

Connects **only** to the AgentDeck daemon (default `127.0.0.1:9120`) over
WebSocket — never to any agent directly, and does no terminal scraping, key
simulation, or session discovery (that all lives in AgentDeck).

Current version: **1.16.0** · built against `@companion-module/base` 2.x.

Unofficial community module — not affiliated with or distributed by the
AgentDeck project. Maintenance, distribution, and issue triage for this
module live in this repo; see [AgentDeck](https://github.com/puritysb/AgentDeck)
for the daemon itself.

## Features

- **2×3 AI Control Surface** — Row 1: Codex / Claude / Gemini status (press to
  select that provider's approval). Row 2: Approve Once / Approve Session /
  Reject the single global active approval, with auto-advance.
- **All AgentDeck agents supported** — OpenClaw, OpenCode, Antigravity, and Kiro
  each get their own status/pet/tile/info presets and feed the same global
  approval queue; drag them onto a page to extend past the fixed 2×3 core.
- **Rotary option navigation** — ports AgentDeck's Stream Deck+ dial pattern
  (rotate to highlight, press to select) to a managed session's live
  multi-option prompt (e.g. `AskUserQuestion`).
- **Global approval queue** — actionable-first ordering, capability-gated buttons
  (`OBSERVED ≠ ACTIONABLE`); Approve Session only where a managed `yes_no_always`
  prompt truly supports it. Decisions target a specific `sessionId`+`requestId`
  and wait for the daemon's own confirmation.
- **Animated pets** — Codex cloud, Claude octopus, OpenClaw crayfish, OpenCode
  nested ring, Antigravity rainbow mark (all upstream art), plus Gemini spark
  and Kiro ghost (honest placeholders — no upstream pixel art exists for
  those two). Each reacts to status; **the key background colour changes with
  state** (teal while working, amber on approval, red on error, …).
- **Custom Codex avatar** — the Codex CLI "pet" (`~/.codex/pets/<id>`) can be
  embedded as a selectable *skin* (see the tool below). Ships with 白咪.
- **Session info variables** — per provider: status, session/working/approval
  counts, active project, model, effort, current tool, activity, context %,
  total tokens, elapsed; plus a ready-made **Session Info** preset.
- **Reconnect-safe** — backoff ladder, stale detection, and full approval-state
  invalidation on disconnect.

## Install into Companion 5.x

Import the packaged `agentdeck-<version>.tgz` (root of this folder, newest wins),
or point Companion's *Developer modules path* at this folder after `npm run build`.

Connection config: **Host / Port / Token**. Localhost needs no token; a remote
daemon needs its pairing token. See [`companion/HELP.md`](companion/HELP.md) for
the full guide (2×3 preset, pets, approval safety, troubleshooting).

## Build / develop

```bash
npm install
npm run build      # → dist/main.js
npm test           # vitest (mapping, aggregation, approval queue, pets, scenarios A–F)
npm run package    # → agentdeck-<version>.tgz  (importable)
```

Requires Node 22 (matches Companion 5.x).

## Swap the custom Codex pet

```bash
node scripts/embed-codex-pet.mjs --from-config   # your selected Codex avatar
# or: node scripts/embed-codex-pet.mjs <petId|path-to-~/.codex/pets/xxx>
npm run build && npm run package
```

Slices four poses from the avatar's spritesheet and re-embeds them (macOS `sips`
decodes the WebP; on other platforms convert to `spritesheet.png` first).

## Layout

```
src/
├── main.ts                     # InstanceBase entry, wiring, pet animation timer
├── config.ts                   # Host / Port / Token
├── agentdeck/                  # protocol.ts (vendored types), connection.ts, mapper.ts
├── state/                      # sessionStore, providerRegistry, stateMapper
├── approval/                   # approvalCoordinator, approvalTypes
└── companion/                  # actions, feedbacks, variables, presets, pet, baimi
scripts/embed-codex-pet.mjs     # custom-pet embedder
companion/                      # manifest.json, HELP.md
```

## Protocol source of truth

Wire types are a vendored subset of
[`puritysb/AgentDeck`](https://github.com/puritysb/AgentDeck) (`shared/src/*`),
annotated in `src/agentdeck/protocol.ts`. Notably the `permission_decision` gate
is `allow`/`deny` only, and there is no Gemini agent type yet — so the Gemini
slot is present but OFFLINE until upstream ships an adapter.

## License

MIT
