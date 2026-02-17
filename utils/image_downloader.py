"""Image downloader — fetches remote images to a temp file for upload."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

DOWNLOAD_TIMEOUT = 15
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB


def download_image(url: str) -> Path | None:
    """Download an image URL to a temporary file.

    Returns the Path to the temp file, or None on failure.
    The caller is responsible for cleanup.
    """
    try:
        response = requests.get(url, timeout=DOWNLOAD_TIMEOUT, stream=True)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed to download image %s: %s", url, exc)
        return None

    content_length = int(response.headers.get("content-length", 0))
    if content_length > MAX_IMAGE_SIZE:
        logger.warning("Image too large (%d bytes): %s", content_length, url)
        return None

    suffix = _guess_extension(url, response.headers.get("content-type", ""))
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)

    try:
        size = 0
        for chunk in response.iter_content(chunk_size=8192):
            size += len(chunk)
            if size > MAX_IMAGE_SIZE:
                logger.warning("Image exceeded max size during download: %s", url)
                tmp.close()
                Path(tmp.name).unlink(missing_ok=True)
                return None
            tmp.write(chunk)
        tmp.close()
        return Path(tmp.name)
    except Exception as exc:
        logger.error("Error writing image to temp file: %s", exc)
        tmp.close()
        Path(tmp.name).unlink(missing_ok=True)
        return None


def _guess_extension(url: str, content_type: str) -> str:
    """Derive file extension from URL path or Content-Type header."""
    path_ext = Path(urlparse(url).path).suffix.lower()
    if path_ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        return path_ext

    mime_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    return mime_map.get(content_type.split(";")[0].strip(), ".jpg")
