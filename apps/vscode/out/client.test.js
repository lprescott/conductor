"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = __importDefault(require("node:http"));
const vitest_1 = require("vitest");
const client_1 = require("./client");
let server;
let baseUrl;
let currentHandler = (_req, res) => { res.writeHead(500); res.end(); };
function sseBody(data) {
    return `event: message\ndata: ${JSON.stringify(data)}\n\n`;
}
function mcpResult(text, id = 1) {
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
}
(0, vitest_1.beforeAll)(() => new Promise((resolve) => {
    server = node_http_1.default.createServer((req, res) => currentHandler(req, res));
    server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
    });
}));
(0, vitest_1.afterAll)(() => new Promise((resolve) => server.close(() => resolve())));
(0, vitest_1.describe)('ConductorClient — MCP HTTP', () => {
    (0, vitest_1.it)('fetchState parses server state', async () => {
        currentHandler = (_req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.end(sseBody(mcpResult(JSON.stringify({ playing: true, error: null, connectedClients: 2 }))));
        };
        // Use a non-WS URL so the WS connection attempt just fails silently
        const c = new client_1.ConductorClient(baseUrl);
        const state = await c.fetchState();
        (0, vitest_1.expect)(state).toEqual({ playing: true, error: null, connectedClients: 2 });
        c.dispose();
    });
    (0, vitest_1.it)('fetchState surfaces eval errors', async () => {
        currentHandler = (_req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.end(sseBody(mcpResult(JSON.stringify({ playing: false, error: 'SyntaxError: boom', connectedClients: 1 }))));
        };
        const c = new client_1.ConductorClient(baseUrl);
        const state = await c.fetchState();
        (0, vitest_1.expect)(state.error).toBe('SyntaxError: boom');
        c.dispose();
    });
    (0, vitest_1.it)('setPattern sends the correct tool name and code', async () => {
        let body = '';
        currentHandler = (req, res) => {
            const chunks = [];
            req.on('data', (c) => chunks.push(c));
            req.on('end', () => {
                body = Buffer.concat(chunks).toString();
                res.writeHead(200);
                res.end(sseBody(mcpResult('{"ok":true}')));
            });
        };
        const c = new client_1.ConductorClient(baseUrl);
        await c.setPattern("note('c3')");
        const parsed = JSON.parse(body);
        (0, vitest_1.expect)(parsed.params.name).toBe('set_pattern');
        (0, vitest_1.expect)(parsed.params.arguments.code).toBe("note('c3')");
        c.dispose();
    });
    (0, vitest_1.it)('listPatterns returns the pattern array', async () => {
        currentHandler = (_req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.end(sseBody(mcpResult(JSON.stringify({ patterns: ['a', 'b', 'c'] }))));
        };
        const c = new client_1.ConductorClient(baseUrl);
        const patterns = await c.listPatterns();
        (0, vitest_1.expect)(patterns).toEqual(['a', 'b', 'c']);
        c.dispose();
    });
    (0, vitest_1.it)('rejects on connection refused', async () => {
        const c = new client_1.ConductorClient('http://127.0.0.1:1');
        await (0, vitest_1.expect)(c.fetchState()).rejects.toThrow();
        c.dispose();
    });
    (0, vitest_1.it)('rejects when response has no data line', async () => {
        currentHandler = (_req, res) => { res.writeHead(200); res.end('event: message\n\n'); };
        const c = new client_1.ConductorClient(baseUrl);
        await (0, vitest_1.expect)(c.fetchState()).rejects.toThrow('No data line');
        c.dispose();
    });
});
(0, vitest_1.describe)('ConductorClient — local state', () => {
    (0, vitest_1.it)('updateState patches state without overwriting other fields', () => {
        const c = new client_1.ConductorClient(baseUrl);
        c.updateState({ playing: true });
        (0, vitest_1.expect)(c.getState().playing).toBe(true);
        (0, vitest_1.expect)(c.getState().error).toBeNull();
        c.dispose();
    });
    (0, vitest_1.it)('isConnected starts false when daemon is not reachable', () => {
        const c = new client_1.ConductorClient('http://127.0.0.1:1');
        (0, vitest_1.expect)(c.isConnected()).toBe(false);
        c.dispose();
    });
});
//# sourceMappingURL=client.test.js.map