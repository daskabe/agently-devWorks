import { createMessage } from "./protocol";
import { BridgeClientOptions, BridgeEnvelope, BridgeTransport } from "./types";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export function createBridgeClient(
  transports: BridgeTransport[],
  options: BridgeClientOptions = {}
) {
  const transport = transports.find((t) => t.isAvailable());

  if (!transport) {
    throw new Error("No transport available");
  }

  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pending = new Map<string, PendingRequest>();

  const unsubscribe = transport.subscribe((msg: BridgeEnvelope) => {
    if (!msg.requestId || !pending.has(msg.requestId)) return;

    const entry = pending.get(msg.requestId);
    if (!entry) return;

    clearTimeout(entry.timer);
    pending.delete(msg.requestId);
    entry.resolve(msg.payload);
  });

  function request<TResponse = unknown>(type: string, payload?: unknown): Promise<TResponse> {
    const msg = createMessage(type, payload);

    return new Promise<TResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(msg.id);
        reject(new Error(`Request timed out for message type \"${type}\"`));
      }, timeoutMs);

      pending.set(msg.id, {
        resolve: (value) => resolve(value as TResponse),
        reject,
        timer
      });

      transport.send(msg);
    });
  }

  function notify(type: string, payload?: unknown): void {
    transport.send(createMessage(type, payload));
  }

  function dispose(): void {
    unsubscribe();

    for (const [id, entry] of pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`Bridge client disposed before response for ${id}`));
      pending.delete(id);
    }
  }

  return {
    request,
    notify,
    dispose,
    transport
  };
}
