import os
import re
import yaml
import folder_paths
from typing import Optional
from aiohttp import web
from concurrent.futures import ThreadPoolExecutor, as_completed


from . import utils
from . import config


class ModelManager:

    @staticmethod
    def merge_model_information(civitai_info: Optional[dict], hf_info: Optional[dict], hf_url: Optional[str] = None) -> Optional[dict]:
        if not civitai_info and not hf_info:
            return None
        if not civitai_info:
            return hf_info
        if not hf_info:
            return civitai_info

        # 1. Merge previews (Civitai previews first for sample generations, followed by HF previews)
        civitai_previews = civitai_info.get("preview") or []
        hf_previews = hf_info.get("preview") or []
        seen = set()
        merged_previews = []
        for p in (civitai_previews + hf_previews):
            if p and p not in seen:
                seen.add(p)
                merged_previews.append(p)

        def parse_desc(desc_text):
            if not desc_text:
                return {}, ""
            m = re.match(r"^---\s*\r?\n(.*?)\r?\n---\s*\r?\n?(.*)$", desc_text, re.DOTALL)
            if m:
                try:
                    fm = yaml.safe_load(m.group(1)) or {}
                    body = m.group(2).strip()
                    return fm, body
                except Exception:
                    pass
            return {}, desc_text.strip()

        civ_fm, civ_body = parse_desc(civitai_info.get("description", ""))
        hf_fm, hf_body = parse_desc(hf_info.get("description", ""))

        hf_model_page = hf_url or hf_info.get("modelPage") or hf_fm.get("modelPage")
        civ_model_page = civitai_info.get("modelPage") or civ_fm.get("modelPage")

        merged_fm = dict(civ_fm)
        merged_fm["website"] = "Civitai / HuggingFace"
        merged_fm["modelPage"] = civ_model_page or hf_model_page
        if civ_model_page:
            merged_fm["civitaiUrl"] = civ_model_page
        if hf_model_page:
            merged_fm["huggingfaceUrl"] = hf_model_page
        if not merged_fm.get("baseModel") and hf_fm.get("baseModel"):
            merged_fm["baseModel"] = hf_fm.get("baseModel")
        if not merged_fm.get("license") and hf_fm.get("license"):
            merged_fm["license"] = hf_fm.get("license")

        civ_tags = civ_fm.get("tags") or []
        hf_tags = hf_fm.get("tags") or []
        merged_tags = list(dict.fromkeys([str(t) for t in (civ_tags + hf_tags)]))
        if merged_tags:
            merged_fm["tags"] = merged_tags[:20]

        merged_fm["preview"] = merged_previews

        desc_parts = [
            "---",
            yaml.dump(merged_fm).strip(),
            "---",
            ""
        ]

        if civ_body and hf_body and hf_body not in civ_body:
            hf_formatted = hf_body if hf_body.startswith("#") else f"# HuggingFace Model Card\n\n{hf_body}"
            desc_parts.extend([
                "<!-- section: civitai -->",
                civ_body,
                "<!-- /section: civitai -->",
                "",
                "<!-- section: huggingface -->",
                hf_formatted,
                "<!-- /section: huggingface -->"
            ])
        else:
            desc_parts.append(civ_body if civ_body else hf_body)

        merged_result = dict(civitai_info)
        merged_result["preview"] = merged_previews
        merged_result["description"] = "\n".join(desc_parts)
        if hf_model_page:
            merged_result["huggingfaceUrl"] = hf_model_page
        if civ_model_page:
            merged_result["civitaiUrl"] = civ_model_page

        return merged_result

    def add_routes(self, routes):

        @routes.get("/model-manager/base-folders")
        @utils.deprecated(reason="Use `/model-manager/models` instead.")
        async def get_model_paths(request):
            """
            Returns the base folders for models.
            """
            model_base_paths = utils.resolve_model_base_paths()
            return web.json_response({"success": True, "data": model_base_paths})

        @routes.get("/model-manager/models")
        async def get_folders(request):
            """
            Returns the base folders for models.
            """
            try:
                result = utils.resolve_model_base_paths()
                return web.json_response({"success": True, "data": result})
            except Exception as e:
                error_msg = f"Read models failed: {str(e)}"
                utils.print_error(error_msg)
                return web.json_response({"success": False, "error": error_msg})

        @routes.get("/model-manager/models/{folder}")
        async def get_folder_models(request):
            try:
                folder = request.match_info.get("folder", None)
                results = self.scan_models(folder, request)
                return web.json_response({"success": True, "data": results})
            except Exception as e:
                error_msg = f"Read models failed: {str(e)}"
                utils.print_error(error_msg)
                return web.json_response({"success": False, "error": error_msg})

        @routes.get("/model-manager/model/{type}/{index}/{filename:.*}")
        async def get_model_info(request):
            """
            Get the information of the specified model.
            """
            model_type = request.match_info.get("type", None)
            path_index = int(request.match_info.get("index", None))
            filename = request.match_info.get("filename", None)

            try:
                model_path = utils.get_valid_full_path(model_type, path_index, filename)
                result = self.get_model_info(model_path)
                return web.json_response({"success": True, "data": result})
            except Exception as e:
                error_msg = f"Read model info failed: {str(e)}"
                utils.print_error(error_msg)
                return web.json_response({"success": False, "error": error_msg})

        @routes.put("/model-manager/model/{type}/{index}/{filename:.*}")
        async def update_model(request):
            """
            Update model information.

            request body: x-www-form-urlencoded
            - previewFile: preview file.
            - description: description.
            - type: model type.
            - pathIndex: index of the model folders.
            - fullname: filename that relative to the model folder.
            All fields are optional, but type, pathIndex and fullname must appear together.
            """
            model_type = request.match_info.get("type", None)
            path_index = int(request.match_info.get("index", None))
            filename = request.match_info.get("filename", None)

            model_data = await request.post()
            model_data = dict(model_data)

            try:
                model_path = utils.get_valid_full_path(model_type, path_index, filename)
                if model_path is None:
                    raise RuntimeError(f"File {filename} not found")
                self.update_model(model_path, model_data)
                return web.json_response({"success": True})
            except Exception as e:
                error_msg = f"Update model failed: {str(e)}"
                utils.print_error(error_msg)
                return web.json_response({"success": False, "error": error_msg})

        @routes.delete("/model-manager/model/{type}/{index}/{filename:.*}")
        async def delete_model(request):
            """
            Delete model.
            """
            model_type = request.match_info.get("type", None)
            path_index = int(request.match_info.get("index", None))
            filename = request.match_info.get("filename", None)

            try:
                model_path = utils.get_valid_full_path(model_type, path_index, filename)
                if model_path is None:
                    raise RuntimeError(f"File {filename} not found")
                self.remove_model(model_path)
                return web.json_response({"success": True})
            except Exception as e:
                error_msg = f"Delete model failed: {str(e)}"
                utils.print_error(error_msg)
                return web.json_response({"success": False, "error": error_msg})

        @routes.get("/model-manager/settings")
        async def get_settings(request):
            try:
                civitai_key = utils.get_setting_value(request, "api_key.civitai", "")
                hf_key = utils.get_setting_value(request, "api_key.huggingface", "")
                max_tasks = utils.get_setting_value(request, "download.max_task_count", 3)
                include_hidden = utils.get_setting_value(request, "scan.include_hidden_files", False)
                convert_video_webp = utils.get_setting_value(request, "scan.convert_video_to_webp", False)
                proxy_civitai = utils.get_setting_value(request, "proxy.civitai", False)
                proxy_huggingface = utils.get_setting_value(request, "proxy.huggingface", False)
                proxy_scope = utils.get_setting_value(request, "proxy.scope", "api_only")
                proxy_host = utils.get_setting_value(request, "proxy.host", "")
                proxy_port = utils.get_setting_value(request, "proxy.port", "1080")
                proxy_username = utils.get_setting_value(request, "proxy.username", "")
                proxy_password = utils.get_setting_value(request, "proxy.password", "")
                proxy_url = utils.get_setting_value(request, "proxy.url", "")
                proxy_reuse_connection = utils.get_setting_value(request, "proxy.reuse_connection", True)

                return web.json_response({
                    "success": True,
                    "data": {
                        "civitai_api_key": civitai_key or "",
                        "huggingface_api_key": hf_key or "",
                        "max_task_count": max_tasks or 3,
                        "include_hidden_files": bool(include_hidden),
                        "convert_video_to_webp": bool(convert_video_webp),
                        "proxy_civitai": bool(proxy_civitai),
                        "proxy_huggingface": bool(proxy_huggingface),
                        "proxy_scope": proxy_scope or "api_only",
                        "proxy_host": proxy_host or "",
                        "proxy_port": proxy_port or "1080",
                        "proxy_username": proxy_username or "",
                        "proxy_password": proxy_password or "",
                        "proxy_url": proxy_url or "",
                        "proxy_reuse_connection": bool(proxy_reuse_connection),
                    }
                })
            except Exception as e:
                error_msg = f"Get settings failed: {str(e)}"
                utils.print_error(error_msg)
                return web.json_response({"success": False, "error": error_msg})

        @routes.post("/model-manager/settings")
        async def update_settings(request):
            try:
                data = await request.json()
                if "civitai_api_key" in data:
                    utils.set_setting_value(request, "api_key.civitai", data["civitai_api_key"])
                if "huggingface_api_key" in data:
                    utils.set_setting_value(request, "api_key.huggingface", data["huggingface_api_key"])
                if "max_task_count" in data:
                    utils.set_setting_value(request, "download.max_task_count", int(data["max_task_count"]))
                if "include_hidden_files" in data:
                    utils.set_setting_value(request, "scan.include_hidden_files", bool(data["include_hidden_files"]))
                if "convert_video_to_webp" in data:
                    utils.set_setting_value(request, "scan.convert_video_to_webp", bool(data["convert_video_to_webp"]))
                if "proxy_civitai" in data:
                    utils.set_setting_value(request, "proxy.civitai", bool(data["proxy_civitai"]))
                if "proxy_huggingface" in data:
                    utils.set_setting_value(request, "proxy.huggingface", bool(data["proxy_huggingface"]))
                if "proxy_scope" in data:
                    utils.set_setting_value(request, "proxy.scope", str(data["proxy_scope"]))
                if "proxy_host" in data:
                    utils.set_setting_value(request, "proxy.host", str(data["proxy_host"]))
                if "proxy_port" in data:
                    utils.set_setting_value(request, "proxy.port", str(data["proxy_port"]))
                if "proxy_username" in data:
                    utils.set_setting_value(request, "proxy.username", str(data["proxy_username"]))
                if "proxy_password" in data:
                    utils.set_setting_value(request, "proxy.password", str(data["proxy_password"]))
                if "proxy_url" in data:
                    utils.set_setting_value(request, "proxy.url", str(data["proxy_url"]))
                if "proxy_reuse_connection" in data:
                    utils.set_setting_value(request, "proxy.reuse_connection", bool(data["proxy_reuse_connection"]))

                # Invalidate cached sessions on settings change
                utils.clear_session_cache()

                return web.json_response({"success": True})
            except Exception as e:
                error_msg = f"Update settings failed: {str(e)}"
                utils.print_error(error_msg)
                return web.json_response({"success": False, "error": error_msg})

        @routes.post("/model-manager/settings/check-ffmpeg")
        async def check_ffmpeg_status(request):
            installed = utils.is_ffmpeg_installed()
            if installed:
                return web.json_response({"success": True, "installed": True, "message": "FFmpeg is installed and ready in PATH!"})
            else:
                return web.json_response({"success": False, "installed": False, "error": "FFmpeg was not found in system PATH or environment."})

        @routes.post("/model-manager/settings/test-proxy")
        async def test_proxy_connection(request):
            try:
                data = await request.json()
                host = str(data.get("host", "")).strip()
                port = str(data.get("port", "1080")).strip()
                username = str(data.get("username", "")).strip()
                password = str(data.get("password", "")).strip()

                if not host:
                    return web.json_response({"success": False, "error": "Proxy host/server is required for testing."})

                if username and password:
                    proxy_url = f"socks5h://{username}:{password}@{host}:{port}"
                elif username:
                    proxy_url = f"socks5h://{username}@{host}:{port}"
                else:
                    proxy_url = f"socks5h://{host}:{port}"

                import requests
                session = requests.Session()
                session.proxies.update({"http": proxy_url, "https": proxy_url})
                session.headers.update({"User-Agent": config.user_agent})

                res = session.get("https://civitai.com/api/v1/models?limit=1", timeout=10)
                if res.status_code == 200:
                    return web.json_response({"success": True, "message": "Proxy connection successful! Reached Civitai API."})
                else:
                    return web.json_response({"success": False, "error": f"Proxy connected but endpoint returned HTTP {res.status_code}"})
            except Exception as e:
                return web.json_response({"success": False, "error": f"Proxy test failed: {str(e)}"})

        @routes.post("/model-manager/model/{type}/{index}/{filename:.*}/scan")
        async def scan_single_model_info(request):
            model_type = request.match_info.get("type", None)
            path_index = int(request.match_info.get("index", None))
            filename = request.match_info.get("filename", None)

            try:
                model_path = utils.get_valid_full_path(model_type, path_index, filename)
                if not model_path or not os.path.isfile(model_path):
                    raise RuntimeError(f"Model file {filename} not found")

                req_body = await utils.get_request_body(request)
                target_url = req_body.get("url") or req_body.get("modelPage") or request.query.get("url")

                hf_url = None
                civitai_url = None

                # If no URL passed in request, check if existing description file contains modelPage / huggingfaceUrl / civitaiUrl frontmatter
                if not target_url:
                    existing_info = self.get_model_info(model_path)
                    existing_desc = existing_info.get("description") or ""
                    if existing_desc:
                        fm_match = re.match(r"^---\s*\r?\n(.*?)\r?\n---\s*", existing_desc, re.DOTALL)
                        if fm_match:
                            try:
                                loaded_fm = yaml.safe_load(fm_match.group(1))
                                if isinstance(loaded_fm, dict):
                                    target_url = loaded_fm.get("modelPage") or loaded_fm.get("url")
                                    hf_url = loaded_fm.get("huggingfaceUrl")
                                    civitai_url = loaded_fm.get("civitaiUrl")
                            except Exception:
                                pass

                if target_url:
                    if "huggingface.co" in target_url:
                        hf_url = target_url
                    elif any(c in target_url for c in ["civitai.com", "civitai.red", "civitai.green"]):
                        civitai_url = target_url

                model_info = None
                hf_info = None
                civitai_info = None

                from .information import Information, CivitaiModelSearcher

                # 1. If we have a HuggingFace URL, fetch HuggingFace info
                if hf_url:
                    try:
                        search_results = Information().fetch_model_info(hf_url, request=request)
                        if search_results and len(search_results) > 0:
                            clean_fname = os.path.basename(filename)
                            clean_base = os.path.splitext(clean_fname)[0]
                            hf_info = next(
                                (m for m in search_results if m.get("fullname") == clean_fname or m.get("basename") == clean_base or m.get("id") == clean_fname),
                                search_results[0]
                            )
                    except Exception as e:
                        utils.print_warning(f"HuggingFace URL info fetch failed for {hf_url}: {e}")

                # 2. If we have a Civitai URL, fetch directly from Civitai
                if civitai_url:
                    try:
                        search_results = Information().fetch_model_info(civitai_url, request=request)
                        if search_results and len(search_results) > 0:
                            clean_fname = os.path.basename(filename)
                            clean_base = os.path.splitext(clean_fname)[0]
                            civitai_info = next(
                                (m for m in search_results if m.get("fullname") == clean_fname or m.get("basename") == clean_base or m.get("id") == clean_fname),
                                search_results[0]
                            )
                    except Exception as e:
                        utils.print_warning(f"Civitai URL info fetch failed for {civitai_url}: {e}")

                # 3. Always attempt Civitai SHA256 hash lookup if Civitai info not yet obtained
                # (allows models downloaded from HuggingFace to also fetch Civitai previews, trigger words, etc.)
                if not civitai_info:
                    try:
                        hash_value = utils.calculate_sha256(model_path)
                        utils.print_info(f"Searching Civitai info by SHA256 hash: {hash_value}")
                        civitai_info = CivitaiModelSearcher().search_by_hash(hash_value, request=request)
                        if civitai_info:
                            utils.print_info(f"Found Civitai match for {filename}")
                    except Exception as e:
                        utils.print_warning(f"Civitai hash lookup failed for {filename}: {e}")

                # 4. Merge info if both exist, otherwise use whichever was found
                if civitai_info and hf_info:
                    model_info = self.merge_model_information(civitai_info, hf_info, hf_url=hf_url)
                elif civitai_info:
                    model_info = civitai_info
                elif hf_info:
                    model_info = hf_info

                if model_info:
                    preview_url_list = model_info.get("preview", [])
                    preview_url = preview_url_list[0] if preview_url_list else None
                    if preview_url:
                        platform = model_info.get("downloadPlatform") or ("civitai" if "civitai" in str(preview_url) else "huggingface")
                        utils.save_model_preview(model_path, preview_url, platform=platform, request=request)

                    description = model_info.get("description", None)
                    if description:
                        utils.save_model_description(model_path, description)

                # Convert existing video preview to WebP if enabled
                should_convert = utils.get_setting_value(request, "scan.convert_video_to_webp", False)
                if should_convert and utils.is_ffmpeg_installed():
                    existing_preview = utils.get_model_preview_name(model_path)
                    if existing_preview:
                        ext = os.path.splitext(existing_preview)[1].lower()
                        if ext in utils.VIDEO_EXTENSIONS:
                            base_dir = os.path.dirname(model_path)
                            video_file = utils.join_path(base_dir, existing_preview)
                            webp_file = utils.join_path(base_dir, f"{os.path.splitext(os.path.basename(model_path))[0]}.webp")
                            if utils.convert_video_to_webp(video_file, webp_file, quality=85, compression_level=2):
                                if os.path.exists(video_file) and video_file != webp_file:
                                    os.remove(video_file)

                updated_info = self.get_model_info(model_path)
                return web.json_response({"success": True, "data": updated_info})
            except Exception as e:
                error_msg = f"Single model scan failed: {str(e)}"
                utils.print_error(error_msg)
                return web.json_response({"success": False, "error": error_msg})

    def scan_models(self, folder: str, request):
        result = []

        include_hidden_files = utils.get_setting_value(request, "scan.include_hidden_files", False)
        folders, *others = folder_paths.folder_names_and_paths[folder]

        def get_file_info(entry: os.DirEntry[str], base_path: str, path_index: int):
            prefix_path = utils.normalize_path(base_path)
            if not prefix_path.endswith("/"):
                prefix_path = f"{prefix_path}/"

            is_file = entry.is_file()
            relative_path = utils.normalize_path(entry.path).replace(prefix_path, "")
            sub_folder = os.path.dirname(relative_path)
            filename = os.path.basename(relative_path)
            basename = os.path.splitext(filename)[0] if is_file else filename
            extension = os.path.splitext(filename)[1] if is_file else ""

            model_preview = None
            if is_file:
                preview_name = utils.get_model_preview_name(entry.path)
                if preview_name:
                    preview_ext = f".{preview_name.split('.')[-1]}"
                    model_preview = f"/model-manager/preview/{folder}/{path_index}/{relative_path.replace(extension, preview_ext)}"

            if not os.path.exists(entry.path):
                utils.print_error(f"{entry.path} is not file or directory.")
                return None

            stat = entry.stat()
            return {
                "type": folder,
                "subFolder": sub_folder,
                "isFolder": not is_file,
                "basename": basename,
                "extension": extension,
                "pathIndex": path_index,
                "sizeBytes": stat.st_size if is_file else 0,
                "preview": model_preview,
                "createdAt": round(stat.st_ctime_ns / 1000000),
                "updatedAt": round(stat.st_mtime_ns / 1000000),
            }

        def get_all_files_entry(directory: str):
            entries: list[os.DirEntry[str]] = []
            if not os.path.exists(directory):
                return []
            with os.scandir(directory) as it:
                for entry in it:
                    if not include_hidden_files and entry.name.startswith("."):
                        continue
                    
                    if entry.is_file():
                        extension = os.path.splitext(entry.name)[1]
                        if extension in folder_paths.supported_pt_extensions:
                            entries.append(entry)
                    else:
                        entries.append(entry)
                        entries.extend(get_all_files_entry(entry.path))
            return entries

        BATCH_SIZE = 200
        MAX_WORKERS = min(4, os.cpu_count() or 1)
        
        for path_index, base_path in enumerate(folders):
            if not os.path.exists(base_path):
                continue
            file_entries = get_all_files_entry(base_path)
            
            for i in range(0, len(file_entries), BATCH_SIZE):
                batch = file_entries[i:i + BATCH_SIZE]
                with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                    futures = {executor.submit(get_file_info, entry, base_path, path_index): entry for entry in batch}
                    for future in as_completed(futures):
                        file_info = future.result()
                        if file_info is not None:
                            result.append(file_info)

        return result

    def get_model_info(self, model_path: str):
        directory = os.path.dirname(model_path)

        metadata = utils.get_model_metadata(model_path)

        description_file = utils.get_model_description_name(model_path)
        description_file = utils.join_path(directory, description_file)
        description = None
        if os.path.isfile(description_file):
            with open(description_file, "r", encoding="utf-8", newline="") as f:
                description = f.read()

        return {
            "metadata": metadata,
            "description": description,
        }

    def update_model(self, model_path: str, model_data: dict):

        if "previewFile" in model_data:
            previewFile = model_data["previewFile"]
            # Always remove existing preview files first in case the file extension has changed
            utils.remove_model_preview(model_path)
            # Nothing else to do if the preview file was being removed
            if not (type(previewFile) is str and previewFile == "undefined"):
                utils.save_model_preview(model_path, previewFile)

        if "description" in model_data:
            description = model_data["description"]
            utils.save_model_description(model_path, description)

        if "type" in model_data and "pathIndex" in model_data and "fullname" in model_data:
            model_type = model_data.get("type", None)
            path_index = int(model_data.get("pathIndex", None))
            fullname = model_data.get("fullname", None)
            if model_type is None or path_index is None or fullname is None:
                raise RuntimeError("Invalid type or pathIndex or fullname")

            # get new path
            new_model_path = utils.get_full_path(model_type, path_index, fullname)

            utils.rename_model(model_path, new_model_path)

    def remove_model(self, model_path: str):
        model_dirname = os.path.dirname(model_path)
        os.remove(model_path)

        model_previews = utils.get_model_all_previews(model_path)
        for preview in model_previews:
            os.remove(utils.join_path(model_dirname, preview))

        model_descriptions = utils.get_model_all_descriptions(model_path)
        for description in model_descriptions:
            os.remove(utils.join_path(model_dirname, description))
