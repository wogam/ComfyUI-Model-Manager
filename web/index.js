import { app } from "../../scripts/app.js";

// Inject CSS stylesheet dynamically
const styleLink = document.createElement("link");
styleLink.rel = "stylesheet";
styleLink.href = new URL("./styles.css", import.meta.url).href;
document.head.appendChild(styleLink);

// Helper Utilities
async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(endpoint, options);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Server returned ${res.status}: ${errText}`);
    }
    return await res.json();
  } catch (err) {
    console.error("[ModelManager API Error]", err);
    throw err;
  }
}

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  let cleanStr = String(timestamp).trim().replace(/^['"]|['"]$/g, '');
  let num = Number(cleanStr);
  if (!isNaN(num) && num > 0) {
    if (num < 10000000000) num *= 1000;
    const d = new Date(num);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }
  const d = new Date(cleanStr);
  if (isNaN(d.getTime())) return cleanStr;
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getNoPreviewHTML(text = "No Preview") {
  return `
    <div class="cmm-no-preview">
      <svg class="cmm-no-preview-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21 15 16 10 5 21"></polyline>
      </svg>
      <span class="cmm-no-preview-text">${text}</span>
    </div>
  `;
}

function showToast(message, duration = 2800) {
  if (!message) return;
  const existing = document.querySelector(".cmm-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "cmm-toast";

  let icon = "✨";
  let cleanMsg = String(message).trim();
  if (cleanMsg.startsWith("✅")) {
    icon = "✅";
    cleanMsg = cleanMsg.replace(/^✅\s*/, "");
  } else if (cleanMsg.startsWith("❌") || cleanMsg.toLowerCase().includes("failed") || cleanMsg.toLowerCase().includes("error")) {
    icon = "⚠️";
    cleanMsg = cleanMsg.replace(/^❌\s*/, "");
  } else if (cleanMsg.startsWith("🗑️") || cleanMsg.startsWith("📋") || cleanMsg.startsWith("📁") || cleanMsg.startsWith("🔍") || cleanMsg.startsWith("🏷️")) {
    icon = cleanMsg.slice(0, 2);
    cleanMsg = cleanMsg.slice(2).trim();
  }

  toast.innerHTML = `<span style="font-size:1rem;">${icon}</span> <span>${escapeHtml(cleanMsg)}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.25s ease, transform 0.25s ease";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px) scale(0.96)";
    setTimeout(() => toast.remove(), 260);
  }, duration);
}

async function copyToClipboard(text, successMsg = "Copied to clipboard!") {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    showToast(successMsg);
  } catch (err) {
    console.error("Failed to copy text:", err);
  }
}

function createOverlay(extraClass = "") {
  const overlay = document.createElement("div");
  const isSub = extraClass.includes("cmm-dialog-sub") || extraClass.includes("cmm-sub-overlay");
  overlay.className = `cmm-dialog-overlay ${isSub ? "cmm-sub-overlay" : ""}`;
  overlay.onclick = (e) => {
    if (e.target === overlay && !isSub) {
      overlay.remove();
    }
  };
  return overlay;
}

// Hardware-accelerated draggable dialog helper (uses requestAnimationFrame)
function makeDraggable(dialog, handle) {
  if (!dialog || !handle) return;
  
  let isDragging = false;
  let startX = 0, startY = 0;
  let currentX = 0, currentY = 0;
  let initialLeft = 0, initialTop = 0;
  let rafId = null;

  handle.addEventListener("mousedown", (e) => {
    if (e.target.closest("button, input, select, textarea, a, .cmm-btn, .cmm-switch")) return;
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;

    const rect = dialog.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    dialog.style.position = "fixed";
    dialog.style.left = `${initialLeft}px`;
    dialog.style.top = `${initialTop}px`;
    dialog.style.margin = "0";
    dialog.style.transform = "none";
    dialog.style.willChange = "left, top";

    const updatePosition = () => {
      if (!isDragging) return;
      const dx = currentX - startX;
      const dy = currentY - startY;
      dialog.style.left = `${initialLeft + dx}px`;
      dialog.style.top = `${initialTop + dy}px`;
      rafId = null;
    };

    const onMouseMove = (moveEvent) => {
      if (!isDragging) return;
      currentX = moveEvent.clientX;
      currentY = moveEvent.clientY;

      if (!rafId) {
        rafId = requestAnimationFrame(updatePosition);
      }
    };

    const onMouseUp = () => {
      isDragging = false;
      dialog.style.willChange = "auto";
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mouseup", onMouseUp);
  });
}

// Robust Frontmatter Extractor
function extractFrontmatter(desc) {
  if (!desc) return { cleanDesc: "", info: {} };
  
  let trimmed = desc.trim();
  const info = {};

  if (trimmed.startsWith("---")) {
    const endIdx = trimmed.indexOf("---", 3);
    if (endIdx !== -1) {
      const yamlStr = trimmed.substring(3, endIdx).trim();
      let remaining = trimmed.substring(endIdx + 3).trim();

      // Clean up any double leading --- separators
      while (remaining.startsWith("---")) {
        remaining = remaining.substring(3).trim();
      }

      let currentKey = null;

      yamlStr.split("\n").forEach(line => {
        const lineTrim = line.trim();
        if (!lineTrim) return;

        if (lineTrim.startsWith("- ") && currentKey) {
          if (!Array.isArray(info[currentKey])) info[currentKey] = [];
          info[currentKey].push(lineTrim.substring(2).trim());
        } else if (line.startsWith("    ") && currentKey && Array.isArray(info[currentKey])) {
          info[currentKey].push(lineTrim);
        } else if (line.includes(":")) {
          const colonIdx = line.indexOf(":");
          const k = line.substring(0, colonIdx).trim();
          const v = line.substring(colonIdx + 1).trim();
          currentKey = k;
          if (v) {
            info[k] = v;
          } else {
            info[k] = [];
          }
        }
      });

      return { cleanDesc: remaining, info };
    }
  }
  return { cleanDesc: trimmed, info: {} };
}

// Markdown parser
function parseMarkdown(md) {
  if (!md || !md.trim()) return "<p style='color:#777; font-style:italic;'>No description provided.</p>";

  // 1. Extract Fenced Code Blocks (```code```) to protect them from all other parsing
  const codeBlocks = [];
  let text = md.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    const idx = codeBlocks.length;
    const escapedCode = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    codeBlocks.push(`<pre style="background:#111118; padding:12px; border-radius:6px; overflow-x:auto; font-family:monospace; font-size:0.85rem; border:1px solid #333; margin:14px 0; line-height:1.45; color:#e2e8f0; white-space:pre;"><code>${escapedCode.trim()}</code></pre>`);
    return `\n\n@@@CODEBLOCK_${idx}@@@\n\n`;
  });

  // 2. Extract Inline Code (`code`)
  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (match, code) => {
    const idx = inlineCodes.length;
    const escapedCode = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    inlineCodes.push(`<code style="background:#1a1a24; padding:2px 6px; border-radius:4px; font-family:monospace; color:#93c5fd; font-size:0.9em;">${escapedCode}</code>`);
    return `@@@INLINECODE_${idx}@@@`;
  });

  // 3. HTML escape remaining characters
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 4. Autolinks: <https://...>
  text = text.replace(/&lt;((?:https?|mailto):[^\s&>]+)&gt;/gi, (match, url) => {
    let targetUrl = url;
    if (/civitai\.(com|green)/i.test(targetUrl)) {
      targetUrl = targetUrl.replace(/civitai\.(com|green)/gi, "civitai.red");
    }
    return `<a href="${targetUrl}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa; text-decoration:underline;">${url}</a>`;
  });

  // 5. Images: ![alt](url "optional title")
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\)/g, (match, alt, url, title) => {
    const titleAttr = title ? ` title="${title}"` : "";
    return `<img src="${url.trim()}" alt="${alt}"${titleAttr} style="max-width:100%; height:auto; border-radius:6px; margin:14px 0; display:block;" loading="lazy" />`;
  });

  // 6. Links: [text](url "optional title")
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\)/g, (match, linkText, url, title) => {
    let targetUrl = url;
    if (typeof targetUrl === "string" && /civitai\.(com|green)/i.test(targetUrl)) {
      targetUrl = targetUrl.replace(/civitai\.(com|green)/gi, "civitai.red");
    }
    const titleAttr = title ? ` title="${title}"` : "";
    return `<a href="${targetUrl}"${titleAttr} target="_blank" rel="noopener noreferrer" style="color:#60a5fa; text-decoration:underline;">${linkText}</a>`;
  });

  // 7. Setext Headings (Heading 1 ===, Heading 2 ---)
  text = text.replace(/^([^\n#<>\s][^\n]*)\n=+\s*$/gm, '# $1');
  text = text.replace(/^([^\n#<>\s][^\n]*)\n-+\s*$/gm, '## $1');

  // 8. ATX Headings
  text = text.replace(/^### (.*$)/gm, '<h3 style="margin:18px 0 8px 0; font-size:1.05rem; color:#fff; font-weight:600;">$1</h3>');
  text = text.replace(/^## (.*$)/gm, '<h2 style="margin:22px 0 10px 0; font-size:1.2rem; color:#fff; font-weight:600; border-bottom:1px solid #2d2d3a; padding-bottom:4px;">$1</h2>');
  text = text.replace(/^# (.*$)/gm, '<h1 style="margin:24px 0 12px 0; font-size:1.35rem; color:#fff; font-weight:700; border-bottom:1px solid #445; padding-bottom:6px;">$1</h1>');

  // 9. Horizontal rules
  text = text.replace(/^(?:---|___|\*\*\*)\s*$/gm, '<hr style="border:none; border-top:1px solid #334; margin:18px 0;" />');

  // Helper for inline formatting (Bold, Italic, Unescape)
  function formatInline(str) {
    let s = str;
    // Bold & Italic: ***text*** or ___text___
    s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/___([^_\n]+)___/g, '<strong><em>$1</em></strong>');
    // Bold: **text** or __text__
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    s = s.replace(/\b_([^_]+)_\b/g, '<em>$1</em>');
    // Unescape markdown backslash escapes (e.g. \_, \*, \(, \))
    s = s.replace(/\\([\\`*_{}\[\]()#+\-.!])/g, "$1");
    return s;
  }

  // 10. Block & List & Paragraph processing
  const lines = text.split("\n");
  let result = [];
  let inUl = false;
  let inOl = false;
  let currentParagraph = [];

  function flushParagraph() {
    if (currentParagraph.length > 0) {
      const formattedLines = currentParagraph.map(formatInline);
      const content = formattedLines.join("<br />");
      result.push(`<p style="margin:0 0 14px 0; line-height:1.6; color:#d1d5db;">${content}</p>`);
      currentParagraph = [];
    }
  }

  function flushList() {
    if (inUl) {
      result.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      result.push("</ol>");
      inOl = false;
    }
  }

  for (let line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (trimmed.startsWith("@@@CODEBLOCK_")) {
      flushParagraph();
      flushList();
      result.push(trimmed);
      continue;
    }

    if (/^<h[1-6]/.test(trimmed) || /^<hr/.test(trimmed) || /^<img/.test(trimmed)) {
      flushParagraph();
      flushList();
      result.push(formatInline(trimmed));
      continue;
    }

    // Blockquote (> text)
    const quoteMatch = line.match(/^\s*>\s*(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      result.push(`<blockquote style="border-left:3px solid #3b82f6; margin:14px 0; padding:6px 14px; color:#9ca3af; background:rgba(59,130,246,0.06); border-radius:0 6px 6px 0;">${formatInline(quoteMatch[1])}</blockquote>`);
      continue;
    }

    // Unordered list item (* or - or + followed by space)
    const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ulMatch) {
      flushParagraph();
      if (inOl) {
        result.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        result.push('<ul style="margin:8px 0 14px 0; padding-left:20px; color:#d1d5db;">');
        inUl = true;
      }
      result.push(`<li style="margin-bottom:6px; line-height:1.5;">${formatInline(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list item (1. 2. etc)
    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (olMatch) {
      flushParagraph();
      if (inUl) {
        result.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        result.push('<ol style="margin:8px 0 14px 0; padding-left:20px; color:#d1d5db;">');
        inOl = true;
      }
      result.push(`<li style="margin-bottom:6px; line-height:1.5;">${formatInline(olMatch[1])}</li>`);
      continue;
    }

    // Regular line in paragraph
    flushList();
    currentParagraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  let htmlOutput = result.join("\n");

  // 11. Restore Code Blocks
  htmlOutput = htmlOutput.replace(/@@@CODEBLOCK_(\d+)@@@/g, (match, idx) => {
    return codeBlocks[parseInt(idx, 10)] || "";
  });

  // 12. Restore Inline Codes
  htmlOutput = htmlOutput.replace(/@@@INLINECODE_(\d+)@@@/g, (match, idx) => {
    return inlineCodes[parseInt(idx, 10)] || "";
  });

  return htmlOutput;
}

// Global State
const savedFlatView = localStorage.getItem("cmm_flatView");
const savedCategory = localStorage.getItem("cmm_currentFolder");

const state = {
  currentFolder: savedCategory || "checkpoints",
  flatView: savedFlatView !== null ? savedFlatView === "true" : false,
  includeHidden: false,
  searchQuery: "",
  currentSubFolder: "",
  foldersList: {},
  modelsList: [],
  activeDownloadInterval: null,
};

// --- MAIN MODEL MANAGER DIALOG ---
async function openModelManagerDialog() {
  const overlay = createOverlay();
  const dialog = document.createElement("div");
  dialog.className = "cmm-dialog";

  dialog.innerHTML = `
    <div class="cmm-header">
      <div class="cmm-title">
        <span style="font-size:1.3rem;">📂</span> Model Manager
      </div>
      <div class="cmm-header-actions">
        <button class="cmm-btn cmm-btn-icon" id="cmm-close-btn" title="Close">✕</button>
      </div>
    </div>

    <div class="cmm-toolbar">
      <div class="cmm-toolbar-group">
        <label style="font-size:0.85rem; font-weight:600;">Category:</label>
        <select class="cmm-select" id="cmm-folder-select"></select>

        <input type="text" class="cmm-input" id="cmm-search-input" placeholder="Search models..." style="width:200px;" />
      </div>

      <div class="cmm-toolbar-group">
        <button class="cmm-btn" id="cmm-view-toggle-btn"></button>
        <button class="cmm-btn" id="cmm-scan-btn">🔍 Fetch Info</button>
        <button class="cmm-btn" id="cmm-upload-btn">📤 Upload</button>
        <button class="cmm-btn cmm-btn-primary" id="cmm-download-btn">📥 Downloads</button>
        <button class="cmm-btn" id="cmm-refresh-btn">🔄 Refresh</button>
        <button class="cmm-btn" id="cmm-settings-btn">⚙️ Settings</button>
      </div>
    </div>

    <div class="cmm-body">
      <div id="cmm-breadcrumb-container" style="margin-bottom:12px; font-size:0.88rem; display:none;"></div>
      <div class="cmm-grid" id="cmm-model-grid">
        <div style="grid-column: 1 / -1; text-align:center; padding: 40px; color:#888;">Loading models...</div>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const headerEl = dialog.querySelector(".cmm-header");
  makeDraggable(dialog, headerEl);

  dialog.querySelector("#cmm-close-btn").onclick = () => overlay.remove();

  // Load Folder List
  try {
    const res = await apiFetch("/model-manager/models");
    if (res.success && res.data) {
      state.foldersList = res.data;
      const folderSelect = dialog.querySelector("#cmm-folder-select");
      folderSelect.innerHTML = "";
      Object.keys(res.data).sort().forEach(folder => {
        const opt = document.createElement("option");
        opt.value = folder;
        opt.textContent = folder;
        if (folder === state.currentFolder) opt.selected = true;
        folderSelect.appendChild(opt);
      });

      folderSelect.onchange = (e) => {
        state.currentFolder = e.target.value;
        localStorage.setItem("cmm_currentFolder", state.currentFolder);
        state.currentSubFolder = "";
        loadModels();
      };
    }
  } catch (err) {
    showToast("Failed to load model categories: " + err.message);
  }

  const searchInput = dialog.querySelector("#cmm-search-input");
  searchInput.oninput = (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    renderGrid();
  };

  const viewToggleBtn = dialog.querySelector("#cmm-view-toggle-btn");
  const updateViewToggleText = () => {
    viewToggleBtn.textContent = state.flatView ? "📁 Switch to Folder View" : "📄 Switch to Flat View";
    viewToggleBtn.title = state.flatView ? "Currently in Flat View mode" : "Currently in Folder View mode";
  };
  updateViewToggleText();

  viewToggleBtn.onclick = () => {
    state.flatView = !state.flatView;
    localStorage.setItem("cmm_flatView", state.flatView);
    state.currentSubFolder = "";
    updateViewToggleText();
    renderGrid();
  };

  const settingsBtn = dialog.querySelector("#cmm-settings-btn");
  settingsBtn.onclick = () => openSettingsModal(loadModels);

  dialog.querySelector("#cmm-refresh-btn").onclick = () => loadModels();
  dialog.querySelector("#cmm-scan-btn").onclick = () => openBatchScanModal();
  dialog.querySelector("#cmm-upload-btn").onclick = () => openUploadModal();
  dialog.querySelector("#cmm-download-btn").onclick = () => openDownloadManagerModal();

  async function loadModels() {
    const grid = dialog.querySelector("#cmm-model-grid");
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#888;">Scanning ${state.currentFolder}...</div>`;
    
    try {
      const res = await apiFetch(`/model-manager/models/${state.currentFolder}`);
      if (res.success && Array.isArray(res.data)) {
        state.modelsList = res.data;
        renderGrid();
      } else {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#ef4444;">Failed to load models.</div>`;
      }
    } catch (err) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#ef4444;">Error: ${err.message}</div>`;
    }
  }

  function renderGrid() {
    const grid = dialog.querySelector("#cmm-model-grid");
    const breadcrumbContainer = dialog.querySelector("#cmm-breadcrumb-container");
    grid.innerHTML = "";

    let items = state.modelsList;

    if (state.searchQuery) {
      items = items.filter(m => 
        (m.basename && m.basename.toLowerCase().includes(state.searchQuery)) ||
        (m.subFolder && m.subFolder.toLowerCase().includes(state.searchQuery))
      );
    }

    if (state.flatView) {
      breadcrumbContainer.style.display = "none";
      const filesOnly = items.filter(m => !m.isFolder);

      if (filesOnly.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#888;">No models found in ${state.currentFolder}.</div>`;
        return;
      }

      filesOnly.forEach(model => {
        grid.appendChild(createModelCard(model));
      });
    } else {
      // Hierarchical Folder View
      breadcrumbContainer.style.display = "block";
      renderBreadcrumb(breadcrumbContainer);

      const currentSub = state.currentSubFolder;

      const subFoldersSet = new Set();
      const directFiles = [];

      items.forEach(m => {
        const sub = m.subFolder || "";
        if (currentSub === "") {
          if (sub === "") {
            if (!m.isFolder) directFiles.push(m);
          } else {
            const topFolder = sub.split("/")[0];
            subFoldersSet.add(topFolder);
          }
        } else {
          if (sub === currentSub) {
            if (!m.isFolder) directFiles.push(m);
          } else if (sub.startsWith(currentSub + "/")) {
            const relPath = sub.substring(currentSub.length + 1);
            const nextFolder = relPath.split("/")[0];
            subFoldersSet.add(nextFolder);
          }
        }
      });

      // Render Subfolder cards
      Array.from(subFoldersSet).sort().forEach(folderName => {
        const card = document.createElement("div");
        card.className = "cmm-card cmm-folder-card";
        card.innerHTML = `
          <div class="cmm-folder-icon">📁</div>
          <div style="font-weight:600; color:#fff; word-break:break-word;">${folderName}</div>
        `;
        card.onclick = () => {
          state.currentSubFolder = currentSub ? `${currentSub}/${folderName}` : folderName;
          renderGrid();
        };
        grid.appendChild(card);
      });

      // Render direct file cards
      directFiles.forEach(model => {
        grid.appendChild(createModelCard(model));
      });

      if (subFoldersSet.size === 0 && directFiles.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#888;">Folder is empty.</div>`;
      }
    }
  }

  function renderBreadcrumb(container) {
    container.innerHTML = "";
    const rootSpan = document.createElement("span");
    rootSpan.style.cursor = "pointer";
    rootSpan.style.color = "#3b82f6";
    rootSpan.style.fontWeight = "600";
    rootSpan.textContent = state.currentFolder;
    rootSpan.onclick = () => {
      state.currentSubFolder = "";
      renderGrid();
    };
    container.appendChild(rootSpan);

    if (state.currentSubFolder) {
      const parts = state.currentSubFolder.split("/");
      let accum = "";
      parts.forEach(part => {
        accum = accum ? `${accum}/${part}` : part;
        const currentAccum = accum;

        const sep = document.createElement("span");
        sep.style.margin = "0 6px";
        sep.style.color = "#666";
        sep.textContent = "/";
        container.appendChild(sep);

        const link = document.createElement("span");
        link.style.cursor = "pointer";
        link.style.color = "#3b82f6";
        link.textContent = part;
        link.onclick = () => {
          state.currentSubFolder = currentAccum;
          renderGrid();
        };
        container.appendChild(link);
      });
    }
  }

  function createModelCard(model) {
    const card = document.createElement("div");
    card.className = "cmm-card";

    let mediaHTML = "";
    if (model.preview) {
      const ext = model.preview.split(".").pop().toLowerCase();
      if (["mp4", "webm", "mov"].includes(ext)) {
        mediaHTML = `<video src="${model.preview}" autoplay loop muted playsinline onerror="this.onerror=null; this.parentElement.innerHTML=getNoPreviewHTML();"></video>`;
      } else {
        mediaHTML = `<img src="${model.preview}" loading="lazy" alt="preview" onerror="this.onerror=null; this.parentElement.innerHTML=getNoPreviewHTML();" />`;
      }
    } else {
      mediaHTML = getNoPreviewHTML();
    }

    const fullName = model.subFolder ? `${model.subFolder}/${model.basename}${model.extension}` : `${model.basename}${model.extension}`;

    card.innerHTML = `
      <div class="cmm-card-media">${mediaHTML}</div>
      <div class="cmm-card-info">
        <div class="cmm-card-title" title="${fullName}">${model.basename}</div>
        <div class="cmm-card-sub">
          <span>${model.extension}</span>
          <span>${formatBytes(model.sizeBytes)}</span>
        </div>
      </div>
    `;

    card.onclick = () => openModelDetailModal(model, loadModels);

    return card;
  }

  loadModels();
}

// --- MODEL DETAIL MODAL ---
async function openModelDetailModal(model, onRefresh) {
  const overlay = createOverlay("cmm-dialog-sub");
  const dialog = document.createElement("div");
  dialog.className = "cmm-dialog";
  dialog.style.width = "1000px";
  dialog.style.maxWidth = "95vw";
  dialog.style.height = "84vh";

  const relativeFilename = model.subFolder ? `${model.subFolder}/${model.basename}${model.extension}` : `${model.basename}${model.extension}`;

  dialog.innerHTML = `
    <div class="cmm-header">
      <div class="cmm-title" style="display:flex; align-items:center; gap:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;">
        <span class="cmm-type-badge">${escapeHtml(model.type)}</span>
        <span id="cmm-header-filename" title="Click to copy filename" style="cursor:pointer; color:#f8fafc; font-weight:600; overflow:hidden; text-overflow:ellipsis;" class="cmm-clickable-filename">${escapeHtml(model.basename + model.extension)}</span>
      </div>
      <div class="cmm-header-actions">
        <button class="cmm-btn" id="cmm-single-scan-btn" title="Fetch preview & info from Civitai / HuggingFace">🔍 Fetch Info</button>
        <button class="cmm-btn cmm-btn-icon" id="cmm-detail-close" title="Close">✕</button>
      </div>
    </div>

    <div class="cmm-body" style="padding:18px;">
      <div class="cmm-detail-layout">
        <!-- Left Side: Preview & Structured Spec Sheet -->
        <div class="cmm-detail-left">
          <div class="cmm-preview-box" id="cmm-detail-preview">
            Loading preview...
          </div>
          
          <label class="cmm-btn" style="width:100%; justify-content:center; box-sizing:border-box; cursor:pointer;">
            📷 Upload Preview
            <input type="file" id="cmm-preview-file-input" accept="image/*,video/*" style="display:none;" />
          </label>

          <!-- Specifications Card -->
          <div class="cmm-specs-card">
            <div class="cmm-spec-row">
              <span class="cmm-spec-label">Category</span>
              <span class="cmm-spec-value"><span class="cmm-type-badge">${escapeHtml(model.type)}</span></span>
            </div>
            <div class="cmm-spec-row">
              <span class="cmm-spec-label">File Size</span>
              <span class="cmm-spec-value">${formatBytes(model.sizeBytes)}</span>
            </div>
            <div class="cmm-spec-row">
              <span class="cmm-spec-label">Extension</span>
              <span class="cmm-spec-value" style="font-family:monospace; color:#94a3b8;">${escapeHtml(model.extension)}</span>
            </div>
            <div class="cmm-spec-row">
              <span class="cmm-spec-label">Subfolder</span>
              <span class="cmm-spec-value" style="font-family:monospace; font-size:0.78rem; color:#93c5fd;">${escapeHtml(model.subFolder || "(root)")}</span>
            </div>
            <div class="cmm-spec-row">
              <span class="cmm-spec-label">Modified</span>
              <span class="cmm-spec-value" style="font-size:0.78rem;">${formatDate(model.updatedAt || model.createdAt)}</span>
            </div>
            <div class="cmm-spec-row" id="cmm-detail-published-row" style="display:none;">
              <span class="cmm-spec-label">Published</span>
              <span class="cmm-spec-value" id="cmm-detail-published-val" style="font-size:0.78rem;"></span>
            </div>
            <div class="cmm-spec-row" id="cmm-detail-modelpage-row" style="display:none;">
              <span class="cmm-spec-label">Source Page</span>
              <span class="cmm-spec-value">
                <a id="cmm-detail-modelpage-link" href="#" target="_blank" rel="noopener noreferrer" style="color:#60a5fa; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
                  Open ↗
                </a>
              </span>
            </div>
          </div>

          <!-- Quick Copy Actions -->
          <div class="cmm-quick-actions-row">
            <button class="cmm-btn" id="cmm-copy-filename-btn" style="font-size:0.78rem; justify-content:center;">
              📋 Filename
            </button>
            <button class="cmm-btn" id="cmm-copy-relpath-btn" style="font-size:0.78rem; justify-content:center;">
              📁 Rel Path
            </button>
          </div>
        </div>

        <!-- Right Side: Unified Tab Toolbar & Workbench -->
        <div class="cmm-detail-right">
          <div class="cmm-tab-toolbar">
            <div class="cmm-tabs">
              <button class="cmm-tab active" data-tab="desc">📝 Description</button>
              <button class="cmm-tab" data-tab="info">ℹ️ Model Info</button>
              <button class="cmm-tab" data-tab="rename">🏷️ Rename & Move</button>
              <button class="cmm-tab" data-tab="danger">🗑️ Delete</button>
            </div>

            <!-- Description Actions (Visible on Desc tab) -->
            <div id="cmm-desc-actions" class="cmm-tab-actions">
              <button class="cmm-tab-action-btn" id="cmm-toggle-edit-desc-btn" title="Edit markdown description">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                <span>Edit</span>
              </button>
              <button class="cmm-tab-action-btn" id="cmm-cancel-desc-btn" style="display:none;" title="Cancel editing">✕ Cancel</button>
              <button class="cmm-tab-action-btn cmm-tab-action-primary" id="cmm-save-desc-btn" style="display:none;" title="Save changes">💾 Save</button>
            </div>
          </div>

          <div style="flex:1; overflow-y:auto; display:flex; flex-direction:column; min-height:0;" id="cmm-tab-content">
            <!-- Desc Tab -->
            <div id="cmm-tab-desc" style="display:flex; flex-direction:column; gap:10px; flex:1; height:100%; min-height:0;">
              <!-- Trigger Words Banner (Shown if available) -->
              <div id="cmm-trigger-banner" class="cmm-trigger-banner" style="display:none;">
                <span class="cmm-trigger-label">🏷️ Trigger Words:</span>
                <div id="cmm-trigger-chips-wrap" class="cmm-trigger-chips-wrap"></div>
                <button class="cmm-btn" id="cmm-copy-all-triggers-btn" style="padding:2px 8px; font-size:0.72rem; flex-shrink:0;">Copy All</button>
              </div>

              <!-- Rendered Markdown View -->
              <div id="cmm-desc-markdown-view" style="flex:1; overflow-y:auto; padding:16px; background:#14141d; border:1px solid rgba(255,255,255,0.07); border-radius:8px; box-sizing:border-box;"></div>

              <!-- Raw Text Editor -->
              <textarea class="cmm-input" id="cmm-desc-text" style="flex:1; width:100%; font-family:monospace; resize:none; display:none; box-sizing:border-box; line-height:1.5; padding:14px; background:#14141d; border:1px solid rgba(255,255,255,0.07); border-radius:8px;" placeholder="Enter markdown description..."></textarea>
            </div>

            <!-- Model Info Tab -->
            <div id="cmm-tab-info" style="display:none; flex-direction:column; gap:14px;">
              <div id="cmm-info-table-container">No model info available.</div>
            </div>

            <!-- Rename Tab -->
            <div id="cmm-tab-rename" style="display:none; flex-direction:column; gap:16px;">
              <div class="cmm-path-preview">
                <div class="cmm-path-preview-label">Live Path Preview</div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                  <div style="color:#94a3b8; font-size:0.78rem;">Current: <span style="font-family:monospace; color:#cbd5e1;">${escapeHtml(relativeFilename)}</span></div>
                  <div style="color:#94a3b8; font-size:0.78rem;">Target: <span class="cmm-path-preview-val" id="cmm-rename-live-target">${escapeHtml(relativeFilename)}</span></div>
                </div>
              </div>

              <div>
                <label style="display:block; font-size:0.84rem; font-weight:600; color:#e2e8f0; margin-bottom:6px;">Subfolder Path:</label>
                <input type="text" class="cmm-input" id="cmm-rename-subfolder" value="${escapeHtml(model.subFolder || '')}" style="width:100%; box-sizing:border-box;" placeholder="e.g. SDXL/Base (leave empty for root)" />
              </div>
              <div>
                <label style="display:block; font-size:0.84rem; font-weight:600; color:#e2e8f0; margin-bottom:6px;">Basename (without extension):</label>
                <input type="text" class="cmm-input" id="cmm-rename-basename" value="${escapeHtml(model.basename)}" style="width:100%; box-sizing:border-box;" />
              </div>
              <div>
                <button class="cmm-btn cmm-btn-primary" id="cmm-rename-btn">🏷️ Rename / Move Model</button>
              </div>
            </div>

            <!-- Danger Tab -->
            <div id="cmm-tab-danger" style="display:none; padding:10px;">
              <div class="cmm-danger-zone">
                <div style="font-size:2rem;">⚠️</div>
                <div>
                  <h4 style="margin:0 0 6px 0; color:#f87171;">Delete Model File & Artifacts</h4>
                  <p style="margin:0; font-size:0.84rem; color:#94a3b8; line-height:1.5;">
                    This will permanently delete <code style="color:#fca5a5; background:rgba(239,68,68,0.12); padding:2px 6px; border-radius:4px;">${escapeHtml(relativeFilename)}</code> along with its preview images and metadata files from your disk.
                  </p>
                </div>
                <button class="cmm-btn cmm-btn-danger" id="cmm-delete-btn" style="padding:9px 20px;">🗑️ Permanently Delete Model</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  makeDraggable(dialog, dialog.querySelector(".cmm-header"));

  dialog.querySelector("#cmm-detail-close").onclick = () => overlay.remove();

  // Quick Copy Filename & Path
  dialog.querySelector("#cmm-header-filename").onclick = () => copyToClipboard(model.basename + model.extension, "Filename copied!");
  dialog.querySelector("#cmm-copy-filename-btn").onclick = () => copyToClipboard(model.basename + model.extension, "Filename copied!");
  dialog.querySelector("#cmm-copy-relpath-btn").onclick = () => copyToClipboard(relativeFilename, "Relative path copied!");

  // Render Preview
  function renderPreview(previewSrc) {
    const previewBox = dialog.querySelector("#cmm-detail-preview");
    if (previewSrc) {
      const ext = previewSrc.split(".").pop().toLowerCase();
      if (["mp4", "webm", "mov"].includes(ext)) {
        previewBox.innerHTML = `<video src="${previewSrc}" controls autoplay loop style="width:100%; height:100%; object-fit:cover; border-radius:6px;" onerror="this.onerror=null; this.parentElement.innerHTML=getNoPreviewHTML();"></video>`;
      } else {
        previewBox.innerHTML = `<img src="${previewSrc}" style="width:100%; max-height:340px; object-fit:cover; border-radius:6px;" alt="Preview" onerror="this.onerror=null; this.parentElement.innerHTML=getNoPreviewHTML();" />`;
      }
    } else {
      previewBox.innerHTML = getNoPreviewHTML();
    }
  }

  renderPreview(model.preview);

  // Single Model Fetch Info button
  const singleScanBtn = dialog.querySelector("#cmm-single-scan-btn");
  singleScanBtn.onclick = async () => {
    singleScanBtn.disabled = true;
    singleScanBtn.textContent = "Fetching...";
    try {
      const res = await apiFetch(`/model-manager/model/${model.type}/${model.pathIndex}/${encodeURIComponent(relativeFilename)}/scan`, {
        method: "POST",
      });
      if (res.success && res.data) {
        showToast("Metadata & preview fetched!");
        if (res.data.description) {
          updateDescDisplay(res.data.description);
        }
        if (onRefresh) onRefresh();
      } else {
        showToast("Failed to fetch model info: " + (res.error || "No match found"));
      }
    } catch (err) {
      showToast("Error fetching model info: " + err.message);
    } finally {
      singleScanBtn.disabled = false;
      singleScanBtn.textContent = "🔍 Fetch Info";
    }
  };

  // Description Editor & Frontmatter handling
  const descMarkdownView = dialog.querySelector("#cmm-desc-markdown-view");
  const descTextarea = dialog.querySelector("#cmm-desc-text");
  const descActions = dialog.querySelector("#cmm-desc-actions");
  const toggleEditBtn = dialog.querySelector("#cmm-toggle-edit-desc-btn");
  const cancelDescBtn = dialog.querySelector("#cmm-cancel-desc-btn");
  const saveDescBtn = dialog.querySelector("#cmm-save-desc-btn");

  let currentRawDescription = "";
  let currentCleanDescription = "";
  let currentFrontmatterInfo = {};
  let isEditingDesc = false;

  // Extract Trigger Words helper
  function updateTriggerWordsBanner(info) {
    const banner = dialog.querySelector("#cmm-trigger-banner");
    const chipsWrap = dialog.querySelector("#cmm-trigger-chips-wrap");
    const copyAllBtn = dialog.querySelector("#cmm-copy-all-triggers-btn");

    let triggers = [];
    if (info) {
      const rawTriggers = info.trainedWords || info.triggerWords || info.triggers || info["Trained Words"] || info["Trigger Words"];
      if (Array.isArray(rawTriggers)) {
        triggers = rawTriggers.map(t => String(t).trim()).filter(Boolean);
      } else if (typeof rawTriggers === "string" && rawTriggers.trim()) {
        triggers = rawTriggers.split(",").map(t => t.trim()).filter(Boolean);
      }
    }

    if (triggers.length > 0) {
      chipsWrap.innerHTML = "";
      triggers.forEach(word => {
        const chip = document.createElement("button");
        chip.className = "cmm-trigger-chip";
        chip.title = `Click to copy "${word}"`;
        chip.textContent = word;
        chip.onclick = () => copyToClipboard(word, `Copied "${word}"!`);
        chipsWrap.appendChild(chip);
      });

      copyAllBtn.onclick = () => copyToClipboard(triggers.join(", "), "Copied all trigger words!");
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  }

  function renderModelInfoTable(info) {
    const container = dialog.querySelector("#cmm-info-table-container");
    const pubRow = dialog.querySelector("#cmm-detail-published-row");
    const pubVal = dialog.querySelector("#cmm-detail-published-val");
    const modelPageRow = dialog.querySelector("#cmm-detail-modelpage-row");
    const modelPageLink = dialog.querySelector("#cmm-detail-modelpage-link");

    if (!info || Object.keys(info).length === 0) {
      container.innerHTML = `<div style="color:#888; padding:16px; text-align:center; background:#14141d; border-radius:8px; border:1px solid rgba(255,255,255,0.07);">No additional model info available.</div>`;
      pubRow.style.display = "none";
      modelPageRow.style.display = "none";
      return;
    }

    // Populate Left Sidebar Published Date & Model Page Link
    const published = info.publishedAt || info.published_at || info.createdAt;
    if (published) {
      pubVal.textContent = formatDate(published);
      pubRow.style.display = "flex";
    } else {
      pubRow.style.display = "none";
    }

    let mPage = info.modelPage || info.model_page;
    if (mPage) {
      if (typeof mPage === "string" && /civitai\.(com|green)/i.test(mPage)) {
        mPage = mPage.replace(/civitai\.(com|green)/gi, "civitai.red");
      }
      modelPageLink.href = mPage;
      modelPageRow.style.display = "flex";
    } else {
      modelPageRow.style.display = "none";
    }

    // Structured Cards / Table for Model Info Tab
    let rows = "";
    for (const [k, v] of Object.entries(info)) {
      if (k === "preview") continue;

      let label = k.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase());
      let valHtml = "";

      if (k === "modelPage" && v) {
        let linkUrl = v;
        if (typeof linkUrl === "string" && /civitai\.(com|green)/i.test(linkUrl)) {
          linkUrl = linkUrl.replace(/civitai\.(com|green)/gi, "civitai.red");
        }
        valHtml = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa; font-weight:600; text-decoration:underline;">${escapeHtml(linkUrl)} ↗</a>`;
      } else if ((k === "publishedAt" || k === "createdAt" || k === "updatedAt") && v) {
        valHtml = `<span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatDate(v))}</span>`;
      } else if ((k === "trainedWords" || k === "triggerWords") && v) {
        const words = Array.isArray(v) ? v : String(v).split(",");
        valHtml = `<div style="display:flex; flex-wrap:wrap; gap:4px;">${words.map(w => `<span class="cmm-trigger-chip" style="font-size:0.75rem;" onclick="navigator.clipboard.writeText('${escapeHtml(String(w).trim())}')">${escapeHtml(String(w).trim())}</span>`).join("")}</div>`;
      } else if (typeof v === "object" && v !== null) {
        if (Array.isArray(v)) {
          valHtml = `<div style="display:flex; flex-wrap:wrap; gap:4px;">${v.map(item => `<span class="cmm-badge" style="background:#1e2230; color:#93c5fd;">${escapeHtml(String(item))}</span>`).join("")}</div>`;
        } else {
          let subRows = "";
          for (const [sk, sv] of Object.entries(v)) {
            subRows += `<div style="padding:2px 0;"><span style="color:#888;">${escapeHtml(sk)}:</span> <code style="color:#93c5fd; background:rgba(0,0,0,0.25); padding:1px 4px; border-radius:3px;">${escapeHtml(String(sv))}</code></div>`;
          }
          valHtml = subRows;
        }
      } else {
        valHtml = escapeHtml(String(v));
      }

      rows += `<tr>
        <td class="cmm-info-key-cell">${escapeHtml(label)}</td>
        <td class="cmm-info-val-cell">${valHtml}</td>
      </tr>`;
    }

    container.innerHTML = `
      <div class="cmm-info-card">
        <table class="cmm-info-table">${rows}</table>
      </div>
    `;
  }

  function updateDescDisplay(rawDesc) {
    currentRawDescription = rawDesc || "";
    const { cleanDesc, info } = extractFrontmatter(currentRawDescription);
    currentCleanDescription = cleanDesc;
    currentFrontmatterInfo = info;

    descTextarea.value = currentCleanDescription;
    descMarkdownView.innerHTML = parseMarkdown(currentCleanDescription);
    updateTriggerWordsBanner(currentFrontmatterInfo);
    renderModelInfoTable(currentFrontmatterInfo);
  }

  function setEditMode(editing) {
    isEditingDesc = editing;
    if (isEditingDesc) {
      descMarkdownView.style.display = "none";
      descTextarea.style.display = "block";
      toggleEditBtn.style.display = "none";
      cancelDescBtn.style.display = "inline-flex";
      saveDescBtn.style.display = "inline-flex";
    } else {
      descMarkdownView.innerHTML = parseMarkdown(descTextarea.value);
      descMarkdownView.style.display = "block";
      descTextarea.style.display = "none";
      toggleEditBtn.style.display = "inline-flex";
      toggleEditBtn.textContent = "✏️ Edit";
      cancelDescBtn.style.display = "none";
      saveDescBtn.style.display = "none";
    }
  }

  toggleEditBtn.onclick = () => setEditMode(true);
  cancelDescBtn.onclick = () => {
    descTextarea.value = currentCleanDescription;
    setEditMode(false);
  };

  saveDescBtn.onclick = async () => {
    const desc = descTextarea.value;
    const formData = new FormData();
    formData.append("description", desc);

    try {
      const res = await apiFetch(`/model-manager/model/${model.type}/${model.pathIndex}/${encodeURIComponent(relativeFilename)}`, {
        method: "PUT",
        body: formData,
      });
      if (res.success) {
        updateDescDisplay(desc);
        showToast("Description saved successfully!");
        setEditMode(false);
      } else {
        showToast("Failed to save description: " + res.error);
      }
    } catch (err) {
      showToast("Error: " + err.message);
    }
  };

  // Tab Switching
  const tabBtns = dialog.querySelectorAll(".cmm-tab");
  tabBtns.forEach(tab => {
    tab.onclick = () => {
      tabBtns.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const target = tab.getAttribute("data-tab");
      ["desc", "info", "rename", "danger"].forEach(tName => {
        const el = dialog.querySelector(`#cmm-tab-${tName}`);
        if (el) el.style.display = tName === target ? (tName === "desc" || tName === "rename" || tName === "info" ? "flex" : "block") : "none";
      });

      // Show desc actions only on desc tab
      if (descActions) {
        descActions.style.display = target === "desc" ? "flex" : "none";
      }
    };
  });

  // Fetch Full Info (Description & Info)
  try {
    const infoRes = await apiFetch(`/model-manager/model/${model.type}/${model.pathIndex}/${encodeURIComponent(relativeFilename)}`);
    if (infoRes.success && infoRes.data) {
      const { description } = infoRes.data;
      updateDescDisplay(description);
    }
  } catch (err) {
    console.error(err);
  }

  // Live Path Rename Preview
  const renameSubfolderInput = dialog.querySelector("#cmm-rename-subfolder");
  const renameBasenameInput = dialog.querySelector("#cmm-rename-basename");
  const liveTargetSpan = dialog.querySelector("#cmm-rename-live-target");

  function updateLivePathPreview() {
    const sub = renameSubfolderInput.value.trim();
    const base = renameBasenameInput.value.trim() || model.basename;
    const target = sub ? `${sub}/${base}${model.extension}` : `${base}${model.extension}`;
    liveTargetSpan.textContent = target;
  }

  renameSubfolderInput.oninput = updateLivePathPreview;
  renameBasenameInput.oninput = updateLivePathPreview;

  // Upload Preview File
  const fileInput = dialog.querySelector("#cmm-preview-file-input");
  fileInput.onchange = async () => {
    if (!fileInput.files || fileInput.files.length === 0) return;
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append("previewFile", file);

    try {
      const res = await apiFetch(`/model-manager/model/${model.type}/${model.pathIndex}/${encodeURIComponent(relativeFilename)}`, {
        method: "PUT",
        body: formData,
      });
      if (res.success) {
        showToast("Preview updated successfully!");
        overlay.remove();
        if (onRefresh) onRefresh();
      } else {
        showToast("Failed to update preview: " + res.error);
      }
    } catch (err) {
      showToast("Error: " + err.message);
    }
  };

  // Rename Model
  dialog.querySelector("#cmm-rename-btn").onclick = async () => {
    const newSubfolder = renameSubfolderInput.value.trim();
    const newBasename = renameBasenameInput.value.trim();
    if (!newBasename) {
      showToast("Basename cannot be empty.");
      return;
    }

    const newFullname = newSubfolder ? `${newSubfolder}/${newBasename}${model.extension}` : `${newBasename}${model.extension}`;
    const formData = new FormData();
    formData.append("type", model.type);
    formData.append("pathIndex", model.pathIndex);
    formData.append("fullname", newFullname);

    try {
      const res = await apiFetch(`/model-manager/model/${model.type}/${model.pathIndex}/${encodeURIComponent(relativeFilename)}`, {
        method: "PUT",
        body: formData,
      });
      if (res.success) {
        showToast("Model renamed successfully!");
        overlay.remove();
        if (onRefresh) onRefresh();
      } else {
        showToast("Failed to rename model: " + res.error);
      }
    } catch (err) {
      showToast("Error: " + err.message);
    }
  };

  // Delete Model
  dialog.querySelector("#cmm-delete-btn").onclick = async () => {
    if (!confirm(`Permanently delete ${model.basename}${model.extension} and its preview/metadata?`)) return;

    try {
      const res = await apiFetch(`/model-manager/model/${model.type}/${model.pathIndex}/${encodeURIComponent(relativeFilename)}`, {
        method: "DELETE",
      });
      if (res.success) {
        showToast("Model deleted!");
        overlay.remove();
        if (onRefresh) onRefresh();
      } else {
        showToast("Failed to delete model: " + res.error);
      }
    } catch (err) {
      showToast("Error: " + err.message);
    }
  };
}

// --- DOWNLOAD MANAGER MODAL ---
async function openDownloadManagerModal() {
  const overlay = createOverlay("cmm-dialog-sub");
  const dialog = document.createElement("div");
  dialog.className = "cmm-dialog";
  dialog.style.width = "920px";
  dialog.style.maxWidth = "95vw";
  dialog.style.height = "86vh";

  dialog.innerHTML = `
    <div class="cmm-header">
      <div class="cmm-title">
        <span>📥</span> Downloads
      </div>
      <div class="cmm-header-actions">
        <button class="cmm-btn cmm-btn-icon" id="cmm-download-close">✕</button>
      </div>
    </div>

    <div class="cmm-body" style="padding:18px; display:flex; flex-direction:column; gap:16px;">
      <!-- Add Task Section -->
      <div class="cmm-section-card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <h4 style="margin:0; color:#f8fafc; font-size:0.95rem;">Add Download Tasks</h4>
          <div class="cmm-tabs-nav" style="margin-bottom:0;">
            <button class="cmm-tab-btn active" id="cmm-dl-tab-single">🔗 Single URL</button>
            <button class="cmm-tab-btn" id="cmm-dl-tab-bulk">📋 Bulk URLs</button>
          </div>
        </div>

        <!-- Single URL Panel -->
        <div id="cmm-dl-single-panel" style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; gap:8px;">
            <input type="text" class="cmm-input" id="cmm-dl-url" placeholder="Paste Civitai or HuggingFace URL..." style="flex:1;" />
            <button class="cmm-btn" id="cmm-dl-parse-btn">🔍 Parse Link</button>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
            <div>
              <label style="font-size:0.78rem; color:#94a3b8; display:block; margin-bottom:4px; font-weight:500;">Target Category:</label>
              <select class="cmm-select" id="cmm-dl-category" style="width:100%; box-sizing:border-box;"></select>
            </div>
            <div>
              <label style="font-size:0.78rem; color:#94a3b8; display:block; margin-bottom:4px; font-weight:500;">Subfolder Path:</label>
              <input type="text" class="cmm-input" id="cmm-dl-subfolder" placeholder="e.g. SDXL 1.0/Style" style="width:100%; box-sizing:border-box;" />
            </div>
            <div>
              <label style="font-size:0.78rem; color:#94a3b8; display:block; margin-bottom:4px; font-weight:500;">Filename on Disk:</label>
              <input type="text" class="cmm-input" id="cmm-dl-filename" placeholder="model_name.safetensors" style="width:100%; box-sizing:border-box;" />
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; margin-top:2px;">
            <button class="cmm-btn cmm-btn-primary" id="cmm-dl-start-btn">🚀 Start Download Task</button>
          </div>
        </div>

        <!-- Bulk URLs Panel -->
        <div id="cmm-dl-bulk-panel" style="display:none; flex-direction:column; gap:12px;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <label style="font-size:0.78rem; color:#94a3b8; font-weight:500;">Paste multiple URLs (one per line):</label>
              <span id="cmm-dl-bulk-line-count" class="cmm-badge" style="background:rgba(255,255,255,0.06); font-size:0.72rem;">0 URLs detected</span>
            </div>
            <textarea class="cmm-input" id="cmm-dl-bulk-urls" placeholder="https://civitai.com/models/12345&#10;https://civitai.com/models/67890?modelVersionId=112233&#10;https://huggingface.co/author/repo/blob/main/model.safetensors" style="width:100%; min-height:85px; box-sizing:border-box; resize:vertical; font-family:monospace; font-size:0.82rem; line-height:1.45;"></textarea>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr auto; gap:10px; align-items:flex-start;">
            <div>
              <label style="font-size:0.78rem; color:#94a3b8; display:block; margin-bottom:4px; font-weight:500;">Default Target Category:</label>
              <select class="cmm-select" id="cmm-dl-bulk-category" style="width:100%; box-sizing:border-box;">
                <option value="AUTO" selected>✨ Auto-detect Category (Recommended)</option>
              </select>
            </div>
            <div>
              <label style="font-size:0.78rem; color:#94a3b8; display:block; margin-bottom:4px; font-weight:500;">Default Subfolder:</label>
              <select class="cmm-select" id="cmm-dl-bulk-subfolder-mode" style="width:100%; box-sizing:border-box;">
                <option value="AUTO" selected>✨ Auto-detect Base Model (e.g. SDXL, FLUX)</option>
                <option value="ROOT">📁 Root (No subfolder)</option>
                <option value="CUSTOM">✏️ Custom Subfolder...</option>
              </select>
              <input type="text" class="cmm-input" id="cmm-dl-bulk-custom-subfolder" placeholder="e.g. MyLoRAs" style="width:100%; box-sizing:border-box; margin-top:6px; display:none;" />
            </div>
            <div style="display:flex; gap:8px; margin-top:20px;">
              <button class="cmm-btn" id="cmm-dl-bulk-clear-btn" title="Clear text">🧹 Clear</button>
              <button class="cmm-btn cmm-btn-primary" id="cmm-dl-bulk-parse-btn">🔍 Parse & Review URLs</button>
            </div>
          </div>

          <!-- Staged Items Section -->
          <div id="cmm-dl-staging-section" style="display:none; margin-top:6px; border-top:1px solid rgba(255,255,255,0.07); padding-top:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <div style="font-size:0.88rem; font-weight:600; color:#f8fafc; display:flex; align-items:center; gap:8px;">
                <span>📋 Staged Items</span>
                <span id="cmm-staging-count" class="cmm-badge">0</span>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="cmm-btn" id="cmm-staging-clear-all" title="Remove all staged items" style="font-size:0.78rem;">🗑️ Clear Staged</button>
                <button class="cmm-btn cmm-btn-primary" id="cmm-staging-start-all" style="font-size:0.78rem;">🚀 Start All Downloads</button>
              </div>
            </div>
            <div class="cmm-staging-container" id="cmm-staging-list"></div>
          </div>
        </div>
      </div>

      <!-- Downloads History & Active Section -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h4 style="margin:0; color:#fff; display:flex; align-items:center; gap:8px;">
            <span>Downloads</span>
            <span id="cmm-dl-count" style="font-size:0.8rem; font-weight:normal; color:#888;"></span>
          </h4>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="cmm-btn cmm-btn-icon" id="cmm-dl-clear-completed" title="Clear Completed" style="display:none;">🧹</button>
            <button class="cmm-btn cmm-btn-icon" id="cmm-dl-refresh-tasks" title="Refresh">🔄</button>
          </div>
        </div>
        <div id="cmm-tasks-container">
          <div style="color:#888; text-align:center; padding:20px;">Loading task list...</div>
        </div>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  makeDraggable(dialog, dialog.querySelector(".cmm-header"));

  const closeDialog = () => {
    if (state.activeDownloadInterval) {
      clearInterval(state.activeDownloadInterval);
      state.activeDownloadInterval = null;
    }
    overlay.remove();
  };

  dialog.querySelector("#cmm-download-close").onclick = closeDialog;

  // Populate category options
  const categorySelect = dialog.querySelector("#cmm-dl-category");
  const bulkCategorySelect = dialog.querySelector("#cmm-dl-bulk-category");

  Object.keys(state.foldersList).sort().forEach(folder => {
    const opt = document.createElement("option");
    opt.value = folder;
    opt.textContent = folder;
    if (folder === state.currentFolder) opt.selected = true;
    categorySelect.appendChild(opt);

    const bulkOpt = document.createElement("option");
    bulkOpt.value = folder;
    bulkOpt.textContent = folder;
    bulkCategorySelect.appendChild(bulkOpt);
  });

  // Tab switching logic
  const singleTab = dialog.querySelector("#cmm-dl-tab-single");
  const bulkTab = dialog.querySelector("#cmm-dl-tab-bulk");
  const singlePanel = dialog.querySelector("#cmm-dl-single-panel");
  const bulkPanel = dialog.querySelector("#cmm-dl-bulk-panel");

  singleTab.onclick = () => {
    singleTab.classList.add("active");
    bulkTab.classList.remove("active");
    singlePanel.style.display = "flex";
    bulkPanel.style.display = "none";
  };

  bulkTab.onclick = () => {
    bulkTab.classList.add("active");
    singleTab.classList.remove("active");
    singlePanel.style.display = "none";
    bulkPanel.style.display = "flex";
  };

  // Bulk subfolder mode change
  const bulkSubfolderMode = dialog.querySelector("#cmm-dl-bulk-subfolder-mode");
  const bulkCustomSubfolder = dialog.querySelector("#cmm-dl-bulk-custom-subfolder");
  bulkSubfolderMode.onchange = () => {
    if (bulkSubfolderMode.value === "CUSTOM") {
      bulkCustomSubfolder.style.display = "block";
      bulkCustomSubfolder.focus();
    } else {
      bulkCustomSubfolder.style.display = "none";
    }
  };

  // Bulk URLs textarea counter
  const bulkUrlsInput = dialog.querySelector("#cmm-dl-bulk-urls");
  const lineCountBadge = dialog.querySelector("#cmm-dl-bulk-line-count");
  const updateUrlCount = () => {
    const lines = bulkUrlsInput.value.split(/[\r\n]+/).map(s => s.trim()).filter(s => s && !s.startsWith("#") && /^https?:\/\//i.test(s));
    lineCountBadge.textContent = `${lines.length} URL${lines.length === 1 ? '' : 's'} detected`;
  };
  bulkUrlsInput.oninput = updateUrlCount;

  // --- SINGLE DOWNLOAD LOGIC ---
  let parsedData = null;

  const parseBtn = dialog.querySelector("#cmm-dl-parse-btn");
  parseBtn.onclick = async () => {
    const url = dialog.querySelector("#cmm-dl-url").value.trim();
    if (!url) return showToast("Please enter a URL first.");

    const originalBtnContent = parseBtn.innerHTML;
    parseBtn.disabled = true;
    parseBtn.innerHTML = `<span class="cmm-spin-icon">⏳</span> Parsing...`;

    try {
      const res = await apiFetch(`/model-manager/model-info?model-page=${encodeURIComponent(url)}`);
      if (res.success && res.data && res.data.length > 0) {
        parsedData = res.data[0];
        
        // Auto-fill Filename formatted like import.py ({Model Name} - {Version Name}.safetensors)
        const targetFilename = parsedData.fullname || parsedData.name || (parsedData.basename ? `${parsedData.basename}${parsedData.extension || '.safetensors'}` : "");
        if (targetFilename) {
          dialog.querySelector("#cmm-dl-filename").value = targetFilename;
        }

        // Auto-fill Subfolder
        if (parsedData.subFolder) {
          dialog.querySelector("#cmm-dl-subfolder").value = parsedData.subFolder;
        }

        // Auto-select Category
        if (parsedData.type) {
          const matchingOpt = Array.from(categorySelect.options).find(opt => opt.value === parsedData.type);
          if (matchingOpt) {
            categorySelect.value = parsedData.type;
          }
        }

        showToast("Link parsed successfully!");
        console.log(`[ModelManager] Found model info from ${parsedData.website || 'web'}: Filename=${targetFilename}, Subfolder=${parsedData.subFolder || '(root)'}`);
      } else {
        showToast("⚠️ Could not parse model details from URL");
        console.warn("[ModelManager] Failed to parse URL or no downloadable file found.");
      }
    } catch (err) {
      showToast("Parse error: " + err.message);
      console.error("[ModelManager] Parse error:", err.message);
    } finally {
      parseBtn.disabled = false;
      parseBtn.innerHTML = originalBtnContent;
    }
  };

  // Start Single Download Task
  dialog.querySelector("#cmm-dl-start-btn").onclick = async () => {
    const url = dialog.querySelector("#cmm-dl-url").value.trim();
    const type = categorySelect.value;
    const subFolder = dialog.querySelector("#cmm-dl-subfolder").value.trim();
    const basename = dialog.querySelector("#cmm-dl-filename").value.trim();

    if (!url || !basename) {
      showToast("Please provide both URL and filename.");
      return;
    }

    const fullname = subFolder ? `${subFolder}/${basename}` : basename;
    const previewFile = parsedData?.preview ? (Array.isArray(parsedData.preview) ? parsedData.preview[0] : parsedData.preview) : "";

    let platform = (parsedData?.downloadPlatform || parsedData?.website || "").toLowerCase();
    if (!platform || platform === "url") {
      if (/civitai\.(com|red|green)/i.test(url)) {
        platform = "civitai";
      } else if (/huggingface\.co/i.test(url)) {
        platform = "huggingface";
      } else {
        platform = "url";
      }
    }

    const payload = {
      type,
      pathIndex: 0,
      fullname,
      description: parsedData?.description || "",
      downloadPlatform: platform,
      downloadUrl: parsedData?.downloadUrl || url,
      sizeBytes: parsedData?.sizeBytes || 0,
      previewFile: previewFile || "",
    };

    try {
      const res = await apiFetch("/model-manager/model", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(payload).toString(),
      });

      if (res.success) {
        showToast("Download task added!");
        dialog.querySelector("#cmm-dl-url").value = "";
        dialog.querySelector("#cmm-dl-filename").value = "";
        dialog.querySelector("#cmm-dl-subfolder").value = "";
        parsedData = null;
        fetchTasks();
      } else {
        showToast("Failed to add task: " + res.error);
      }
    } catch (err) {
      showToast("Error starting download: " + err.message);
    }
  };

  // --- BULK DOWNLOAD STAGING & ACTIONS ---
  let stagedDownloads = [];
  const stagingSection = dialog.querySelector("#cmm-dl-staging-section");
  const stagingList = dialog.querySelector("#cmm-staging-list");
  const stagingCountBadge = dialog.querySelector("#cmm-staging-count");
  const startAllBtn = dialog.querySelector("#cmm-staging-start-all");
  const clearAllStagedBtn = dialog.querySelector("#cmm-staging-clear-all");
  const bulkParseBtn = dialog.querySelector("#cmm-dl-bulk-parse-btn");
  const bulkClearBtn = dialog.querySelector("#cmm-dl-bulk-clear-btn");

  bulkClearBtn.onclick = () => {
    bulkUrlsInput.value = "";
    updateUrlCount();
  };

  clearAllStagedBtn.onclick = () => {
    stagedDownloads = [];
    renderStagedDownloads();
  };

  const renderStagedDownloads = () => {
    if (stagedDownloads.length === 0) {
      stagingSection.style.display = "none";
      stagingList.innerHTML = "";
      stagingCountBadge.textContent = "0";
      return;
    }

    stagingSection.style.display = "block";
    stagingCountBadge.textContent = stagedDownloads.length.toString();

    stagingList.innerHTML = "";
    stagedDownloads.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "cmm-staging-item";

      let statusBadgeHtml = "";
      if (item.status === "parsing") {
        statusBadgeHtml = `<span class="cmm-badge cmm-badge-downloading"><span class="cmm-spin-icon">⏳</span> Parsing</span>`;
      } else if (item.status === "ready") {
        statusBadgeHtml = `<span class="cmm-badge cmm-badge-completed">✅ Ready</span>`;
      } else if (item.status === "queued") {
        statusBadgeHtml = `<span class="cmm-badge cmm-badge-waiting">🚀 Queued</span>`;
      } else if (item.status === "error") {
        statusBadgeHtml = `<span class="cmm-badge cmm-badge-error" title="${escapeHtml(item.errorMsg || 'Failed')}">❌ Error</span>`;
      }

      const previewHtml = item.preview ? 
        `<img src="${item.preview}" style="width:36px; height:36px; object-fit:cover; border-radius:4px; flex-shrink:0; background:#111;" onerror="this.style.display='none'" />` : 
        `<div style="width:36px; height:36px; border-radius:4px; background:#15151c; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0; color:#555;">📦</div>`;

      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
          ${previewHtml}
          <div style="display:flex; flex-direction:column; min-width:0; flex:1;">
            <div style="font-size:0.86rem; font-weight:600; color:#eee; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(item.filename || item.url)}">
              ${escapeHtml(item.filename || item.url)}
            </div>
            <div style="font-size:0.75rem; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${item.sizeBytes > 0 ? formatBytes(item.sizeBytes) + ' • ' : ''}${escapeHtml(item.url)}
            </div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
          <select class="cmm-select cmm-stage-cat" data-index="${index}" style="font-size:0.8rem; padding:4px 8px; width:130px;" ${item.status === "queued" ? "disabled" : ""}>
            ${Object.keys(state.foldersList).sort().map(f => `<option value="${f}" ${f === item.category ? "selected" : ""}>${f}</option>`).join("")}
          </select>
          <input type="text" class="cmm-input cmm-stage-sub" data-index="${index}" placeholder="Subfolder" value="${escapeHtml(item.subfolder || '')}" style="font-size:0.8rem; padding:4px 8px; width:120px;" ${item.status === "queued" ? "disabled" : ""} />
          ${statusBadgeHtml}
          <button class="cmm-btn cmm-btn-icon cmm-stage-remove" data-index="${index}" title="Remove item" style="padding:4px 7px;">✕</button>
        </div>
      `;

      // Event listeners for row inputs
      const catSelect = row.querySelector(".cmm-stage-cat");
      catSelect.onchange = (e) => {
        item.category = e.target.value;
      };

      const subInput = row.querySelector(".cmm-stage-sub");
      subInput.oninput = (e) => {
        item.subfolder = e.target.value.trim();
      };

      const removeBtn = row.querySelector(".cmm-stage-remove");
      removeBtn.onclick = () => {
        stagedDownloads.splice(index, 1);
        renderStagedDownloads();
      };

      stagingList.appendChild(row);
    });
  };

  // Bulk Parse handler
  bulkParseBtn.onclick = async () => {
    const rawLines = bulkUrlsInput.value.split(/[\r\n,]+/);
    const urls = [];
    for (let line of rawLines) {
      line = line.trim().replace(/^<|>$/g, "").replace(/^["']|["']$/g, "");
      if (!line || line.startsWith("#")) continue;
      if (/^https?:\/\//i.test(line)) {
        if (!urls.includes(line)) urls.push(line);
      }
    }

    if (urls.length === 0) {
      showToast("Please paste at least one valid URL (starting with http:// or https://).");
      return;
    }

    const defaultCategory = bulkCategorySelect.value;
    const subfolderMode = bulkSubfolderMode.value;
    const customSubfolderVal = bulkCustomSubfolder.value.trim();

    const originalBtnHtml = bulkParseBtn.innerHTML;
    bulkParseBtn.disabled = true;
    bulkParseBtn.innerHTML = `<span class="cmm-spin-icon">⏳</span> Parsing...`;

    try {
      // Append new items
      const startIndex = stagedDownloads.length;
      const newItems = urls.map(url => ({
        id: "stage_" + Math.random().toString(36).substr(2, 9),
        url: url,
        status: "parsing",
        errorMsg: "",
        parsedData: null,
        category: defaultCategory === "AUTO" ? (state.currentFolder || "checkpoints") : defaultCategory,
        subfolder: subfolderMode === "CUSTOM" ? customSubfolderVal : "",
        filename: "",
        sizeBytes: 0,
        preview: "",
        platform: "url",
      }));

      stagedDownloads = stagedDownloads.concat(newItems);
      renderStagedDownloads();

      // Throttle parsing with concurrency = 3
      const concurrency = 3;
      let currIdx = startIndex;

      async function parseWorker() {
        while (currIdx < stagedDownloads.length) {
          const itemIdx = currIdx++;
          const item = stagedDownloads[itemIdx];
          if (!item || item.status !== "parsing") continue;

          try {
            let platform = "url";
            if (/civitai\.(com|red|green)/i.test(item.url)) platform = "civitai";
            else if (/huggingface\.co/i.test(item.url)) platform = "huggingface";

            const res = await apiFetch(`/model-manager/model-info?model-page=${encodeURIComponent(item.url)}`);
            if (res && res.success && res.data && res.data.length > 0) {
              const data = res.data[0];
              item.parsedData = data;
              item.platform = (data.downloadPlatform || data.website || platform).toLowerCase();
              
              const targetFilename = data.fullname || data.name || (data.basename ? `${data.basename}${data.extension || '.safetensors'}` : "");
              item.filename = targetFilename || "model.safetensors";

              // Category resolution
              if (defaultCategory === "AUTO") {
                const autoCat = data.type;
                const match = autoCat && Object.keys(state.foldersList).find(f => f.toLowerCase() === autoCat.toLowerCase());
                item.category = match || autoCat || (state.currentFolder || "checkpoints");
              } else {
                item.category = defaultCategory;
              }

              // Subfolder resolution
              if (subfolderMode === "AUTO") {
                item.subfolder = data.subFolder || "";
              } else if (subfolderMode === "ROOT") {
                item.subfolder = "";
              } else if (subfolderMode === "CUSTOM") {
                item.subfolder = customSubfolderVal;
              }

              item.sizeBytes = data.sizeBytes || 0;
              item.preview = data.preview ? (Array.isArray(data.preview) ? data.preview[0] : data.preview) : "";
              item.status = "ready";
            } else {
              // Direct download link or fallback
              let cleanFile = "model.safetensors";
              try {
                const urlObj = new URL(item.url);
                const pathParts = urlObj.pathname.split("/").filter(Boolean);
                const rawFile = pathParts[pathParts.length - 1] || "model.safetensors";
                cleanFile = decodeURIComponent(rawFile.split("?")[0]);
              } catch (e) {}

              item.filename = cleanFile;
              item.platform = platform;
              if (defaultCategory === "AUTO") {
                item.category = state.currentFolder || "checkpoints";
              } else {
                item.category = defaultCategory;
              }
              if (subfolderMode === "CUSTOM") item.subfolder = customSubfolderVal;
              else item.subfolder = "";
              item.status = "ready";
            }
          } catch (err) {
            item.status = "error";
            item.errorMsg = err.message || "Failed to parse link";
          }
          renderStagedDownloads();
        }
      }

      const workers = Array.from({ length: Math.min(concurrency, newItems.length) }, () => parseWorker());
      await Promise.all(workers);
    } catch (err) {
      console.error("[ModelManager] Bulk parse unexpected error:", err);
    } finally {
      bulkParseBtn.disabled = false;
      bulkParseBtn.innerHTML = originalBtnHtml;
      renderStagedDownloads();
    }
  };

  // Start All Downloads handler
  startAllBtn.onclick = async () => {
    const readyItems = stagedDownloads.filter(item => item.status === "ready");
    if (readyItems.length === 0) {
      showToast("No ready items to download. Please parse URLs first or check error items.");
      return;
    }

    const originalBtnHtml = startAllBtn.innerHTML;
    startAllBtn.disabled = true;

    try {
      for (let i = 0; i < readyItems.length; i++) {
        const item = readyItems[i];
        startAllBtn.innerHTML = `<span class="cmm-spin-icon">⏳</span> Queueing (${i + 1}/${readyItems.length})...`;

        const fullname = item.subfolder ? `${item.subfolder}/${item.filename}` : item.filename;
        let platform = item.platform || "url";
        if (!platform || platform === "url") {
          if (/civitai\.(com|red|green)/i.test(item.url)) platform = "civitai";
          else if (/huggingface\.co/i.test(item.url)) platform = "huggingface";
        }

        const payload = {
          type: item.category,
          pathIndex: 0,
          fullname: fullname,
          description: item.parsedData?.description || "",
          downloadPlatform: platform,
          downloadUrl: item.parsedData?.downloadUrl || item.url,
          sizeBytes: item.sizeBytes || 0,
          previewFile: item.preview || "",
        };

        try {
          const res = await apiFetch("/model-manager/model", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(payload).toString(),
          });
          if (res && res.success) {
            item.status = "queued";
          } else {
            item.status = "error";
            item.errorMsg = (res && res.error) || "Failed to create task";
          }
        } catch (err) {
          item.status = "error";
          item.errorMsg = err.message || "Network error";
        }
        renderStagedDownloads();
      }
    } finally {
      startAllBtn.disabled = false;
      startAllBtn.innerHTML = originalBtnHtml;
      fetchTasks();
    }
  };



  const refreshBtn = dialog.querySelector("#cmm-dl-refresh-tasks");
  if (refreshBtn) {
    refreshBtn.onclick = () => fetchTasks();
  }

  let latestTasks = [];

  const clearCompletedBtn = dialog.querySelector("#cmm-dl-clear-completed");
  if (clearCompletedBtn) {
    clearCompletedBtn.onclick = async () => {
      const completedTasks = latestTasks.filter(t => ["completed", "complete", "done"].includes((t.status || "").toLowerCase()));
      if (completedTasks.length === 0) return;
      for (const t of completedTasks) {
        try {
          await apiFetch(`/model-manager/download/${t.taskId}`, { method: "DELETE" });
        } catch (err) {
          console.warn("[ModelManager] Failed to clear task:", t.taskId, err);
        }
      }
      fetchTasks();
    };
  }

  async function fetchTasks() {
    const container = dialog.querySelector("#cmm-tasks-container");
    const countBadge = dialog.querySelector("#cmm-dl-count");
    if (!container) return;

    try {
      const res = await apiFetch("/model-manager/download/task");
      if (res.success && Array.isArray(res.data)) {
        latestTasks = res.data;
        
        if (countBadge) {
          countBadge.textContent = latestTasks.length > 0 ? `(${latestTasks.length})` : "";
        }

        const completedCount = latestTasks.filter(t => ["completed", "complete", "done"].includes((t.status || "").toLowerCase())).length;
        if (clearCompletedBtn) {
          clearCompletedBtn.style.display = completedCount > 0 ? "inline-block" : "none";
        }

        if (latestTasks.length === 0) {
          container.innerHTML = `<div style="color:#888; text-align:center; padding:30px;">No download tasks in history.</div>`;
          return;
        }

        container.innerHTML = "";
        latestTasks.forEach(task => {
          const item = document.createElement("div");
          item.className = "cmm-task-item";

          const pct = Math.min(100, Math.max(0, task.progress || 0));
          const status = (task.status || "pause").toLowerCase();

          let statusBadgeClass = "cmm-badge-pause";
          let statusLabel = "⏸️ Paused";
          let progressFillColor = "#6b7280";
          let detailText = "";
          let actionButtons = "";

          if (status === "doing" || status === "downloading") {
            statusBadgeClass = "cmm-badge-downloading";
            statusLabel = "⬇️ Downloading";
            progressFillColor = "#3b82f6";
            detailText = `<span>${formatBytes(task.downloadedSize)} / ${formatBytes(task.totalSize)} (${pct.toFixed(1)}%)</span><span>⚡ ${formatBytes(task.bps)}/s</span>`;
            actionButtons = `
              <button class="cmm-btn cmm-btn-pause" data-id="${task.taskId}">⏸️ Pause</button>
              <button class="cmm-btn cmm-btn-danger cmm-btn-del" data-id="${task.taskId}">🗑️ Cancel</button>
            `;
          } else if (status === "retrying") {
            statusBadgeClass = "cmm-badge-retrying";
            statusLabel = "🔄 Retrying...";
            progressFillColor = "#f59e0b";
            detailText = `<span>${formatBytes(task.downloadedSize)} / ${formatBytes(task.totalSize)} (${pct.toFixed(1)}%)</span><span>🔄 Reconnecting...</span>`;
            actionButtons = `
              <button class="cmm-btn cmm-btn-pause" data-id="${task.taskId}">⏸️ Pause</button>
              <button class="cmm-btn cmm-btn-danger cmm-btn-del" data-id="${task.taskId}">🗑️ Cancel</button>
            `;
          } else if (status === "completed" || status === "complete" || status === "done") {
            statusBadgeClass = "cmm-badge-completed";
            statusLabel = "✅ Completed";
            progressFillColor = "#10b981";
            detailText = `<span>${formatBytes(task.totalSize || task.downloadedSize)} • Ready to use</span><span>100%</span>`;
            actionButtons = `
              <button class="cmm-btn cmm-btn-del" data-id="${task.taskId}" title="Remove from history">🗑️ Clear</button>
            `;
          } else if (status === "error" || status === "failed") {
            statusBadgeClass = "cmm-badge-error";
            statusLabel = "❌ Failed";
            progressFillColor = "#ef4444";
            detailText = `<span>${formatBytes(task.downloadedSize)} / ${formatBytes(task.totalSize)} (${pct.toFixed(1)}%)</span>`;
            actionButtons = `
              <button class="cmm-btn cmm-btn-retry" data-id="${task.taskId}">🔁 Retry</button>
              <button class="cmm-btn cmm-btn-danger cmm-btn-del" data-id="${task.taskId}">🗑️ Delete</button>
            `;
          } else if (status === "waiting" || status === "queued") {
            statusBadgeClass = "cmm-badge-waiting";
            statusLabel = "⏳ Queued";
            progressFillColor = "#8b5cf6";
            detailText = `<span>Waiting in queue...</span>`;
            actionButtons = `
              <button class="cmm-btn cmm-btn-danger cmm-btn-del" data-id="${task.taskId}">🗑️ Cancel</button>
            `;
          } else {
            // Paused
            statusBadgeClass = "cmm-badge-pause";
            statusLabel = "⏸️ Paused";
            progressFillColor = "#6b7280";
            detailText = `<span>${formatBytes(task.downloadedSize)} / ${formatBytes(task.totalSize)} (${pct.toFixed(1)}%)</span><span>Paused</span>`;
            actionButtons = `
              <button class="cmm-btn cmm-btn-start" data-id="${task.taskId}">▶️ Resume</button>
              <button class="cmm-btn cmm-btn-danger cmm-btn-del" data-id="${task.taskId}">🗑️ Delete</button>
            `;
          }

          item.innerHTML = `
            <div class="cmm-task-row" style="align-items:flex-start; gap:12px;">
              <span style="font-weight:600; color:#fff; flex:1; min-width:0; word-break:break-word; line-height:1.4;" title="${task.fullname}">${task.fullname}</span>
              <span class="cmm-badge ${statusBadgeClass}">${statusLabel}</span>
            </div>
            <div class="cmm-progress-bar">
              <div class="cmm-progress-fill" style="width:${status === 'completed' ? 100 : pct}%; background:${progressFillColor};"></div>
            </div>
            <div class="cmm-task-row" style="font-size:0.78rem; color:#aaa;">
              ${detailText}
            </div>
            ${task.error ? `<div style="color:#f87171; font-size:0.8rem; background:rgba(239,68,68,0.1); padding:5px 8px; border-radius:4px; border:1px solid rgba(239,68,68,0.25);">⚠️ ${task.error}</div>` : ''}
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              ${actionButtons}
            </div>
          `;

          const delBtn = item.querySelector(".cmm-btn-del");
          if (delBtn) {
            delBtn.onclick = async () => {
              await apiFetch(`/model-manager/download/${task.taskId}`, { method: "DELETE" });
              fetchTasks();
            };
          }

          const pauseBtn = item.querySelector(".cmm-btn-pause");
          if (pauseBtn) {
            pauseBtn.onclick = async () => {
              await apiFetch(`/model-manager/download/${task.taskId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "pause" }),
              });
              fetchTasks();
            };
          }

          const startBtn = item.querySelector(".cmm-btn-start");
          if (startBtn) {
            startBtn.onclick = async () => {
              await apiFetch(`/model-manager/download/${task.taskId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "resume" }),
              });
              fetchTasks();
            };
          }

          const retryBtn = item.querySelector(".cmm-btn-retry");
          if (retryBtn) {
            retryBtn.onclick = async () => {
              await apiFetch(`/model-manager/download/${task.taskId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "retry" }),
              });
              fetchTasks();
            };
          }

          container.appendChild(item);
        });
      } else {
        container.innerHTML = `<div style="color:#888; text-align:center; padding:30px;">No download tasks in history.</div>`;
      }
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div style="color:#888; text-align:center; padding:30px;">No download tasks in history.</div>`;
    }
  }

  fetchTasks();
  state.activeDownloadInterval = setInterval(fetchTasks, 2000);
}

// --- MODEL UPLOAD MODAL ---
function openUploadModal() {
  const overlay = createOverlay("cmm-dialog-sub");
  const dialog = document.createElement("div");
  dialog.className = "cmm-dialog";
  dialog.style.width = "580px";
  dialog.style.maxWidth = "94vw";
  dialog.style.height = "auto";
  dialog.style.maxHeight = "85vh";

  dialog.innerHTML = `
    <div class="cmm-header">
      <div class="cmm-title">
        <span>📤</span> Upload Model File
      </div>
      <div class="cmm-header-actions">
        <button class="cmm-btn cmm-btn-icon" id="cmm-upload-close">✕</button>
      </div>
    </div>

    <div class="cmm-body" style="padding:18px; display:flex; flex-direction:column; gap:14px;">
      <div>
        <label style="display:block; font-size:0.84rem; font-weight:600; color:#e2e8f0; margin-bottom:4px;">Target Category:</label>
        <select class="cmm-select" id="cmm-up-category" style="width:100%; box-sizing:border-box;"></select>
      </div>

      <div>
        <label style="display:block; font-size:0.84rem; font-weight:600; color:#e2e8f0; margin-bottom:4px;">Subfolder Path (optional):</label>
        <input type="text" class="cmm-input" id="cmm-up-subfolder" placeholder="e.g. SDXL/Base" style="width:100%; box-sizing:border-box;" />
      </div>

      <div class="cmm-dropzone" id="cmm-up-dropzone">
        <div style="font-size:2.4rem; margin-bottom:6px;">📁</div>
        <div style="font-weight:600; color:#f8fafc; font-size:0.92rem;">Drag & drop model file here</div>
        <div style="font-size:0.78rem; color:#94a3b8; margin-top:3px;">or click to browse filesystem</div>
        <input type="file" id="cmm-up-file-input" style="display:none;" />
      </div>

      <div id="cmm-up-file-name" style="font-size:0.84rem; font-weight:600; color:#93c5fd; text-align:center; font-family:monospace;"></div>

      <div style="display:flex; justify-content:flex-end;">
        <button class="cmm-btn cmm-btn-primary" id="cmm-up-submit-btn" disabled>Upload File</button>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  makeDraggable(dialog, dialog.querySelector(".cmm-header"));

  dialog.querySelector("#cmm-upload-close").onclick = () => overlay.remove();

  const categorySelect = dialog.querySelector("#cmm-up-category");
  Object.keys(state.foldersList).sort().forEach(folder => {
    const opt = document.createElement("option");
    opt.value = folder;
    opt.textContent = folder;
    if (folder === state.currentFolder) opt.selected = true;
    categorySelect.appendChild(opt);
  });

  const dropzone = dialog.querySelector("#cmm-up-dropzone");
  const fileInput = dialog.querySelector("#cmm-up-file-input");
  const fileNameDisplay = dialog.querySelector("#cmm-up-file-name");
  const submitBtn = dialog.querySelector("#cmm-up-submit-btn");

  let selectedFile = null;

  dropzone.onclick = () => fileInput.click();

  fileInput.onchange = () => {
    if (fileInput.files && fileInput.files.length > 0) {
      selectedFile = fileInput.files[0];
      fileNameDisplay.textContent = `Selected: ${selectedFile.name} (${formatBytes(selectedFile.size)})`;
      submitBtn.disabled = false;
    }
  };

  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "#3b82f6";
  };

  dropzone.ondragleave = () => {
    dropzone.style.borderColor = "rgba(255, 255, 255, 0.15)";
  };

  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "rgba(255, 255, 255, 0.15)";
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      selectedFile = e.dataTransfer.files[0];
      fileNameDisplay.textContent = `Selected: ${selectedFile.name} (${formatBytes(selectedFile.size)})`;
      submitBtn.disabled = false;
    }
  };

  submitBtn.onclick = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("type", categorySelect.value);
    formData.append("pathIndex", 0);
    formData.append("subFolder", dialog.querySelector("#cmm-up-subfolder").value.trim());

    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading...";

    try {
      const res = await apiFetch("/model-manager/upload", {
        method: "POST",
        body: formData,
      });

      if (res.success) {
        showToast("Upload completed successfully!");
        overlay.remove();
      } else {
        showToast("Upload failed: " + res.error);
        submitBtn.disabled = false;
        submitBtn.textContent = "Upload File";
      }
    } catch (err) {
      showToast("Upload error: " + err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = "Upload File";
    }
  };
}

// --- BATCH SCAN MODAL ---
function openBatchScanModal() {
  const overlay = createOverlay("cmm-dialog-sub");
  const dialog = document.createElement("div");
  dialog.className = "cmm-dialog";
  dialog.style.width = "540px";
  dialog.style.maxWidth = "94vw";
  dialog.style.height = "auto";
  dialog.style.maxHeight = "85vh";

  dialog.innerHTML = `
    <div class="cmm-header">
      <div class="cmm-title">
        <span>🔍</span> Fetch Model Info
      </div>
      <div class="cmm-header-actions">
        <button class="cmm-btn cmm-btn-icon" id="cmm-scan-close">✕</button>
      </div>
    </div>

    <div class="cmm-body" style="padding:18px; display:flex; flex-direction:column; gap:14px;">
      <p style="color:#94a3b8; font-size:0.86rem; margin:0; line-height:1.5;">Batch fetching calculates model SHA256 hashes and queries Civitai to automatically download preview images and model metadata.</p>
      
      <div>
        <label style="display:block; font-size:0.84rem; font-weight:600; color:#e2e8f0; margin-bottom:4px;">Fetch Mode:</label>
        <select class="cmm-select" id="cmm-scan-mode" style="width:100%; box-sizing:border-box;">
          <option value="diff">Diff Fetch (Only models missing preview/info)</option>
          <option value="full">Full Refetch (All models)</option>
        </select>
      </div>

      <div style="display:flex; justify-content:flex-end; margin-top:4px;">
        <button class="cmm-btn cmm-btn-primary" id="cmm-start-scan-btn">🚀 Start Fetching</button>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  makeDraggable(dialog, dialog.querySelector(".cmm-header"));

  dialog.querySelector("#cmm-scan-close").onclick = () => overlay.remove();

  dialog.querySelector("#cmm-start-scan-btn").onclick = async () => {
    const mode = dialog.querySelector("#cmm-scan-mode").value;
    try {
      const res = await apiFetch("/model-manager/model-info/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (res.success) {
        showToast("Batch metadata fetching started in background!");
        overlay.remove();
      } else {
        showToast("Failed to start fetch task: " + res.error);
      }
    } catch (err) {
      showToast("Error: " + err.message);
    }
  };
}

// --- SETTINGS MODAL ---
async function openSettingsModal(onSaveCallback) {
  const overlay = createOverlay("cmm-dialog-sub");
  const dialog = document.createElement("div");
  dialog.className = "cmm-dialog";
  dialog.style.width = "620px";
  dialog.style.maxWidth = "94vw";
  dialog.style.height = "auto";
  dialog.style.maxHeight = "88vh";

  dialog.innerHTML = `
    <div class="cmm-header">
      <div class="cmm-title">
        <span>⚙️</span> Model Manager Settings
      </div>
      <div class="cmm-header-actions">
        <button class="cmm-btn cmm-btn-icon" id="cmm-settings-close" title="Close settings">✕</button>
      </div>
    </div>

    <div class="cmm-body" style="padding:18px; display:flex; flex-direction:column; gap:14px; overflow-y:auto;">
      <div>
        <label style="display:block; font-size:0.84rem; font-weight:600; color:#e2e8f0; margin-bottom:4px;" title="Civitai API Key for authentication">
          Civitai API Key:
          <span class="cmm-help-tip" title="API key from civitai.com account settings. Required for downloading early access or NSFW models, fetching private metadata, and avoiding API rate limits.">?</span>
        </label>
        <div style="display:flex; gap:6px;">
          <input type="password" class="cmm-input" id="cmm-set-civitai-key" style="flex:1;" placeholder="Optional API Key for Civitai..." title="Enter your Civitai API key (from civitai.com -> Account Settings -> API Keys)" />
          <button class="cmm-btn cmm-btn-icon" id="cmm-toggle-civitai-visibility" title="Toggle Civitai API key visibility (Show/Hide)">👁️</button>
        </div>
      </div>

      <div>
        <label style="display:block; font-size:0.84rem; font-weight:600; color:#e2e8f0; margin-bottom:4px;" title="HuggingFace User Access Token">
          HuggingFace API Token:
          <span class="cmm-help-tip" title="User Access Token from huggingface.co/settings/tokens. Required for downloading gated repositories (e.g., SDXL, Flux) or private models.">?</span>
        </label>
        <div style="display:flex; gap:6px;">
          <input type="password" class="cmm-input" id="cmm-set-hf-token" style="flex:1;" placeholder="Optional Token for HuggingFace..." title="Enter your HuggingFace User Access Token (read permission is sufficient)" />
          <button class="cmm-btn cmm-btn-icon" id="cmm-toggle-hf-visibility" title="Toggle HuggingFace token visibility (Show/Hide)">👁️</button>
        </div>
      </div>

      <!-- SOCKS5 Proxy Enclosure with Civitai and HuggingFace Toggles -->
      <div class="cmm-section-card">
        <div style="font-weight:600; font-size:0.88rem; color:#f8fafc; margin-bottom:4px; display:flex; align-items:center;" title="Configure SOCKS5 proxy to bypass regional restrictions or network firewalls">
          SOCKS5 Proxy Configuration
          <span class="cmm-help-tip" title="Route Civitai or HuggingFace network traffic through a local or remote SOCKS5 proxy server (e.g. Clash, V2Ray, Shadowsocks, SSH tunnel).">?</span>
        </div>
        
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;" title="Route Civitai API queries and metadata lookups through your SOCKS5 proxy">
            <div>
              <div style="font-size:0.84rem; font-weight:600; color:#e2e8f0;">Use Proxy for Civitai</div>
              <div style="font-size:0.75rem; color:#94a3b8;">Route Civitai API queries & info lookups</div>
            </div>
            <label class="cmm-switch" title="Toggle SOCKS5 proxy routing for Civitai">
              <input type="checkbox" id="cmm-set-proxy-civitai" title="Toggle SOCKS5 proxy routing for Civitai" />
              <span class="cmm-slider"></span>
            </label>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;" title="Route HuggingFace API queries and model lookups through your SOCKS5 proxy">
            <div>
              <div style="font-size:0.84rem; font-weight:600; color:#e2e8f0;">Use Proxy for HuggingFace</div>
              <div style="font-size:0.75rem; color:#94a3b8;">Route HuggingFace API queries & info lookups</div>
            </div>
            <label class="cmm-switch" title="Toggle SOCKS5 proxy routing for HuggingFace">
              <input type="checkbox" id="cmm-set-proxy-hf" title="Toggle SOCKS5 proxy routing for HuggingFace" />
              <span class="cmm-slider"></span>
            </label>
          </div>
        </div>

        <div id="cmm-proxy-fields-container" style="display:none; flex-direction:column; gap:10px; border-top:1px solid rgba(255,255,255,0.07); padding-top:10px; margin-top:2px;">
          <div>
            <label style="display:block; font-size:0.78rem; color:#94a3b8; margin-bottom:4px; font-weight:500;" title="Determine whether downloads or only API queries pass through the proxy">
              Proxy Routing Mode:
              <span class="cmm-help-tip" title="Choose whether to route only API metadata queries (recommended to save bandwidth and maximize download speed) or all traffic including large model files.">?</span>
            </label>
            <select class="cmm-select" id="cmm-set-proxy-scope" style="width:100%; box-sizing:border-box;" title="Select proxy routing scope">
              <option value="api_only" title="Routes API queries and metadata lookups via proxy, while file downloads stream directly for maximum speed">API & Metadata Only (Recommended - Bypass blocks, fast downloads)</option>
              <option value="all" title="Routes both API queries and large model file downloads entirely through the proxy">Route All Traffic (API Queries + File Downloads)</option>
            </select>
          </div>

          <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
            <div>
              <label style="display:block; font-size:0.78rem; color:#94a3b8; margin-bottom:4px; font-weight:500;" title="SOCKS5 Server hostname or IP address">Host / Server:</label>
              <input type="text" class="cmm-input" id="cmm-set-proxy-host" placeholder="e.g. 127.0.0.1 or proxy.example.com" style="width:100%; box-sizing:border-box;" title="SOCKS5 proxy IP address or hostname (e.g. 127.0.0.1 for local clients)" />
            </div>
            <div>
              <label style="display:block; font-size:0.78rem; color:#94a3b8; margin-bottom:4px; font-weight:500;" title="SOCKS5 Server Port">Port:</label>
              <input type="text" class="cmm-input" id="cmm-set-proxy-port" placeholder="1080" style="width:100%; box-sizing:border-box;" title="SOCKS5 port number (default: 1080, Clash: 7890, V2Ray: 10808, etc.)" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div>
              <label style="display:block; font-size:0.78rem; color:#94a3b8; margin-bottom:4px; font-weight:500;" title="Optional proxy username">Username (optional):</label>
              <input type="text" class="cmm-input" id="cmm-set-proxy-user" placeholder="Username" style="width:100%; box-sizing:border-box;" title="Optional username for SOCKS5 proxy authentication" />
            </div>
            <div>
              <label style="display:block; font-size:0.78rem; color:#94a3b8; margin-bottom:4px; font-weight:500;" title="Optional proxy password">Password (optional):</label>
              <input type="password" class="cmm-input" id="cmm-set-proxy-pass" placeholder="Password" style="width:100%; box-sizing:border-box;" title="Optional password for SOCKS5 proxy authentication" />
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; background:#14141d; border:1px solid rgba(255,255,255,0.06); border-radius:6px; padding:10px 12px; margin-top:2px;" title="Keep SOCKS5 TCP connection open across requests to speed up metadata lookups">
            <div>
              <div style="font-size:0.84rem; font-weight:600; color:#e2e8f0; display:flex; align-items:center;">
                Reuse Proxy Connection (Keep-Alive)
                <span class="cmm-help-tip" title="Maintains persistent HTTP/SOCKS5 connection pools to drastically speed up batch metadata parsing and avoid repeated TLS/proxy handshakes.">?</span>
              </div>
              <div style="font-size:0.74rem; color:#94a3b8;">Reuses persistent connection pool for metadata parsing & bulk URL scans to prevent connection overhead</div>
            </div>
            <label class="cmm-switch" title="Toggle persistent proxy connection pool">
              <input type="checkbox" id="cmm-set-proxy-reuse" title="Toggle persistent proxy connection pool" />
              <span class="cmm-slider"></span>
            </label>
          </div>

          <div style="display:flex; justify-content:flex-end; margin-top:2px;">
            <button class="cmm-btn" id="cmm-test-proxy-btn" style="font-size:0.8rem;" title="Test connection to the specified SOCKS5 proxy server">🧪 Test Proxy Connection</button>
          </div>
        </div>
      </div>

      <!-- Convert Video Previews to WebP Toggle Switch -->
      <div class="cmm-section-card" title="Convert downloaded/detected video previews into lightweight animated WebP images">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:600; font-size:0.86rem; color:#f8fafc; display:flex; align-items:center;">
              Convert Video Previews to Animated WebP
              <span class="cmm-help-tip" title="Uses FFmpeg to convert MP4/WEBM model preview videos into animated WebP files (quality 85%, compression 2), significantly reducing disk space and speeding up gallery loading. Requires FFmpeg on PATH.">?</span>
            </div>
            <div style="font-size:0.75rem; color:#94a3b8;">Uses FFmpeg to convert video previews to WebP (quality 85%, compression 2). Requires FFmpeg installed.</div>
          </div>
          <label class="cmm-switch" title="Toggle video preview conversion to animated WebP">
            <input type="checkbox" id="cmm-set-convert-video-webp" title="Toggle video preview conversion to animated WebP" />
            <span class="cmm-slider"></span>
          </label>
        </div>
        <div style="display:flex; justify-content:flex-end;">
          <button class="cmm-btn" id="cmm-check-ffmpeg-btn" style="font-size:0.8rem;" title="Check if FFmpeg binary is installed and detected on system PATH">🔍 Check FFmpeg Installation</button>
        </div>
      </div>

      <div>
        <label style="display:block; font-size:0.84rem; font-weight:600; color:#e2e8f0; margin-bottom:4px;" title="Number of simultaneous background downloads">
          Max Concurrent Downloads:
          <span class="cmm-help-tip" title="The maximum number of model download tasks that can run in parallel. Additional tasks will stay queued in the background and start automatically when slots become available.">?</span>
        </label>
        <input type="number" class="cmm-input" id="cmm-set-max-tasks" min="1" max="10" value="3" style="width:100%; box-sizing:border-box;" title="Set maximum concurrent downloads (1-10, default: 3)" />
      </div>

      <!-- Include Hidden Files Toggle Switch -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:#181824; border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:12px 14px;" title="Scan dotted folders and hidden files when discovering models">
        <div>
          <div style="font-weight:600; font-size:0.86rem; color:#f8fafc; display:flex; align-items:center;">
            Include Hidden Files in Model Scanning
            <span class="cmm-help-tip" title="When enabled, model scanner will include hidden directories and files prefixed with a dot (e.g. .hidden, .models). Keep disabled to ignore system/cache directories.">?</span>
          </div>
          <div style="font-size:0.75rem; color:#94a3b8;">Scan hidden folders and dotted files</div>
        </div>
        <label class="cmm-switch" title="Toggle scanning of hidden and dotted files">
          <input type="checkbox" id="cmm-set-include-hidden" title="Toggle scanning of hidden and dotted files" />
          <span class="cmm-slider"></span>
        </label>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:6px;">
        <button class="cmm-btn" id="cmm-settings-cancel-btn" title="Discard unsaved changes and close settings">Cancel</button>
        <button class="cmm-btn cmm-btn-primary" id="cmm-settings-save-btn" title="Save all settings and apply changes">💾 Save Settings</button>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  makeDraggable(dialog, dialog.querySelector(".cmm-header"));

  const closeModal = () => overlay.remove();
  dialog.querySelector("#cmm-settings-close").onclick = closeModal;
  dialog.querySelector("#cmm-settings-cancel-btn").onclick = closeModal;

  const civitaiInput = dialog.querySelector("#cmm-set-civitai-key");
  const hfInput = dialog.querySelector("#cmm-set-hf-token");

  const proxyCivitaiCheck = dialog.querySelector("#cmm-set-proxy-civitai");
  const proxyHfCheck = dialog.querySelector("#cmm-set-proxy-hf");
  const proxyScopeSelect = dialog.querySelector("#cmm-set-proxy-scope");
  const proxyFieldsContainer = dialog.querySelector("#cmm-proxy-fields-container");

  const proxyHostInput = dialog.querySelector("#cmm-set-proxy-host");
  const proxyPortInput = dialog.querySelector("#cmm-set-proxy-port");
  const proxyUserInput = dialog.querySelector("#cmm-set-proxy-user");
  const proxyPassInput = dialog.querySelector("#cmm-set-proxy-pass");
  const proxyReuseCheck = dialog.querySelector("#cmm-set-proxy-reuse");

  const convertVideoWebpCheck = dialog.querySelector("#cmm-set-convert-video-webp");

  const updateProxyVisibility = () => {
    proxyFieldsContainer.style.display = (proxyCivitaiCheck.checked || proxyHfCheck.checked) ? "flex" : "none";
  };

  proxyCivitaiCheck.onchange = updateProxyVisibility;
  proxyHfCheck.onchange = updateProxyVisibility;

  dialog.querySelector("#cmm-toggle-civitai-visibility").onclick = () => {
    civitaiInput.type = civitaiInput.type === "password" ? "text" : "password";
  };

  dialog.querySelector("#cmm-toggle-hf-visibility").onclick = () => {
    hfInput.type = hfInput.type === "password" ? "text" : "password";
  };

  // Check FFmpeg Installation Button
  dialog.querySelector("#cmm-check-ffmpeg-btn").onclick = async () => {
    const btn = dialog.querySelector("#cmm-check-ffmpeg-btn");
    btn.disabled = true;
    btn.textContent = "Checking...";
    try {
      const res = await apiFetch("/model-manager/settings/check-ffmpeg", { method: "POST" });
      if (res.success && res.installed) {
        showToast(res.message);
      } else {
        showToast("❌ " + (res.error || "FFmpeg is not installed on system PATH."));
      }
    } catch (err) {
      showToast("Error checking FFmpeg: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "🔍 Check FFmpeg Installation";
    }
  };

  // Test Proxy Connection Button
  dialog.querySelector("#cmm-test-proxy-btn").onclick = async () => {
    const host = proxyHostInput.value.trim();
    const port = proxyPortInput.value.trim() || "1080";
    const username = proxyUserInput.value.trim();
    const password = proxyPassInput.value.trim();

    if (!host) {
      showToast("Please enter a proxy Host / Server first.");
      return;
    }

    const testBtn = dialog.querySelector("#cmm-test-proxy-btn");
    testBtn.disabled = true;
    testBtn.textContent = "Testing...";

    try {
      const res = await apiFetch("/model-manager/settings/test-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, username, password }),
      });

      if (res.success) {
        showToast(res.message || "Proxy connection successful!");
      } else {
        showToast("❌ " + (res.error || "Proxy connection failed."));
      }
    } catch (err) {
      showToast("Error testing proxy: " + err.message);
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = "🧪 Test Proxy Connection";
    }
  };

  try {
    const res = await apiFetch("/model-manager/settings");
    if (res.success && res.data) {
      civitaiInput.value = res.data.civitai_api_key || "";
      hfInput.value = res.data.huggingface_api_key || "";

      proxyCivitaiCheck.checked = !!res.data.proxy_civitai;
      proxyHfCheck.checked = !!res.data.proxy_huggingface;
      proxyScopeSelect.value = res.data.proxy_scope || "api_only";
      updateProxyVisibility();

      proxyHostInput.value = res.data.proxy_host || "";
      proxyPortInput.value = res.data.proxy_port || "1080";
      proxyUserInput.value = res.data.proxy_username || "";
      proxyPassInput.value = res.data.proxy_password || "";
      proxyReuseCheck.checked = res.data.proxy_reuse_connection !== false;

      convertVideoWebpCheck.checked = !!res.data.convert_video_to_webp;

      dialog.querySelector("#cmm-set-max-tasks").value = res.data.max_task_count || 3;
      dialog.querySelector("#cmm-set-include-hidden").checked = !!res.data.include_hidden_files;
    }
  } catch (err) {
    console.error("Failed to load settings:", err);
  }

  dialog.querySelector("#cmm-settings-save-btn").onclick = async () => {
    const civitai_api_key = civitaiInput.value.trim();
    const huggingface_api_key = hfInput.value.trim();

    const proxy_civitai = proxyCivitaiCheck.checked;
    const proxy_huggingface = proxyHfCheck.checked;
    const proxy_scope = proxyScopeSelect.value;
    const proxy_host = proxyHostInput.value.trim();
    const proxy_port = proxyPortInput.value.trim() || "1080";
    const proxy_username = proxyUserInput.value.trim();
    const proxy_password = proxyPassInput.value.trim();
    const proxy_reuse_connection = proxyReuseCheck.checked;

    const convert_video_to_webp = convertVideoWebpCheck.checked;
    const max_task_count = parseInt(dialog.querySelector("#cmm-set-max-tasks").value, 10) || 3;
    const include_hidden_files = dialog.querySelector("#cmm-set-include-hidden").checked;

    try {
      const res = await apiFetch("/model-manager/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          civitai_api_key,
          huggingface_api_key,
          proxy_civitai,
          proxy_huggingface,
          proxy_scope,
          proxy_host,
          proxy_port,
          proxy_username,
          proxy_password,
          proxy_reuse_connection,
          convert_video_to_webp,
          max_task_count,
          include_hidden_files,
        }),
      });

      if (res.success) {
        showToast("Settings saved successfully!");
        closeModal();
        if (onSaveCallback) onSaveCallback();
      } else {
        showToast("Failed to save settings: " + res.error);
      }
    } catch (err) {
      showToast("Error: " + err.message);
    }
  };
}

async function addModelManagerButtonToMenu() {
  const openManager = () => {
    openModelManagerDialog();
  };

  // 1. Add to modern ComfyUI Topbar (app.menu.settingsGroup)
  if (app.menu?.settingsGroup && !window._modelManagerSettingsGroupBtnAdded) {
    let ComfyButtonClass =
      window.comfyAPI?.button?.ComfyButton ||
      window.comfyAPI?.ui?.components?.button?.ComfyButton ||
      app.ui?.button?.ComfyButton;

    try {
      if (ComfyButtonClass) {
        const btn = new ComfyButtonClass({
          icon: "folder",
          tooltip: "Open Model Manager",
          action: openManager,
        });
        if (btn.element) {
          btn.element.title = "Open Model Manager";
        }
        app.menu.settingsGroup.append(btn);
        window._modelManagerSettingsGroupBtnAdded = true;
        console.log("[ModelManager] Appended ComfyButton to app.menu.settingsGroup");
      } else {
        const btn = document.createElement("button");
        btn.id = "comfyui-model-manager-button";
        btn.textContent = "📂";
        btn.title = "Open Model Manager";
        btn.onclick = openManager;
        if (app.menu.settingsGroup.element) {
          app.menu.settingsGroup.element.append(btn);
        } else if (typeof app.menu.settingsGroup.append === "function") {
          app.menu.settingsGroup.append(btn);
        }
        window._modelManagerSettingsGroupBtnAdded = true;
        console.log("[ModelManager] Appended DOM button to app.menu.settingsGroup");
      }
    } catch (err) {
      console.warn("[ModelManager] Error appending button to app.menu.settingsGroup:", err);
    }
  }

  // 2. Add to app.ui.menuContainer for legacy menu support
  if (app.ui?.menuContainer && !document.getElementById("comfy-model-manager-menu-btn")) {
    const btn = document.createElement("button");
    btn.id = "comfy-model-manager-menu-btn";
    btn.textContent = "📂";
    btn.title = "Open Model Manager";
    btn.onclick = openManager;
    app.ui.menuContainer.appendChild(btn);
    console.log("[ModelManager] Appended button to app.ui.menuContainer");
  }
}

function ensureModelManagerButtonInMenu() {
  addModelManagerButtonToMenu();

  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    addModelManagerButtonToMenu();
    if (window._modelManagerSettingsGroupBtnAdded || attempts > 30) {
      clearInterval(interval);
    }
  }, 500);
}

// Register ComfyUI Extension
app.registerExtension({
  name: "Comfy.ModelManager",

  commands: [
    {
      id: "modelManager.open",
      label: "Model Manager",
      icon: "pi pi-folder",
      function: () => {
        openModelManagerDialog();
      },
    },
  ],

  menuCommands: [
    {
      path: ["Model Manager"],
      commands: ["modelManager.open"],
    },
  ],

  init() {
    console.log("[ModelManager] Initializing Model Manager Extension");
    ensureModelManagerButtonInMenu();
  },

  async setup() {
    console.log("[ModelManager] Setting up Model Manager Extension");
    ensureModelManagerButtonInMenu();
  },
});
