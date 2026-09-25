# Relay

One VS Code panel for every AI coding session you have going: Claude, Codex, and whatever comes next.

Status: **Claude and Codex sessions are real**, through the installed `claude` and `codex` CLIs. Set `relay.backend` to `mock` to work on the UI with seeded fake sessions.

## What's here

A **sidebar view** (`Relay` in the activity bar). Sessions are listed in three groups:

- **Working**: running (spinner) or waiting for approval (amber, with Allow / Deny on the card).
- **Ready to review**: finished since you last opened them, marked with a dot. Opening one moves it to Past.
- **Past**: opened, not completed, active in the last 2 hours. "Show all past sessions" also lists older and completed ones.

**Getting your attention.** When a session you aren't looking at finishes, fails or stops for an approval, Relay shows a VS Code notification with an Open button, and a macOS notification with a sound if VS Code isn't the focused app. The Relay icon in the activity bar carries a count of sessions to review or approve. `relay.notifications`: `all` (default), `inApp`, or `off`.

**Usage** sits at the top of the list: every plan window each provider reports (Claude: 5h session, weekly all models, weekly per model such as Sonnet or Fable, extra usage; Codex: 5h and weekly limits, credits), with percent used and time to reset. It starts expanded in the editor tab and collapsed to one line in the sidebar. The chat header shows how full the open session's context window is.

**Complete** (top right of the chat, or the check on a card) archives a session and its finished forks. Sending a message to a completed session brings it back. Forks nest under their parent, and the whole tree sits in the group of its most active member.

The chat sits below the list, with a composer that picks provider, model and effort. **↵** sends; while the session is working it queues instead, and queued messages go out in order as each turn ends (shown above the composer, with send-now and remove). **⇧↵** interrupts the running turn and sends immediately. **⌥↵** is a new line. Your latest message stays pinned at the top of the chat while the reply scrolls under it.

An **editor tab** (`Relay: Open as Editor Tab`, or the icon in the view title) shows the same thing in two columns: sessions on the left, the open session on the right. Typing with no session selected, or the `+` in the view title, starts a new one.

**Backends.** [RealSessionsApi](src/backend/RealSessionsApi.ts) holds the session rules (unread, complete, queue, interrupt, forks) and saves sessions to the extension's storage. Each provider is a [ProviderAdapter](src/backend/adapter.ts):

- [Claude](src/backend/claude.ts): the Agent SDK driving your installed `claude`, so its login, settings, CLAUDE.md and permission rules apply. Runs in `auto` permission mode; anything it wants confirmed shows on the Allow / Deny card. Models and effort levels come from `supportedModels()` (refreshed every 30 minutes and on each new session), plan usage from the SDK's usage request, context from `getContextUsage()`. Forks branch with `resumeSessionAt`.
- [Codex](src/backend/codex.ts): one long-lived `codex app-server` process (JSON-RPC over stdio), each session a Codex thread. Runs with Codex's Auto preset (on-request approvals, workspace-write sandbox), so it asks only for network access or writes outside the project. Models and effort levels come from `model/list`, plan usage from `account/rateLimits/read` (and its updates), context from `thread/tokenUsage/updated`. Forks use `thread/fork` through the chosen turn.
- The mock ([MockSessionsApi](src/api/MockSessionsApi.ts)) is the same `RealSessionsApi` with fake adapters, so the UI rules run through the real code path.

Models are never hardcoded: new ones appear once the installed CLI knows them, so keep `claude` and `codex` up to date.

Sessions are stored in the project itself: one JSON file per session in `.relay/sessions/` of the first workspace folder, so each project lists only its own. Sessions from earlier versions (kept in VS Code's storage) move there the first time a project opens. A window with no folder keeps them in memory only.

Settings: `relay.backend` (`real` or `mock`), `relay.claudePath` / `relay.codexPath` (if the CLI isn't on PATH, `~/.local/bin`, or Homebrew).

## Layout of the code

```
src/
  extension.ts            activation, commands, wires API to views
  api/
    types.ts              shared domain types (also imported by the webview)
    SessionsApi.ts        backend interface
    MockSessionsApi.ts    fake adapters and seeded sessions
  backend/
    RealSessionsApi.ts    session rules on top of provider adapters
    adapter.ts            ProviderAdapter / TurnSink contract
    claude.ts             Claude Agent SDK adapter
    codex.ts              Codex app-server adapter
    store.ts              sessions and messages, saved as JSON
    binaries.ts           finds CLIs outside the extension host's PATH
  panel/
    protocol.ts           messages between extension host and webview
    PanelHost.ts          binds one webview to the API, pushes UiState snapshots
    SidebarViewProvider.ts
    WidePanel.ts          the two-column editor tab
    html.ts               webview HTML with CSP
  webview/
    main.ts               bootstrap, event delegation, re-render on state
    sessions.ts           Working / Ready to review / Past groups, fork tree
    chat.ts               messages, tool rows, approval card
    composer.ts           textarea and option chips (rendered once, chips refreshed)
    styles.css            themed with VS Code CSS variables
```

## Run

```
make install   # once
make run       # builds, then opens an Extension Development Host on this folder
make watch     # rebuild on change; reload the dev host window with ⌘R
```

## Install into your VS Code

```
make install-extension   # builds relay.vsix and installs it; reload open windows
```

`make package` only builds `relay.vsix` (about 1.5 MB: the bundle plus the Agent SDK's JavaScript; it uses your installed `claude` and `codex`, so the SDK's own CLI binary is left out). Run `make install-extension` again after changes to update the installed copy.

## Next

- Transcript store on disk in one normalized format, so a session can move between providers.
