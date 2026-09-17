# AI Sessions

One VS Code panel for every AI coding session you have going: Claude, Codex, and whatever comes next.

Status: **UI scaffold with mock data.** Nothing talks to a real agent yet.

## What's here

- **Sidebar view** (`AI Sessions` in the activity bar): active sessions on top with a spinner while they run, a different tint once they finish, and an amber "needs approval" state. Sessions idle for over an hour collapse behind "Show older". Forks nest under their parent with a branch line. Chat in the middle, composer with provider / model / effort / mode chips at the bottom, and a todos strip.
- **Editor tab** (`AI Sessions: Open as Editor Tab`): the same data in a three-column layout with a plan column for feature-mode runs and a full todo list.
- **`SessionsApi`** ([src/api/SessionsApi.ts](src/api/SessionsApi.ts)): the interface the UI is built against. [MockSessionsApi](src/api/MockSessionsApi.ts) seeds sessions in every state, streams replies word by word, and handles fork / stop / approve / todos in memory. The real backend replaces this one class.

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
    WidePanel.ts
    html.ts               webview HTML with CSP
  webview/
    main.ts               bootstrap, event delegation, re-render on state
    sessions.ts           session cards, fork tree, older group
    chat.ts               messages, tool rows, approval card
    composer.ts           textarea and option chips (rendered once, chips refreshed)
    side.ts               plan column and todos
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
- Transcript store on disk in one normalized format, so a session can move between providers.
- Feature mode orchestration: planner, N workers in git worktrees, reviewer.
