import * as vscode from "vscode";
import { BridgeServer } from "./bridgeServer";
import { AgentlyPanel } from "./panel";
import { PromptQueue } from "./promptQueue";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const queue = new PromptQueue();
  const panel = new AgentlyPanel(context.extensionUri);
  const bridge = new BridgeServer();

  const config = vscode.workspace.getConfiguration("agently");
  const port = config.get<number>("bridgePort", 43110);
  const autoOpenPanel = config.get<boolean>("autoOpenPanelOnPrompt", true);

  await bridge.start(port);

  bridge.on("prompt", (payload) => {
    const item = queue.enqueue(payload);

    if (autoOpenPanel) {
      panel.show();
    }

    panel.postInfo(`Prompt queued at ${new Date(item.receivedAt).toLocaleTimeString()}`);
    panel.postQueue(queue.all());

    void vscode.window.showInformationMessage(`Agently prompt received: ${payload.text}`);
  });

  context.subscriptions.push({
    dispose: () => {
      void bridge.stop();
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("agently.openPromptPanel", () => {
      panel.show();
      panel.postQueue(queue.all());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agently.applyQueuedPrompt", async () => {
      const next = queue.dequeue();

      if (!next) {
        void vscode.window.showInformationMessage("Agently queue is empty.");
        panel.postQueue(queue.all());
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage("Open a file before applying an Agently prompt.");
        queue.enqueue(next);
        panel.postQueue(queue.all());
        return;
      }

      const insertion = `\n/*\nAgently prompt: ${next.text}\nselector: ${next.context?.selector ?? "-"}\nurl: ${next.context?.pageUrl ?? "-"}\n*/\n`;

      await editor.edit((builder) => {
        builder.insert(editor.selection.active, insertion);
      });

      panel.postInfo("Applied one prompt to the active editor.");
      panel.postQueue(queue.all());
      void vscode.window.showInformationMessage("Agently prompt inserted into active file.");
    })
  );

  void vscode.window.showInformationMessage(`Agently bridge listening on http://127.0.0.1:${port}`);
}

export function deactivate(): void {
  // No-op; server cleanup is handled by extension subscriptions.
}
