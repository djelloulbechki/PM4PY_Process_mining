from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken


def _fernet() -> Fernet:
    raw = os.getenv("CONNECTOR_ENCRYPTION_KEY", "").strip()
    if not raw:
        raise RuntimeError("CONNECTOR_ENCRYPTION_KEY is required for connector credentials.")
    try:
        return Fernet(raw.encode())
    except Exception:
        # Allow a strong arbitrary secret in development and derive a valid Fernet key.
        digest = hashlib.sha256(raw.encode()).digest()
        return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("Connector credential cannot be decrypted.") from exc
