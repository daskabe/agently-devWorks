chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "agently.openBottomPanel" });
  } catch {
    // Ignore tabs where the content script is not available.
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "agently.openSettingsPage") {
    return undefined;
  }

  chrome.runtime.openOptionsPage()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to open settings page."
      });
    });

  return true;
});
