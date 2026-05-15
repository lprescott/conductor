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

- **`state.ts`** — singleton module holding `{ pattern, playing, error, clients }`. All mutations go through its exported functions. The `clients` set holds live WebSocket connections; `broadcast()` pushes to all of them.
- **`mcp.ts`** — exports `createMcpServer()`, a factory that creates a fresh `McpServer` instance with 6 tools registered. **Must be called per HTTP request**, not once at startup — the SDK's `connect()` silently overwrites the transport if called twice on the same instance (issues #1405, #1994).
- **`index.ts`** — boots a single `http.Server` that handles both WebSocket upgrades (via `ws`) and HTTP. The `/mcp` handler creates new `McpServer` + `StreamableHTTPServerTransport` per request (stateless mode: `sessionIdGenerator: undefined`). On new WS connection, immediately sends the current pattern to hydrate the browser.
- **`watcher.ts`** — chokidar watches `pattern.js` at the monorepo root; on change, updates state and broadcasts so the browser reloads without MCP.

### Browser (`apps/web/`)

- **`hooks/usePatternSocket.ts`** — manages the WebSocket connection lifecycle with auto-reconnect. Exposes `{ status, send }`. Uses a ref for `onMessage` to avoid stale closures without re-subscribing.
- **`components/StrudelEditor.tsx`** — the integration point. Imports `@strudel/repl` as a side effect (registers `<strudel-editor>` custom element). Resolves `StrudelMirror` (`.editor` on the element) via `customElements.whenDefined('strudel-editor')` — not synchronously available after mount. Calls `editor.setCode(code)` + `editor.evaluate()` on incoming `pattern` messages.
- **`app/page.tsx`** — loads `StrudelEditor` via `dynamic(..., { ssr: false })` inside a `'use client'` component. Required because `@strudel/repl` calls `customElements.define` at import time, which crashes in Node.

### MCP endpoint

MCP clients must include `Accept: application/json, text/event-stream` on requests — the transport rejects without it. Responses are SSE-framed even for simple tool calls.

### `pattern.js`

The live pattern file at the repo root. The watcher reads it on every save and broadcasts to connected browsers. It's also written by `set_pattern` calls so the file stays in sync with the AI IDE's intent.
