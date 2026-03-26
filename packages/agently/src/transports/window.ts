import { isBridgeMessage } from "../protocol";
import { BridgeEnvelope, BridgeTransport } from "../types";

export class WindowTransport implements BridgeTransport {
  name = "window";

  isAvailable(): boolean {
    return typeof window !== "undefined";
  }

  send(message: BridgeEnvelope): void {
    window.postMessage(message, window.origin);
  }

  subscribe(handler: (msg: BridgeEnvelope) => void): () => void {
    const listener = (e: MessageEvent) => {
      if (e.source !== window) return;
      if (isBridgeMessage(e.data)) {
        handler(e.data);
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }
}
