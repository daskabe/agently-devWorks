import { PromptQueueItem, PromptRequestPayload } from "./types";

export class PromptQueue {
  #items: PromptQueueItem[] = [];

  enqueue(payload: PromptRequestPayload): PromptQueueItem {
    const item: PromptQueueItem = {
      ...payload,
      id: crypto.randomUUID(),
      receivedAt: Date.now(),
      source: payload.source ?? "unknown"
    };

    this.#items.push(item);
    return item;
  }

  dequeue(): PromptQueueItem | undefined {
    return this.#items.shift();
  }

  all(): PromptQueueItem[] {
    return [...this.#items];
  }

  size(): number {
    return this.#items.length;
  }
}
