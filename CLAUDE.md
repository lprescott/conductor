# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run everything (daemon on :7777, esbuild watch for extension)
pnpm dev

# Run separately
pnpm dev:server   # daemon only
pnpm dev:vscode   # extension watch-build only

# Tests
pnpm test
cd server && pnpm test                        # daemon only
cd apps/vscode && pnpm test                   # extension only
cd server && npx vitest run --reporter=verbose

# Typecheck
cd server && pnpm typecheck
cd apps/vscode && pnpm typecheck

# Package and install the VS Code extension
cd apps/vscode && pnpm package
code --install-extension conductor-vscode-0.2.0.vsix --force

# Kill stale dev processes
fuser -k 7777/tcp
```

## Pattern library

Saved patterns live in `patterns/` at the repo root as plain `.js` files. Create them via the
`save_pattern` MCP tool or the `Conductor: Save Pattern` command. The extension's Conductor
Patterns sidebar (Explorer) fetches via `GET /patterns` and loads via `GET /patterns/:name`.

## Architecture

The daemon (`server/`) and VS Code extension (`apps/vscode/`) are separate pnpm workspace
packages connected at runtime.

### Data flow

```
AI IDE ──MCP HTTP POST /mcp──► server/src/index.ts
                                     │
                     ┌───────────────┴───────────────┐
                     │ state.ts (singleton)           │
                     └───────────────┬───────────────┘
                                     │ broadcast()
                                WebSocket (:7777)
                                     │
                          ConductorClient (extension host)
                                     │ postMessage
                              Strudel webview panel
                                     │
                              <strudel-editor>
                              (StrudelMirror API)
```

Pattern state flows one way: MCP tool or file change → `state.ts` → WebSocket broadcast →
extension host → webview postMessage → Strudel evaluates. Browser state (playing, errors, manual
edits) flows back over the same WebSocket via the extension host relay.

### Server (`server/src/`)

- **`state.ts`** — singleton holding `{ pattern, playing, error, clients }`. Exports
  `suppressNextWatcherBroadcast()` to prevent the file watcher from re-broadcasting a write that
  the daemon itself initiated.
- **`watcher.ts`** — exports `REPO_ROOT`, `PATTERN_FILE`, `PATTERNS_DIR`. Chokidar watches
  `pattern.js`; on change checks `shouldSuppressWatcherBroadcast()` before broadcasting.
- **`mcp.ts`** — exports `createMcpServer()` factory (fresh per HTTP request). Tools:
  `get_pattern`, `set_pattern`, `get_state`, `play`, `stop`, `save_pattern`, `list_patterns`,
  `load_pattern`, `delete_pattern`, `get_strudel_docs`. `set_pattern` and `load_pattern` both
  write to `pattern.js` with suppression.
- **`index.ts`** — HTTP server: `/mcp` (MCP/SSE), `/health`, `/patterns` REST (GET list, GET by
  name, POST load), and WebSocket upgrades. `handleWsMessage()` handles: `state`, `error`,
  `cleared`, `code_changed` (manual webview edits → write `pattern.js` with suppression).
  `broadcastExcept(ws, msg)` relays messages to all other connected WS clients.

### VS Code extension (`apps/vscode/`)

- **`src/client.ts`** — `ConductorClient extends EventEmitter`. Maintains a WebSocket to the
  daemon with auto-reconnect (3 s delay). Emits `connected`, `disconnected`, `message`. HTTP MCP
  methods: `fetchState`, `setPattern`, `play`, `stop`, `savePattern`, `loadPattern`,
  `deletePattern`, `listPatterns`.
- **`src/panel.ts`** — `StrudelPanel` singleton. Creates a `WebviewPanel` with
  `retainContextWhenHidden: true` (preserves audio context). Reads `media/index.html` as a
  template, substitutes `{{NONCE}}` and `{{STRUDEL_URI}}`.
- **`src/extension.ts`** — `activate()` wires everything together. Key state: `currentPatternName`
  (shown in webview toolbar), `lastPushedUri` (auto-push target on file save), `lastPatternMessage`
  (replayed to newly-opened panel). `syncPanelState()` posts `ui_state` to the webview; called
  from `renderStatusBar()` and the `ready` handler. File-save watcher auto-pushes `lastPushedUri`
  on every save.
- **`src/patternsProvider.ts`** — `PatternProvider` tree data provider for the Conductor Patterns
  sidebar. Single-click on a pattern loads it.
- **`media/index.html`** — Strudel webview. Toolbar uses VS Code CSS variables for theming.
  Sends `ready` on editor init; receives `ui_state` to sync toolbar. Sends `state`/`error`/
  `cleared`/`code_changed` messages back to the extension host.
- **`media/strudel.js`** — bundled `@strudel/repl` IIFE (2 MB, gitignored, copied at build time).

### MCP endpoint

MCP clients must include `Accept: application/json, text/event-stream` on requests. Responses are
SSE-framed even for simple tool calls.

### `pattern.js`

The live pattern file at the repo root. The watcher reads it on every save and broadcasts to all
connected WS clients. Written by `set_pattern` and `load_pattern` with suppression enabled.
