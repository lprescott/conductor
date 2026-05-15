# Conductor

Live Strudel coding inside VS Code, with an MCP bridge so AI assistants can write and modify patterns in real time.

## What you get

- A custom editor for `.strudel` files that hosts the Strudel REPL right in VS Code, themed to your color scheme.
- A status bar Play/Stop control, plus `Ctrl+Shift+Space` (macOS: `Cmd+Shift+Space`) to toggle playback.
- A Patterns sidebar for saving and reloading patterns by name.
- A local daemon that exposes pattern state over [MCP](https://modelcontextprotocol.io) at `http://localhost:7777/mcp`, so Claude Code, Cursor, and other MCP-aware tools can drive playback.

## Quick start

1. Install the extension.
2. Run **Conductor: New Song** from the command palette, or open any `.strudel` file in your workspace.
3. Click Play in the editor toolbar. Edit code, hit save, and the loop re-evaluates.

The daemon spawns automatically on activation. If you want to point an AI IDE at it, run **Conductor: Add .mcp.json to Workspace** to drop a config file.

## MCP tools

The daemon exposes these tools to MCP clients:

| Tool | Description |
|------|-------------|
| `get_pattern` | Current Strudel pattern |
| `set_pattern` | Replace the pattern |
| `get_state` | `{ playing, error, connectedClients }` |
| `play` / `stop` | Playback control |
| `save_pattern` / `load_pattern` / `list_patterns` / `delete_pattern` | Pattern library |
| `get_strudel_docs` | Strudel API reference, so the assistant can author patterns |

## Audio

Browsers (and webviews) block audio until a user gesture. Click anywhere inside the editor panel before the first play so the AudioContext can resume.

## Pattern library

Saved patterns live in `<workspace>/patterns/*.js`, scoped per workspace. If you save a pattern in workspace A it will not appear in workspace B. With no folder open, patterns fall back to the extension's global storage.

## Port handling

The daemon prefers port `7777`. If it's busy (another VS Code window, another app) it falls back to an ephemeral port chosen by the OS. Run `Conductor: Add .mcp.json to Workspace` after activation to drop a `.mcp.json` pointing at the live URL so external MCP clients can find it.

## Configuration

- `conductor.serverUrl` — probed first on activation; if `/health` answers, the extension adopts that URL instead of spawning a daemon. Useful for pointing at a remote or pre-started instance.

## Support

If Conductor is useful to you, [buy me a coffee](https://buymeacoffee.com/lprescott).

## License

AGPL-3.0-or-later. Conductor bundles [`@strudel/repl`](https://www.npmjs.com/package/@strudel/repl), which is AGPL-3.0, so the combined work ships under the same license.
