import { createServer, IncomingMessage, Server } from "node:http";
import { EventEmitter } from "node:events";
import { PromptRequestPayload } from "./types";

type BridgeServerEvents = {
  prompt: [payload: PromptRequestPayload];
};

export class BridgeServer extends EventEmitter {
  #server: Server | undefined;

  async start(port: number): Promise<void> {
    if (this.#server) return;

    this.#server = createServer(async (req, res) => {
      const { method = "GET", url = "/" } = req;

      // Handle CORS
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (method === "POST" && url === "/agently/prompt") {
        try {
          const payload = await parsePromptPayload(req);
          this.emit("prompt", payload);
          res.writeHead(202, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid payload" }));
        }

        return;
      }

      if (method === "GET" && url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "agently-vscode-bridge" }));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
    });

    await new Promise<void>((resolve, reject) => {
      this.#server?.listen(port, "127.0.0.1", () => resolve());
      this.#server?.once("error", reject);
    });
  }

  async stop(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;

    if (!server) return;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  override on<TEvent extends keyof BridgeServerEvents>(
    eventName: TEvent,
    listener: (...args: BridgeServerEvents[TEvent]) => void
  ): this {
    return super.on(eventName, listener);
  }
}

async function parsePromptPayload(req: IncomingMessage): Promise<PromptRequestPayload> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf-8");
  const data = JSON.parse(body) as PromptRequestPayload;

  if (!data || typeof data.text !== "string" || data.text.trim().length === 0) {
    throw new Error("Prompt text missing");
  }

  return data;
}
