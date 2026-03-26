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

## Current protocol contract

- `channel`: always `"agently"`
- `id`: unique message id
- `requestId`: set on responses and equals original request `id`
- `type`: event type (`prompt.send`, `prompt.result`, etc.)
- `payload`: event-specific object
