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

  dequeueById(id: string): PromptQueueItem | undefined {
    const index = this.#items.findIndex((item) => item.id === id);
    if (index === -1) {
      return undefined;
    }
    return this.#items.splice(index, 1)[0];
  }

  prepend(item: PromptQueueItem): void {
    this.#items.unshift(item);
  }

  all(): PromptQueueItem[] {
    return [...this.#items];
  }

  size(): number {
    return this.#items.length;
  }
}
