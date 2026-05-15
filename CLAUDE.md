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
`save_pattern` MCP tool or the `Conductor: Save Pattern` command. The Conductor Patterns sidebar
in Explorer lists them via the `list_patterns` MCP tool; single-click loads via `load_pattern`.

## Architecture

The daemon (`server/`) and VS Code extension (`apps/vscode/`) are separate pnpm workspace
packages connected at runtime.

### Data flow

```
AI IDE ──MCP HTTP POST /mcp──► server/src/index.ts ──► state.ts
                                                          ▲
                                                          │ ws state/error/cleared
                                                          │
VS Code  ──opens *.strudel──► StrudelEditorProvider ──► <strudel-editor>
                                  (per-doc webview)     (StrudelMirror API)
```

Each `.strudel` document gets its own webview. The webview's text content lives in the file
(synced via `WorkspaceEdit`). When a document becomes active, its content is pushed to the
daemon via the `set_pattern` MCP tool so external MCP callers see the current pattern. The
webview also notifies the daemon of `state` / `error` / `cleared` events over WebSocket so the
daemon's `get_state` stays accurate.

### Server (`server/src/`)

- **`state.ts`** — singleton holding `{ pattern, playing, error, clients }` plus subscribe-style
  listeners.
- **`watcher.ts`** — exports `REPO_ROOT`, `PATTERN_FILE`, `PATTERNS_DIR`. Chokidar watches
  `pattern.js` and updates `state.pattern` on add/change.
- **`mcp.ts`** — exports `createMcpServer()` factory (fresh per HTTP request). Tools:
  `get_pattern`, `set_pattern`, `get_state`, `play`, `stop`, `save_pattern`, `list_patterns`,
  `load_pattern`, `delete_pattern`, `get_strudel_docs`. `set_pattern` and `load_pattern` write
  to `pattern.js`.
- **`index.ts`** — HTTP server: `/mcp` (MCP/SSE), `/health`, and WebSocket upgrades.
  `handleWsMessage()` handles `state`, `error`, `cleared` (the webview's playback/error events).

### VS Code extension (`apps/vscode/`)

- **`src/client.ts`** — `ConductorClient extends EventEmitter`. Opens a WebSocket to the daemon
  with 3-second auto-reconnect; emits `connected` / `disconnected`. HTTP MCP methods:
  `fetchState`, `setPattern`, `play`, `stop`, `savePattern`, `loadPattern`, `deletePattern`,
  `listPatterns`. `send(msg)` forwards a JSON message over the open WebSocket.
- **`src/strudelEditor.ts`** — `StrudelEditorProvider` implements `CustomTextEditorProvider` for
  `*.strudel` files (registered via the `customEditors` contribution). Each open `.strudel`
  document gets its own webview built from `media/index.html` (template substitutes `{{NONCE}}`
  and `{{STRUDEL_URI}}`). On `ready` / view-state-active, calls `onDocumentActive(doc)` which
  pushes the file's contents to the daemon as the live pattern and sets `lastPushedUri`.
  Webview `code_changed` messages are applied to the document via `WorkspaceEdit` (with a
  suppression flag to avoid echo). The static `StrudelEditorProvider.activePanel` tracks the
  most-recently-active webview so play/stop commands can post into it.
- **`src/extension.ts`** — `activate()` wires everything together. Key state: `lastPushedUri`
  (auto-push target on file save). The `play`/`stop`/`togglePlay` commands call the daemon and
  forward `play`/`stop` messages to `StrudelEditorProvider.activePanel`. The save watcher
  auto-pushes `lastPushedUri` on every save.
- **`src/patternsProvider.ts`** — `PatternProvider` tree data provider for the Conductor Patterns
  sidebar. Single-click on a pattern loads it.
- **`media/index.html`** — Strudel webview. Toolbar uses VS Code CSS variables for theming.
  Sends `ready` on editor init. Sends `state` / `error` / `cleared` / `code_changed` messages
  back to the extension host. Receives `pattern` / `play` / `stop` messages.
- **`media/strudel.js`** — bundled `@strudel/repl` IIFE (2 MB, gitignored, copied at build time).

### MCP endpoint

MCP clients must include `Accept: application/json, text/event-stream` on requests. Responses are
SSE-framed even for simple tool calls.

### `pattern.js`

The daemon's view of the live pattern, kept at the repo root. The watcher reads it on every
change and updates `state.pattern`. Written by `set_pattern` and `load_pattern`.
