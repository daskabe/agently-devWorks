(() => {
  console.log("Agently loaded.");
  const BRIDGE_URL = "http://127.0.0.1:43110/agently/prompt";
  const OVERLAY_ID = "agently-overlay";
  const PANEL_ID = "agently-panel";

  let anchor = { x: 16, y: 16 };
  let selectedElement = null;
  let activeRecognition = null;
  let holdSource = null;

  document.addEventListener(
    "mousedown",
    (event) => {
      if (!event.shiftKey) return;
      if (event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();

      selectedElement = event.target instanceof Element ? event.target : null;
      anchor = { x: event.clientX, y: event.clientY };
      showPanel();
    },
    true
  );

  function showPanel() {
    removePanel();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: transparent;
      z-index: 2147483646;
    `;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = `
      position: fixed;
      left: ${Math.max(8, anchor.x)}px;
      top: ${Math.max(8, anchor.y)}px;
      width: min(420px, calc(100vw - 16px));
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.18);
      background: #111827;
      color: #f9fafb;
      box-shadow: 0 12px 36px rgba(0,0,0,.35);
      z-index: 2147483647;
      padding: 20px;
      font-family: Inter, system-ui, sans-serif;
    `;

    panel.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <div style="font-size:16px; opacity:.85; color:orange;">Agently
        <br/>
        <span style="font-size:10px; opacity:.6;">prompt away...</span>
        </div>
        <button id="agently-mic" title="Voice input" aria-label="Voice input"
          style="width:28px; height:28px; border-radius:8px; border:1px solid #374151; background:transparent; color:inherit; display:inline-flex; align-items:center; justify-content:center; cursor:pointer;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M12 19v3"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <rect x="9" y="2" width="6" height="13" rx="3"></rect>
          </svg>
        </button>
      </div>
      <textarea id="agently-input" placeholder="change the background to blue"
        style="width:100%; min-height:90px; border-radius:8px; border:1px solid #374151; background:#0b1220; color:#f9fafb; padding:8px;"></textarea>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
        <button id="agently-cancel" style="padding:6px 10px; border-radius:8px; border:1px solid #374151; background:transparent; color:#f9fafb;">Cancel</button>
        <button id="agently-send" style="padding:6px 10px; border-radius:8px; border:1px solid #2563eb; background:#2563eb; color:white;">Send</button>
      </div>
      <div id="agently-status" style="font-size:12px; opacity:.8; margin-top:6px;"></div>
    `;

    overlay.addEventListener("click", removePanel);
    document.body.append(overlay, panel);

    const input = panel.querySelector("#agently-input");
    const sendBtn = panel.querySelector("#agently-send");
    const cancelBtn = panel.querySelector("#agently-cancel");
    const micBtn = panel.querySelector("#agently-mic");
    const status = panel.querySelector("#agently-status");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    input?.focus();

    const setMicActiveStyle = (isActive) => {
      if (!micBtn) return;
      micBtn.style.borderColor = isActive ? "#2563eb" : "#374151";
      micBtn.style.color = isActive ? "#93c5fd" : "inherit";
    };

    const startRecording = (source) => {
      if (!SR) {
        setStatus(status, "Voice input is not supported in this browser.");
        return false;
      }

      if (activeRecognition) {
        return holdSource === source;
      }

      const recognition = new SR();
      activeRecognition = recognition;
      holdSource = source;
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.continuous = true;

      setMicActiveStyle(true);
      setStatus(status, "Listening... release to stop.");

      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          transcript += event.results[i][0].transcript;
        }

        input.value = [input.value.trim(), transcript.trim()].filter(Boolean).join(" ").trimStart();
      };

      recognition.onerror = () => {
        setStatus(status, "Voice input failed. Try again.");
      };

      recognition.onend = () => {
        activeRecognition = null;
        holdSource = null;
        setMicActiveStyle(false);
      };

      recognition.start();
      return true;
    };

    const stopRecording = (source) => {
      if (!activeRecognition || holdSource !== source) {
        return;
      }

      try {
        activeRecognition.stop();
      } catch {
        // No-op.
      }
    };

    cancelBtn?.addEventListener("click", removePanel);
    micBtn?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      startRecording("mic-hold");
    });
    micBtn?.addEventListener("pointerup", () => stopRecording("mic-hold"));
    micBtn?.addEventListener("pointercancel", () => stopRecording("mic-hold"));
    micBtn?.addEventListener("mouseleave", () => stopRecording("mic-hold"));

    input?.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp" && event.shiftKey) {
        event.preventDefault();
        startRecording("keyboard-hold");
      }
    });

    input?.addEventListener("keyup", (event) => {
      if (event.key === "ArrowUp" || event.key === "Shift") {
        stopRecording("keyboard-hold");
      }
    });

    input?.addEventListener("blur", () => {
      stopRecording("keyboard-hold");
    });
    sendBtn?.addEventListener("click", async () => {
      const text = input?.value?.trim();
      if (!text) {
        setStatus(status, "Please enter a prompt.");
        return;
      }

      setStatus(status, "Sending…");

      const payload = {
        text,
        source: "chrome-extension",
        context: buildContext(selectedElement)
      };

      try {
        const response = await fetch(BRIDGE_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          setStatus(status, `Bridge error (${response.status}). Is VS Code extension running?`);
          return;
        }

        setStatus(status, "Sent to Agently in VS Code.");
        setTimeout(removePanel, 1200);
      } catch {
        setStatus(status, "Cannot reach local bridge. Start VS Code Agently extension first.");
      }
    });
  }

  function setStatus(node, message) {
    if (node) node.textContent = message;
  }

  function removePanel() {
    if (activeRecognition) {
      try {
        activeRecognition.stop();
      } catch {
        // No-op.
      }
      activeRecognition = null;
    }

    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
  }

  function buildContext(element) {
    if (!element) {
      return { pageUrl: location.href };
    }

    return {
      pageUrl: location.href,
      selector: buildSelector(element),
      htmlSnippet: element.outerHTML?.slice(0, 1200)
    };
  }

  function buildSelector(el) {
    if (!(el instanceof Element)) return "";
    if (el.id) return `#${cssEscape(el.id)}`;

    const parts = [];
    let current = el;

    while (current && current.nodeType === 1 && parts.length < 4) {
      let part = current.tagName.toLowerCase();
      if (current.classList.length > 0) {
        part += "." + Array.from(current.classList).slice(0, 2).map(cssEscape).join(".");
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
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
