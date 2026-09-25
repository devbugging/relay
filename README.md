# AI Sessions

One VS Code panel for every AI coding session you have going: Claude, Codex, and whatever comes next.

Status: **UI scaffold with mock data.** Nothing talks to a real agent yet.

## What's here

A **sidebar view** (`AI Sessions` in the activity bar). Sessions are listed in three groups:

- **Working**: running (spinner) or waiting for approval (amber, with Allow / Deny on the card).
- **Ready to review**: finished since you last opened them, marked with a dot. Opening one moves it to Past.
- **Past**: opened, not completed, active in the last 2 hours. "Show all past sessions" also lists older and completed ones.

**Usage** sits at the top of the list: every plan window each provider reports (Claude: 5h session, weekly all models, weekly per model such as Sonnet or Fable, extra usage; Codex: 5h and weekly limits, credits), with percent used and time to reset. It starts expanded in the editor tab and collapsed to one line in the sidebar. The chat header shows how full the open session's context window is.

**Complete** (top right of the chat, or the check on a card) archives a session and its finished forks. Sending a message to a completed session brings it back. Forks nest under their parent, and the whole tree sits in the group of its most active member.

The chat sits below the list, with a composer that picks provider, model and effort.

An **editor tab** (`AI Sessions: Open as Editor Tab`, or the icon in the view title) shows the same thing in two columns: sessions on the left, the open session on the right. Typing with no session selected, or the `+` in the view title, starts a new one.

**`SessionsApi`** ([src/api/SessionsApi.ts](src/api/SessionsApi.ts)) is the interface the UI is built against. [MockSessionsApi](src/api/MockSessionsApi.ts) seeds sessions in every group, streams replies word by word, and handles fork / stop / approve / complete in memory. The real backend replaces this one class.

## Layout of the code

```
src/
  extension.ts            activation, commands, wires API to views
  api/
    types.ts              shared domain types (also imported by the webview)
    SessionsApi.ts        backend interface
    MockSessionsApi.ts    in-memory implementation with seeded data
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

## Next

- Real `SessionsApi` on top of the Claude Agent SDK, Codex SDK, or pi's RPC mode.
- Real usage: Claude's `get_usage` control request and `rate_limit_event`, Codex app-server's `account/rateLimits/read` and `account/rateLimits/updated`. Both need a subscription login, not an API key. Context: Claude's `getContextUsage()`, Codex's `thread/tokenUsage/updated`.
- Transcript store on disk in one normalized format, so a session can move between providers.
