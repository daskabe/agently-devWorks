export interface BridgeEnvelope<T = unknown> {
  v: 1;
  id: string;
  channel: "agently";
  type: string;
  payload?: T;
  requestId?: string;
  timestamp: number;
}

export interface BridgeTransport {
  name: string;
  isAvailable(): boolean;
  send(message: BridgeEnvelope): void;
  subscribe(handler: (msg: BridgeEnvelope) => void): () => void;
}

export interface BridgeClientOptions {
  requestTimeoutMs?: number;
}
