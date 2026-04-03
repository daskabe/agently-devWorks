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
  let port = 43110;
  let autoOpenPanel = true;
  let showNotifications = false;

  const refreshConfig = (): void => {
    const config = vscode.workspace.getConfiguration("agently");
    port = config.get<number>("bridgePort", 43110);
    autoOpenPanel = config.get<boolean>("autoOpenPanelOnPrompt", true);
    showNotifications = config.get<boolean>("showNotifications", false);
  };

  const notify = (message: string): void => {
    if (showNotifications) {
      void vscode.window.showInformationMessage(message);
    }
  };

  const restartBridge = async (): Promise<void> => {
    await bridge.stop();
    await bridge.start(port);
  };

  refreshConfig();
  await bridge.start(port);

  const processNextQueuedPrompt = async (trigger: "auto" | "manual"): Promise<void> => {
    if (isProcessing) {
      return;
    }

    const next = queue.dequeue();

    if (!next) {
      if (trigger === "manual") {
        void vscode.window.showInformationMessage("Agently queue is empty.");
      }

      panel.postQueue(queue.all());
      return;
    }

    isProcessing = true;

    try {
      const editor = await resolveTargetEditor(next);
      const chatPrompt = buildCopilotChatPrompt(next, editor);

      panel.postInfo("Sending queued prompt to Copilot Chat...");
      await openCopilotChatWithPrompt(chatPrompt);

      panel.postInfo("Prompt sent to Copilot Chat.");
      panel.postQueue(queue.all());
      notify("Prompt added to Copilot Chat.");
    } catch (error) {
      queue.prepend(next);
      panel.postQueue(queue.all());

      const message = toUserErrorMessage(error);
      panel.postInfo(`Copilot processing failed: ${message}`);
      void vscode.window.showErrorMessage(`Agently could not process prompt with Copilot: ${message}`);
    } finally {
      isProcessing = false;
    }
  };

  bridge.on("prompt", (payload) => {
    const wasEmpty = queue.size() === 0;
    const item = queue.enqueue(payload);

    if (autoOpenPanel) {
      panel.show();
    }

    panel.postInfo(`Prompt queued at ${new Date(item.receivedAt).toLocaleTimeString()}`);
    panel.postQueue(queue.all());

    notify(`Agently prompt received: ${payload.text}`);

    if (wasEmpty) {
      void processNextQueuedPrompt("auto");
    }
  });

  panel.onPlayPrompt(async (id) => {
    if (isProcessing) {
      return;
    }

    const item = queue.dequeueById(id);
    if (!item) {
      return;
    }

    isProcessing = true;
    try {
      const editor = await resolveTargetEditor(item);
      const chatPrompt = buildCopilotChatPrompt(item, editor);

      panel.postInfo("Sending queued prompt to Copilot Chat...");
      await openCopilotChatWithPrompt(chatPrompt);

      panel.postInfo("Prompt sent to Copilot Chat.");
      panel.postQueue(queue.all());
      notify("Prompt added to Copilot Chat.");
    } catch (error) {
      queue.prepend(item);
      panel.postQueue(queue.all());

      const message = toUserErrorMessage(error);
      panel.postInfo(`Copilot processing failed: ${message}`);
      void vscode.window.showErrorMessage(`Agently could not process prompt with Copilot: ${message}`);
    } finally {
      isProcessing = false;
    }
  });

  context.subscriptions.push({
    dispose: () => {
      void bridge.stop();
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("agently.openSettings", async () => {
      await vscode.commands.executeCommand("workbench.action.openSettings", "agently");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agently.openPromptPanel", () => {
      panel.show();
      panel.postQueue(queue.all());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agently.applyQueuedPrompt", async () => {
      await processNextQueuedPrompt("manual");
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      const bridgePortChanged = event.affectsConfiguration("agently.bridgePort");
      const panelSettingChanged = event.affectsConfiguration("agently.autoOpenPanelOnPrompt");
      const notificationsSettingChanged = event.affectsConfiguration("agently.showNotifications");

      if (!bridgePortChanged && !panelSettingChanged && !notificationsSettingChanged) {
        return;
      }

      const previousPort = port;
      refreshConfig();

      if (bridgePortChanged && port !== previousPort) {
        try {
          await restartBridge();
          notify(`Agently bridge restarted on http://127.0.0.1:${port}`);
        } catch (error) {
          const message = toUserErrorMessage(error);
          void vscode.window.showErrorMessage(`Agently could not restart bridge on port ${port}: ${message}`);
        }
      }
    })
  );

  notify(`Agently bridge listening on http://127.0.0.1:${port}`);
}

export function deactivate(): void {
  // No-op; server cleanup is handled by extension subscriptions.
}

function buildCopilotChatPrompt(item: PromptQueueItem, editor: vscode.TextEditor | undefined): string {
  const currentFile = editor?.document.uri.scheme === "file" ? vscode.workspace.asRelativePath(editor.document.uri) : "-";
  const languageId = editor?.document.languageId ?? "-";
  const selectedCode = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : "<no selection>";

  return [
    `${item.text}`,
    `context: `,
    `Page URL: ${item.context?.pageUrl ?? "-"}`,
    `DOM selector: ${item.context?.selector ?? "-"}`,
    `Current file: ${currentFile}`,
    `Language: ${languageId}`,
    // "Selected code:",
    selectedCode
  ].join("\n");
}

async function openCopilotChatWithPrompt(prompt: string): Promise<void> {
  const attempts: Array<[string, unknown[]]> = [
    ["workbench.action.chat.open", [{ query: prompt, mode: "agent" }]],
    ["workbench.action.chat.open", [{ query: prompt }]],
    ["workbench.action.chat.open", [prompt]]
  ];

  for (const [command, args] of attempts) {
    try {
      await vscode.commands.executeCommand(command, ...args);

      // Best effort: if available, submit immediately after opening/prefilling.
      try {
        await vscode.commands.executeCommand("workbench.action.chat.submit");
      } catch {
        // Some VS Code builds may not expose this command.
      }

      return;
    } catch {
      // Try the next command signature.
    }
  }

  throw new Error("Unable to open Copilot Chat with prompt. Ensure GitHub Copilot Chat is installed and enabled.");
}

function toUserErrorMessage(error: unknown): string {
  if (error instanceof vscode.LanguageModelError) {
    return `${error.message} (${error.code})`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error.";
}

async function resolveTargetEditor(item: PromptQueueItem): Promise<vscode.TextEditor | undefined> {
  const originEditor = await resolveEditorFromPromptOrigin(item);
  if (originEditor) {
    return originEditor;
  }

  const active = vscode.window.activeTextEditor;
  if (isEditableEditor(active)) {
    return active;
  }

  const visible = vscode.window.visibleTextEditors.find((editor) => isEditableEditor(editor));
  if (visible) {
    return visible;
  }

  const demoEditor = await openPreferredEditorByAppName("demo-react-app");
  if (demoEditor) {
    return demoEditor;
  }

  const firstWorkspaceFile = await openFirstWorkspaceSourceFile();
  if (firstWorkspaceFile) {
    return firstWorkspaceFile;
  }

  return undefined;
}

async function resolveEditorFromPromptOrigin(item: PromptQueueItem): Promise<vscode.TextEditor | undefined> {
  const pageUrl = item.context?.pageUrl;
  const source = normalizeSource(item.source);
  const page = parsePageUrl(pageUrl);

  if (source) {
    const bySourceName = await openPreferredEditorByAppName(source);
    if (bySourceName) {
      return bySourceName;
    }
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const appsRoot = vscode.Uri.joinPath(folder.uri, "apps");
    const appFolders = await listChildDirectories(appsRoot);

    if (appFolders.length === 0) {
      continue;
    }

    const bySource = source
      ? appFolders.find((appUri) => appUri.path.toLowerCase().endsWith(`/${source.toLowerCase()}`))
      : undefined;
    if (bySource) {
      const editor = await openPreferredEditor(bySource);
      if (editor) {
        return editor;
      }
    }

    if (!page?.port) {
      continue;
    }

    for (const appUri of appFolders) {
      const appPort = await detectAppDevPort(appUri);
      if (appPort && appPort === page.port) {
        const editor = await openPreferredEditor(appUri);
        if (editor) {
          return editor;
        }
      }
    }
  }

  return undefined;
}

function parsePageUrl(value: string | undefined): { hostname: string; port: number | undefined } | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return {
      hostname: url.hostname,
      port: url.port ? Number(url.port) : undefined
    };
  } catch {
    return undefined;
  }
}

async function listChildDirectories(parent: vscode.Uri): Promise<vscode.Uri[]> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(parent);
    return entries
      .filter(([, type]) => type === vscode.FileType.Directory)
      .map(([name]) => vscode.Uri.joinPath(parent, name));
  } catch {
    return [];
  }
}

async function detectAppDevPort(appUri: vscode.Uri): Promise<number | undefined> {
  const packageJson = await readWorkspaceText(vscode.Uri.joinPath(appUri, "package.json"));
  if (!packageJson) {
    return undefined;
  }

  let parsed: { scripts?: { dev?: string } } | undefined;
  try {
    parsed = JSON.parse(packageJson) as { scripts?: { dev?: string } };
  } catch {
    return undefined;
  }

  const devScript = parsed.scripts?.dev ?? "";
  const isVite = /\bvite\b/.test(devScript);
  if (!isVite) {
    return undefined;
  }

  const scriptPort = devScript.match(/--port\s+(\d+)/)?.[1];
  if (scriptPort) {
    return Number(scriptPort);
  }

  const viteConfig = await readWorkspaceText(vscode.Uri.joinPath(appUri, "vite.config.ts"));
  const vitePort = viteConfig?.match(/\bport\s*:\s*(\d+)\b/)?.[1];
  if (vitePort) {
    return Number(vitePort);
  }

  // Vite default dev server port when not explicitly configured.
  return 5173;
}

function normalizeSource(source: string | undefined): string | undefined {
  if (!source) {
    return undefined;
  }

  const normalized = source.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "webapp") {
    return "demo-react-app";
  }

  return normalized;
}

async function openPreferredEditorByAppName(appName: string): Promise<vscode.TextEditor | undefined> {
  const candidates = [
    `**/${appName}/src/App.tsx`,
    `**/${appName}/src/main.tsx`,
    `**/${appName}/src/App.jsx`,
    `**/${appName}/src/main.jsx`,
    `**/${appName}/src/index.tsx`,
    `**/${appName}/src/index.jsx`,
    `**/${appName}/index.html`
  ];

  for (const pattern of candidates) {
    const [uri] = await vscode.workspace.findFiles(pattern, "**/{node_modules,dist,build,.turbo}/**", 1);
    if (!uri) {
      continue;
    }

    try {
      const document = await vscode.workspace.openTextDocument(uri);
      return await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
    } catch {
      // Try next candidate pattern.
    }
  }

  return undefined;
}

async function openFirstWorkspaceSourceFile(): Promise<vscode.TextEditor | undefined> {
  const patterns = [
    "**/src/App.tsx",
    "**/src/main.tsx",
    "**/src/index.tsx",
    "**/src/App.jsx",
    "**/src/main.jsx",
    "**/*.tsx",
    "**/*.ts",
    "**/*.jsx",
    "**/*.js",
    "**/*.html"
  ];

  for (const pattern of patterns) {
    const [uri] = await vscode.workspace.findFiles(pattern, "**/{node_modules,dist,build,.turbo}/**", 1);
    if (!uri) {
      continue;
    }

    try {
      const document = await vscode.workspace.openTextDocument(uri);
      return await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
    } catch {
      // Try the next pattern.
    }
  }

  return undefined;
}

async function openPreferredEditor(appUri: vscode.Uri): Promise<vscode.TextEditor | undefined> {
  const candidates = [
    "src/App.tsx",
    "src/main.tsx",
    "src/App.jsx",
    "src/main.jsx",
    "src/index.tsx",
    "src/index.jsx",
    "index.html"
  ];

  for (const relativePath of candidates) {
    const uri = vscode.Uri.joinPath(appUri, relativePath);
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      return await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
    } catch {
      // Continue searching for the next likely entry file.
    }
  }

  return undefined;
}

async function readWorkspaceText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return undefined;
  }
}

function isEditableEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
  if (!editor) {
    return false;
  }

  if (editor.document.isUntitled) {
    return true;
  }

  return editor.document.uri.scheme === "file";
}
