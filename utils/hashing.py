"""SHA-256 hashing utilities."""

import hashlib


def sha256_digest(content: str) -> str:
    """Compute a hex-encoded SHA-256 digest of the given string."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()
