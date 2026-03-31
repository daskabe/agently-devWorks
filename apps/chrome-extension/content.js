(() => {
  const DEFAULT_BRIDGE_PORT = 43110;
  const BRIDGE_PORT_STORAGE_KEY = "agentlyBridgePort";
  const OVERLAY_ID = "agently-overlay";
  const PANEL_ID = "agently-panel";
  const PANEL_MARGIN = 8;
  const DRAWER_ID = "agently-drawer";
  const DRAWER_RESIZE_ID = "agently-drawer-resize";
  const BOTTOM_PANEL_ID = "agently-bottom-panel";
  const BOTTOM_PANEL_RESIZE_ID = "agently-bottom-panel-resize";
  const BRAND_FONT_STYLE_ID = "agently-brand-font-style";
  const BRAND_FONT_FILE = "assets/fonts/MoiraiOne-Regular.ttf";

  let anchor = { x: 16, y: 16 };
  let selectedElement = null;
  let activeRecognition = null;
  let activeMicButton = null;
  let activeStatusNode = null;
  let queuedPrompts = [];
  let queueModeEnabled = false;
  let editingQueueIndex = null;
  let drawerWidth = 420;
  let bottomPanelHeight = 300;
  let panelMode = "popup";
  let pendingRetarget = null;
  let activeHoveredElement = null;
  const INTERNAL_ELEMENT_CLASSNAMES = new Set(["agentlyActive"]);

  function normalizePort(value) {
    const port = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      return DEFAULT_BRIDGE_PORT;
    }

    return port;
  }

  async function getBridgeUrl() {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return `http://127.0.0.1:${DEFAULT_BRIDGE_PORT}/agently/prompt`;
    }

    try {
      const stored = await chrome.storage.local.get([BRIDGE_PORT_STORAGE_KEY]);
      const port = normalizePort(stored[BRIDGE_PORT_STORAGE_KEY]);
      return `http://127.0.0.1:${port}/agently/prompt`;
    } catch {
      return `http://127.0.0.1:${DEFAULT_BRIDGE_PORT}/agently/prompt`;
    }
  }

  function setRetargetCursor(isActive) {
    document.documentElement.classList.toggle("agently-retarget-active", isActive);
    if (document.body) {
      document.body.classList.toggle("agently-retarget-active", isActive);
    }
  }

  function updateHoverChip(label) {
    const chip = document.getElementById("agently-hover-chip");
    if (!chip) {
      return;
    }

    chip.textContent = label || "";
    chip.classList.remove("agently-hidden");
    chip.classList.toggle("is-visible", Boolean(label));
  }

  function updateContextIndicator(label) {
    const indicator = document.getElementById("agently-context-indicator");
    if (!indicator) {
      return;
    }

    indicator.innerHTML = label
      ? `<span class="agently-context-label">${escapeHtml(label)}</span><button id="agently-clear-context" class="agently-context-clear" type="button" title="Remove selected context" aria-label="Remove selected context">×</button>`
      : "";
    indicator.classList.toggle("is-visible", Boolean(label));
  }

  function describeElement(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    if (element.id) {
      return `#${element.id}`;
    }

    const firstClass = Array.from(element.classList).find(
      (className) => className && !INTERNAL_ELEMENT_CLASSNAMES.has(className),
    );
    if (firstClass) {
      return `.${firstClass}`;
    }

    return `<${element.tagName.toLowerCase()}>`;
  }

  function getCleanElementClone(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    const clone = element.cloneNode(true);
    if (!(clone instanceof Element)) {
      return null;
    }

    clone.classList.remove(...INTERNAL_ELEMENT_CLASSNAMES);
    return clone;
  }

  function setActiveHoveredElement(element) {
    if (activeHoveredElement === element) {
      return;
    }

    if (activeHoveredElement instanceof Element) {
      activeHoveredElement.classList.remove("agentlyActive");
    }

    activeHoveredElement = element instanceof Element ? element : null;

    if (activeHoveredElement) {
      activeHoveredElement.classList.add("agentlyActive");
    }
  }

  function isBlockedTargetElement(target) {
    return target instanceof Element && target.id === "agently-bottom-panel-resize";
  }

  document.addEventListener(
    "mousemove",
    (event) => {
      if (!pendingRetarget) {
        return;
      }

      const panel =
        document.getElementById(PANEL_ID) ??
        document.getElementById(DRAWER_ID) ??
        document.getElementById(BOTTOM_PANEL_ID);

      if (panel?.contains(event.target) || isBlockedTargetElement(event.target)) {
        setActiveHoveredElement(null);
        updateHoverChip("");
        return;
      }

      setActiveHoveredElement(event.target instanceof Element ? event.target : null);
      updateHoverChip(
        event.target instanceof Element ? describeElement(event.target) : "",
      );
    },
    true,
  );

  document.addEventListener(
    "mousedown",
    (event) => {
      if (pendingRetarget && event.button === 0) {
        const panel =
          document.getElementById(PANEL_ID) ??
          document.getElementById(DRAWER_ID) ??
          document.getElementById(BOTTOM_PANEL_ID);
        if (panel?.contains(event.target) || isBlockedTargetElement(event.target)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const nextMode = pendingRetarget.mode;
        const nextValue = pendingRetarget.inputValue;

        anchor = { x: event.clientX, y: event.clientY };
        selectedElement = event.target instanceof Element ? event.target : null;
        const selectedLabel = describeElement(selectedElement);
        setActiveHoveredElement(null);
        pendingRetarget = null;
        setRetargetCursor(false);

        removePanel();
        showPanel(nextMode, {
          initialValue: nextValue,
          contextAdded: true,
          contextLabel: selectedLabel,
        });
        return;
      }

      if (!event.shiftKey || event.button !== 0) {
        return;
      }

      const existingPanel =
        document.getElementById(PANEL_ID) ?? document.getElementById(DRAWER_ID);
      if (existingPanel?.contains(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      anchor = { x: event.clientX, y: event.clientY };
      selectedElement = event.target instanceof Element ? event.target : null;

      removePanel();
      showPanel();
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && pendingRetarget) {
        event.preventDefault();
        event.stopPropagation();
        const retargetButton = document.getElementById("agently-retarget");
        if (retargetButton instanceof HTMLElement) {
          retargetButton.blur();
        }
        pendingRetarget = null;
        setActiveHoveredElement(null);
        updateHoverChip("");
        setRetargetCursor(false);
        setStatus(activeStatusNode, "Target selection cancelled.");
        return;
      }

      if (event.key === "Escape" && activeRecognition) {
        event.preventDefault();
        event.stopPropagation();
        stopActiveRecognition();
        return;
      }

      if (
        event.key !== "Escape" ||
        (panelMode !== "drawer" && panelMode !== "bottom")
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      removePanel();
    },
    true,
  );

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type !== "agently.openBottomPanel") {
        return;
      }

      anchor = {
        x: Math.max(16, Math.floor(window.innerWidth / 2)),
        y: Math.max(16, window.innerHeight - 16),
      };
      selectedElement = null;

      removePanel();
      showPanel("bottom");
    });
  }

  function setRecordingUiActive(isActive) {
    if (activeMicButton instanceof HTMLElement) {
      activeMicButton.classList.toggle("is-active", isActive);
    }
  }

  function stopActiveRecognition() {
    if (!activeRecognition) {
      return false;
    }

    const recognition = activeRecognition;
    activeRecognition = null;
    setRecordingUiActive(false);

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;

    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        // No-op.
      }
    }

    setStatus(activeStatusNode, "Voice input stopped.");
    return true;
  }

  function ensureBrandFontLoaded() {
    if (document.getElementById(BRAND_FONT_STYLE_ID)) {
      return;
    }

    const fontUrl =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL(BRAND_FONT_FILE)
        : BRAND_FONT_FILE;

    const style = document.createElement("style");
    style.id = BRAND_FONT_STYLE_ID;
    style.textContent = `
      @font-face {
        font-family: "Moirai One";
        src: url("${fontUrl}") format("truetype");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function showPanel(mode, opts) {
    mode = mode || "popup";
    opts = opts || {};
    panelMode = mode;
    ensureBrandFontLoaded();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "agently-overlay";

    const panel = document.createElement("div");
    if (mode === "drawer") {
      panel.id = DRAWER_ID;
      panel.className = "agently-panel agently-drawer";
      panel.style.width = `${drawerWidth}px`;
    } else if (mode === "bottom") {
      panel.id = BOTTOM_PANEL_ID;
      panel.className = "agently-panel agently-bottom-panel";
      bottomPanelHeight = Math.min(
        bottomPanelHeight,
        Math.max(150, Math.floor(window.innerHeight * 0.5)),
      );
      panel.style.height = `${bottomPanelHeight}px`;
    } else {
      panel.id = PANEL_ID;
      panel.className = "agently-panel";
      panel.style.left = `${Math.max(PANEL_MARGIN, anchor.x)}px`;
      panel.style.top = `${Math.max(PANEL_MARGIN, anchor.y)}px`;
    }

    panel.innerHTML = `
      <div class="agently-panel-inner">
        <div class="agently-header">
          <div class="agently-brand-block">
            <div class="agently-brand">Agently</div>
            <div class="agently-brand-byline">by <a class="agently-brand-author" href="https://www.linkedin.com/in/dawita/" target="_blank" rel="noopener noreferrer">dawit</a></div>
          </div>
          <div class="agently-header-actions">
            <button id="agently-maximize" class="agently-icon-button${mode === "drawer" ? " agently-hidden" : ""}" title="Open in drawer" aria-label="Open in drawer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                <path d="M15 3v18"></path>
              </svg>
            </button>
            <button id="agently-open-bottom" class="agently-icon-button${mode === "bottom" ? " agently-hidden" : ""}" title="Open as bottom panel" aria-label="Open as bottom panel">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                <path d="M3 15h18"></path>
              </svg>
            </button>
            <button id="agently-mic" class="agently-icon-button" title="Voice input" aria-label="Voice input">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <path d="M12 19v3"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <rect x="9" y="2" width="6" height="13" rx="3"></rect>
              </svg>
            </button>
            <button id="agently-settings" class="agently-icon-button" title="Open settings" aria-label="Open settings">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
        </div>
        <div class="agently-input-shell${mode === "drawer" || mode === "bottom" ? " agently-input-shell-targeted" : ""}">
          <textarea id="agently-input" class="agently-textarea${mode === "drawer" || mode === "bottom" ? " agently-textarea-targeted" : ""}" placeholder="Your prompt here..."></textarea>
          <div id="agently-hover-chip" class="agently-hover-chip"></div>
          <div id="agently-context-indicator" class="agently-context-indicator${mode === "drawer" || mode === "bottom" ? "" : " agently-hidden"}${opts.contextAdded || selectedElement ? " is-visible" : ""}">${
            opts.contextLabel || describeElement(selectedElement)
              ? `<span class="agently-context-label">${escapeHtml(opts.contextLabel || describeElement(selectedElement) || "")}</span><button id="agently-clear-context" class="agently-context-clear" type="button" title="Remove selected context" aria-label="Remove selected context">×</button>`
              : ""
          }</div>
          <button
            id="agently-retarget"
            class="agently-input-corner-button${mode === "drawer" || mode === "bottom" ? "" : " agently-hidden"}"
            title="Select a new target element"
            aria-label="Select a new target element"
          >
 <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-crosshair-icon lucide-crosshair"><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></svg>
          </button>
        </div>
        <div class="agently-controls">
          <div class="agently-queue-label">
            <input id="agently-queue-mode" type="checkbox" />
            <span style="font-size: 14px;">Queue mode</span>
            <span class="agently-info-chip" title="Queue mode lets you add multiple prompts first, then send them together to your IDE"><sup>i</sup></span>
          </div>
          <div class="agently-actions">
            <button id="agently-cancel" class="agently-button">Cancel</button>
            <button id="agently-import" class="agently-icon-button agently-hidden" title="Import prompts from JSON" aria-label="Import prompts from JSON">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4"/></svg>
            </button>
            <button id="agently-add-queue" class="agently-icon-button agently-hidden" title="Add to queue" aria-label="Add to queue">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            </button>
            <button id="agently-send" class="agently-button agently-button-primary">Send</button>
          </div>
        </div>
        <div id="agently-status" class="agently-status"></div>
        <div id="agently-queue-list" class="agently-queue-container"></div>
      </div>
    `;

    panel.addEventListener("click", (event) => event.stopPropagation());

    if (mode === "drawer") {
      const resizeHandle = document.createElement("div");
      resizeHandle.id = DRAWER_RESIZE_ID;
      resizeHandle.className = "agently-drawer-resize";
      resizeHandle.style.right = `${drawerWidth}px`;

      let isResizing = false;
      let resizeStartX = 0;
      let resizeStartWidth = 0;

      resizeHandle.addEventListener("mousedown", (e) => {
        isResizing = true;
        resizeStartX = e.clientX;
        resizeStartWidth = panel.offsetWidth;
        resizeHandle.classList.add("is-resizing");
        e.preventDefault();
      });

      const onResizeMouseMove = (e) => {
        if (!isResizing) {
          return;
        }
        const delta = resizeStartX - e.clientX;
        const newWidth = Math.max(
          280,
          Math.min(window.innerWidth - 40, resizeStartWidth + delta),
        );
        drawerWidth = newWidth;
        panel.style.width = `${newWidth}px`;
        resizeHandle.style.right = `${newWidth}px`;
      };

      const onResizeMouseUp = () => {
        isResizing = false;
        resizeHandle.classList.remove("is-resizing");
      };

      document.addEventListener("mousemove", onResizeMouseMove);
      document.addEventListener("mouseup", onResizeMouseUp);

      panel._cleanupResize = () => {
        document.removeEventListener("mousemove", onResizeMouseMove);
        document.removeEventListener("mouseup", onResizeMouseUp);
      };

      document.body.append(panel, resizeHandle);
    } else if (mode === "bottom") {
      const resizeHandle = document.createElement("div");
      resizeHandle.id = BOTTOM_PANEL_RESIZE_ID;
      resizeHandle.className = "agently-bottom-panel-resize";

      const syncBottomResizeHandle = (height) => {
        resizeHandle.style.bottom = `${Math.max(0, height)}px`;
      };

      syncBottomResizeHandle(bottomPanelHeight);

      let isResizing = false;
      let resizeStartY = 0;
      let resizeStartHeight = 0;

      resizeHandle.addEventListener("mousedown", (e) => {
        isResizing = true;
        resizeStartY = e.clientY;
        resizeStartHeight = panel.offsetHeight;
        resizeHandle.classList.add("is-resizing");
        e.preventDefault();
      });

      const onResizeMouseMove = (e) => {
        if (!isResizing) {
          return;
        }
        const delta = resizeStartY - e.clientY;
        const maxHeight = Math.max(150, Math.floor(window.innerHeight * 0.5));
        const newHeight = Math.max(
          150,
          Math.min(maxHeight, resizeStartHeight + delta),
        );
        bottomPanelHeight = newHeight;
        panel.style.height = `${newHeight}px`;
        syncBottomResizeHandle(newHeight);
      };

      const onResizeMouseUp = () => {
        isResizing = false;
        resizeHandle.classList.remove("is-resizing");
      };

      document.addEventListener("mousemove", onResizeMouseMove);
      document.addEventListener("mouseup", onResizeMouseUp);

      panel._cleanupResize = () => {
        document.removeEventListener("mousemove", onResizeMouseMove);
        document.removeEventListener("mouseup", onResizeMouseUp);
      };

      document.body.append(panel, resizeHandle);
    } else {
      overlay.addEventListener("click", removePanel);
      document.body.append(overlay, panel);

      requestAnimationFrame(() => {
        const panelRect = panel.getBoundingClientRect();
        const maxLeft = Math.max(
          PANEL_MARGIN,
          window.innerWidth - panelRect.width - PANEL_MARGIN,
        );
        const maxTop = Math.max(
          PANEL_MARGIN,
          window.innerHeight - panelRect.height - PANEL_MARGIN,
        );
        const nextLeft = Math.min(Math.max(PANEL_MARGIN, anchor.x), maxLeft);
        const nextTop = Math.min(Math.max(PANEL_MARGIN, anchor.y), maxTop);

        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
      });
    }

    const input = panel.querySelector("#agently-input");
    const sendBtn = panel.querySelector("#agently-send");
    const addQueueBtn = panel.querySelector("#agently-add-queue");
    const importBtn = panel.querySelector("#agently-import");
    const cancelBtn = panel.querySelector("#agently-cancel");
    const micBtn = panel.querySelector("#agently-mic");
    const status = panel.querySelector("#agently-status");
    const queueMode = panel.querySelector("#agently-queue-mode");
    const queueList = panel.querySelector("#agently-queue-list");
    const maximizeBtn = panel.querySelector("#agently-maximize");
    const bottomPanelBtn = panel.querySelector("#agently-open-bottom");
    const settingsBtn = panel.querySelector("#agently-settings");
    const retargetBtn = panel.querySelector("#agently-retarget");
    const contextIndicator = panel.querySelector("#agently-context-indicator");
    const clearContextBtn = panel.querySelector("#agently-clear-context");
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!(input instanceof HTMLTextAreaElement)) {
      return;
    }

    activeMicButton = micBtn instanceof HTMLElement ? micBtn : null;
    activeStatusNode = status instanceof HTMLElement ? status : null;

    if (opts.initialValue) {
      input.value = opts.initialValue;
    }

    if (queueMode instanceof HTMLInputElement) {
      queueMode.checked = queueModeEnabled || queuedPrompts.length > 0;
    }

    input.focus();

    const setMicActiveState = (isActive) => {
      setRecordingUiActive(isActive);
    };

    const setHidden = (node, isHidden) => {
      if (node instanceof HTMLElement) {
        node.classList.toggle("agently-hidden", isHidden);
      }
    };

    const updateQueueControls = () => {
      const isQueueMode = Boolean(queueMode?.checked);
      const hasQueuedItems = queuedPrompts.length > 0;
      const hasInputText = Boolean(input.value.trim());

      if (!isQueueMode) {
        setHidden(sendBtn, false);
        setHidden(importBtn, true);
        setHidden(addQueueBtn, true);
        if (addQueueBtn instanceof HTMLButtonElement) {
          addQueueBtn.disabled = false;
        }
        return;
      }

      setHidden(importBtn, false);
      setHidden(addQueueBtn, false);
      setHidden(sendBtn, !hasQueuedItems);

      if (addQueueBtn instanceof HTMLButtonElement) {
        addQueueBtn.disabled = !hasInputText;
      }
    };

    const renderQueueList = () => {
      if (!(queueList instanceof HTMLElement)) {
        return;
      }

      queueList.classList.toggle("agently-hidden", queuedPrompts.length === 0);

      if (queuedPrompts.length === 0) {
        queueList.innerHTML = "";
        return;
      }

      if (editingQueueIndex !== null && queuedPrompts[editingQueueIndex]) {
        const item = queuedPrompts[editingQueueIndex];
        queueList.innerHTML = `
          <div class="agently-queue-editor-shell">
            <textarea class="agently-queue-edit" data-queue-edit-input-index="${editingQueueIndex}">${escapeHtml(item.text)}</textarea>
            <button class="agently-queue-save" data-queue-save-index="${editingQueueIndex}">Save</button>
          </div>
        `;

        const editNode = queueList.querySelector(
          `[data-queue-edit-input-index="${editingQueueIndex}"]`,
        );
        if (editNode instanceof HTMLTextAreaElement) {
          editNode.focus();
          editNode.setSelectionRange(
            editNode.value.length,
            editNode.value.length,
          );
        }
        return;
      }

      queueList.innerHTML = `
        <div class="agently-queue-list">
          ${queuedPrompts
            .map(
              (item, index) => `
            <div class="agently-queue-row">
              <div class="agently-queue-text" data-queue-edit-index="${index}" title="Double-click to edit">${escapeHtml(truncatePreview(item.text, 300))}</div>
              <button class="agently-queue-remove" data-queue-remove-index="${index}" aria-label="Remove queued prompt" title="Remove from queue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                  <path d="M18 6 6 18"></path>
                  <path d="m6 6 12 12"></path>
                </svg>
              </button>
            </div>
          `,
            )
            .join("")}
        </div>
      `;
    };

    const startRecording = (source) => {
      if (!SpeechRecognitionCtor) {
        setStatus(status, "Voice input is not supported in this browser.");
        return false;
      }

      if (activeRecognition) {
        return false;
      }

      const recognition = new SpeechRecognitionCtor();
      activeRecognition = recognition;
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.continuous = true;

      setMicActiveState(true);
      setStatus(
        status,
        source === "mouse"
          ? "Listening... click mic again or press Escape to stop."
          : "Listening... press Escape to stop.",
      );

      recognition.onresult = (event) => {
        let transcript = "";
        for (
          let index = event.resultIndex;
          index < event.results.length;
          index += 1
        ) {
          transcript += event.results[index][0].transcript;
        }

        input.value = [input.value.trim(), transcript.trim()]
          .filter(Boolean)
          .join(" ")
          .trimStart();
        updateQueueControls();
      };

      recognition.onerror = () => {
        activeRecognition = null;
        setMicActiveState(false);
        setStatus(status, "Voice input failed. Try again.");
      };

      recognition.onend = () => {
        activeRecognition = null;
        setMicActiveState(false);
      };

      recognition.start();
      return true;
    };

    const sendPayload = async (payload) => {
      const bridgeUrl = await getBridgeUrl();
      const response = await fetch(bridgeUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Bridge error (${response.status}). Is VS Code extension running?`,
        );
      }
    };

    const getCurrentPayload = () => {
      const text = input.value.trim();
      if (!text) {
        return null;
      }

      return {
        text,
        source: "chrome-extension",
        context: buildContext(selectedElement),
      };
    };

    cancelBtn?.addEventListener("click", removePanel);
    queueMode?.addEventListener("change", () => {
      queueModeEnabled = Boolean(queueMode.checked);
      updateQueueControls();
    });

    input.addEventListener("input", () => {
      updateQueueControls();
    });

    addQueueBtn?.addEventListener("click", () => {
      const payload = getCurrentPayload();
      if (!payload) {
        setStatus(status, "Please enter a prompt before adding to queue.");
        return;
      }

      queuedPrompts.push(payload);
      editingQueueIndex = null;
      queueModeEnabled = true;

      if (queueMode instanceof HTMLInputElement) {
        queueMode.checked = true;
      }

      input.value = "";
      setStatus(
        status,
        `Added to queue. ${queuedPrompts.length} prompt(s) queued.`,
      );
      updateQueueControls();
      renderQueueList();
      input.focus();
    });

    importBtn?.addEventListener("click", () => {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = ".json,application/json";

      picker.addEventListener("change", async () => {
        const file = picker.files?.[0];
        if (!file) {
          return;
        }

        try {
          const raw = await file.text();
          const parsed = JSON.parse(raw);
          const items = Array.isArray(parsed?.queueItems)
            ? parsed.queueItems
            : Array.isArray(parsed?.prompts)
              ? parsed.prompts
              : null;

          if (!items) {
            setStatus(
              status,
              'Invalid JSON format. Expected { "queueItems": ["prompt1"] }.',
            );
            return;
          }

          const importedPayloads = items
            .filter((item) => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
            .map((text) => ({
              text,
              source: "chrome-extension",
              context: buildContext(selectedElement),
            }));

          if (importedPayloads.length === 0) {
            setStatus(status, "No valid queue items found in file.");
            return;
          }

          queuedPrompts.push(...importedPayloads);
          queueModeEnabled = true;
          editingQueueIndex = null;

          if (queueMode instanceof HTMLInputElement) {
            queueMode.checked = true;
          }

          setStatus(
            status,
            `Imported ${importedPayloads.length} prompt(s). ${queuedPrompts.length} prompt(s) queued.`,
          );
          updateQueueControls();
          renderQueueList();
          input.focus();
        } catch {
          setStatus(
            status,
            "Could not import queue. Check that the file is valid JSON.",
          );
        }
      });

      picker.click();
    });

    queueList?.addEventListener("click", (event) => {
      const source = event.target instanceof Element ? event.target : null;
      if (!source) {
        return;
      }

      const saveTarget = source.closest("[data-queue-save-index]");
      if (saveTarget) {
        const index = Number(saveTarget.getAttribute("data-queue-save-index"));
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= queuedPrompts.length
        ) {
          return;
        }

        const editInput = queueList.querySelector(
          `[data-queue-edit-input-index="${index}"]`,
        );
        if (!(editInput instanceof HTMLTextAreaElement)) {
          return;
        }

        const nextText = editInput.value.trim();
        if (!nextText) {
          setStatus(status, "Queue item cannot be empty.");
          return;
        }

        queuedPrompts[index].text = nextText;
        editingQueueIndex = null;
        setStatus(status, `${queuedPrompts.length} prompt(s) queued.`);
        renderQueueList();
        return;
      }

      const removeTarget = source.closest("[data-queue-remove-index]");
      if (!removeTarget) {
        return;
      }

      const index = Number(
        removeTarget.getAttribute("data-queue-remove-index"),
      );
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= queuedPrompts.length
      ) {
        return;
      }

      queuedPrompts.splice(index, 1);
      if (editingQueueIndex !== null) {
        if (editingQueueIndex === index) {
          editingQueueIndex = null;
        } else if (editingQueueIndex > index) {
          editingQueueIndex -= 1;
        }
      }

      setStatus(
        status,
        queuedPrompts.length > 0
          ? `${queuedPrompts.length} prompt(s) queued.`
          : "Queue is empty.",
      );
      updateQueueControls();
      renderQueueList();
    });

    queueList?.addEventListener("dblclick", (event) => {
      const source = event.target instanceof Element ? event.target : null;
      if (!source) {
        return;
      }

      const editTarget = source.closest("[data-queue-edit-index]");
      if (!editTarget) {
        return;
      }

      const index = Number(editTarget.getAttribute("data-queue-edit-index"));
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= queuedPrompts.length
      ) {
        return;
      }

      editingQueueIndex = index;
      renderQueueList();
    });

    maximizeBtn?.addEventListener("click", () => {
      const currentValue =
        input instanceof HTMLTextAreaElement ? input.value : "";
      removePanel();
      showPanel("drawer", { initialValue: currentValue });
    });

    bottomPanelBtn?.addEventListener("click", () => {
      const currentValue =
        input instanceof HTMLTextAreaElement ? input.value : "";
      removePanel();
      showPanel("bottom", { initialValue: currentValue });
    });

    settingsBtn?.addEventListener("click", async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "agently.openSettingsPage",
        });
        if (!response?.ok) {
          throw new Error(
            response?.error || "Could not open the settings page.",
          );
        }
      } catch {
        setStatus(status, "Could not open the settings page.");
      }
    });

    retargetBtn?.addEventListener("click", () => {
      pendingRetarget = {
        mode,
        inputValue: input.value,
      };
      setRetargetCursor(true);
      updateHoverChip("");

      setStatus(
        status,
        "Click any element on the page to retarget this prompt.",
      );
    });

    clearContextBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedElement = null;
      updateContextIndicator("");
      setStatus(status, "Selected context removed.");
      input.focus();
    });

    micBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      if (activeRecognition) {
        stopActiveRecognition();
        return;
      }

      startRecording("mouse");
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp" && event.shiftKey) {
        event.preventDefault();
        if (!activeRecognition) {
          startRecording("keyboard");
        }
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        const isQueueMode =
          queueMode instanceof HTMLInputElement && queueMode.checked;
        if (isQueueMode) {
          event.preventDefault();
          const payload = getCurrentPayload();
          if (!payload) {
            setStatus(status, "Please enter a prompt before adding to queue.");
            return;
          }
          queuedPrompts.push(payload);
          editingQueueIndex = null;
          input.value = "";
          setStatus(
            status,
            `Added to queue. ${queuedPrompts.length} prompt(s) queued.`,
          );
          updateQueueControls();
          renderQueueList();
          input.focus();
        }
      }
    });

    sendBtn?.addEventListener("click", async () => {
      const currentPayload = getCurrentPayload();
      const hasQueuedItems = queuedPrompts.length > 0;

      if (!currentPayload && !hasQueuedItems) {
        setStatus(status, "Please enter a prompt.");
        return;
      }

      if (hasQueuedItems && currentPayload) {
        queuedPrompts.push(currentPayload);
      }

      const toSend = hasQueuedItems
        ? [...queuedPrompts]
        : currentPayload
          ? [currentPayload]
          : [];
      if (toSend.length === 0) {
        setStatus(status, "Nothing to send.");
        return;
      }

      setStatus(status, `Sending ${toSend.length} prompt(s)…`);

      try {
        for (const payload of toSend) {
          await sendPayload(payload);
        }

        queuedPrompts = [];
        editingQueueIndex = null;
        queueModeEnabled = false;

        if (queueMode instanceof HTMLInputElement) {
          queueMode.checked = false;
        }

        input.value = "";
        setStatus(status, "Sent to Agently in VS Code.");
        updateQueueControls();
        renderQueueList();
        setTimeout(removePanel, 1200);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Cannot reach local bridge. Start VS Code Agently extension first.";
        setStatus(status, message);
      }
    });

    updateQueueControls();
    renderQueueList();
  }

  function setStatus(node, message) {
    if (node) {
      node.textContent = message;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  }

  function truncatePreview(text, maxChars) {
    const value = String(text ?? "");
    if (value.length <= maxChars) {
      return value;
    }

    return `${value.slice(0, maxChars)}...`;
  }

  function removePanel() {
    if (activeRecognition) {
      stopActiveRecognition();
    }

    setRetargetCursor(false);
    updateHoverChip("");
    setActiveHoveredElement(null);
    pendingRetarget = null;

    const drawer = document.getElementById(DRAWER_ID);
    if (drawer?._cleanupResize) {
      drawer._cleanupResize();
    }

    const bottomPanel = document.getElementById(BOTTOM_PANEL_ID);
    if (bottomPanel?._cleanupResize) {
      bottomPanel._cleanupResize();
    }

    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(DRAWER_ID)?.remove();
    document.getElementById(DRAWER_RESIZE_ID)?.remove();
    document.getElementById(BOTTOM_PANEL_ID)?.remove();
    document.getElementById(BOTTOM_PANEL_RESIZE_ID)?.remove();
    activeMicButton = null;
    activeStatusNode = null;
    panelMode = "popup";
  }

  function buildContext(element) {
    if (!element) {
      return { pageUrl: location.href };
    }

    const cleanElement = getCleanElementClone(element);
    const htmlSnippetSource = cleanElement ?? element;

    return {
      pageUrl: location.href,
      selector: buildSelector(element),
      htmlSnippet: htmlSnippetSource.outerHTML?.slice(0, 1200),
    };
  }

  function buildSelector(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    if (element.id) {
      return `#${cssEscape(element.id)}`;
    }

    const parts = [];
    let current = element;

    while (current && current.nodeType === 1 && parts.length < 4) {
      let part = current.tagName.toLowerCase();
      if (current.classList.length > 0) {
        const publicClassNames = Array.from(current.classList)
          .filter((className) => !INTERNAL_ELEMENT_CLASSNAMES.has(className))
          .slice(0, 2);

        if (publicClassNames.length > 0) {
          part += `.${publicClassNames.map(cssEscape).join(".")}`;
        }
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === current.tagName,
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          part += `:nth-of-type(${index})`;
        }
      }

      parts.unshift(part);
      current = current.parentElement;
    }

    return parts.join(" > ");
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
})();
