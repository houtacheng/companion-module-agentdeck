# Feature request: "Menu bar only" mode (hide the Dock icon)

## Summary

Add a macOS preference to run AgentDeck as a **menu-bar-only app** — visible in
the menu bar (as it already is via `MenuBarExtra`) but **without a Dock icon**.

## Motivation

I run AgentDeck purely as a background control surface (menu bar + daemon for a
Stream Deck / Companion setup) and rarely open the dashboard window. The Dock
icon is just clutter for this use case. Many menu-bar utilities offer a "hide
Dock icon" / "menu bar only" toggle, and AgentDeck already leans this way with
the `MenuBarExtra` and the "Open dashboard on launch" option.

## Current behavior

The macOS app runs with the default `.regular` activation policy, so it always
shows a Dock icon. `Info.plist` has no `LSUIElement`, and there's no user-facing
setting to change it. The existing Dashboard settings
(`SettingsScreen.swift` → `dashboardContent`) already gate macOS-only prefs like
`openDashboardOnLaunch` and `menuBarIconStyle`, which feels like the natural home
for this.

## Proposed solution

Add a preference, e.g. `AppPreferences.hideDockIcon` (Bool), surfaced in the
Dashboard settings alongside "Open dashboard on launch":

```swift
#if os(macOS)
Toggle("Hide Dock icon (menu bar only)", isOn: $preferences.hideDockIcon)
#endif
```

Apply it by switching the app's activation policy at launch and whenever the
toggle changes:

```swift
NSApp.setActivationPolicy(preferences.hideDockIcon ? .accessory : .regular)
```

Notes:
- `.accessory` keeps the `MenuBarExtra` working and lets windows still be opened
  from the menu bar; it only removes the Dock icon and the global menu bar.
- When the user opens the dashboard from the menu bar while in `.accessory`
  mode, briefly calling `NSApp.activate(ignoringOtherApps:)` (or temporarily
  `.regular`) may be needed so the window comes to the front. Reverting to
  `.accessory` on window close keeps the Dock clean.
- Default the toggle **off** so existing behavior is unchanged.

## Alternatives considered

- **CLI daemon only** (`npx @agentdeck/setup`) — runs with no Dock icon, but
  also no menu bar UI, so it's not equivalent to "menu bar only".
- **Editing `Info.plist` to add `LSUIElement`** — not viable for an App Store
  build: it breaks the code signature and is overwritten on update.

## Environment

- AgentDeck Mac app (App Store build), macOS.
- Used as a background daemon/menu-bar surface for a Companion + Stream Deck rig.

Thanks for AgentDeck! 🐙
