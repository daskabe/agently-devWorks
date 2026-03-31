const DEFAULT_BRIDGE_PORT = 43110;
const STORAGE_KEY = "agentlyBridgePort";

function normalizePort(value) {
  const port = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return null;
  }

  return port;
}

async function loadSettings() {
  const input = document.getElementById("bridge-port");
  const status = document.getElementById("settings-status");

  if (!(input instanceof HTMLInputElement) || !(status instanceof HTMLElement)) {
    return;
  }

  try {
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    const port = normalizePort(stored[STORAGE_KEY]) ?? DEFAULT_BRIDGE_PORT;
    input.value = String(port);
  } catch {
    input.value = String(DEFAULT_BRIDGE_PORT);
    status.textContent = "Could not load saved settings.";
  }
}

async function saveSettings(event) {
  event.preventDefault();

  const input = document.getElementById("bridge-port");
  const status = document.getElementById("settings-status");

  if (!(input instanceof HTMLInputElement) || !(status instanceof HTMLElement)) {
    return;
  }

  const port = normalizePort(input.value);
  if (port === null) {
    status.textContent = "Enter a port between 1024 and 65535.";
    return;
  }

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: port });
    status.textContent = `Saved. Chrome bridge port is now ${port}.`;
  } catch {
    status.textContent = "Could not save settings.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("bridge-settings-form");
  if (form) {
    form.addEventListener("submit", saveSettings);
  }

  void loadSettings();
});
