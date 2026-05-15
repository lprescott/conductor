# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run everything (daemon on :7777, Next.js on :3000)
pnpm dev

# Run separately
pnpm dev:server   # daemon only
pnpm dev:web      # Next.js only

# Tests (server only — no web tests)
pnpm test
cd server && pnpm test              # same, scoped
cd server && npx vitest run --reporter=verbose  # with test names

# Typecheck
cd server && pnpm typecheck
cd apps/web && pnpm typecheck

# Kill stale dev processes
fuser -k 7777/tcp 3000/tcp
```

## Pattern library

Saved patterns live in `patterns/` at the repo root as plain `.js` files. Create them via the `save_pattern` MCP tool or `POST /patterns/load` REST endpoint. The browser's pattern panel (toggle with the "patterns" button) fetches from `GET /patterns` and loads via `GET /patterns/:name`.

## Architecture

The daemon (`server/`) and browser app (`apps/web/`) are separate pnpm workspace packages connected at runtime.

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
                             StrudelEditor.tsx
                                     │
                              <strudel-editor>
                              (StrudelMirror API)
```

Pattern state flows one way: MCP tool or file change → `state.ts` → WebSocket broadcast → browser → Strudel evaluates. Browser state (playing, errors) flows back over the same WebSocket.

### Server (`server/src/`)

- **`state.ts`** — singleton module holding `{ pattern, playing, error, clients }`. Also owns the watcher-echo suppression flag: call `suppressNextWatcherBroadcast()` before any programmatic write to `pattern.js` to prevent the watcher from broadcasting the change back to browsers that already have it.
- **`watcher.ts`** — exports `REPO_ROOT`, `PATTERN_FILE`, `PATTERNS_DIR`. Chokidar watches `pattern.js`; on change checks `shouldSuppressWatcherBroadcast()` before broadcasting.
- **`mcp.ts`** — exports `createMcpServer()` factory (fresh instance per HTTP request — SDK issues #1405/#1994). Tools: `get_pattern`, `set_pattern`, `get_state`, `play`, `stop`, `save_pattern`, `list_patterns`, `load_pattern`, `delete_pattern`, `get_strudel_docs`. `set_pattern` and `load_pattern` both write to `pattern.js` with suppression.
- **`index.ts`** — HTTP server handling `/mcp` (MCP), `/health`, `/patterns` REST (GET list, GET by name, POST load), and WebSocket upgrades. WS messages handled in `handleWsMessage()`: `state`, `error`, `cleared`, `code_changed` (browser manual edits → write to `pattern.js` with suppression).

### Browser (`apps/web/`)

- **`hooks/usePatternSocket.ts`** — WS lifecycle with auto-reconnect. `ClientMessage` includes `code_changed` for syncing browser edits back to the server.
- **`components/StrudelEditor.tsx`** — main integration point. Key invariants:
  - `editorRef` is set via `customElements.whenDefined('strudel-editor')` — not synchronously available; messages that arrive before resolve are held in `pendingMessageRef` and replayed.
  - `evalChainRef` serializes all `editor.evaluate()` calls via a promise chain to prevent concurrent evaluation.
  - `sendRef` holds the latest `send` function so `whenDefined` and `onChange` callbacks never stale-close over it.
  - `onChange` is wired after editor resolves, debounced 800ms, sends `code_changed` to server.
  - `localStorage` history (key `conductor:history`, max 50) is written on every successful eval.
- **`components/PatternPanel.tsx`** — sidebar panel with Library (fetches `GET /patterns`, loads via `GET /patterns/:name`) and History (reads localStorage) tabs.
- **`app/page.tsx`** — loads `StrudelEditor` via `dynamic(..., { ssr: false })` in a `'use client'` component. Required because `@strudel/repl` calls `customElements.define` at import time, which crashes in Node.

### MCP endpoint

MCP clients must include `Accept: application/json, text/event-stream` on requests — the transport rejects without it. Responses are SSE-framed even for simple tool calls.

### `pattern.js`

The live pattern file at the repo root. The watcher reads it on every save and broadcasts to connected browsers. It's also written by `set_pattern` calls so the file stays in sync with the AI IDE's intent.
