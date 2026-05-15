# conductor

A browser-based live coding music environment that AI IDEs can control in real time via MCP.

Write patterns in natural language with your AI IDE; the browser updates live and plays the result.

## Quick Start

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The local daemon runs on http://localhost:7777.

## How It Works

The daemon owns pattern state and exposes it over two channels:

- **MCP HTTP** at `http://localhost:7777/mcp` — for AI IDEs (Claude Code, Cursor, etc.)
- **WebSocket** at `ws://localhost:7777` — for the VS Code webview to receive live updates

Open a `.strudel` file (e.g. under `songs/`) in VS Code with the bundled extension; the custom
editor pushes the file's contents to the daemon on activation and on every save.

## MCP Configuration

A `.mcp.json` is already present for Claude Code — it auto-connects when you open this project.

For other AI IDEs, point them at:

```json
{
  "mcpServers": {
    "conductor": {
      "type": "http",
      "url": "http://localhost:7777/mcp"
    }
  }
}
```

## MCP Tools

| Tool | Input | Description |
|------|-------|-------------|
| `get_pattern` | — | Returns the current Strudel pattern |
| `set_pattern` | `{ code: string }` | Updates the pattern; browser changes instantly |
| `get_state` | — | Returns `{ playing, error, connectedClients }` |
| `play` | — | Starts playback |
| `stop` | — | Stops playback |
| `get_strudel_docs` | — | Returns Strudel API reference for writing patterns |

## Note on Audio

Browsers block audio until a user gesture. Click anywhere in the browser after opening the page before sending patterns from your IDE. Patterns sent before that first click will load silently.

## Support

If Conductor's useful to you, you can [buy me a coffee](https://buymeacoffee.com/lprescott).

## License

AGPL-3.0-or-later (required by `@strudel/repl`).
