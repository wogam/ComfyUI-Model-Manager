# ComfyUI Model Manager 📂

A native, zero-build extension for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) to browse, organize, inspect, download, and manage your AI models directly inside the ComfyUI web interface.

[![Version](https://img.shields.io/badge/version-3.1.0-blue.svg)](pyproject.toml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-yellow.svg)](LICENSE)
[![ComfyUI Native](https://img.shields.io/badge/ComfyUI-Native%20Extension-green.svg)](https://github.com/comfyanonymous/ComfyUI)

---

## ✨ Features at a Glance

- 📂 **Visual Model Explorer**: Browse all model categories (`checkpoints`, `loras`, `vae`, `clip`, `controlnet`, `unet`, `upscale_models`, etc.) with instant search, breadcrumb navigation, folder hierarchy vs. flat view, and hidden files toggle.
- 📥 **Advanced Download Manager**: Download models directly from **Civitai** and **HuggingFace** with automatic metadata parsing, smart category routing, base-model folder organization, and clean filename formatting (`{Model Name} - {Version Name}.safetensors`).
- ⚡ **Bulk URL Downloads & Staging Queue**: Paste multiple URLs at once to fetch info in parallel, review and customize filenames/destinations in an interactive staging queue, and batch-download with live progress monitoring.
- 📝 **Interactive Model Inspector**:
  - **Media Preview**: Display image and animated video previews with one-click full-screen zoom.
  - **📝 Description Tab**: Read, edit, and save Markdown notes (`.md`) saved alongside your models.
  - **ℹ️ Model Info Tab**: View structured model details (Platform, Author, Base Model, Date, Hashes, File Specs, and hyperlinked model page `Link ↗`).
  - **🔬 Safetensors Metadata**: Inspect raw header metadata, training configs, and model parameters.
  - **🏷️ Rename & Move**: Safely move or rename models while automatically preserving associated preview images and metadata.
  - **🗑️ Safe Delete**: Remove models and their paired previews and markdown files in one click.
- 🌐 **SOCKS5 Proxy & Regional Bypass**:
  - Independent proxy toggles for Civitai and HuggingFace.
  - **Selective Routing**: Choose *API & Metadata Only (Recommended)* to bypass regional censorship without throttling download speeds, or *Route All Traffic*.
  - **Keep-Alive Connection Reuse**: Persistent SOCKS5 connection pooling to eliminate TCP handshake latency during bulk lookups.
  - Built-in proxy connection tester (`🧪 Test Proxy Connection`).
  - Automatic fallback to `civitai.red` mirror if `civitai.com` returns HTTP 451 blocks.
- 🎬 **FFmpeg Video to WebP Conversion**:
  - Automatically convert video previews (`.mp4`, `.webm`) into lightweight animated `.webp` files (quality 85%, compression level 2) to save disk space and accelerate gallery rendering.
  - Integrated system PATH checker (`🔍 Check FFmpeg Installation`).
- 🔍 **Model Metadata & Preview Fetcher**: Hash-based (SHA256) auto-detection from Civitai to pull missing previews and metadata for your local model collection.
- 📤 **Model Uploader**: Drag and drop local model files from your computer directly into target model folders and subdirectories on the server.
- ⚙️ **User-Friendly Settings Modal**: Clean configuration interface with contextual tooltips and `?` help badges for every setting.
- 🚀 **Zero-Build Native Architecture**: Pure ES Module JavaScript and modern CSS. No Node.js compilation, Vite, or external frontend build dependencies required.

---

## 📦 Installation

### Method 1: Via Git Clone (Recommended)

1. Open a terminal in your ComfyUI root directory:
   ```bash
   cd ComfyUI/custom_nodes
   ```
2. Clone this repository:
   ```bash
   git clone https://github.com/wogam/ComfyUI-Model-Manager.git
   ```
3. Restart ComfyUI.

### Method 2: Via ComfyUI Manager

1. Open ComfyUI and open the **ComfyUI Manager**.
2. Search for `ComfyUI-Model-Manager` (or `wogam/ComfyUI-Model-Manager`).
3. Click **Install** and restart ComfyUI.

---

## 🎯 How to Use

### 1. Opening the Manager
After restarting ComfyUI, you can open the Model Manager in two ways:
- Click the **📂 Model Manager** button located in the top menu bar.
- Or open it from the ComfyUI settings menu.

### 2. Browsing & Organizing Models
- **Category Filter**: Select from checkpoints, LoRAs, VAEs, ControlNets, Upscalers, etc.
- **View Modes**: Switch between **Folder Hierarchy View** (navigate nested folders with breadcrumbs) and **Flat View** (list all models in the category).
- **Search**: Instant, real-time filtering by model filename, subfolder path, or basename.
- **Card Actions**: Click on any model card to open the **Model Inspector**.

### 3. Model Inspector Tabs
- **Description (`📝`)**: Markdown notes editor. Notes are saved as `<model_name>.md` next to the model file.
- **Model Info (`ℹ️`)**: Displays base model (e.g. SD 1.5, SDXL, Pony, Flux), author, hash, file size, license, and direct link to the Civitai page.
- **Metadata (`🔬`)**: Displays raw safetensors header keys and values.
- **Rename / Move (`🏷️`)**: Change model filename or relocate it into subdirectories. Associated `.png`, `.webp`, and `.md` files are moved/renamed automatically.
- **Delete (`🗑️`)**: Permanently removes the model and associated previews from disk.
- **Fetch Info (`🔍`)**: Calculates model hash and fetches preview images and info from Civitai.

### 4. Downloading Models
Click the **📥 Download** button in the top toolbar to open the download interface:
- **Single URL Mode**:
  1. Paste a Civitai or HuggingFace model URL.
  2. Click **Parse URL** — filename, preview, category, and recommended subfolder are filled automatically.
  3. Click **Start Download**.
- **Bulk URLs Mode**:
  1. Paste multiple model URLs (one per line).
  2. Click **Scan & Parse All URLs**.
  3. Review the staged items in the **Staging Queue**, customize destinations or filenames as needed, and click **🚀 Download All Staged Models**.
- **Task Monitor**: View real-time progress, speed (B/s), downloaded percentage, pause, resume, and cancellation controls.

### 5. Settings Configuration (`⚙️`)
Click the **⚙️ Settings** button in the Model Manager toolbar:
- **Civitai API Key**: Optional, needed for gated, NSFW, or early-access models.
- **HuggingFace API Token**: Optional, required for gated models (SDXL, Flux, etc.).
- **SOCKS5 Proxy**:
  - Enable for Civitai / HuggingFace.
  - Choose **API & Metadata Only** (recommended to bypass regional blocks while streaming file downloads at full speed) or **Route All Traffic**.
  - Configure Host (e.g. `127.0.0.1`), Port (`1080`, `7890`, `10808`), and optional authentication.
  - Enable **Reuse Proxy Connection (Keep-Alive)** for optimal batch query performance.
- **Convert Video Previews to WebP**: Automatically convert video previews to animated WebP with FFmpeg.
- **Max Concurrent Downloads**: Set parallel download concurrency (1 to 10).
- **Include Hidden Files**: Toggle scanning of hidden directories and dotted files (`.cache`, `.git`).

---

## 🗂️ File Association Conventions

ComfyUI Model Manager keeps your model folders clean by pairing associated files using standard naming conventions:

| File Type | Example Filename | Description |
| :--- | :--- | :--- |
| **Model Weight** | `my_model.safetensors` | The main model weights file |
| **Preview Image** | `my_model.preview.png` or `my_model.png` | Gallery preview image |
| **Animated Preview** | `my_model.preview.webp` or `my_model.webp` | Animated preview (WebP) |
| **Video Preview** | `my_model.mp4` | Video preview (MP4/WEBM) |
| **Markdown Notes** | `my_model.md` | Model descriptions, prompt notes, and tags |
| **Civitai Metadata** | `my_model.civitai.info` | Cached Civitai metadata JSON |

---

## 🛠️ Requirements & Dependencies

- **Python**: 3.9+
- **ComfyUI**: Latest release
- **Python Dependencies** (automatically installed on first run):
  - `requests`
  - `pysocks`
  - `pillow`
  - `markdownify`
  - `pyyaml`
- **Optional**: [FFmpeg](https://ffmpeg.org/) (required only if enabling video-to-WebP conversion).

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**. See the [LICENSE](LICENSE) file for details.
