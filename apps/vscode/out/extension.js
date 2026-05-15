"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const client_1 = require("./client");
const patternsProvider_1 = require("./patternsProvider");
const panel_1 = require("./panel");
let client;
let statusBar;
function serverUrl() {
    return vscode.workspace.getConfiguration('conductor').get('serverUrl', 'http://localhost:7777');
}
function renderStatusBar() {
    const s = client.getState();
    if (!client.isConnected()) {
        statusBar.text = '$(circle-slash) Conductor';
        statusBar.tooltip = `Cannot connect to ${serverUrl()}`;
        statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    else if (s.error) {
        statusBar.text = '$(warning) Conductor';
        statusBar.tooltip = `Eval error: ${s.error}\n\nClick to stop`;
        statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    else if (s.playing) {
        statusBar.text = '$(play) Conductor';
        statusBar.tooltip = 'Playing — click to stop';
        statusBar.backgroundColor = undefined;
    }
    else {
        statusBar.text = '$(debug-pause) Conductor';
        statusBar.tooltip = 'Stopped — click to play';
        statusBar.backgroundColor = undefined;
    }
}
// Messages from the Strudel webview → relay to daemon + update local state
function handleWebviewMessage(msg) {
    client.send(msg);
    if (msg.type === 'state')
        client.updateState({ playing: msg.playing });
    if (msg.type === 'error')
        client.updateState({ error: msg.message });
    if (msg.type === 'cleared')
        client.updateState({ error: null });
    renderStatusBar();
}
function activate(context) {
    client = new client_1.ConductorClient(serverUrl());
    // ── Status bar ────────────────────────────────────────────────────────────
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.command = 'conductor.togglePlay';
    statusBar.show();
    context.subscriptions.push(statusBar);
    // ── Pattern tree view ─────────────────────────────────────────────────────
    const patternProvider = new patternsProvider_1.PatternProvider(client);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('conductorPatterns', patternProvider));
    // ── Daemon WS events → status bar + webview bridge ────────────────────────
    client.on('connected', () => {
        renderStatusBar();
        patternProvider.refresh();
        // Fetch authoritative state on (re)connect
        void client.fetchState().then(renderStatusBar).catch(() => { });
    });
    client.on('disconnected', renderStatusBar);
    client.on('message', (msg) => {
        // Forward broadcasts that the webview needs to act on
        if (msg.type === 'pattern' || msg.type === 'play' || msg.type === 'stop') {
            panel_1.StrudelPanel.instance?.post(msg);
        }
        renderStatusBar();
    });
    renderStatusBar();
    // ── Commands ──────────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('conductor.openPanel', () => {
        panel_1.StrudelPanel.createOrShow(context.extensionUri, handleWebviewMessage);
    }), vscode.commands.registerCommand('conductor.play', async () => {
        try {
            await client.play();
            client.updateState({ playing: true, error: null });
            renderStatusBar();
            // Ensure panel plays even when WS broadcast hasn't arrived yet
            panel_1.StrudelPanel.instance?.post({ type: 'play' });
        }
        catch (err) {
            vscode.window.showErrorMessage(`Conductor: ${String(err)}`);
        }
    }), vscode.commands.registerCommand('conductor.stop', async () => {
        try {
            await client.stop();
            client.updateState({ playing: false });
            renderStatusBar();
            panel_1.StrudelPanel.instance?.post({ type: 'stop' });
        }
        catch (err) {
            vscode.window.showErrorMessage(`Conductor: ${String(err)}`);
        }
    }), vscode.commands.registerCommand('conductor.togglePlay', async () => {
        await vscode.commands.executeCommand(client.getState().playing ? 'conductor.stop' : 'conductor.play');
    }), vscode.commands.registerCommand('conductor.pushPattern', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Conductor: No active editor.');
            return;
        }
        const code = editor.document.getText().trim();
        if (!code) {
            vscode.window.showWarningMessage('Conductor: Active file is empty.');
            return;
        }
        try {
            await client.setPattern(code);
            // If panel isn't open, offer to open it
            if (!panel_1.StrudelPanel.instance) {
                const choice = await vscode.window.showInformationMessage('Conductor: Pattern pushed.', 'Open Panel');
                if (choice === 'Open Panel') {
                    panel_1.StrudelPanel.createOrShow(context.extensionUri, handleWebviewMessage);
                }
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Conductor: ${String(err)}`);
        }
    }), vscode.commands.registerCommand('conductor.savePattern', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Pattern name',
            placeHolder: 'my-groove',
            validateInput: (v) => v.trim() ? undefined : 'Name cannot be empty',
        });
        if (!name)
            return;
        try {
            await client.savePattern(name.trim());
            patternProvider.refresh();
            vscode.window.showInformationMessage(`Conductor: Saved "${name.trim()}".`);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Conductor: ${String(err)}`);
        }
    }), vscode.commands.registerCommand('conductor.loadPattern', async (arg) => {
        let name;
        if (typeof arg === 'string') {
            name = arg;
        }
        else if (arg instanceof patternsProvider_1.PatternItem) {
            name = arg.name;
        }
        else {
            try {
                const patterns = await client.listPatterns();
                if (!patterns.length) {
                    vscode.window.showInformationMessage('No saved patterns.');
                    return;
                }
                name = await vscode.window.showQuickPick(patterns.sort(), { placeHolder: 'Select a pattern' });
            }
            catch (err) {
                vscode.window.showErrorMessage(`Conductor: ${String(err)}`);
                return;
            }
        }
        if (!name)
            return;
        try {
            await client.loadPattern(name);
            if (!panel_1.StrudelPanel.instance) {
                panel_1.StrudelPanel.createOrShow(context.extensionUri, handleWebviewMessage);
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Conductor: ${String(err)}`);
        }
    }), vscode.commands.registerCommand('conductor.deletePattern', async (arg) => {
        const name = arg?.name ?? await vscode.window.showInputBox({ prompt: 'Pattern name to delete' });
        if (!name)
            return;
        const confirm = await vscode.window.showWarningMessage(`Delete pattern "${name}"?`, { modal: true }, 'Delete');
        if (confirm !== 'Delete')
            return;
        try {
            await client.deletePattern(name);
            patternProvider.refresh();
        }
        catch (err) {
            vscode.window.showErrorMessage(`Conductor: ${String(err)}`);
        }
    }), vscode.commands.registerCommand('conductor.refreshPatterns', () => patternProvider.refresh()), vscode.commands.registerCommand('conductor.initMcp', async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) {
            vscode.window.showWarningMessage('Conductor: No workspace folder open.');
            return;
        }
        const mcpPath = path.join(folders[0].uri.fsPath, '.mcp.json');
        const content = JSON.stringify({ mcpServers: { conductor: { type: 'http', url: `${serverUrl()}/mcp` } } }, null, 2) + '\n';
        try {
            if (fs.existsSync(mcpPath)) {
                const overwrite = await vscode.window.showWarningMessage('.mcp.json already exists. Overwrite?', { modal: true }, 'Overwrite');
                if (overwrite !== 'Overwrite')
                    return;
            }
            fs.writeFileSync(mcpPath, content, 'utf8');
            const doc = await vscode.workspace.openTextDocument(mcpPath);
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage('Conductor: .mcp.json created. Reload your AI IDE to activate.');
        }
        catch (err) {
            vscode.window.showErrorMessage(`Conductor: ${String(err)}`);
        }
    }));
}
function deactivate() {
    client?.dispose();
    panel_1.StrudelPanel.instance?.dispose();
}
//# sourceMappingURL=extension.js.map