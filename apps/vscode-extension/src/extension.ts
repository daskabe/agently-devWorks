import * as vscode from "vscode";
import { BridgeServer } from "./bridgeServer";
import { AgentlyPanel } from "./panel";
import { PromptQueue } from "./promptQueue";
import { PromptQueueItem } from "./types";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const queue = new PromptQueue();
  const panel = new AgentlyPanel(context.extensionUri);
  const bridge = new BridgeServer();
  let isProcessing = false;

  const config = vscode.workspace.getConfiguration("agently");
  const port = config.get<number>("bridgePort", 43110);

  await bridge.start(port);

  bridge.on("prompt", async (payload) => {
    const item = queue.enqueue(payload);

    if (config.get<boolean>("autoOpenPanelOnPrompt", true)) {
      panel.show();
    }

    panel.postInfo(`Prompt queued at ${new Date(item.receivedAt).toLocaleTimeString()}`);
    panel.postQueue(queue.all());

    void vscode.window.showInformationMessage(`Agently prompt received: ${payload.text}`);

    if (config.get<boolean>("autoProcessQueue", false)) {
      await processNextQueueItem(queue, panel, () => isProcessing, (value) => {
        isProcessing = value;
      });
    }
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
      await processNextQueueItem(queue, panel, () => isProcessing, (value) => {
        isProcessing = value;
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agently.processQueue", async () => {
      if (isProcessing) {
        panel.postInfo("Queue is already processing.");
        return;
      }

      while (queue.size() > 0) {
        await processNextQueueItem(queue, panel, () => isProcessing, (value) => {
          isProcessing = value;
        });
      }
    })
  );

  void vscode.window.showInformationMessage(`Agently bridge listening on http://127.0.0.1:${port}`);
}

async function processNextQueueItem(
  queue: PromptQueue,
  panel: AgentlyPanel,
  getProcessing: () => boolean,
  setProcessing: (value: boolean) => void
): Promise<void> {
  if (getProcessing()) {
    panel.postInfo("Queue is already processing.");
    return;
  }

  const next = queue.dequeue();

  if (!next) {
    panel.postInfo("Queue is empty.");
    panel.postQueue(queue.all());
    return;
  }

  setProcessing(true);
  panel.postInfo(`Processing: ${next.text}`);

  try {
    const handled = await processWithAntigravity(next);

    if (handled) {
      panel.postInfo(`Processed with Antigravity: ${next.text}`);
      void vscode.window.showInformationMessage(`Agently processed: ${next.text}`);
    } else {
      const fallbackUsed = await insertPromptCommentFallback(next);
      if (fallbackUsed) {
        panel.postInfo("Antigravity unavailable; used editor comment fallback.");
      } else {
        queue.enqueue(next);
        panel.postInfo("No editor available; prompt returned to queue.");
      }
    }
  } finally {
    setProcessing(false);
    panel.postQueue(queue.all());
  }
}

async function processWithAntigravity(item: PromptQueueItem): Promise<boolean> {
  const config = vscode.workspace.getConfiguration("agently");
  const commandId = config.get<string>("processorCommand", "antigravity.prompt.send");

  try {
    await vscode.commands.executeCommand(commandId, {
      prompt: item.text,
      source: item.source,
      context: item.context,
      metadata: {
        id: item.id,
        receivedAt: item.receivedAt
      }
    });

    return true;
  } catch {
    return false;
  }
}

async function insertPromptCommentFallback(item: PromptQueueItem): Promise<boolean> {
  const config = vscode.workspace.getConfiguration("agently");
  if (!config.get<boolean>("fallbackInsertComment", true)) {
    return false;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return false;
  }

  const insertion = `\n/*\nAgently prompt: ${item.text}\nselector: ${item.context?.selector ?? "-"}\nurl: ${item.context?.pageUrl ?? "-"}\n*/\n`;

  await editor.edit((builder) => {
    builder.insert(editor.selection.active, insertion);
  });

  return true;
}

export function deactivate(): void {
  // No-op; server cleanup is handled by extension subscriptions.
}
