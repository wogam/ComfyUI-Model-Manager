extension_tag = "ComfyUI Model Manager"

extension_uri: str = None


setting_key = {
    "api_key": {
        "civitai": "ModelManager.APIKey.Civitai",
        "huggingface": "ModelManager.APIKey.HuggingFace",
    },
    "download": {
        "max_task_count": "ModelManager.Download.MaxTaskCount",
    },
    "scan": {
        "include_hidden_files": "ModelManager.Scan.IncludeHiddenFiles",
        "convert_video_to_webp": "ModelManager.Scan.ConvertVideoToWebp"
    },
    "proxy": {
        "civitai": "ModelManager.Proxy.Civitai",
        "huggingface": "ModelManager.Proxy.HuggingFace",
        "scope": "ModelManager.Proxy.Scope",
        "host": "ModelManager.Proxy.Host",
        "port": "ModelManager.Proxy.Port",
        "username": "ModelManager.Proxy.Username",
        "password": "ModelManager.Proxy.Password",
        "url": "ModelManager.Proxy.Url",
    },
}

default_civitai_api_key = "35de988b9b0a2b81d88772be2aab5b00"
user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0"


from server import PromptServer

serverInstance = PromptServer.instance
routes = serverInstance.routes

