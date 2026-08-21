# AgentDeck — Companion module

Drive your AI coding agents (Codex / Claude / Gemini) from a fixed **2×3 AI
Control Surface**. This module talks **only** to the AgentDeck daemon over
WebSocket — it never connects to Codex, Claude, or Gemini directly.

```
┌────────────┬────────────┬────────────┐
│   CODEX    │   CLAUDE   │   GEMINI   │   ← Row 1: status + provider selector
│   STATUS   │   STATUS   │   STATUS   │
├────────────┼────────────┼────────────┤
│  ✓ ONCE    │ ✓∞ SESSION │  ✕ REJECT  │   ← Row 2: act on the GLOBAL active approval
└────────────┴────────────┴────────────┘
```

## Install

1. Run an AgentDeck daemon on the machine your agents run on
   (`npx @agentdeck/setup`, or the macOS App Store app). Default port **9120**.
2. In Companion, add a connection of type **AgentDeck**.
3. Configure it (below).

## Connect (Host / Port / Token)

| Field | Default | Notes |
|-------|---------|-------|
| **Host** | `127.0.0.1` | The daemon's host. Use `127.0.0.1` when Companion and the daemon are on the same machine. |
| **Port** | `9120` | The daemon's WebSocket port (`BRIDGE_WS_PORT`). |
| **Auto-reconnect** | on | Reconnect ladder 1s → 2s → 5s → 10s → 30s. |
| **Auth Token** | *(blank)* | **Leave blank for a local daemon** — same-machine connections need no token. For a **remote** daemon, paste its pairing token; a wrong/missing token is rejected with close code 4001. |

## Rotary control — navigate a live option list

AgentDeck's original Stream Deck+ profile used its physical dials to *cycle
through views* (usage windows) — turning didn't drive the agent itself.
Separately, the daemon protocol supports a genuinely live, navigable option
list on a **managed** session's prompt (e.g. a Claude Code `AskUserQuestion`
with several choices). This module ports that concept to Companion: rotate a
highlight through the list, press to commit — the same "rotate to browse,
press to act" feel, now aimed at the thing that actually needs it.

**Presets → AgentDeck → Rotary Control (Navigate Options) → Navigate Approval
Option (rotary)** shows `index/count` and the highlighted option's label, and
wires:

- **Rotate left / right** → move the highlight (bound to the preset's
  `rotate_left`/`rotate_right` steps — works on a real Stream Deck+ dial via
  Companion, or any other rotary-capable surface).
- **Press** → commit the highlighted option (`select_option` at that index).

The key only lights up (feedback `Approval option list is navigable`) when the
active approval is a **managed** prompt with **more than one live option** —
never for a plain allow/deny gate, and never for an observed/non-actionable
approval (fail-closed, same rule as every other approval control). On a
button-only surface (no dial), bind **Navigate Approval Option — Up/Down** and
**Select Highlighted Approval Option** to separate keys instead.

Variables: `approval_can_navigate`, `approval_option_label`,
`approval_option_index`, `approval_option_count`.

## Response blink — flash a button while anything is waiting on you

Not an official AgentDeck surface behaviour — this is Companion-native, added
because a plain color change is easy to miss. **Provider needs your response
(blink)** is a boolean feedback that alternates true/false every ~450ms (a
full on/off cycle is ~900ms) while the given provider has **any** interrupt
waiting on you — not just a gated tool-permission request:

- **Approval** — a gated tool-permission request (`awaiting_permission`).
- **Input** — a live question/option prompt, e.g. a Claude Code
  `AskUserQuestion` (`awaiting_option`). This is the case people usually
  mean by "it's asking me something" and is **not** part of the global
  approval queue (Once/Session/Reject), so it needed its own trigger.
- **Review** — a diff awaiting your review (`awaiting_diff`).

It's already wired into every AgentDeck button that can show it:

- **AI Control Surface** status keys and **Session Info** keys — a plain
  boolean feedback, **Provider needs your response (blink)**, is already on
  them. Add it to your own text-style button the same way: pick the Provider,
  give it a style (default: bright red background, white text) — it paints on
  the "on" beat only, so stack a solid-color "has a pending approval" style
  underneath to get a proper two-color flash.
- **Session Tiles (official look)** and **Pets** — these render a full-bleed
  PNG that covers the whole key, so the blink is **baked directly into the
  image** instead (a boolean feedback's bgcolor would only ever show through
  the four rounded-corner triangles the PNG doesn't cover — which is exactly
  what "only flashes in the corners" looks like if you try to stack one on
  top). Nothing to configure — the key's own background flashes between its
  normal status tint and a bright red automatically.

The blink rides the same animation timer as the pet creatures, so it turns
itself off within one tick (≤150ms) of the prompt clearing or the daemon
disconnecting — never left flashing on stale state.

## Usage gauges (official Stream Deck+ dial look)

Full-bleed level-fill bars rising from the bottom to the used percentage, with
the official severity ramp (green ≤50%, amber 50–80%, red >80%; stale data
renders grey, an inactive scoped cap renders cyan). What the label means:

| Label | Meaning |
|---|---|
| **5H** | The rolling 5-hour usage window. |
| **7D** | The rolling 7-day (weekly) usage window. |
| **SCOPED** | Claude's *binding* per-model cap — a narrower, per-model limit (e.g. a weekly "Fable" cap) that can bind even while the account-wide 5H/7D windows still read low. Shows that model's own name instead of "SCOPED" once data arrives (this is also the official standalone "Claude Limit" keypad button). |

**One feedback drives every gauge — the window it shows is a "Metric"
dropdown option, not a fixed feedback.** Drag any preset from **Presets →
AgentDeck → Usage (official Stream Deck+ look)** onto a button, then open that
button's feedback and change **Metric** to whichever of the five you want:
Claude 5H, Claude 7D, Claude Scoped, Codex 5H-style, or Codex 7D-style. The
five ready-made presets are just a convenient starting point matching the
official screenshot layout — nothing about them is fixed once they're on a
button. Pressing a gauge requests a fresh snapshot from the daemon
(`query_usage`), same as the official dial's press; the module also
auto-requests one on connect. A gauge reads a dim "—" until the first snapshot
arrives, and blanks back to it on disconnect (no stale numbers survive a
reconnect).

## Session quick actions (official keypad detail-view presets)

**Presets → AgentDeck → Session Quick Actions** ports the official
GO ON / REVIEW / COMMIT / CLEAR / MODEL / STOP / ESC detail-view keys, plus
OpenClaw's GATEWAY key:

| Preset | Sends | Effect |
|---|---|---|
| **GO ON** | `send_prompt "go on"` | Nudge the agent to continue. |
| **REVIEW** | `review_run` | Trigger an independent daemon-side review of the session's latest work. |
| **COMMIT** | `send_prompt "/commit"` | Ask the agent to commit. |
| **CLEAR** | `send_prompt "/clear"` | Clear the session. |
| **MODEL** | `send_prompt "/model"` | Open the agent's model switcher. |
| **STOP** | `interrupt` (Ctrl+C) | Interrupt the running agent. |
| **ESC** | `escape` | Cancel the current prompt/selection. |
| **GATEWAY** | *(local)* | Open OpenClaw's browser dashboard at `127.0.0.1:18789`. |

Each preset targets a **Provider**'s *active session* — Companion has no
single "focused session" concept the way the physical deck's detail view
does, so pick the provider via the preset's own option after dragging it onto
a button (defaults to Claude). Commands are routed exactly like the official
plugin: wrapped in `session_command` for managed/observed sessions the daemon
can steer directly, sent bare for OpenClaw or an unmanaged session.

## System controls (E1 Volume / E4 Launcher — local, macOS only)

**Presets → AgentDeck → System (Volume / Launcher)** ports the two "utility"
Stream Deck+ encoders, which are pure local OS actions and never touch the
AgentDeck daemon:

- **Volume Up / Down** — adjusts macOS output volume via `osascript`
  (mirrors E1's rotate; the step size is a preset option, default 5).
- **Volume: Toggle Mute** — mirrors E1's press.
- **Launch Claude / Codex / OpenClaw** — mirrors E4: opens the desktop app if
  installed, else falls back to the web (`claude.ai`, ChatGPT Codex Cloud, or
  OpenClaw's local gateway) — the exact fallback chains the official plugin
  uses.

## The 2×3 preset

Open **Presets → AI Control Surface** and drop the six presets onto a page in
this layout:

```
CODEX  | CLAUDE | GEMINI
ONCE   | SESSION| REJECT
```

- **Row 1** shows each provider's aggregated status and doubles as an approval
  selector — pressing e.g. **CODEX** points the global active approval at
  Codex's earliest pending approval (no-op if Codex has none).
- **Row 2** always controls the **single global active approval**, whichever
  provider it currently belongs to. When one approval is resolved the surface
  auto-advances to the next in the queue — no "Next" button needed.

## Supported providers

The fixed 2×3 core is Codex / Claude / Gemini. Every other AgentDeck-supported
agent also gets full support — status keys, the global approval queue,
animated pet, and an official-look tile — just not a slot in that fixed 2×3
grid (its layout is a deliberate design constant). Find them under
**Presets → Additional Providers (Status)** and the Pets / Session Tiles /
Session Info sections; drag them onto any page to build a larger surface.

| Provider | AgentDeck agent types | Creature |
|----------|-----------------------|----------|
| Codex        | `codex-cli`, `codex-app` | cloud (upstream art) |
| Claude       | `claude-code` | octopus (upstream art) |
| Gemini       | *(none yet — no daemon adapter; stays **OFFLINE**)* | spark — placeholder |
| OpenClaw     | `openclaw` | crayfish (upstream art) |
| OpenCode     | `opencode` | nested ring (upstream art) |
| Antigravity  | `antigravity` | rainbow peak/arc mark (upstream art) |
| Kiro         | `kiro-cli`, `kiro-ide` (one row) | ghost — placeholder |

"Placeholder" creatures (Gemini, Kiro) exist because upstream AgentDeck has no
pixel-art mascot for them yet (Gemini: no adapter at all; Kiro: only a vector
brand mark) — they're generic, not claimed official mascots. Every other
creature above is transcribed from AgentDeck's own pixel-art source
(`bridge/src/pixoo/pixoo-sprites.ts`).

`monitor` (a usage-only observation mode, not an interactive agent) is
intentionally excluded — it never gets a provider row.

## Managed vs Observed — the approval limitation

AgentDeck sessions are either **managed** (the daemon drives the terminal) or
**observed** (the daemon only watches, but may hold a permission gate open).
Seeing an agent wait for permission does **not** always mean this surface can
answer it. Buttons are enabled only when the daemon signals the request is
actionable (a held `requestId` gate, a live-answerable prompt, or a managed
prompt with options). Otherwise the row shows **APPROVAL** but the buttons stay
disabled — this is intentional and safe.

**Approve Session / Always** is only available for a *managed* prompt that
offers an explicit "always / for this session" option. For the common observed
permission gate, only **Approve Once** and **Reject** are possible, so the
SESSION button is disabled there.

## Approval safety

- Every decision targets a specific live approval (`sessionId` + `requestId`),
  never merely "the current agent".
- After you press a button the module waits for the daemon's own state update to
  confirm the gate cleared — it never optimistically removes an approval.
- On disconnect, all pending approvals are dropped; nothing from before a
  reconnect is ever re-actioned.

## Running more than one session per provider

By default, every Tile/Pet button for a provider shows its single
**Active** session — the one highest-priority session (approval > input >
review > working > done > idle, then earliest-started). That's fine with one
session running, but if you run two Claude sessions side by side, dragging
the Tile preset twice used to render **two identical copies** of whichever
one happened to be highest priority — there was no way to point a button at
"the other one."

Both the **Session Tiles (official look)** and **Pets** feedbacks now have a
**Session** dropdown: leave it on *Active* for the old single-session
behavior, or pick **Session 1**, **Session 2**, … to address a specific
concurrent session directly. Numbering is stable across daemon updates
(sessions are sorted by start time, not by whatever order `sessions_list`
happens to arrive in), so "Session 1" keeps pointing at the same session tick
to tick — it doesn't jump around when a newer session starts or an older one
that hasn't been placed on a slot changes status.

**Presets → AgentDeck → Session Slots (multiple sessions per provider)**
ships two ready-made slots per provider (Session 1 / Session 2); for a third
concurrent session, drag the base Tile preset and change its feedback's
Session option to **Session 3** yourself. A slot with no matching session
(e.g. Session 2 when only one is running) renders the same dim OFFLINE tile
as a provider with nothing running — it never falls back to showing another
session's data.

## Pets (animated creatures)

**Presets → AgentDeck → Pets** has one animated creature button per provider:

| Provider | Creature |
|----------|----------|
| Codex  | indigo cloud with a `>_` prompt (upstream jellyfish mascot) |
| Claude | terracotta octopus (upstream mascot) |
| Gemini | blue-violet 4-point spark — a **placeholder** (AgentDeck has no Gemini creature yet) |

Each pet animates from its provider's aggregated status:

| Status | Pet |
|--------|-----|
| offline | dim, still |
| idle | gentle bob, no glow |
| working | faster bob + lit "water" glow + pulse |
| approval | strong pulse + glow |
| error | red tint |

Images are rendered inside the module (no external assets, pure Node) and
repainted a few times a second. Pressing a pet selects that provider's approval,
exactly like its status key.

### Custom Codex avatar — 白咪 (baimi)

The Codex Pet feedback has a **Skin** option: *Default (cloud)* or *白咪 (custom
Codex avatar)*. The 白咪 skin is the user's own Codex avatar (the Codex CLI
"pet" from `~/.codex/pets/baimi`) — four poses were sliced from its spritesheet
and embedded in the module: sitting (idle), prowling (working), holding a sign
(awaiting your approval), and paw-up (done). There is a ready-made
**Codex Pet — 白咪 (custom)** preset in the Pets section.

**The Codex Tile (official look) feedback carries the same Skin option** —
switch it to 白咪 and the full official-layout tile (status word, ACT badge,
"Codex", model name) shows the custom avatar instead of the built-in cloud, in
the same poses and with the same per-status background tint as every other
tile. Ready-made preset: **Codex Tile — 白咪 (official look, custom)** in the
Session Tiles section.

To embed a *different* custom Codex avatar, run the bundled tool and rebuild:

```bash
node scripts/embed-codex-pet.mjs --from-config   # your currently-selected Codex avatar
# or: node scripts/embed-codex-pet.mjs <petId|path-to-~/.codex/pets/xxx>
npm run build && npm run package
```

It reads `~/.codex/pets/<id>/spritesheet.webp`, slices the four poses, and
re-embeds them. macOS only (uses `sips` to decode WebP); on other platforms
convert the sheet to `spritesheet.png` first.

## Variables

`agentdeck_connected`; per provider `codex_status`, `codex_session_count`,
`codex_working_count`, `codex_approval_count`, `codex_active_project` plus active-
session detail `codex_model`, `codex_effort`, `codex_tool`, `codex_activity`,
`codex_context_percent`, `codex_total_tokens`, `codex_elapsed` (and the same for
`claude_`/`gemini_`); global approval `approval_provider`,
`approval_provider_name`, `approval_project`, `approval_question`,
`approval_type`, `approval_count`, `approval_actionable`, `approval_can_once`,
`approval_can_session`, `approval_can_reject`; usage `usage_known`,
`claude_usage_5h_percent`, `claude_usage_5h_reset`, `claude_usage_7d_percent`,
`claude_usage_7d_reset`, `claude_usage_scoped_label`,
`claude_usage_scoped_percent`, `claude_usage_scoped_reset`,
`codex_usage_5h_percent`, `codex_usage_5h_reset`, `codex_usage_7d_percent`,
`codex_usage_7d_reset`.

## Troubleshooting

- **Everything OFFLINE / status "Connecting"** — the daemon isn't reachable at
  Host:Port. Confirm it's running and the port matches `~/.agentdeck/daemon.json`.
- **Closed with 4001 / Unauthorized** — a remote daemon rejected the token.
  Re-check the Auth Token (local connections should leave it blank).
- **APPROVAL shows but buttons are dark** — the request is observed-only / not
  actionable from a device. Answer it in the agent's own terminal.
- **Gemini always OFFLINE** — expected; AgentDeck has no Gemini adapter yet.
