import * as vscode from "vscode";
import { PromptQueueItem } from "./types";

export class AgentlyPanel {
  #panel: vscode.WebviewPanel | undefined;
  #extensionUri: vscode.Uri;
  #onPlayPrompt = new vscode.EventEmitter<string>();
  readonly onPlayPrompt = this.#onPlayPrompt.event;

  constructor(extensionUri: vscode.Uri) {
    this.#extensionUri = extensionUri;
  }

  show() {
    if (!this.#panel) {
      const localResourceRoots = [
        this.#extensionUri,
        ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri)
      ];

      this.#panel = vscode.window.createWebviewPanel(
        "agentlyPromptPanel",
        "Agently Prompt Queue",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots
        }
      );

      this.#panel.onDidDispose(() => {
        this.#panel = undefined;
      });

      this.#panel.webview.onDidReceiveMessage((message) => {
        if (message.type === 'playPrompt' && typeof message.id === 'string') {
          this.#onPlayPrompt.fire(message.id);
        }
      });

      this.#panel.webview.html = getHtml();
    }

    this.#panel.reveal(vscode.ViewColumn.Beside, true);
  }

  postQueue(items: PromptQueueItem[]) {
    this.#panel?.webview.postMessage({ type: "queue.update", payload: items });
  }

  postInfo(message: string) {
    this.#panel?.webview.postMessage({ type: "status", payload: { message } });
  }
}

function getHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Agently</title>
    <style>
      body {
        font-family: var(--vscode-font-family);
        padding: 12px;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }
      .header h2 {
        margin: 0;
        font-size: 18px;
      }
      .meta { opacity: 0.75; font-size: 12px; }
      .card {
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
        padding: 8px;
        margin-bottom: 8px;
        background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-foreground) 12%);
        display: flex;
        align-items: center;
      }
      .card-content {
        flex: 1;
        min-width: 0;
      }
      .play-btn {
        flex-shrink: 0;
        margin-left: 8px;
        width: 32px;
        height: 32px;
        border: 2px solid black;
        border-radius: 50%;
        background: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      .play-btn:hover {
        opacity: 0.8;
      }
      .play-btn svg {
        width: 14px;
        height: 14px;
        margin-left: 2px;
      }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    </style>
  </head>
  <body>
    <div class="header">
      <h2>Agently Prompt Queue</h2>
    </div>
    <div id="status" class="meta">Waiting for prompts…</div>
    <div id="list"></div>
    <script>
      const status = document.getElementById('status');
      const list = document.getElementById('list');

      window.addEventListener('message', (event) => {
        const message = event.data;

        if (message.type === 'status') {
          status.textContent = message.payload.message;
        }

        if (message.type === 'queue.update') {
          const items = message.payload || [];
          list.innerHTML = items.map((item) => \`
            <div class="card">
              <div class="card-content">
                <div><strong>\${escape(item.text)}</strong></div>
                <div class="meta">source: \${escape(item.source || 'unknown')}</div>
                <div class="meta">selector: <code>\${escape(item.context?.selector || '-')}</code></div>
                <div class="meta">url: \${escape(item.context?.pageUrl || '-')}</div>
              </div>
              <button class="play-btn" data-id="\${escape(item.id)}" title="Run this prompt">
                <svg viewBox="0 0 24 24" fill="black" xmlns="http://www.w3.org/2000/svg">
                  <polygon points="6,3 21,12 6,21" />
                </svg>
              </button>
            </div>
          \`).join('');
        }
      });

      const vscode = acquireVsCodeApi();

      document.getElementById('list').addEventListener('click', (e) => {
        const btn = e.target.closest('.play-btn');
        if (btn) {
          vscode.postMessage({ type: 'playPrompt', id: btn.dataset.id });
        }
      });

      function escape(value) {
        return String(value).replace(/[&<>"']/g, (ch) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[ch]));
      }
    </script>
  </body>
</html>`;
}
