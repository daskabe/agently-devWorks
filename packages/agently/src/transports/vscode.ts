import { isBridgeMessage } from "../protocol";
import { BridgeEnvelope, BridgeTransport } from "../types";

type VsCodeApi = {
  postMessage: (message: BridgeEnvelope) => void;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    __agently_vscode_api?: VsCodeApi;
  }
}

function getApi(): VsCodeApi | null {
  if (typeof window === "undefined") return null;
  if (typeof window.acquireVsCodeApi !== "function") return null;

  if (!window.__agently_vscode_api) {
    window.__agently_vscode_api = window.acquireVsCodeApi();
  }

  return window.__agently_vscode_api;
}

export class VscodeTransport implements BridgeTransport {
  name = "vscode";

  isAvailable(): boolean {
    return !!getApi();
  }

  send(message: BridgeEnvelope): void {
    const api = getApi();
    if (!api) throw new Error("VSCode transport not available");
    api.postMessage(message);
  }

  subscribe(handler: (msg: BridgeEnvelope) => void): () => void {
    const listener = (e: MessageEvent) => {
      if (isBridgeMessage(e.data)) {
        handler(e.data);
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }
}
