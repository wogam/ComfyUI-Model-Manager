# ComfyUI Model Manager

A lightweight, zero-build native extension for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) to browse, manage, scan, download, and upload models directly inside the ComfyUI interface.

## Features

- **📂 Model Explorer**: Browse all model categories (`checkpoints`, `loras`, `vae`, `clip`, `controlnet`, etc.). Supports instant real-time searching, Flat View vs. Folder Hierarchy View with breadcrumb navigation, and toggle switch for hidden files.
- **📄 Model Details & Compact Tab Editor**:
  - View preview images or animated videos in a hardware-accelerated draggable modal.
  - Compact icon-based tab bar (`📝 Description`, `ℹ️ Model Info`, `🔬 Metadata`, `🏷️ Rename / Move`, `🗑️ Delete`) with tooltips.
  - **Model Info Tab**: View structured model details (Platform, Author, Base Model, Published Date, Hashes, File Specs, and hyperlinked Model Page `Link ↗`).
  - Read, edit, and save markdown notes/descriptions (`.md`) alongside model files.
  - Inspect raw `safetensors` header metadata and model parameters.
  - Rename basenames or move models into subfolders safely.
  - Permanently delete models along with all associated previews and metadata.
- **🌐 SOCKS5 Proxy & Civitai Fallback Support**:
  - Configurable SOCKS5 Proxy with separate toggles for Civitai and HuggingFace.
  - Flexible proxy routing modes: *API & Metadata Only (Recommended)* or *Route All Traffic*.
  - **Persistent Connection Reuse (Keep-Alive)**: Toggle to reuse persistent SOCKS5 connection pools for bulk URL parsing and metadata queries without connection re-establishment overhead.
  - Proxy connection test tool (`🧪 Test Proxy Connection`).
  - Automatic fallback to `civitai.red` mirror when `civitai.com` returns HTTP 451 blocks.
- **🎬 FFmpeg Video to WebP Conversion**:
  - Toggle switch to convert video previews (`.mp4`, `.webm`, etc.) to animated `.webp` images (85% quality, compression level 2) to save disk space.
  - Integrated FFmpeg installation checker (`🔍 Check FFmpeg Installation`).
  - Converts existing video previews when fetching info.
- **📥 Download Manager**:
  - Download models directly from Civitai, HuggingFace, or custom direct URLs.
  - **Single & Bulk Download Modes**:
    - **Single Download**: Instant link parsing with auto-filled target category, base model subfolder path, formatted filename (`{Model Name} - {Version Name}.safetensors`), and preview images/videos.
    - **Bulk Downloads**: Paste multiple model URLs (one per line) with throttled parallel parsing, smart category auto-routing (`checkpoints`, `loras`, `controlnet`, etc.), base model subfolder auto-organization, interactive staging review queue (per-item overrides & removal), and one-click batch queueing.
  - Live task monitor displaying real-time download progress, transfer speed (B/s), downloaded size, pause, resume, and deletion controls.
- **📤 Model Uploader**:
  - Drag and drop local model files to upload directly into selected model categories and subfolder paths on the server.
- **🔍 Fetch Model Information Scanner**:
  - Calculate SHA256 hashes to automatically retrieve metadata and preview images/videos from Civitai.
  - Single-model info fetch button (`🔍 Fetch Info`) and batch scanning modes.
- **⚡ Zero-Build Native Extension**:
  - Lightweight pure JavaScript (ES Module) and CSS using standard ComfyUI extension APIs (`app.registerExtension`). No Node.js build steps, Vite, or heavy frontend frameworks required.

## Installation

Clone or place this repository in your ComfyUI `custom_nodes` folder:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/wogam/ComfyUI-Model-Manager.git
```

Restart ComfyUI, and open the Model Manager using the **📂 Model Manager** button in the ComfyUI top menu bar or settings menu.

## License

[MIT](LICENSE)
