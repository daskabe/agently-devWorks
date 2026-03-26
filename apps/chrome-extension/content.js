(() => {
  const BRIDGE_URL = "http://127.0.0.1:43110/agently/prompt";
  const OVERLAY_ID = "agently-overlay";
  const PANEL_ID = "agently-panel";

  let anchor = { x: 16, y: 16 };
  let selectedElement = null;

  document.addEventListener(
    "contextmenu",
    (event) => {
      if (!event.shiftKey) return;

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
      padding: 10px;
      font-family: Inter, system-ui, sans-serif;
    `;

    panel.innerHTML = `
      <div style="font-size:12px; opacity:.85; margin-bottom:8px;">Agently prompt</div>
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
    const status = panel.querySelector("#agently-status");

    input?.focus();

    cancelBtn?.addEventListener("click", removePanel);
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
        setTimeout(removePanel, 500);
      } catch {
        setStatus(status, "Cannot reach local bridge. Start VS Code Agently extension first.");
      }
    });
  }

  function setStatus(node, message) {
    if (node) node.textContent = message;
  }

  function removePanel() {
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
