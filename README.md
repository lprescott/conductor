# conductor

A browser-based live coding music environment that AI IDEs can control in real time via MCP.

Write patterns in natural language with your AI IDE; the editor updates live and plays the result.

## Quick Start

```bash
pnpm install
pnpm dev
```

That starts the daemon on `http://localhost:7777` and a watch-build of the VS Code extension.

Then in VS Code (with the bundled extension installed from `apps/vscode`):

1. Open any `.strudel` file under `songs/` — it opens in the Conductor custom editor.
2. Click **Play** in the editor toolbar to unlock browser audio.
3. Edit the file (or have your AI IDE call `set_pattern`); save to re-evaluate.

There is no `localhost:3000`. The audio and editor live inside the VS Code webview; the daemon is just the MCP/WebSocket bridge.

## How It Works

The daemon owns pattern state and exposes it over two channels:

- **MCP HTTP** at `http://localhost:7777/mcp` — for AI IDEs (Claude Code, Cursor, etc.)
- **WebSocket** at `ws://localhost:7777` — for the VS Code webview to receive live updates

Open a `.strudel` file (e.g. under `songs/`) in VS Code with the bundled extension; the custom editor pushes the file's contents to the daemon on activation and on every save.

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
| `save_pattern` | `{ name, code }` | Saves a snippet to `patterns/<name>.js` |
| `list_patterns` | — | Lists saved patterns in the library |
| `load_pattern` | `{ name }` | Loads a saved pattern into the active editor |
| `delete_pattern` | `{ name }` | Removes a saved pattern from the library |
| `get_strudel_docs` | — | Returns Strudel API reference for writing patterns |

## Songs vs. patterns

Two directories, two purposes:

- **`songs/`** — full, playable `.strudel` files. One song per file. This is what you open and play.
- **`patterns/`** — a reusable snippet library: drum kits, basslines, chord voicings, FX chains. The Conductor Patterns sidebar (Explorer view) lists them; single-click loads one into the active editor, or use **Conductor: Insert Snippet** to paste at the cursor.

`songs/` is gitignored (except a `.gitkeep`) so your own work-in-progress stays local. `patterns/` is checked in so the library ships with the repo.

## Note on Audio

Browsers block audio until a user gesture. Click **Play** in the editor toolbar after opening a `.strudel` file. Patterns sent over MCP before that first click will load silently until you press Play.

## Support

If Conductor's useful to you, you can [buy me a coffee](https://buymeacoffee.com/lprescott).

## License

AGPL-3.0-or-later (required by `@strudel/repl`).
