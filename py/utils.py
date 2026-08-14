import os
import re
import json
import yaml
import shutil
import tarfile
import logging
import requests
import traceback
import configparser
import functools
import mimetypes


def sanitize_filename(filename: str) -> str:
    if not filename:
        return "_"
    invalid_chars = r'[\/\?<>\\:\*\|"]'
    sanitized = re.sub(invalid_chars, '_', str(filename))
    sanitized = sanitized.strip('. ')
    if not sanitized:
        sanitized = '_'
    return sanitized

import comfy.utils
import folder_paths

from aiohttp import web
from typing import Any, Optional
from . import config

# Media file extensions
VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.m4v', '.ogv']
IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.bmp']

# Preview extensions in priority order (videos first, then images)
PREVIEW_EXTENSIONS = ['.webm', '.mp4', '.webp', '.png', '.jpg', '.jpeg', '.gif', '.bmp']

# Content type mappings
VIDEO_CONTENT_TYPE_MAP = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/x-matroska': '.mkv',
    'video/x-flv': '.flv',
    'video/x-ms-wmv': '.wmv',
    'video/ogg': '.ogv',
}


def print_info(msg, *args, **kwargs):
    logging.info(f"[{config.extension_tag}] {msg}", *args, **kwargs)


def print_warning(msg, *args, **kwargs):
    logging.warning(f"[{config.extension_tag}][WARNING] {msg}", *args, **kwargs)


def print_error(msg, *args, **kwargs):
    logging.error(f"[{config.extension_tag}][ERROR] {msg}", *args, **kwargs)
    logging.debug(traceback.format_exc())


def print_debug(msg, *args, **kwargs):
    logging.debug(f"[{config.extension_tag}] {msg}", *args, **kwargs)


def deprecated(reason: str):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            print_warning(f"{func.__name__} is deprecated: {reason}")
            return func(*args, **kwargs)

        return wrapper

    return decorator


def _matches(predicate: dict):
    def _filter(obj: dict):
        return all(obj.get(key, None) == value for key, value in predicate.items())

    return _filter


def filter_with(list: list, predicate):
    if isinstance(predicate, dict):
        predicate = _matches(predicate)

    return [item for item in list if predicate(item)]


async def get_request_body(request) -> dict:
    try:
        return await request.json()
    except:
        return {}


def normalize_path(path: str):
    normpath = os.path.normpath(path)
    return normpath.replace(os.path.sep, "/")


def join_path(path: str, *paths: list[str]):
    return normalize_path(os.path.join(path, *paths))


def get_current_version():
    try:
        pyproject_path = join_path(config.extension_uri, "pyproject.toml")
        config_parser = configparser.ConfigParser()
        config_parser.read(pyproject_path)
        version = config_parser.get("project", "version")
        return version.strip("'\"")
    except:
        return "0.0.0"


def download_web_distribution(version: str):
    return



def resolve_model_base_paths() -> dict[str, list[str]]:
    """
    Resolve model base paths.
    eg. { "checkpoints": ["path/to/checkpoints"] }
    """
    folders = list(folder_paths.folder_names_and_paths.keys())
    model_base_paths = {}
    folder_black_list = ["configs", "custom_nodes"]
    for folder in folders:
        if folder in folder_black_list:
            continue
        folders = folder_paths.get_folder_paths(folder)
        model_base_paths[folder] = [normalize_path(f) for f in folders]
    return model_base_paths


def resolve_file_content_type(filename: str):
    extension_mimetypes_cache = folder_paths.extension_mimetypes_cache
    extension = filename.split(".")[-1]
    if extension not in extension_mimetypes_cache:
        mime_type, _ = mimetypes.guess_type(filename, strict=False)
        if not mime_type:
            return None
        content_type = mime_type.split("/")[0]
        extension_mimetypes_cache[extension] = content_type
    else:
        content_type = extension_mimetypes_cache[extension]
    return content_type


def get_full_path(model_type: str, path_index: int, filename: str):
    """
    Get the absolute path in the model type through string concatenation.
    """
    folders = resolve_model_base_paths().get(model_type, [])
    if not path_index < len(folders):
        raise RuntimeError(f"PathIndex {path_index} is not in {model_type}")
    base_path = folders[path_index]
    full_path = join_path(base_path, filename)
    real_base = os.path.realpath(base_path)
    real_full = os.path.realpath(full_path)
    if not (real_full == real_base or real_full.startswith(real_base + os.sep)):
        raise RuntimeError(f"Path traversal detected: filename escapes model directory")
    return full_path


def get_valid_full_path(model_type: str, path_index: int, filename: str):
    """
    Like get_full_path but it will check whether the file is valid.
    """
    full_path = get_full_path(model_type, path_index, filename)
    if os.path.isfile(full_path):
        return full_path
    elif os.path.islink(full_path):
        raise RuntimeError(f"WARNING path {full_path} exists but doesn't link anywhere, skipping.")


def get_download_path():
    download_path = join_path(config.extension_uri, "downloads")
    if not os.path.exists(download_path):
        os.makedirs(download_path)
    return download_path


def recursive_search_files(directory: str, request):
    if not os.path.isdir(directory):
        return []

    excluded_dir_names = [".git"]
    result = []
    include_hidden_files = get_setting_value(request, "scan.include_hidden_files", False)

    for dirpath, subdirs, filenames in os.walk(directory, followlinks=True, topdown=True):
        subdirs[:] = [d for d in subdirs if d not in excluded_dir_names]
        if not include_hidden_files:
            subdirs[:] = [d for d in subdirs if not d.startswith(".")]
            filenames[:] = [f for f in filenames if not f.startswith(".")]

        for file_name in filenames:
            try:
                relative_path = os.path.relpath(os.path.join(dirpath, file_name), directory)
                result.append(relative_path)
            except:
                logging.warning(f"Warning: Unable to access {file_name}. Skipping this file.")
                continue

    return [normalize_path(f) for f in result]


def search_files(directory: str):
    entries = os.listdir(directory)
    files = [f for f in entries if os.path.isfile(join_path(directory, f))]
    return files


def file_list_to_name_dict(files: list[str]):
    file_dict: dict[str, str] = {}
    for file in files:
        filename = os.path.splitext(file)[0]
        file_dict[filename] = file
    return file_dict


def get_model_metadata(filename: str):
    if not filename.endswith(".safetensors"):
        return {}
    try:
        out = comfy.utils.safetensors_header(filename, max_size=1024 * 1024)
        if out is None:
            return {}
        dt = json.loads(out)
        if not "__metadata__" in dt:
            return {}
        return dt["__metadata__"]
    except:
        return {}


def _check_preview_variants(base_dirname: str, basename: str, extensions: list[str]) -> list[str]:
    """Check for preview files with given extensions and return found files"""
    found = []
    for ext in extensions:
        # Direct match (basename.ext)
        preview_file = f"{basename}{ext}"
        if os.path.isfile(join_path(base_dirname, preview_file)):
            found.append(preview_file)
        
        # Preview variant (basename.preview.ext)
        preview_file = f"{basename}.preview{ext}"
        if os.path.isfile(join_path(base_dirname, preview_file)):
            found.append(preview_file)
    return found


def _get_preview_path(model_path: str, extension: str) -> str:
    """Generate preview file path with given extension"""
    basename = os.path.splitext(model_path)[0]
    return f"{basename}{extension}"


def get_model_all_previews(model_path: str) -> list[str]:
    """Get all preview files for a model"""
    base_dirname = os.path.dirname(model_path)
    basename = os.path.splitext(os.path.basename(model_path))[0]
    
    basenames = [basename]
    for suffix in [".download", ".task"]:
        if basename.endswith(suffix):
            basenames.append(basename[:-len(suffix)])
        elif "." in basename:
            basenames.append(basename.split(".")[0])

    found = []
    for b in set(basenames):
        found.extend(_check_preview_variants(base_dirname, b, PREVIEW_EXTENSIONS))
    return list(set(found))


def get_model_preview_name(model_path: str) -> str | None:
    """Get the first available preview file or None if none found"""
    base_dirname = os.path.dirname(model_path)
    basename = os.path.splitext(os.path.basename(model_path))[0]
    
    basenames = [basename]
    for suffix in [".download", ".task"]:
        if basename.endswith(suffix):
            basenames.append(basename[:-len(suffix)])
        elif "." in basename:
            basenames.append(basename.split(".")[0])
            
    for b in set(basenames):
        for ext in PREVIEW_EXTENSIONS:
            # Check direct match first
            preview_name = f"{b}{ext}"
            if os.path.isfile(join_path(base_dirname, preview_name)):
                return preview_name
            
            # Check preview variant
            preview_name = f"{b}.preview{ext}"
            if os.path.isfile(join_path(base_dirname, preview_name)):
                return preview_name
    
    return None


from PIL import Image
from io import BytesIO


def remove_model_preview(model_path: str):
    """Remove all preview files for a model"""
    base_dirname = os.path.dirname(model_path)
    basename = os.path.splitext(os.path.basename(model_path))[0]
    
    previews = _check_preview_variants(base_dirname, basename, PREVIEW_EXTENSIONS)
    for preview in previews:
        preview_path = join_path(base_dirname, preview)
        if os.path.exists(preview_path):
            os.remove(preview_path)


import subprocess


def is_ffmpeg_installed() -> bool:
    """Check if FFmpeg is installed and accessible via system PATH."""
    try:
        if shutil.which("ffmpeg"):
            return True
        res = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return res.returncode == 0
    except Exception:
        return False


def convert_video_to_webp(video_path: str, webp_path: str, quality: int = 85, compression_level: int = 2) -> bool:
    """Convert a video file to an animated WebP file using FFmpeg."""
    if not os.path.isfile(video_path):
        return False
    try:
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vcodec", "libwebp",
            "-q:v", str(quality),
            "-compression_level", str(compression_level),
            "-loop", "0",
            webp_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
        if res.returncode == 0 and os.path.isfile(webp_path) and os.path.getsize(webp_path) > 0:
            return True
        return False
    except Exception as e:
        print_error(f"FFmpeg video conversion failed: {e}")
        return False


def save_model_preview(model_path: str, file_or_url: Any, platform: Optional[str] = None, request: Optional[web.Request] = None):
    """Save a preview file for a model. Images -> WebP (85%), videos -> WebP via FFmpeg if enabled."""
    if not file_or_url:
        return

    should_convert_video = False
    if request:
        try:
            should_convert_video = bool(get_setting_value(request, "scan.convert_video_to_webp", False))
        except Exception:
            pass

    # Download file if it is a URL
    if isinstance(file_or_url, str):
        url = file_or_url.strip()
        if not url:
            return

        try:
            session = create_request_session(request=request, platform=platform, traffic_type="preview")
            response = session.get(url, timeout=15)
            response.raise_for_status()
            
            # Determine content type from response headers or URL extension
            content_type = response.headers.get('content-type', '')
            if not content_type:
                content_type = resolve_file_content_type(url) or ''
            
            content = response.content
            
            if content_type.startswith("video/") or _get_video_extension_from_url(url):
                ext = _get_video_extension_from_url(url) or _get_extension_from_content_type(content_type) or '.mp4'
                tmp_video_path = _get_preview_path(model_path, ext)
                with open(tmp_video_path, 'wb') as f:
                    f.write(content)

                if should_convert_video and is_ffmpeg_installed():
                    webp_path = _get_preview_path(model_path, ".webp")
                    if convert_video_to_webp(tmp_video_path, webp_path, quality=85, compression_level=2):
                        if os.path.exists(tmp_video_path) and tmp_video_path != webp_path:
                            os.remove(tmp_video_path)
            else:
                # Default to WebP image (quality 85%)
                preview_path = _get_preview_path(model_path, ".webp")
                image = Image.open(BytesIO(content))
                image.save(preview_path, "WEBP", quality=85)

        except Exception as e:
            print_error(f"Failed to download preview: {e}")

    # Handle uploaded file
    else:
        file_obj = file_or_url

        if not isinstance(file_obj, web.FileField):
            raise RuntimeError("Invalid file")

        content_type: str = file_obj.content_type
        filename: str = getattr(file_obj, 'filename', '')
        
        if content_type.startswith("video/"):
            ext = os.path.splitext(filename.lower())[1] or '.mp4'
            tmp_video_path = _get_preview_path(model_path, ext)
            file_obj.file.seek(0)
            content = file_obj.file.read()
            with open(tmp_video_path, 'wb') as f:
                f.write(content)

            if should_convert_video and is_ffmpeg_installed():
                webp_path = _get_preview_path(model_path, ".webp")
                if convert_video_to_webp(tmp_video_path, webp_path, quality=85, compression_level=2):
                    if os.path.exists(tmp_video_path) and tmp_video_path != webp_path:
                        os.remove(tmp_video_path)
        elif content_type.startswith("image/"):
            # Convert image to webp (quality 85%)
            preview_path = _get_preview_path(model_path, ".webp")
            image = Image.open(file_obj.file)
            image.save(preview_path, "WEBP", quality=85)
        else:
            raise RuntimeError(f"FileTypeError: expected image or video, got {content_type}")


def _get_video_extension_from_url(url: str) -> Optional[str]:
    """Extract video extension from URL."""
    from urllib.parse import urlparse
    path = urlparse(url).path.lower()
    for ext in VIDEO_EXTENSIONS:
        if path.endswith(ext):
            return ext
    return None


def _get_extension_from_content_type(content_type: str) -> Optional[str]:
    """Map content-type to file extension."""
    return VIDEO_CONTENT_TYPE_MAP.get(content_type.lower())


def get_model_all_descriptions(model_path: str):
    base_dirname = os.path.dirname(model_path)
    files = search_files(base_dirname)
    files = folder_paths.filter_files_extensions(files, [".txt", ".md"])

    basename = os.path.splitext(os.path.basename(model_path))[0]
    output: list[str] = []
    for file in files:
        file_basename = os.path.splitext(file)[0]
        if file_basename == basename:
            output.append(file)
    return output


def get_model_description_name(model_path: str):
    descriptions = get_model_all_descriptions(model_path)
    basename = os.path.splitext(os.path.basename(model_path))[0]
    return descriptions[0] if len(descriptions) > 0 else f"{basename}.md"


def save_model_description(model_path: str, content: Any):
    if not isinstance(content, str):
        raise RuntimeError("Invalid description")

    base_dirname = os.path.dirname(model_path)

    # save new description
    basename = os.path.splitext(os.path.basename(model_path))[0]
    extension = ".md"
    new_desc_path = join_path(base_dirname, f"{basename}{extension}")

    with open(new_desc_path, "w", encoding="utf-8", newline="") as f:
        f.write(content)


def rename_model(model_path: str, new_model_path: str):
    if model_path == new_model_path:
        return

    if os.path.exists(new_model_path):
        raise RuntimeError(f"Model {new_model_path} already exists")

    model_name = os.path.splitext(os.path.basename(model_path))[0]
    new_model_name = os.path.splitext(os.path.basename(new_model_path))[0]

    model_dirname = os.path.dirname(model_path)
    new_model_dirname = os.path.dirname(new_model_path)

    if not os.path.exists(new_model_dirname):
        os.makedirs(new_model_dirname)

    # move model
    shutil.move(model_path, new_model_path)

    # move preview
    previews = get_model_all_previews(model_path)
    for preview in previews:
        preview_path = join_path(model_dirname, preview)
        preview_name = os.path.splitext(preview)[0]
        preview_ext = os.path.splitext(preview)[1]
        new_preview_path = (
            join_path(new_model_dirname, new_model_name + preview_ext)
            if preview_name == model_name
            else join_path(new_model_dirname, new_model_name + ".preview" + preview_ext)
        )
        shutil.move(preview_path, new_preview_path)

    # move description
    description = get_model_description_name(model_path)
    description_path = join_path(model_dirname, description)
    if os.path.isfile(description_path):
        new_description_path = join_path(new_model_dirname, f"{new_model_name}.md")
        shutil.move(description_path, new_description_path)


import pickle


def save_dict_pickle_file(filename: str, data: dict):
    with open(filename, "wb") as f:
        pickle.dump(data, f)


def load_dict_pickle_file(filename: str) -> dict:
    with open(filename, "rb") as f:
        data = pickle.load(f)
    return data


def resolve_setting_key(key: str) -> str:
    key_paths = key.split(".")
    setting_id = config.setting_key
    try:
        for key_path in key_paths:
            setting_id = setting_id[key_path]
    except:
        pass
    if not isinstance(setting_id, str):
        raise RuntimeError(f"Invalid key: {key}")

    return setting_id


def set_setting_value(request: web.Request, key: str, value: Any):
    setting_id = resolve_setting_key(key)
    settings = config.serverInstance.user_manager.settings.get_settings(request)
    settings[setting_id] = value
    config.serverInstance.user_manager.settings.save_settings(request, settings)


def get_setting_value(request: Optional[web.Request], key: str, default: Any = None) -> Any:
    try:
        setting_id = resolve_setting_key(key)
        settings = config.serverInstance.user_manager.settings.get_settings(request)
        return settings.get(setting_id, default)
    except Exception:
        return default


def get_api_key(request: Optional[web.Request] = None, platform: str = "civitai") -> str:
    platform = (platform or "civitai").lower()
    val = ""
    try:
        val = get_setting_value(request, f"api_key.{platform}", "")
    except Exception:
        pass
    if not val:
        try:
            val = get_setting_value(None, f"api_key.{platform}", "")
        except Exception:
            pass
    return str(val or "").strip()


async def send_json(event: str, data: Any, sid: str = None):
    await config.serverInstance.send_json(event, data, sid)


import sys
import subprocess
import importlib.util
import importlib.metadata


def is_installed(package_name: str):
    try:
        dist = importlib.metadata.distribution(package_name)
    except importlib.metadata.PackageNotFoundError:
        try:
            spec = importlib.util.find_spec(package_name)
        except ModuleNotFoundError:
            return False

        return spec is not None

    return dist is not None


def pip_install(package_name: str):
    subprocess.run([sys.executable, "-m", "pip", "install", package_name], check=True)


import hashlib


def calculate_sha256(path, buffer_size=1024 * 1024):
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            data = f.read(buffer_size)
            if not data:
                break
            sha256.update(data)
    return sha256.hexdigest()


from requests.adapters import HTTPAdapter
from urllib3.util import Retry


def get_proxy_url(
    request: Optional[web.Request] = None,
    platform: Optional[str] = None,
    traffic_type: str = "api"
) -> str:
    if not request:
        return ""
    try:
        if platform == "civitai":
            enabled = get_setting_value(request, "proxy.civitai", False)
        elif platform == "huggingface":
            enabled = get_setting_value(request, "proxy.huggingface", False)
        else:
            enabled = get_setting_value(request, "proxy.civitai", False) or get_setting_value(request, "proxy.huggingface", False)

        if not enabled:
            return ""

        scope = get_setting_value(request, "proxy.scope", "api_only")
        if traffic_type in ("download", "preview") and scope == "api_only":
            return ""

        host = str(get_setting_value(request, "proxy.host", "") or "").strip()
        port = str(get_setting_value(request, "proxy.port", "1080") or "1080").strip()
        username = str(get_setting_value(request, "proxy.username", "") or "").strip()
        password = str(get_setting_value(request, "proxy.password", "") or "").strip()

        if not host:
            return str(get_setting_value(request, "proxy.url", "") or "").strip()

        if username and password:
            return f"socks5h://{username}:{password}@{host}:{port}"
        elif username:
            return f"socks5h://{username}@{host}:{port}"
        else:
            return f"socks5h://{host}:{port}"
    except Exception:
        return ""


def create_request_session(
    request: Optional[web.Request] = None,
    platform: Optional[str] = None,
    traffic_type: str = "api",
    disable_proxy: bool = False
) -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[500, 502, 503, 504],
        raise_on_status=False
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("http://", adapter)
    session.mount("https://", adapter)

    session.headers.update({
        "User-Agent": config.user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
    })

    if request and not disable_proxy:
        try:
            proxy_url = get_proxy_url(request, platform=platform, traffic_type=traffic_type)
            if proxy_url:
                session.proxies.update({
                    "http": proxy_url,
                    "https": proxy_url
                })
        except Exception:
            pass

    return session

