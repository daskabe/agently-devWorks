export interface PromptContext {
  selector?: string;
  htmlSnippet?: string;
  pageUrl?: string;
}

export interface PromptRequestPayload {
  text: string;
  context?: PromptContext;
  source?: "webapp" | "chrome-extension" | "unknown";
  timestamp?: number;
}

export interface PromptQueueItem extends PromptRequestPayload {
  id: string;
  receivedAt: number;
}
