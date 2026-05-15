"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConductorClient = void 0;
const node_http_1 = __importDefault(require("node:http"));
const node_events_1 = require("node:events");
const ws_1 = __importDefault(require("ws"));
class ConductorClient extends node_events_1.EventEmitter {
    baseUrl;
    ws = null;
    reconnectTimer = null;
    disposed = false;
    connected = false;
    state = { playing: false, error: null, connectedClients: 0 };
    constructor(baseUrl) {
        super();
        this.baseUrl = baseUrl;
        this.connect();
    }
    isConnected() { return this.connected; }
    getState() { return { ...this.state }; }
    updateState(patch) {
        this.state = { ...this.state, ...patch };
    }
    // Forward a raw message to the daemon (e.g. webview → daemon relay)
    send(msg) {
        if (this.ws?.readyState === ws_1.default.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
    wsUrl() {
        return this.baseUrl.replace(/^http/, 'ws');
    }
    connect() {
        if (this.disposed)
            return;
        try {
            const ws = new ws_1.default(this.wsUrl());
            this.ws = ws;
            ws.on('open', () => {
                this.connected = true;
                this.emit('connected');
            });
            ws.on('message', (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    this.applyMessage(msg);
                    this.emit('message', msg);
                }
                catch { /* ignore malformed */ }
            });
            ws.on('close', () => {
                this.connected = false;
                this.ws = null;
                this.emit('disconnected');
                this.scheduleReconnect();
            });
            ws.on('error', () => {
                // 'close' fires after 'error'; handle reconnect there
                this.connected = false;
                this.emit('disconnected');
            });
        }
        catch {
            this.scheduleReconnect();
        }
    }
    scheduleReconnect() {
        if (this.disposed || this.reconnectTimer)
            return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, 3000);
    }
    applyMessage(msg) {
        if (msg.type === 'play')
            this.state = { ...this.state, playing: true };
        if (msg.type === 'stop')
            this.state = { ...this.state, playing: false };
        if (msg.type === 'state')
            this.state = { ...this.state, playing: msg.playing };
        if (msg.type === 'error')
            this.state = { ...this.state, error: msg.message };
        if (msg.type === 'cleared')
            this.state = { ...this.state, error: null };
    }
    // ── HTTP MCP calls ──────────────────────────────────────────────────────────
    async callMcp(tool, args = {}) {
        const body = JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: { name: tool, arguments: args },
        });
        return new Promise((resolve, reject) => {
            const url = new URL('/mcp', this.baseUrl);
            const req = node_http_1.default.request({
                hostname: url.hostname,
                port: Number(url.port) || 80,
                path: '/mcp',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    Accept: 'application/json, text/event-stream',
                },
            }, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString();
                    const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
                    if (!dataLine) {
                        reject(new Error('No data line in MCP response'));
                        return;
                    }
                    try {
                        resolve(JSON.parse(dataLine.slice(6)));
                    }
                    catch {
                        reject(new Error('Failed to parse MCP response'));
                    }
                });
            });
            req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timed out')); });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
    mcpText(res) {
        const text = res?.result?.content?.[0]?.text;
        if (!text)
            throw new Error('Empty MCP response');
        return text;
    }
    async fetchState() {
        const res = await this.callMcp('get_state');
        const parsed = JSON.parse(this.mcpText(res));
        this.state = parsed;
        return parsed;
    }
    async listPatterns() {
        const res = await this.callMcp('list_patterns');
        return JSON.parse(this.mcpText(res)).patterns;
    }
    async savePattern(name) {
        await this.callMcp('save_pattern', { name });
    }
    async deletePattern(name) {
        await this.callMcp('delete_pattern', { name });
    }
    async loadPattern(name) {
        await this.callMcp('load_pattern', { name });
    }
    async setPattern(code) {
        await this.callMcp('set_pattern', { code });
    }
    async play() {
        await this.callMcp('play');
    }
    async stop() {
        await this.callMcp('stop');
    }
    dispose() {
        this.disposed = true;
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.ws?.close();
        this.ws = null;
        this.removeAllListeners();
    }
}
exports.ConductorClient = ConductorClient;
//# sourceMappingURL=client.js.map