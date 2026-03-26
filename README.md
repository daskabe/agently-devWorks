# agently-devWorks

Starter Turborepo for building:

- a VS Code extension host bridge,
- a browser/Chrome extension bridge,
- and a reusable `agently` TypeScript library.

## Packages

### `@agently/bridge`

A lightweight bridge client with pluggable transports.

```ts
import {
  createBridgeClient,
  VscodeTransport,
  WindowTransport
} from "@agently/bridge";

const client = createBridgeClient([
  new VscodeTransport(),
  new WindowTransport()
]);

client.notify("prompt.send", { text: "change the background to blue" });
```

### `agently-vscode-extension`

A local bridge server + prompt queue panel inside VS Code.

- Starts an HTTP server on `127.0.0.1:<agently.bridgePort>` (default `43110`)
- Accepts `POST /agently/prompt` payloads from browser integrations
- Queues prompts in an Agently panel
- Applies the next queued prompt to the active editor via command

Example payload:

```json
{
  "text": "change the background to blue",
  "source": "chrome-extension",
  "context": {
    "selector": "#hero",
    "pageUrl": "http://localhost:3000/",
    "htmlSnippet": "<section id=\"hero\">..."
  }
}
```

## Current protocol contract

- `channel`: always `"agently"`
- `id`: unique message id
- `requestId`: set on responses and equals original request `id`
- `type`: event type (`prompt.send`, `prompt.result`, etc.)
- `payload`: event-specific object
