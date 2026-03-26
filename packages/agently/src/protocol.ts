import { BridgeEnvelope } from "./types";

export const CHANNEL = "agently";

export function createMessage<TPayload = unknown>(
  type: string,
  payload?: TPayload
): BridgeEnvelope<TPayload> {
  return {
    v: 1,
    id: crypto.randomUUID(),
    channel: CHANNEL,
    type,
    payload,
    timestamp: Date.now()
  };
}

export function isBridgeMessage(data: unknown): data is BridgeEnvelope {
  if (!data || typeof data !== "object") return false;

  const value = data as Record<string, unknown>;

  return value.channel === CHANNEL && typeof value.type === "string";
}
