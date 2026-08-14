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
  const d = new Date(cleanStr);
  if (isNaN(d.getTime())) return cleanStr;
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

function createOverlay(extraClass = "") {
  const overlay = document.createElement("div");
  const isSub = extraClass.includes("cmm-dialog-sub");
  overlay.className = `cmm-dialog-overlay ${extraClass} ${isSub ? "cmm-sub-overlay" : ""}`;
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

  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks ```code```
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `<pre style="background:#111118; padding:10px; border-radius:6px; overflow-x:auto; font-family:monospace; font-size:0.85rem; border:1px solid #333; margin:8px 0;"><code>${code.trim()}</code></pre>`;
  });

  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code style="background:#1a1a24; padding:2px 6px; border-radius:4px; font-family:monospace; color:#93c5fd;">$1</code>');

  // Horizontal rules (---, ***, ___)
  html = html.replace(/^(?:---|___|\*\*\*)\s*$/gim, '<hr style="border:none; border-top:1px solid #334; margin:14px 0;" />');

  // Headers #, ##, ###
  html = html.replace(/^### (.*$)/gim, '<h3 style="margin:10px 0 6px 0; font-size:1.05rem; color:#fff;">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 style="margin:12px 0 6px 0; font-size:1.2rem; color:#fff; border-bottom:1px solid #334; padding-bottom:4px;">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 style="margin:14px 0 8px 0; font-size:1.35rem; color:#fff; border-bottom:1px solid #445; padding-bottom:6px;">$1</h1>');

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    let targetUrl = url;
    if (typeof targetUrl === "string" && /civitai\.(com|green)/i.test(targetUrl)) {
      targetUrl = targetUrl.replace(/civitai\.(com|green)/gi, "civitai.red");
    }
    return `<a href="${targetUrl}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa; text-decoration:underline;">${text}</a>`;
  });

  // Bullet lists (- or *)
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li style="margin-left:18px;">$1</li>');

  const lines = html.split("\n");
  let result = "";
  let inList = false;

  for (let line of lines) {
    if (line.startsWith("<li")) {
      if (!inList) {
        result += '<ul style="margin:6px 0; padding-left:6px;">';
        inList = true;
      }
      result += line;
    } else {
      if (inList) {
        result += '</ul>';
        inList = false;
      }
      if (line.trim().length > 0 && !line.startsWith("<h") && !line.startsWith("<pre") && !line.startsWith("<ul") && !line.startsWith("<hr")) {
        result += `<p style="margin:4px 0; line-height:1.5; color:#d1d5db;">${line}</p>`;
      } else {
        result += line;
      }
    }
  }
  if (inList) result += '</ul>';

  return result;
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
    alert("Failed to load model categories: " + err.message);
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
  dialog.style.maxWidth = "920px";
  dialog.style.height = "82vh";

  const relativeFilename = model.subFolder ? `${model.subFolder}/${model.basename}${model.extension}` : `${model.basename}${model.extension}`;

  dialog.innerHTML = `
    <div class="cmm-header">
      <div class="cmm-title">
        <span>📄</span> ${model.basename}${model.extension}
      </div>
      <div class="cmm-header-actions">
        <button class="cmm-btn" id="cmm-single-scan-btn" title="Fetch preview & info for this model">🔍 Fetch Info</button>
        <button class="cmm-btn cmm-btn-icon" id="cmm-detail-close">✕</button>
      </div>
    </div>

    <div class="cmm-body" style="padding:20px;">
      <div class="cmm-detail-layout">
        <!-- Left Side: Preview & Controls -->
        <div class="cmm-detail-left">
          <div class="cmm-preview-box" id="cmm-detail-preview">
            Loading preview...
          </div>
          <div>
            <label class="cmm-btn cmm-btn-primary" style="width:100%; justify-content:center; box-sizing:border-box;">
              📷 Upload Custom Preview
              <input type="file" id="cmm-preview-file-input" accept="image/*,video/*" style="display:none;" />
            </label>
          </div>
          <div style="font-size:0.8rem; color:#888; display:flex; flex-direction:column; gap:4px;">
            <div><strong>Type:</strong> ${model.type}</div>
            <div><strong>Subfolder:</strong> ${model.subFolder || "(root)"}</div>
            <div><strong>Size:</strong> ${formatBytes(model.sizeBytes)}</div>
            <div><strong>Created:</strong> ${formatDate(model.createdAt)}</div>
            <div><strong>Updated:</strong> ${formatDate(model.updatedAt)}</div>
            <div id="cmm-detail-published-row" style="display:none;"><strong>Published:</strong> <span id="cmm-detail-published-val"></span></div>
            <div id="cmm-detail-modelpage-row" style="display:none;"><strong>Model Page:</strong> <a id="cmm-detail-modelpage-link" href="#" target="_blank" rel="noopener noreferrer" style="color:#60a5fa; font-weight:600; text-decoration:none;">Link ↗</a></div>
          </div>
        </div>

        <!-- Right Side: Compact Icon Tabs -->
        <div style="display:flex; flex-direction:column; overflow:hidden; height:100%;">
          <div class="cmm-tabs">
            <div class="cmm-tab active" data-tab="desc" title="Description"><span class="cmm-tab-icon">📝</span><span class="cmm-tab-label"> Description</span></div>
            <div class="cmm-tab" data-tab="info" title="Model Info"><span class="cmm-tab-icon">ℹ️</span><span class="cmm-tab-label" style="display:none;"> Model Info</span></div>
            <div class="cmm-tab" data-tab="meta" title="Raw Safetensors Metadata"><span class="cmm-tab-icon">🔬</span><span class="cmm-tab-label" style="display:none;"> Metadata</span></div>
            <div class="cmm-tab" data-tab="rename" title="Rename / Move Model"><span class="cmm-tab-icon">🏷️</span><span class="cmm-tab-label" style="display:none;"> Rename / Move</span></div>
            <div class="cmm-tab" data-tab="danger" title="Delete Model"><span class="cmm-tab-icon">🗑️</span><span class="cmm-tab-label" style="display:none;"> Delete</span></div>
          </div>

          <div style="flex:1; overflow-y:auto; display:flex; flex-direction:column;" id="cmm-tab-content">
            <!-- Desc Tab -->
            <div id="cmm-tab-desc" style="display:flex; flex-direction:column; gap:10px; flex:1; height:100%;">
              <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #2d2d3a; padding-bottom:8px;">
                <span style="font-size:0.82rem; color:#888; font-weight:600;" id="cmm-desc-mode-indicator">Markdown View</span>
                <div style="display:flex; gap:8px;">
                  <button class="cmm-btn" id="cmm-toggle-edit-desc-btn">✏️ Edit</button>
                  <button class="cmm-btn" id="cmm-cancel-desc-btn" style="display:none;">✕ Cancel</button>
                  <button class="cmm-btn cmm-btn-primary" id="cmm-save-desc-btn" style="display:none;">💾 Save</button>
                </div>
              </div>

              <!-- Rendered Markdown View -->
              <div id="cmm-desc-markdown-view" style="flex:1; overflow-y:auto; padding:14px; background:#14141d; border:1px solid #2d2d3a; border-radius:8px; box-sizing:border-box;"></div>

              <!-- Raw Text Editor -->
              <textarea class="cmm-input" id="cmm-desc-text" style="flex:1; width:100%; font-family:monospace; resize:none; display:none; box-sizing:border-box;" placeholder="Enter markdown description..."></textarea>
            </div>

            <!-- Model Info Tab -->
            <div id="cmm-tab-info" style="display:none;">
              <div id="cmm-info-table-container">No model info available.</div>
            </div>

            <!-- Meta Tab -->
            <div id="cmm-tab-meta" style="display:none;">
              <div id="cmm-meta-table-container">Loading metadata...</div>
            </div>

            <!-- Rename Tab -->
            <div id="cmm-tab-rename" style="display:none; flex-direction:column; gap:16px;">
              <div>
                <label style="display:block; font-size:0.88rem; font-weight:600; margin-bottom:4px;">Subfolder Path:</label>
                <input type="text" class="cmm-input" id="cmm-rename-subfolder" value="${model.subFolder || ''}" style="width:100%; box-sizing:border-box;" placeholder="e.g. SDXL/Base" />
              </div>
              <div>
                <label style="display:block; font-size:0.88rem; font-weight:600; margin-bottom:4px;">Basename (without extension):</label>
                <input type="text" class="cmm-input" id="cmm-rename-basename" value="${model.basename}" style="width:100%; box-sizing:border-box;" />
              </div>
              <div>
                <button class="cmm-btn cmm-btn-primary" id="cmm-rename-btn">🏷️ Rename / Move Model</button>
              </div>
            </div>

            <!-- Danger Tab -->
            <div id="cmm-tab-danger" style="display:none; padding:20px; text-align:center;">
              <p style="color:#ef4444; font-weight:600; margin-bottom:16px;">⚠️ Are you sure you want to permanently delete this model and its associated metadata & previews?</p>
              <button class="cmm-btn cmm-btn-danger" id="cmm-delete-btn" style="padding:10px 24px;">🗑️ Permanently Delete Model</button>
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

  // Render Preview
  function renderPreview(previewSrc) {
    const previewBox = dialog.querySelector("#cmm-detail-preview");
    if (previewSrc) {
      const ext = previewSrc.split(".").pop().toLowerCase();
      if (["mp4", "webm", "mov"].includes(ext)) {
        previewBox.innerHTML = `<video src="${previewSrc}" controls autoplay loop style="width:100%; height:100%; object-fit:cover; border-radius:6px;" onerror="this.onerror=null; this.parentElement.innerHTML=getNoPreviewHTML();"></video>`;
      } else {
        previewBox.innerHTML = `<img src="${previewSrc}" style="width:100%; max-height:380px; object-fit:cover; border-radius:6px;" alt="Preview" onerror="this.onerror=null; this.parentElement.innerHTML=getNoPreviewHTML();" />`;
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
        alert("Model metadata & preview fetched successfully!");
        if (res.data.description) {
          updateDescDisplay(res.data.description);
        }
        if (onRefresh) onRefresh();
      } else {
        alert("Failed to fetch model info: " + (res.error || "No match found"));
      }
    } catch (err) {
      alert("Error fetching model info: " + err.message);
    } finally {
      singleScanBtn.disabled = false;
      singleScanBtn.textContent = "🔍 Fetch Info";
    }
  };

  // Description Editor & Frontmatter handling
  const descMarkdownView = dialog.querySelector("#cmm-desc-markdown-view");
  const descTextarea = dialog.querySelector("#cmm-desc-text");
  const descModeIndicator = dialog.querySelector("#cmm-desc-mode-indicator");
  const toggleEditBtn = dialog.querySelector("#cmm-toggle-edit-desc-btn");
  const cancelDescBtn = dialog.querySelector("#cmm-cancel-desc-btn");
  const saveDescBtn = dialog.querySelector("#cmm-save-desc-btn");

  let currentRawDescription = "";
  let currentCleanDescription = "";
  let currentFrontmatterInfo = {};
  let isEditingDesc = false;

  function renderModelInfoTable(info) {
    const container = dialog.querySelector("#cmm-info-table-container");
    const pubRow = dialog.querySelector("#cmm-detail-published-row");
    const pubVal = dialog.querySelector("#cmm-detail-published-val");
    const modelPageRow = dialog.querySelector("#cmm-detail-modelpage-row");
    const modelPageLink = dialog.querySelector("#cmm-detail-modelpage-link");

    if (!info || Object.keys(info).length === 0) {
      container.innerHTML = `<div style="color:#888; padding:10px;">No additional model info available.</div>`;
      pubRow.style.display = "none";
      modelPageRow.style.display = "none";
      return;
    }

    // Populate Left Sidebar Published Date & Model Page Link
    const published = info.publishedAt || info.published_at || info.createdAt;
    if (published) {
      pubVal.textContent = formatDate(published);
      pubRow.style.display = "block";
    } else {
      pubRow.style.display = "none";
    }

    let mPage = info.modelPage || info.model_page;
    if (mPage) {
      if (typeof mPage === "string" && /civitai\.(com|green)/i.test(mPage)) {
        mPage = mPage.replace(/civitai\.(com|green)/gi, "civitai.red");
      }
      modelPageLink.href = mPage;
      modelPageRow.style.display = "block";
    } else {
      modelPageRow.style.display = "none";
    }

    // Build Structured Table for Model Info Tab
    let rows = "";
    for (const [k, v] of Object.entries(info)) {
      if (k === "preview") continue; // Skip preview list in table

      let label = k.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase());
      let valStr = "";

      if (k === "modelPage" && v) {
        let linkUrl = v;
        if (typeof linkUrl === "string" && /civitai\.(com|green)/i.test(linkUrl)) {
          linkUrl = linkUrl.replace(/civitai\.(com|green)/gi, "civitai.red");
        }
        valStr = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa; font-weight:600; text-decoration:underline;">${linkUrl} ↗</a>`;
      } else if ((k === "publishedAt" || k === "createdAt") && v) {
        valStr = formatDate(v);
      } else if (typeof v === "object" && v !== null) {
        if (Array.isArray(v)) {
          valStr = v.join(", ");
        } else {
          let subRows = "";
          for (const [sk, sv] of Object.entries(v)) {
            subRows += `<div><span style="color:#aaa;">${sk}:</span> <code style="color:#93c5fd;">${sv}</code></div>`;
          }
          valStr = subRows;
        }
      } else {
        valStr = String(v);
      }

      rows += `<tr>
        <td style="padding:8px 12px; font-weight:600; border-bottom:1px solid #2d2d3a; color:#93c5fd; font-size:0.85rem; width:180px;">${label}</td>
        <td style="padding:8px 12px; border-bottom:1px solid #2d2d3a; font-size:0.85rem; word-break:break-all;">${valStr}</td>
      </tr>`;
    }

    container.innerHTML = `<table style="width:100%; border-collapse:collapse; background:#14141d; border:1px solid #2d2d3a; border-radius:8px; overflow:hidden;">${rows}</table>`;
  }

  function updateDescDisplay(rawDesc) {
    currentRawDescription = rawDesc || "";
    const { cleanDesc, info } = extractFrontmatter(currentRawDescription);
    currentCleanDescription = cleanDesc;
    currentFrontmatterInfo = info;

    descTextarea.value = currentCleanDescription;
    descMarkdownView.innerHTML = parseMarkdown(currentCleanDescription);
    renderModelInfoTable(currentFrontmatterInfo);
  }

  function setEditMode(editing) {
    isEditingDesc = editing;
    if (isEditingDesc) {
      descMarkdownView.style.display = "none";
      descTextarea.style.display = "block";
      descModeIndicator.textContent = "Raw Text Mode";
      toggleEditBtn.style.display = "none";
      cancelDescBtn.style.display = "inline-flex";
      saveDescBtn.style.display = "inline-flex";
    } else {
      descMarkdownView.innerHTML = parseMarkdown(descTextarea.value);
      descMarkdownView.style.display = "block";
      descTextarea.style.display = "none";
      descModeIndicator.textContent = "Markdown View";
      toggleEditBtn.style.display = "inline-flex";
      toggleEditBtn.textContent = "✏️ Edit";
      cancelDescBtn.style.display = "none";
      saveDescBtn.style.display = "none";
    }
  }

  toggleEditBtn.onclick = () => {
    setEditMode(true);
  };

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
        alert("Description saved successfully!");
        setEditMode(false);
      } else {
        alert("Failed to save description: " + res.error);
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // Handle Compact Icon Tab Switch
  const tabs = dialog.querySelectorAll(".cmm-tab");
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => {
        t.classList.remove("active");
        const label = t.querySelector(".cmm-tab-label");
        if (label) label.style.display = "none";
      });
      tab.classList.add("active");
      const activeLabel = tab.querySelector(".cmm-tab-label");
      if (activeLabel) activeLabel.style.display = "inline";

      const target = tab.getAttribute("data-tab");
      ["desc", "info", "meta", "rename", "danger"].forEach(tName => {
        const el = dialog.querySelector(`#cmm-tab-${tName}`);
        if (el) el.style.display = tName === target ? (tName === "desc" ? "flex" : "block") : "none";
      });
    };
  });

  // Fetch Full Info (Metadata & Description)
  try {
    const infoRes = await apiFetch(`/model-manager/model/${model.type}/${model.pathIndex}/${encodeURIComponent(relativeFilename)}`);
    if (infoRes.success && infoRes.data) {
      const { description, metadata } = infoRes.data;
      updateDescDisplay(description);
      
      const metaContainer = dialog.querySelector("#cmm-meta-table-container");
      if (metadata && Object.keys(metadata).length > 0) {
        let rows = "";
        for (const [k, v] of Object.entries(metadata)) {
          const valStr = typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);
          rows += `<tr>
            <td style="padding:6px 10px; font-weight:600; border-bottom:1px solid #333; color:#93c5fd; font-size:0.85rem;">${k}</td>
            <td style="padding:6px 10px; border-bottom:1px solid #333; font-family:monospace; font-size:0.8rem; word-break:break-all;">${valStr}</td>
          </tr>`;
        }
        metaContainer.innerHTML = `<table style="width:100%; border-collapse:collapse;">${rows}</table>`;
      } else {
        metaContainer.innerHTML = `<div style="color:#888;">No safetensors metadata found.</div>`;
      }
    }
  } catch (err) {
    console.error(err);
  }

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
        alert("Preview updated successfully!");
        overlay.remove();
        if (onRefresh) onRefresh();
      } else {
        alert("Failed to update preview: " + res.error);
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // Rename Model
  dialog.querySelector("#cmm-rename-btn").onclick = async () => {
    const newSubfolder = dialog.querySelector("#cmm-rename-subfolder").value.trim();
    const newBasename = dialog.querySelector("#cmm-rename-basename").value.trim();
    if (!newBasename) {
      alert("Basename cannot be empty.");
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
        alert("Model renamed successfully!");
        overlay.remove();
        if (onRefresh) onRefresh();
      } else {
        alert("Failed to rename model: " + res.error);
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // Delete Model
  dialog.querySelector("#cmm-delete-btn").onclick = async () => {
    if (!confirm(`Delete ${model.basename}${model.extension}?`)) return;

    try {
      const res = await apiFetch(`/model-manager/model/${model.type}/${model.pathIndex}/${encodeURIComponent(relativeFilename)}`, {
        method: "DELETE",
      });
      if (res.success) {
        alert("Model deleted!");
        overlay.remove();
        if (onRefresh) onRefresh();
      } else {
        alert("Failed to delete model: " + res.error);
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };
}

// --- DOWNLOAD MANAGER MODAL ---
async function openDownloadManagerModal() {
  const overlay = createOverlay("cmm-dialog-sub");
  const dialog = document.createElement("div");
  dialog.className = "cmm-dialog";
  dialog.style.maxWidth = "850px";

  dialog.innerHTML = `
    <div class="cmm-header">
      <div class="cmm-title">
        <span>📥</span> Model Download Manager
      </div>
      <div class="cmm-header-actions">
        <button class="cmm-btn cmm-btn-icon" id="cmm-download-close">✕</button>
      </div>
    </div>

    <div class="cmm-body" style="padding:20px; display:flex; flex-direction:column; gap:20px;">
      <!-- Add Task Section -->
      <div style="background:#20202a; padding:16px; border-radius:8px; border:1px solid #333342;">
        <h4 style="margin:0 0 12px 0; color:#fff;">Add New Download Task</h4>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; gap:10px;">
            <input type="text" class="cmm-input" id="cmm-dl-url" placeholder="Paste Civitai or HuggingFace URL..." style="flex:1;" />
            <button class="cmm-btn" id="cmm-dl-parse-btn">🔍 Parse Link</button>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
            <div>
              <label style="font-size:0.8rem; color:#aaa; display:block; margin-bottom:2px;">Target Category:</label>
              <select class="cmm-select" id="cmm-dl-category" style="width:100%; box-sizing:border-box;"></select>
            </div>
            <div>
              <label style="font-size:0.8rem; color:#aaa; display:block; margin-bottom:2px;">Subfolder Path:</label>
              <input type="text" class="cmm-input" id="cmm-dl-subfolder" placeholder="e.g. SDXL 1.0/Style" style="width:100%; box-sizing:border-box;" />
            </div>
            <div>
              <label style="font-size:0.8rem; color:#aaa; display:block; margin-bottom:2px;">Filename on Disk:</label>
              <input type="text" class="cmm-input" id="cmm-dl-filename" placeholder="model_name.safetensors" style="width:100%; box-sizing:border-box;" />
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end;">
            <button class="cmm-btn cmm-btn-primary" id="cmm-dl-start-btn">🚀 Start Download Task</button>
          </div>
        </div>
      </div>

      <!-- Active Tasks Section -->
      <div>
        <h4 style="margin:0 0 12px 0; color:#fff; display:flex; justify-content:space-between; align-items:center;">
          <span>Active Downloads</span>
          <button class="cmm-btn cmm-btn-icon" id="cmm-dl-refresh-tasks">🔄</button>
        </h4>
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
  Object.keys(state.foldersList).sort().forEach(folder => {
    const opt = document.createElement("option");
    opt.value = folder;
    opt.textContent = folder;
    if (folder === state.currentFolder) opt.selected = true;
    categorySelect.appendChild(opt);
  });

  let parsedData = null;

  // Parse URL & Auto-fill Category, Subfolder, Filename (formatted like import.py: {Model Name} - {Version Name}.safetensors)
  dialog.querySelector("#cmm-dl-parse-btn").onclick = async () => {
    const url = dialog.querySelector("#cmm-dl-url").value.trim();
    if (!url) return alert("Please enter a URL first.");

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

        console.log(`[ModelManager] Found model info from ${parsedData.website || 'web'}: Filename=${targetFilename}, Subfolder=${parsedData.subFolder || '(root)'}`);
      } else {
        console.warn("[ModelManager] Failed to parse URL or no downloadable file found.");
      }
    } catch (err) {
      console.error("[ModelManager] Parse error:", err.message);
    }
  };

  // Start Download Task
  dialog.querySelector("#cmm-dl-start-btn").onclick = async () => {
    const url = dialog.querySelector("#cmm-dl-url").value.trim();
    const type = categorySelect.value;
    const subFolder = dialog.querySelector("#cmm-dl-subfolder").value.trim();
    const basename = dialog.querySelector("#cmm-dl-filename").value.trim();

    if (!url || !basename) {
      alert("Please provide both URL and filename.");
      return;
    }

    const fullname = subFolder ? `${subFolder}/${basename}` : basename;
    const previewFile = parsedData?.preview ? (Array.isArray(parsedData.preview) ? parsedData.preview[0] : parsedData.preview) : "";

    const payload = {
      type,
      pathIndex: 0,
      fullname,
      description: parsedData?.description || "",
      downloadPlatform: parsedData?.website || "URL",
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
        dialog.querySelector("#cmm-dl-url").value = "";
        dialog.querySelector("#cmm-dl-filename").value = "";
        dialog.querySelector("#cmm-dl-subfolder").value = "";
        parsedData = null;
        fetchTasks();
      } else {
        alert("Failed to add task: " + res.error);
      }
    } catch (err) {
      alert("Error starting download: " + err.message);
    }
  };

  dialog.querySelector("#cmm-dl-refresh-tasks").onclick = () => fetchTasks();

  async function fetchTasks() {
    const container = dialog.querySelector("#cmm-tasks-container");
    try {
      const res = await apiFetch("/model-manager/download/task");
      if (res.success && Array.isArray(res.data)) {
        if (res.data.length === 0) {
          container.innerHTML = `<div style="color:#888; text-align:center; padding:20px;">No download tasks.</div>`;
          return;
        }

        container.innerHTML = "";
        res.data.forEach(task => {
          const item = document.createElement("div");
          item.className = "cmm-task-item";

          const pct = task.progress || 0;
          const statusColor = task.status === "doing" ? "#3b82f6" : task.status === "error" ? "#ef4444" : "#888";

          item.innerHTML = `
            <div class="cmm-task-row">
              <span style="font-weight:600; color:#fff;">${task.fullname}</span>
              <span class="cmm-badge" style="background:${statusColor}; color:#fff;">${(task.status || '').toUpperCase()}</span>
            </div>
            <div class="cmm-progress-bar">
              <div class="cmm-progress-fill" style="width:${pct}%; background:${statusColor};"></div>
            </div>
            <div class="cmm-task-row" style="font-size:0.78rem; color:#aaa;">
              <span>${formatBytes(task.downloadedSize)} / ${formatBytes(task.totalSize)} (${pct.toFixed(1)}%)</span>
              <span>${formatBytes(task.bps)}/s</span>
            </div>
            ${task.error ? `<div style="color:#ef4444; font-size:0.8rem;">Error: ${task.error}</div>` : ''}
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              ${task.status === "doing" ? `<button class="cmm-btn cmm-btn-pause" data-id="${task.taskId}">⏸️ Pause</button>` : ''}
              ${task.status === "pause" ? `<button class="cmm-btn cmm-btn-start" data-id="${task.taskId}">▶️ Start</button>` : ''}
              <button class="cmm-btn cmm-btn-danger cmm-btn-del" data-id="${task.taskId}">🗑️ Delete</button>
            </div>
          `;

          item.querySelector(".cmm-btn-del").onclick = async () => {
            await apiFetch(`/model-manager/download/${task.taskId}`, { method: "DELETE" });
            fetchTasks();
          };

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

          container.appendChild(item);
        });
      } else {
        container.innerHTML = `<div style="color:#888; text-align:center; padding:20px;">No download tasks.</div>`;
      }
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div style="color:#888; text-align:center; padding:20px;">No download tasks.</div>`;
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
  dialog.style.maxWidth = "600px";
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

    <div class="cmm-body" style="padding:20px; display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="display:block; font-weight:600; margin-bottom:4px;">Target Category:</label>
        <select class="cmm-select" id="cmm-up-category" style="width:100%; box-sizing:border-box;"></select>
      </div>

      <div>
        <label style="display:block; font-weight:600; margin-bottom:4px;">Subfolder Path (optional):</label>
        <input type="text" class="cmm-input" id="cmm-up-subfolder" placeholder="e.g. SDXL/Base" style="width:100%; box-sizing:border-box;" />
      </div>

      <div class="cmm-dropzone" id="cmm-up-dropzone">
        <div style="font-size:2.5rem; margin-bottom:8px;">📁</div>
        <div style="font-weight:600; color:#fff;">Drag & drop model file here</div>
        <div style="font-size:0.8rem; color:#888; margin-top:4px;">or click to select file</div>
        <input type="file" id="cmm-up-file-input" style="display:none;" />
      </div>

      <div id="cmm-up-file-name" style="font-size:0.9rem; font-weight:600; color:#93c5fd; text-align:center;"></div>

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
    dropzone.style.borderColor = "#444";
  };

  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "#444";
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
        alert("Upload completed successfully!");
        overlay.remove();
      } else {
        alert("Upload failed: " + res.error);
        submitBtn.disabled = false;
        submitBtn.textContent = "Upload File";
      }
    } catch (err) {
      alert("Upload error: " + err.message);
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
  dialog.style.maxWidth = "550px";
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

    <div class="cmm-body" style="padding:20px; display:flex; flex-direction:column; gap:16px;">
      <p style="color:#aaa; font-size:0.9rem; margin:0;">Batch fetching calculates model SHA256 hashes and searches Civitai to automatically download previews and metadata.</p>
      
      <div>
        <label style="display:block; font-weight:600; margin-bottom:4px;">Fetch Mode:</label>
        <select class="cmm-select" id="cmm-scan-mode" style="width:100%; box-sizing:border-box;">
          <option value="diff">Diff Fetch (Only models missing preview/info)</option>
          <option value="full">Full Refetch (All models)</option>
        </select>
      </div>

      <div style="display:flex; justify-content:flex-end;">
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
        alert("Batch metadata fetching started in background!");
        overlay.remove();
      } else {
        alert("Failed to start fetch task: " + res.error);
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };
}

// --- SETTINGS MODAL ---
async function openSettingsModal(onSaveCallback) {
  const overlay = createOverlay("cmm-dialog-sub");
  const dialog = document.createElement("div");
  dialog.className = "cmm-dialog";
  dialog.style.maxWidth = "560px";
  dialog.style.height = "auto";
  dialog.style.maxHeight = "88vh";

  dialog.innerHTML = `
    <div class="cmm-header">
      <div class="cmm-title">
        <span>⚙️</span> Model Manager Settings
      </div>
      <div class="cmm-header-actions">
        <button class="cmm-btn cmm-btn-icon" id="cmm-settings-close">✕</button>
      </div>
    </div>

    <div class="cmm-body" style="padding:20px; display:flex; flex-direction:column; gap:16px; overflow-y:auto;">
      <div>
        <label style="display:block; font-size:0.88rem; font-weight:600; margin-bottom:4px;">Civitai API Key:</label>
        <div style="display:flex; gap:6px;">
          <input type="password" class="cmm-input" id="cmm-set-civitai-key" style="flex:1;" placeholder="Optional API Key for Civitai..." />
          <button class="cmm-btn cmm-btn-icon" id="cmm-toggle-civitai-visibility" title="Show/Hide">👁️</button>
        </div>
      </div>

      <div>
        <label style="display:block; font-size:0.88rem; font-weight:600; margin-bottom:4px;">HuggingFace API Token:</label>
        <div style="display:flex; gap:6px;">
          <input type="password" class="cmm-input" id="cmm-set-hf-token" style="flex:1;" placeholder="Optional Token for HuggingFace..." />
          <button class="cmm-btn cmm-btn-icon" id="cmm-toggle-hf-visibility" title="Show/Hide">👁️</button>
        </div>
      </div>

      <!-- SOCKS5 Proxy Enclosure with Civitai and HuggingFace Toggles -->
      <div style="background:#1a1a24; border:1px solid #2d2d3a; border-radius:8px; padding:14px;">
        <div style="font-weight:600; font-size:0.92rem; color:#fff; margin-bottom:10px;">SOCKS5 Proxy Configuration</div>
        
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:0.86rem; font-weight:600; color:#e0e0e0;">Use Proxy for Civitai</div>
              <div style="font-size:0.75rem; color:#888;">Route Civitai API queries & info lookups</div>
            </div>
            <label class="cmm-switch">
              <input type="checkbox" id="cmm-set-proxy-civitai" />
              <span class="cmm-slider"></span>
            </label>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:0.86rem; font-weight:600; color:#e0e0e0;">Use Proxy for HuggingFace</div>
              <div style="font-size:0.75rem; color:#888;">Route HuggingFace API queries & info lookups</div>
            </div>
            <label class="cmm-switch">
              <input type="checkbox" id="cmm-set-proxy-hf" />
              <span class="cmm-slider"></span>
            </label>
          </div>
        </div>

        <div id="cmm-proxy-fields-container" style="display:none; flex-direction:column; gap:10px; border-top:1px solid #2d2d3a; padding-top:12px;">
          <div>
            <label style="display:block; font-size:0.8rem; color:#aaa; margin-bottom:4px;">Proxy Routing Mode:</label>
            <select class="cmm-select" id="cmm-set-proxy-scope" style="width:100%; box-sizing:border-box;">
              <option value="api_only">API & Metadata Only (Recommended - Bypass blocks, fast downloads)</option>
              <option value="all">Route All Traffic (API Queries + File Downloads)</option>
            </select>
          </div>

          <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
            <div>
              <label style="display:block; font-size:0.8rem; color:#aaa; margin-bottom:2px;">Host / Server:</label>
              <input type="text" class="cmm-input" id="cmm-set-proxy-host" placeholder="e.g. 127.0.0.1 or proxy.example.com" style="width:100%; box-sizing:border-box;" />
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; color:#aaa; margin-bottom:2px;">Port:</label>
              <input type="text" class="cmm-input" id="cmm-set-proxy-port" placeholder="1080" style="width:100%; box-sizing:border-box;" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div>
              <label style="display:block; font-size:0.8rem; color:#aaa; margin-bottom:2px;">Username (optional):</label>
              <input type="text" class="cmm-input" id="cmm-set-proxy-user" placeholder="Username" style="width:100%; box-sizing:border-box;" />
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; color:#aaa; margin-bottom:2px;">Password (optional):</label>
              <input type="password" class="cmm-input" id="cmm-set-proxy-pass" placeholder="Password" style="width:100%; box-sizing:border-box;" />
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; margin-top:4px;">
            <button class="cmm-btn" id="cmm-test-proxy-btn" style="font-size:0.82rem;">🧪 Test Proxy Connection</button>
          </div>
        </div>
      </div>

      <!-- Convert Video Previews to WebP Toggle Switch -->
      <div style="background:#1a1a24; border:1px solid #2d2d3a; border-radius:8px; padding:14px; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:600; font-size:0.88rem; color:#fff;">Convert Video Previews to Animated WebP</div>
            <div style="font-size:0.75rem; color:#888;">Uses FFmpeg to convert video previews to WebP (quality 85%, compression 2). Requires FFmpeg installed.</div>
          </div>
          <label class="cmm-switch">
            <input type="checkbox" id="cmm-set-convert-video-webp" />
            <span class="cmm-slider"></span>
          </label>
        </div>
        <div style="display:flex; justify-content:flex-end;">
          <button class="cmm-btn" id="cmm-check-ffmpeg-btn" style="font-size:0.82rem;">🔍 Check FFmpeg Installation</button>
        </div>
      </div>

      <div>
        <label style="display:block; font-size:0.88rem; font-weight:600; margin-bottom:4px;">Max Concurrent Downloads:</label>
        <input type="number" class="cmm-input" id="cmm-set-max-tasks" min="1" max="10" value="3" style="width:100%; box-sizing:border-box;" />
      </div>

      <!-- Include Hidden Files Toggle Switch -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:#1a1a24; border:1px solid #2d2d3a; border-radius:8px; padding:12px;">
        <div>
          <div style="font-weight:600; font-size:0.88rem; color:#fff;">Include Hidden Files in Model Scanning</div>
          <div style="font-size:0.78rem; color:#888;">Scan hidden folders and dotted files</div>
        </div>
        <label class="cmm-switch">
          <input type="checkbox" id="cmm-set-include-hidden" />
          <span class="cmm-slider"></span>
        </label>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
        <button class="cmm-btn" id="cmm-settings-cancel-btn">Cancel</button>
        <button class="cmm-btn cmm-btn-primary" id="cmm-settings-save-btn">💾 Save Settings</button>
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
        alert("✅ " + res.message);
      } else {
        alert("❌ " + (res.error || "FFmpeg is not installed on system PATH."));
      }
    } catch (err) {
      alert("Error checking FFmpeg: " + err.message);
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
      alert("Please enter a proxy Host / Server first.");
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
        alert("✅ " + (res.message || "Proxy connection successful!"));
      } else {
        alert("❌ " + (res.error || "Proxy connection failed."));
      }
    } catch (err) {
      alert("Error testing proxy: " + err.message);
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
          convert_video_to_webp,
          max_task_count,
          include_hidden_files,
        }),
      });

      if (res.success) {
        alert("Settings saved successfully!");
        closeModal();
        if (onSaveCallback) onSaveCallback();
      } else {
        alert("Failed to save settings: " + res.error);
      }
    } catch (err) {
      alert("Error: " + err.message);
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
