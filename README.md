# ComfyUI Model Manager

A lightweight, zero-build native extension for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) to browse, manage, scan, download, and upload models directly inside the ComfyUI interface.

## Features

- **📂 Model Explorer**: Browse all model categories (`checkpoints`, `loras`, `vae`, `clip`, `controlnet`, etc.). Supports instant real-time searching, Flat View vs. Folder Hierarchy View with breadcrumbs navigation, and toggling hidden files.
- **📄 Model Details & Editor**:
  - View preview images or animated videos.
  - Upload custom preview images/videos via drag & drop or file picker.
  - Read, edit, and save markdown notes/descriptions (`.md`) alongside model files.
  - Inspect `safetensors` header metadata and model parameters.
  - Rename basenames or move models into subfolders safely.
  - Permanently delete models along with all associated previews and metadata.
- **📥 Download Manager**:
  - Download models directly from Civitai, HuggingFace, or custom direct URLs.
  - Automatic URL link parsing for quick filename and metadata setup.
  - Live task monitor displaying real-time download progress, transfer speed (B/s), downloaded size, pause, resume, and deletion controls.
- **📤 Model Uploader**:
  - Drag and drop local model files to upload directly into selected model categories and subfolder paths on the server.
- **🔍 Batch Model Information Scanner**:
  - Batch scan model directories using SHA256 hashing to automatically retrieve metadata and preview images from Civitai.
- **⚡ Zero-Build Native Extension**:
  - Lightweight pure JavaScript (ES Module) and CSS using standard ComfyUI extension APIs (`app.registerExtension`) and theme variables (`var(--bg-color)`, `var(--comfy-input-bg)`). No Node.js build steps, Vite, or heavy frontend frameworks required.

## Installation

Clone or place this repository in your ComfyUI `custom_nodes` folder:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/hayden-cn/ComfyUI-Model-Manager.git
```

Or install via **ComfyUI-Manager** / Comfy CLI:
```bash
comfy node registry-install comfyui-model-manager
```

Restart ComfyUI, and open the Model Manager using the **📂 Model Manager** button in the ComfyUI menu bar or settings menu.

## License

[MIT](LICENSE)
