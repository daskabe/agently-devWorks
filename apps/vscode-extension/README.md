# Agently VS Code Extension

This extension acts as a local bridge and prompt queue for browser integrations.

## Features

- **Local HTTP Bridge**: Listens for prompt payloads from the Chrome extension or other tools (default port `43110`).
- **Prompt Panel**: Visualizes the queue of incoming prompts.
- **Editor Integration**: Apply the next queued prompt to the active text editor with a single command.

## Getting Started

### 1. Build the Extension
Ensure you have all dependencies installed at the root of the monorepo, then build the extension:

```bash
# From the root of the monorepo
pnpm build --filter agently-vscode-extension

# OR from this directory
pnpm build
```

### 2. Run / Debug the Extension
To load the extension into a new VS Code window:

1. **Crucial**: Open the `apps/vscode-extension` folder **directly** in VS Code (not just the monorepo root).
2. Press **F5** (or go to **Run and Debug** -> **Run Extension**).
3. A new "Extension Development Host" window will open with Agently loaded.


### 3. Usage
Once the extension is running in the Host window:

1. Run the command **Agently: Open Prompt Panel** from the Command Palette (`Cmd+Shift+P`).
2. Interact with the demo app or Chrome extension to send prompts.
3. Use the command **Agently: Apply Next Queued Prompt** to process the queue.

## Configuration
You can customize the following settings in VS Code:

- `agently.bridgePort`: The port for the local HTTP server (default: `43110`).
- `agently.autoOpenPanelOnPrompt`: Automatically show the panel when a new prompt arrives.
