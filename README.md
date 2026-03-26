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

### `chrome-extension`

A Manifest V3 content-script extension that enables **Shift + left-click** prompting on local pages.

- Intercepts `Shift + left-click`
- Shows an inline prompt panel at cursor location
- Collects clicked element context (`selector`, `htmlSnippet`, `pageUrl`)
- Sends payload to local VS Code bridge endpoint

### `demo-react-app`

A simple React dashboard with card components inspired by your reference layout (without complex charts).

- Uses `@agently/bridge` in-app
- Sends sample `prompt.send` events from card actions
- Works with the Chrome extension + VS Code extension bridge flow

## End-to-end local flow

1. Start VS Code extension host and run command **Agently: Open Prompt Panel**.
2. Load unpacked extension from `apps/chrome-extension` in Chrome.
3. Run the demo app (`pnpm --filter demo-react-app dev`) and open its local URL.
4. Hold **Shift**, left-click an element, enter prompt, click **Send**.
5. In VS Code run **Agently: Apply Next Queued Prompt**.

## Bridge payload shape

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
