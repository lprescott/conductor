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
exports.StrudelPanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const node_crypto_1 = require("node:crypto");
class StrudelPanel {
    static instance;
    panel;
    disposables = [];
    static createOrShow(extensionUri, onMessage) {
        const col = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
        if (StrudelPanel.instance) {
            StrudelPanel.instance.panel.reveal(col);
            return StrudelPanel.instance;
        }
        const panel = vscode.window.createWebviewPanel('conductorStrudel', 'Conductor', col, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        });
        StrudelPanel.instance = new StrudelPanel(panel, extensionUri, onMessage);
        return StrudelPanel.instance;
    }
    constructor(panel, extensionUri, onMessage) {
        this.panel = panel;
        this.panel.webview.html = this.buildHtml(extensionUri);
        this.panel.webview.onDidReceiveMessage(onMessage, undefined, this.disposables);
        this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    }
    post(message) {
        void this.panel.webview.postMessage(message);
    }
    buildHtml(extensionUri) {
        const strudelUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'strudel.js'));
        const n = (0, node_crypto_1.randomBytes)(16).toString('hex');
        const templatePath = path.join(extensionUri.fsPath, 'media', 'index.html');
        return fs.readFileSync(templatePath, 'utf8')
            .replace(/\{\{NONCE\}\}/g, n)
            .replace('{{STRUDEL_URI}}', strudelUri.toString());
    }
    dispose() {
        StrudelPanel.instance = undefined;
        this.panel.dispose();
        for (const d of this.disposables)
            d.dispose();
        this.disposables = [];
    }
}
exports.StrudelPanel = StrudelPanel;
//# sourceMappingURL=panel.js.map