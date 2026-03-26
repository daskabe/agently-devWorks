import * as vscode from "vscode";
import { PromptQueueItem } from "./types";

export class AgentlyPanel {
  #panel: vscode.WebviewPanel | undefined;
  #extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.#extensionUri = extensionUri;
  }

  show() {
    if (!this.#panel) {
      this.#panel = vscode.window.createWebviewPanel(
        "agentlyPromptPanel",
        "Agently Prompt Queue",
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      this.#panel.onDidDispose(() => {
        this.#panel = undefined;
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
      body { font-family: sans-serif; padding: 12px; }
      .meta { opacity: 0.75; font-size: 12px; }
      .card { border: 1px solid #3333; border-radius: 8px; padding: 8px; margin-bottom: 8px; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    </style>
  </head>
  <body>
    <h2>Agently Prompt Queue</h2>
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
          list.innerHTML = items.map((item) => `
            <div class="card">
              <div><strong>${escape(item.text)}</strong></div>
              <div class="meta">source: ${escape(item.source || 'unknown')}</div>
              <div class="meta">selector: <code>${escape(item.context?.selector || '-')}</code></div>
              <div class="meta">url: ${escape(item.context?.pageUrl || '-')}</div>
            </div>
          `).join('');
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
