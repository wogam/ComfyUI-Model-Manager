import os
import re
import uuid
import math
import yaml
import requests
import markdownify


import folder_paths


from aiohttp import web
from abc import ABC, abstractmethod
from urllib.parse import urlparse, parse_qs
from PIL import Image
from io import BytesIO
from typing import Optional, Union, List, Dict, Any


from . import utils
from . import config
from . import thread


class ModelSearcher(ABC):
    """
    Abstract class for model searcher.
    """

    @abstractmethod
    def search_by_url(self, url: str) -> list[dict]:
        pass

    @abstractmethod
    def search_by_hash(self, hash: str) -> dict:
        pass


class UnknownWebsiteSearcher(ModelSearcher):
    def search_by_url(self, url: str):
        raise RuntimeError(f"Unknown Website, please input a URL from huggingface.co or civitai.com.")

    def search_by_hash(self, hash: str):
        raise RuntimeError(f"Unknown Website, unable to search with hash value.")


def get_folder_from_tags(tags: list[str], base_model: Optional[str]) -> str:
    if not base_model or not base_model.strip():
        base_folder = ""
    else:
        base_folder = utils.sanitize_filename(base_model)

    tag_order = [
        "CHARACTER", "STYLE", "CELEBRITY", "CONCEPT", "CLOTHING",
        "BASE MODEL", "POSES", "BACKGROUND", "TOOL", "BUILDINGS",
        "VEHICLE", "OBJECTS", "ANIMAL", "ACTION", "ASSETS"
    ]
    
    tags_upper = [str(t).upper() for t in tags] if tags else []
    
    for tag in tag_order:
        if tag in tags_upper:
            subfolder = tag.lower().capitalize()
            return f"{base_folder}/{subfolder}" if base_folder else subfolder

    return base_folder


class CivitaiModelSearcher(ModelSearcher):
    def search_by_url(self, url: str, request: Optional[web.Request] = None):
        parsed_url = urlparse(url)
        domain = parsed_url.netloc or "civitai.com"

        pathname = parsed_url.path
        match = re.match(r"^/models/(\d*)", pathname)
        model_id = match.group(1) if match else None

        query_params = parse_qs(parsed_url.query)
        version_id = query_params.get("modelVersionId", [None])[0]

        if not model_id:
            return []

        # Prepare direct session and potential proxy fallback session
        direct_session = utils.create_request_session(request, platform="civitai", traffic_type="api", disable_proxy=True)
        proxy_session = None
        has_proxy = bool(utils.get_proxy_url(request, platform="civitai", traffic_type="api")) if request else False
        if has_proxy:
            proxy_session = utils.create_request_session(request, platform="civitai", traffic_type="api")

        domains_to_try = [domain]
        if "civitai.red" not in domain:
            domains_to_try.append("civitai.red")
        if "civitai.com" not in domain:
            domains_to_try.append("civitai.com")

        res_data = None
        last_error = None

        # 1. Attempt direct connection first (fast, bypass proxy instability if unblocked or WARP/VPN is active)
        for d in domains_to_try:
            try:
                api_url = f"https://{d}/api/v1/models/{model_id}"
                response = direct_session.get(api_url, timeout=10)
                response.raise_for_status()
                res_data = response.json()
                domain = d
                break
            except Exception as e:
                last_error = e

        # 2. If direct request failed (e.g. 451 legal block / 403 / connection error) and proxy is configured, fallback to proxy
        if not res_data and proxy_session:
            utils.print_warning(f"Direct Civitai query failed ({last_error}), retrying via configured proxy fallback...")
            for d in domains_to_try:
                try:
                    api_url = f"https://{d}/api/v1/models/{model_id}"
                    response = proxy_session.get(api_url, timeout=15)
                    response.raise_for_status()
                    res_data = response.json()
                    domain = d
                    last_error = None
                    break
                except Exception as e:
                    last_error = e

        if not res_data:
            if last_error:
                raise last_error
            raise RuntimeError(f"Failed to fetch model info for model ID {model_id}")

        model_versions: list[dict] = res_data.get("modelVersions", [])
        if version_id:
            model_versions = utils.filter_with(model_versions, {"id": int(version_id)})

        tags = [t.get("name", "") if isinstance(t, dict) else str(t) for t in res_data.get("tags", [])]

        models: list[dict] = []

        for version in model_versions:
            version_files: list[dict] = version.get("files", [])
            model_files = utils.filter_with(version_files, {"type": "Model"})
            model_files = version_files if len(model_files) == 0 else model_files

            model_name = utils.sanitize_filename(res_data.get("name", "model"))
            version_name = utils.sanitize_filename(version.get("name", "v1.0"))
            base_model = version.get("baseModel", "")
            sub_folder = get_folder_from_tags(tags, base_model)

            for file in model_files:
                orig_name = file.get("name", None)
                extension = os.path.splitext(orig_name)[1] if orig_name else ".safetensors"
                
                basename = f"{model_name} - {version_name}"
                fullname = f"{basename}{extension}"
                download_url = file.get("downloadUrl", "")

                # Ensure binary file download URL always defaults to civitai.com
                if download_url and any(m in download_url for m in ["civitai.red", "civitai.green"]):
                    download_url = re.sub(r"://civitai\.(red|green)", "://civitai.com", download_url)

                published_at = version.get("publishedAt") or res_data.get("publishedAt") or res_data.get("createdAt")

                metadata_info = {
                    "website": "Civitai",
                    "modelPage": f"https://civitai.red/models/{model_id}?modelVersionId={version.get('id')}",
                    "author": res_data.get("creator", {}).get("username", None),
                    "baseModel": base_model,
                    "publishedAt": published_at,
                    "hashes": file.get("hashes"),
                    "metadata": file.get("metadata"),
                    "preview": [i["url"] for i in version.get("images", []) if isinstance(i, dict) and "url" in i],
                }

                description_parts: list[str] = []
                description_parts.append("---")
                description_parts.append(yaml.dump(metadata_info).strip())
                description_parts.append("---")
                description_parts.append("")
                description_parts.append(f"# Trigger Words")
                description_parts.append("")
                description_parts.append(", ".join(version.get("trainedWords", ["No trigger words"])))
                description_parts.append("")
                description_parts.append(f"# About this version")
                description_parts.append("")
                description_parts.append(markdownify.markdownify(version.get("description", "<p>No description about this version</p>")).strip())
                description_parts.append("")
                description_parts.append(f"# {res_data.get('name')}")
                description_parts.append("")
                description_parts.append(markdownify.markdownify(res_data.get("description", "<p>No description about this model</p>")).strip())
                description_parts.append("")

                model = {
                    "id": version.get("id"),
                    "name": fullname,
                    "shortname": version_name,
                    "basename": basename,
                    "extension": extension,
                    "fullname": fullname,
                    "preview": metadata_info.get("preview"),
                    "sizeBytes": file.get("sizeKB", 0) * 1024,
                    "type": self._resolve_model_type(res_data.get("type", "")),
                    "pathIndex": 0,
                    "subFolder": sub_folder,
                    "description": "\n".join(description_parts),
                    "metadata": file.get("metadata"),
                    "downloadPlatform": "civitai",
                    "downloadUrl": download_url,
                    "modelPage": metadata_info.get("modelPage"),
                    "modelUrl": metadata_info.get("modelPage"),
                    "hashes": file.get("hashes"),
                    "files": version_files if len(version_files) > 1 else None,
                }
                models.append(model)

        return models

    def search_by_hash(self, hash: str, request: Optional[web.Request] = None):
        if not hash:
            raise RuntimeError(f"Hash value is empty.")

        direct_session = utils.create_request_session(request, platform="civitai", traffic_type="api", disable_proxy=True)
        proxy_session = None
        has_proxy = bool(utils.get_proxy_url(request, platform="civitai", traffic_type="api")) if request else False
        if has_proxy:
            proxy_session = utils.create_request_session(request, platform="civitai", traffic_type="api")
        
        response = None
        last_error = None

        # 1. Attempt direct request first
        for d in ["civitai.com", "civitai.red"]:
            try:
                res = direct_session.get(f"https://{d}/api/v1/model-versions/by-hash/{hash}", timeout=10)
                res.raise_for_status()
                response = res
                break
            except Exception as e:
                last_error = e

        # 2. If direct request failed and proxy is configured, fallback to proxy
        if (not response or response.status_code != 200) and proxy_session:
            utils.print_warning(f"Direct Civitai hash lookup failed ({last_error}), retrying via configured proxy fallback...")
            for d in ["civitai.com", "civitai.red"]:
                try:
                    res = proxy_session.get(f"https://{d}/api/v1/model-versions/by-hash/{hash}", timeout=15)
                    res.raise_for_status()
                    response = res
                    last_error = None
                    break
                except Exception as e:
                    last_error = e

        if not response or response.status_code != 200:
            if last_error:
                raise last_error
            raise RuntimeError(f"Hash search failed for hash {hash}")

        version: dict = response.json()
        model_id = version.get("modelId")
        version_id = version.get("id")

        model_page = f"https://civitai.com/models/{model_id}?modelVersionId={version_id}"

        models = self.search_by_url(model_page, request=request)

        for model in models:
            hashes = model.get("hashes") or {}
            sha256 = hashes.get("SHA256") or hashes.get("sha256") or ""
            if sha256 and sha256.lower() == hash.lower():
                return model

        return models[0] if models else None

    def _resolve_model_type(self, model_type: str):
        map_legacy = {
            "TextualInversion": "embeddings",
            "LoCon": "loras",
            "DoRA": "loras",
            "LORA": "loras",
            "Lora": "loras",
            "Controlnet": "controlnet",
            "ControlNet": "controlnet",
            "Upscaler": "upscale_models",
            "VAE": "vae",
            "Checkpoint": "checkpoints",
            "unknown": "",
        }
        return map_legacy.get(model_type, f"{model_type.lower()}s")


class HuggingfaceModelSearcher(ModelSearcher):
    def search_by_url(self, url: str, request: Optional[web.Request] = None):
        parsed_url = urlparse(url)

        pathname = parsed_url.path

        space, name, *rest_paths = pathname.strip("/").split("/")

        model_id = f"{space}/{name}"
        rest_pathname = "/".join(rest_paths)

        hf_api_key = (utils.get_api_key(request, "huggingface") or "") if request else ""
        headers = {"User-Agent": config.user_agent}
        if hf_api_key:
            headers["Authorization"] = f"Bearer {hf_api_key}"

        session = utils.create_request_session(request, platform="huggingface", traffic_type="api")
        response = session.get(f"https://huggingface.co/api/models/{model_id}", headers=headers, timeout=15)
        response.raise_for_status()
        res_data: dict = response.json()

        # Fetch README.md model card
        readme_text = ""
        try:
            readme_resp = session.get(f"https://huggingface.co/{model_id}/raw/main/README.md", headers=headers, timeout=10)
            if readme_resp.status_code == 200:
                readme_text = readme_resp.text
        except Exception as e:
            utils.print_debug(f"Could not fetch README.md for {model_id}: {e}")

        # Parse YAML frontmatter and markdown body from README.md
        frontmatter_dict = {}
        body_markdown = ""
        if readme_text:
            fm_match = re.match(r"^---\s*\r?\n(.*?)\r?\n---\s*\r?\n(.*)$", readme_text, re.DOTALL)
            if fm_match:
                try:
                    loaded_fm = yaml.safe_load(fm_match.group(1))
                    if isinstance(loaded_fm, dict):
                        frontmatter_dict = loaded_fm
                except Exception:
                    pass
                body_markdown = fm_match.group(2).strip()
            else:
                body_markdown = readme_text.strip()

        card_data = res_data.get("cardData") or {}
        if isinstance(card_data, dict):
            for k, v in card_data.items():
                if k not in frontmatter_dict and v is not None:
                    frontmatter_dict[k] = v

        tags: list[str] = res_data.get("tags", [])
        if "tags" in frontmatter_dict and isinstance(frontmatter_dict["tags"], list):
            for t in frontmatter_dict["tags"]:
                if str(t) not in tags:
                    tags.append(str(t))

        pipeline_tag = res_data.get("pipeline_tag", "") or frontmatter_dict.get("pipeline_tag", "")
        base_model_raw = frontmatter_dict.get("base_model") or card_data.get("base_model")
        base_model = ""
        if isinstance(base_model_raw, list):
            base_model = str(base_model_raw[0]) if len(base_model_raw) > 0 else ""
        elif isinstance(base_model_raw, dict):
            base_model = str(base_model_raw.get("name") or base_model_raw.get("id") or "")
        elif base_model_raw is not None:
            base_model = str(base_model_raw)
        base_model = base_model.strip().strip("[]'\"` ")

        # Extract trigger words, gallery media, and widgets
        trigger_words = []
        if "instance_prompt" in frontmatter_dict:
            ip = frontmatter_dict["instance_prompt"]
            if isinstance(ip, list):
                trigger_words.extend([str(x) for x in ip if str(x).strip()])
            elif isinstance(ip, str) and ip.strip():
                trigger_words.append(ip.strip())

        # Extract gallery media from widget / cardData
        widget_data = frontmatter_dict.get("widget") or card_data.get("widget") or []
        gallery_media: list[dict] = []
        if isinstance(widget_data, list):
            for w in widget_data:
                if isinstance(w, dict):
                    t_text = str(w.get("text", "")).strip()
                    if t_text and t_text not in trigger_words and len(t_text) < 100:
                        trigger_words.append(t_text)

                    # Extract output media (video/image)
                    media_url = ""
                    out_field = w.get("output")
                    if isinstance(out_field, dict):
                        media_url = out_field.get("url") or out_field.get("src") or out_field.get("file") or ""
                    elif isinstance(out_field, str):
                        media_url = out_field
                    if not media_url:
                        media_url = w.get("url") or w.get("src") or w.get("file") or ""

                    if media_url:
                        if not (media_url.startswith("http://") or media_url.startswith("https://")):
                            clean_rel = media_url.lstrip("./")
                            full_media_url = f"https://huggingface.co/{model_id}/resolve/main/{clean_rel}"
                        else:
                            full_media_url = media_url
                        gallery_media.append({
                            "url": full_media_url,
                            "text": t_text,
                        })

        sibling_entries: list[dict] = res_data.get("siblings", [])
        sibling_files: list[str] = [x.get("rfilename") for x in sibling_entries if isinstance(x, dict) and "rfilename" in x]

        model_files = utils.filter_with(
            utils.filter_with(sibling_files, self._match_model_files()),
            self._match_tree_files(rest_pathname),
        )

        image_files = utils.filter_with(
            utils.filter_with(sibling_files, self._match_preview_files()),
            self._match_tree_files(rest_pathname),
        )
        image_files = [f"https://huggingface.co/{model_id}/resolve/main/{filename}" for filename in image_files]

        # Prioritize gallery media URLs in preview list
        for gm in reversed(gallery_media):
            if gm["url"] not in image_files:
                image_files.insert(0, gm["url"])

        # Extract any markdown preview images/videos from README body
        if body_markdown:
            md_imgs = re.findall(r'!\[.*?\]\((https?://[^\s\)]+|\./[^\s\)]+|[a-zA-Z0-9_\-\./]+\.(?:png|jpg|jpeg|webp|gif|mp4|webm))\)', body_markdown, re.IGNORECASE)
            for img in md_imgs:
                if img.startswith("http://") or img.startswith("https://"):
                    if img not in image_files:
                        image_files.append(img)
                else:
                    clean_rel = img.lstrip("./")
                    full_img = f"https://huggingface.co/{model_id}/resolve/main/{clean_rel}"
                    if full_img not in image_files:
                        image_files.append(full_img)

        # Expand or remove <Gallery /> tags in body_markdown
        if body_markdown:
            if gallery_media:
                gallery_lines = ["\n### Gallery Samples\n"]
                for gm in gallery_media:
                    g_url = gm["url"]
                    g_text = gm.get("text", "")
                    ext = g_url.split("?")[0].split(".")[-1].lower()
                    if ext in ["mp4", "webm", "mov"]:
                        gallery_lines.append(f'<video src="{g_url}" controls style="max-width:100%; border-radius:6px; margin:8px 0;"></video>')
                    else:
                        gallery_lines.append(f'![Gallery Sample]({g_url})')
                    if g_text:
                        gallery_lines.append(f"> **Prompt:** {g_text}\n")
                gallery_block = "\n".join(gallery_lines)
                body_markdown = re.sub(r'<Gallery[^>]*\/?>', gallery_block, body_markdown, flags=re.IGNORECASE)
            else:
                body_markdown = re.sub(r'<Gallery[^>]*\/?>', '', body_markdown, flags=re.IGNORECASE)

        models: list[dict] = []

        sub_folder = self._resolve_hf_subfolder(base_model, tags)
        resolved_type = self._resolve_hf_model_type(tags, pipeline_tag, model_id, rest_pathname)

        for filename in model_files:
            fullname = os.path.basename(filename)
            extension = os.path.splitext(fullname)[1]
            basename = os.path.splitext(fullname)[0]

            # Look up size from sibling entries
            sibling_obj = next((x for x in sibling_entries if x.get("rfilename") == filename), {})
            size_bytes = sibling_obj.get("size", 0)
            if not size_bytes and isinstance(sibling_obj.get("lfs"), dict):
                size_bytes = sibling_obj.get("lfs", {}).get("size", 0)

            metadata_info = {
                "website": "HuggingFace",
                "modelPage": f"https://huggingface.co/{model_id}",
                "author": res_data.get("author") or space,
                "baseModel": str(base_model) if base_model else "",
                "license": frontmatter_dict.get("license") or "",
                "tags": tags[:15] if tags else [],
                "preview": image_files,
            }

            description_parts: list[str] = []
            description_parts.append("---")
            description_parts.append(yaml.dump(metadata_info).strip())
            description_parts.append("---")
            description_parts.append("")
            description_parts.append("# Trigger Words")
            description_parts.append("")
            description_parts.append(", ".join(trigger_words) if trigger_words else "No trigger words")
            description_parts.append("")
            description_parts.append("# About this version")
            description_parts.append("")
            description_parts.append(f"File: `{filename}`")
            description_parts.append("")
            description_parts.append(f"# {res_data.get('id', model_id)}")
            description_parts.append("")
            description_parts.append(body_markdown if body_markdown else "No description about this model")
            description_parts.append("")

            model = {
                "id": filename,
                "name": fullname,
                "shortname": fullname,
                "basename": basename,
                "extension": extension,
                "fullname": fullname,
                "preview": image_files,
                "sizeBytes": size_bytes or 0,
                "type": resolved_type,
                "pathIndex": 0,
                "subFolder": sub_folder,
                "description": "\n".join(description_parts),
                "metadata": {
                    "baseModel": str(base_model) if base_model else "",
                    "tags": tags,
                    "pipeline_tag": pipeline_tag,
                },
                "downloadPlatform": "huggingface",
                "downloadUrl": f"https://huggingface.co/{model_id}/resolve/main/{filename}?download=true",
                "modelPage": f"https://huggingface.co/{model_id}",
                "modelUrl": f"https://huggingface.co/{model_id}",
            }
            models.append(model)

        return models

    def _resolve_hf_model_type(self, tags: list[str], pipeline_tag: str, model_id: str, rest_pathname: str) -> str:
        tags_lower = [str(t).lower() for t in tags]
        combined = f"{' '.join(tags_lower)} {pipeline_tag.lower()} {model_id.lower()} {rest_pathname.lower()}"

        if any(k in combined for k in ["lora", "locon", "dora"]):
            return "loras"
        elif any(k in combined for k in ["controlnet", "t2i-adapter"]):
            return "controlnet"
        elif "vae" in combined:
            return "vae"
        elif any(k in combined for k in ["upscaler", "esrgan", "real-esrgan", "upscale"]):
            return "upscale_models"
        elif any(k in combined for k in ["diffusion_models", "unet", "diffusion"]):
            return "diffusion_models"
        elif any(k in combined for k in ["text-to-image", "checkpoint", "checkpoints", "diffusers"]):
            return "checkpoints"
        return "checkpoints"

    def _resolve_hf_subfolder(self, base_model: Optional[Any], tags: list[str]) -> str:
        if base_model:
            if isinstance(base_model, list):
                base_model = base_model[0] if len(base_model) > 0 else ""
            elif isinstance(base_model, dict):
                base_model = base_model.get("name") or base_model.get("id") or ""
            bm_str = str(base_model).strip().strip("[]'\"` ")
            if bm_str:
                bm_name = bm_str.split("/")[-1].strip("[]'\"` ")
                bm_lower = bm_name.lower()
                if "flux.1-dev" in bm_lower or "flux-dev" in bm_lower:
                    return "FLUX.1-dev"
                elif "flux.1-schnell" in bm_lower or "flux-schnell" in bm_lower:
                    return "FLUX.1-schnell"
                elif "flux" in bm_lower:
                    return "FLUX.1"
                elif "sdxl" in bm_lower or "stable-diffusion-xl" in bm_lower:
                    return "SDXL"
                elif any(x in bm_lower for x in ["v1-5", "sd-1-5", "sd-1.5", "stable-diffusion-v1-5", "v1.5"]):
                    return "SD1.5"
                elif "pony" in bm_lower:
                    return "Pony"
                elif "illustrious" in bm_lower:
                    return "Illustrious"
                elif "wan" in bm_lower:
                    return "Wan2.1"
                elif "hunyuan" in bm_lower:
                    return "HunyuanVideo"
                elif "minimax" in bm_lower:
                    return "MiniMax"
                sanitized = utils.sanitize_filename(bm_name).strip("[]'\"`_ ")
                return sanitized

        tags_upper = [str(t).strip().strip("[]'\"` ").upper() for t in tags] if tags else []
        for candidate in ["FLUX.1-DEV", "FLUX.1-SCHNELL", "FLUX", "SDXL", "SD1.5", "PONY", "ILLUSTRIOUS", "WAN2.1", "HUNYUANVIDEO", "MINIMAX"]:
            if candidate in tags_upper:
                return candidate
        return ""

    def search_by_hash(self, hash: str):
        raise RuntimeError("Hash search is not supported by Huggingface.")

    def _match_model_files(self):
        extension = [
            ".bin",
            ".ckpt",
            ".gguf",
            ".onnx",
            ".pt",
            ".pth",
            ".safetensors",
        ]

        def _filter_model_files(file: str):
            return any(file.endswith(ext) for ext in extension)

        return _filter_model_files

    def _match_preview_files(self):
        extension = [
            ".png",
            ".webp",
            ".jpeg",
            ".jpg",
            ".jfif",
            ".gif",
            ".apng",
            ".mp4",
            ".webm",
            ".mov",
        ]

        def _filter_preview_files(file: str):
            return any(file.lower().endswith(ext) for ext in extension)

        return _filter_preview_files

    def _match_image_files(self):
        extension = [
            ".png",
            ".webp",
            ".jpeg",
            ".jpg",
            ".jfif",
            ".gif",
            ".apng",
        ]

        def _filter_image_files(file: str):
            return any(file.lower().endswith(ext) for ext in extension)

        return _filter_image_files

    def _match_tree_files(self, pathname: str):
        target, *paths = pathname.split("/")

        def _filter_tree_files(file: str):
            if not target:
                return True
            if target != "tree" and target != "blob":
                return True

            prefix_path = "/".join(paths)
            return file.startswith(prefix_path)

        return _filter_tree_files


class Information:
    def add_routes(self, routes):

        @routes.get("/model-manager/model-info")
        async def fetch_model_info(request):
            """
            Fetch model information from network with model page.
            """
            try:
                model_page = request.query.get("model-page", None)
                result = self.fetch_model_info(model_page, request=request)
                return web.json_response({"success": True, "data": result})
            except Exception as e:
                error_msg = f"Fetch model info failed: {str(e)}"
                utils.print_error(error_msg)
                return web.json_response({"success": False, "error": error_msg})

        @routes.get("/model-manager/model-info/scan")
        async def get_model_info_download_task(request):
            """
            Get model information download task list.
            """
            try:
                result = self.get_scan_model_info_task_list()
                if result is not None:
                    await self.download_model_info(request)
                return web.json_response({"success": True, "data": result})
            except Exception as e:
                error_msg = f"Get model info download task list failed: {str(e)}"
                utils.print_error(error_msg)
                return web.json_response({"success": False, "error": error_msg})

        @routes.post("/model-manager/model-info/scan")
        async def create_model_info_download_task(request):
            """
            Create a task to download model information.

            - scanMode: The alternatives are diff and full.
            - mode: The alternatives are diff and full.
            - path: Scanning root path.
            """
            post = await utils.get_request_body(request)
            try:
                # TODO scanMode is deprecated, use mode instead.
                scan_mode = post.get("scanMode", "diff")
                scan_mode = post.get("mode", scan_mode)
                scan_path = post.get("path", None)
                result = await self.create_scan_model_info_task(scan_mode, scan_path, request)
                return web.json_response({"success": True, "data": result})
            except Exception as e:
                error_msg = f"Download model info failed: {str(e)}"
                utils.print_error(error_msg)
                return web.json_response({"success": False, "error": error_msg})

        @routes.get("/model-manager/preview/{type}/{index}/{filename:.*}")
        async def read_model_preview(request):
            """
            Get the file stream of the specified preview.

            :param type: The type of the model. eg.checkpoints, loras, vae, etc.
            :param index: The index of the model folders.
            :param filename: The filename of the preview.
            """
            model_type = request.match_info.get("type", None)
            index = int(request.match_info.get("index", None))
            filename = request.match_info.get("filename", None)

            try:
                folders = folder_paths.get_folder_paths(model_type)
                base_path = folders[index]
                abs_path = utils.join_path(base_path, filename)
                preview_name = utils.get_model_preview_name(abs_path)
                if preview_name:
                    dir_name = os.path.dirname(abs_path)
                    abs_path = utils.join_path(dir_name, preview_name)
            except Exception:
                return web.Response(status=404, text="Preview not found")

            if not os.path.isfile(abs_path):
                return web.Response(status=404, text="Preview not found")

            # Determine content type from the actual file
            content_type = utils.resolve_file_content_type(abs_path)

            if content_type == "video":
                # Serve video files directly
                return web.FileResponse(abs_path)
            else:
                # Serve image files (WebP or fallback images)
                image_data = self.get_image_preview_data(abs_path)
                return web.Response(body=image_data.getvalue(), content_type="image/webp")

        @routes.get("/model-manager/preview/download/{filename}")
        async def read_download_preview(request):
            filename = request.match_info.get("filename", None)
            download_path = utils.get_download_path()
            preview_path = utils.join_path(download_path, filename)

            if not os.path.isfile(preview_path):
                return web.Response(status=404, text="Preview not found")

            return web.FileResponse(preview_path)

    def get_image_preview_data(self, filename: str):
        with Image.open(filename) as img:
            max_size = 1024
            original_format = img.format

            exif_data = img.info.get("exif")
            icc_profile = img.info.get("icc_profile")

            if getattr(img, "is_animated", False) and img.n_frames > 1:
                total_frames = img.n_frames
                step = max(1, math.ceil(total_frames / 30))

                frames, durations = [], []

                for frame_idx in range(0, total_frames, step):
                    img.seek(frame_idx)
                    frame = img.copy()
                    frame.thumbnail((max_size, max_size), Image.Resampling.NEAREST)

                    frames.append(frame)
                    durations.append(img.info.get("duration", 100) * step)

                save_args = {
                    "format": "WEBP",
                    "save_all": True,
                    "append_images": frames[1:],
                    "duration": durations,
                    "loop": 0,
                    "quality": 80,
                    "method": 0,
                    "allow_mixed": False,
                }

                if exif_data:
                    save_args["exif"] = exif_data

                if icc_profile:
                    save_args["icc_profile"] = icc_profile

                img_byte_arr = BytesIO()
                frames[0].save(img_byte_arr, **save_args)
                img_byte_arr.seek(0)
                return img_byte_arr

            img.thumbnail((max_size, max_size), Image.Resampling.BICUBIC)

            img_byte_arr = BytesIO()
            save_args = {"format": "WEBP", "quality": 80}

            if exif_data:
                save_args["exif"] = exif_data
            if icc_profile:
                save_args["icc_profile"] = icc_profile

            img.save(img_byte_arr, **save_args)
            img_byte_arr.seek(0)
            return img_byte_arr

    def fetch_model_info(self, model_page: str, request: Optional[web.Request] = None):
        if not model_page:
            return []

        model_searcher = self.get_model_searcher_by_url(model_page)
        result = model_searcher.search_by_url(model_page, request=request)
        return result

    def get_scan_information_task_filepath(self):
        download_dir = utils.get_download_path()
        return utils.join_path(download_dir, "scan_information.task")

    def get_scan_model_info_task_list(self):
        scan_info_task_file = self.get_scan_information_task_filepath()
        if os.path.isfile(scan_info_task_file):
            return utils.load_dict_pickle_file(scan_info_task_file)
        return None

    async def create_scan_model_info_task(self, scan_mode: str, scan_path: str | None, request):
        scan_info_task_file = self.get_scan_information_task_filepath()
        scan_info_task_content = {"mode": scan_mode}
        scan_models: dict[str, bool] = {}

        scan_paths: list[str] = []
        if scan_path is None:
            model_base_paths = utils.resolve_model_base_paths()
            for model_type in model_base_paths:
                folders, *others = folder_paths.folder_names_and_paths[model_type]
                for path_index, base_path in enumerate(folders):
                    scan_paths.append(base_path)
        else:
            scan_paths = [scan_path]

        for base_path in scan_paths:
            files = utils.recursive_search_files(base_path, request)
            models = folder_paths.filter_files_extensions(files, folder_paths.supported_pt_extensions)
            for fullname in models:
                fullname = utils.normalize_path(fullname)
                abs_model_path = utils.join_path(base_path, fullname)
                utils.print_debug(f"Found model: {abs_model_path}")
                scan_models[abs_model_path] = False

        scan_info_task_content["models"] = scan_models
        utils.save_dict_pickle_file(scan_info_task_file, scan_info_task_content)
        await self.download_model_info(request)
        return scan_info_task_content

    download_thread_pool = thread.DownloadThreadPool()

    async def download_model_info(self, request):
        async def download_information_task(task_id: str):
            scan_info_task_file = self.get_scan_information_task_filepath()
            scan_info_task_content = utils.load_dict_pickle_file(scan_info_task_file)
            scan_mode = scan_info_task_content.get("mode", "diff")
            scan_models: dict[str, bool] = scan_info_task_content.get("models", {})
            for key, value in scan_models.items():
                if value is True:
                    continue

                abs_model_path = key
                base_path = os.path.dirname(abs_model_path)

                image_name = utils.get_model_preview_name(abs_model_path)
                abs_image_path = utils.join_path(base_path, image_name) if image_name else None
                has_preview = os.path.isfile(abs_image_path) if abs_image_path else False

                description_name = utils.get_model_description_name(abs_model_path)
                abs_description_path = utils.join_path(base_path, description_name) if description_name else None
                has_description = os.path.isfile(abs_description_path) if abs_description_path else False

                try:
                    utils.print_info(f"Checking model {abs_model_path}")
                    utils.print_debug(f"Scan mode: {scan_mode}")
                    utils.print_debug(f"Has preview: {has_preview}")
                    utils.print_debug(f"Has description: {has_description}")

                    if scan_mode == "full" or not has_preview or not has_description:
                        utils.print_debug(f"Calculate sha256 for {abs_model_path}")
                        hash_value = utils.calculate_sha256(abs_model_path)
                        utils.print_info(f"Searching model info by hash {hash_value}")
                        model_info = CivitaiModelSearcher().search_by_hash(hash_value, request=request)

                        preview_url_list = model_info.get("preview", [])
                        preview_url = preview_url_list[0] if preview_url_list else None
                        if preview_url:
                            utils.print_debug(f"Save preview to {abs_model_path}")
                            utils.save_model_preview(abs_model_path, preview_url)

                        description = model_info.get("description", None)
                        if description:
                            utils.save_model_description(abs_model_path, description)

                    scan_models[abs_model_path] = True
                    scan_info_task_content["models"] = scan_models
                    utils.save_dict_pickle_file(scan_info_task_file, scan_info_task_content)
                    utils.print_debug(f"Send update scan information task to frontend.")
                    await utils.send_json("update_scan_information_task", scan_info_task_content)
                except Exception as e:
                    utils.print_error(f"Failed to download model info for {abs_model_path}: {e}")

            os.remove(scan_info_task_file)
            utils.print_info("Completed scan model information.")

        try:
            task_id = uuid.uuid4().hex
            self.download_thread_pool.submit(download_information_task, task_id)
        except Exception as e:
            utils.print_debug(str(e))

    def get_model_searcher_by_url(self, url: str) -> ModelSearcher:
        parsed_url = urlparse(url)
        host_name = (parsed_url.hostname or "").lower()
        if "civitai" in host_name:
            return CivitaiModelSearcher()
        elif "huggingface" in host_name:
            return HuggingfaceModelSearcher()
        return UnknownWebsiteSearcher()
