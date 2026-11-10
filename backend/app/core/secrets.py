"""Encryption at rest for stored credentials (DDS-SRS-075).

AES-256-GCM under a key the server reads from SECRETS_KEY (32 random bytes,
base64). The key never touches Redis, so a copy of the data - a backup, a
Redis dump - holds only ciphertext. Each value is bound to where it is
stored (its `context`, e.g. "test-server:abc:apiKey"), so ciphertext copied
from one record or field into another fails to decrypt.

Generate a key with:  python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
"""

import base64
import binascii
import hashlib
import os
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ALGORITHM = "A256GCM"
_NONCE_BYTES = 12


class SecretsUnavailableError(Exception):
    """No usable SECRETS_KEY, or a value that cannot be decrypted with it."""


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


class SecretBox:
    def __init__(self, key_b64: str) -> None:
        self._aes: AESGCM | None = None
        self.key_id: str | None = None
        self.problem: str | None = None
        if not key_b64.strip():
            self.problem = "The server has no SECRETS_KEY set, so it cannot store credentials."
            return
        try:
            key = base64.b64decode(key_b64.strip(), validate=True)
        except (binascii.Error, ValueError):
            key = b""
        if len(key) != 32:
            self.problem = "SECRETS_KEY must be 32 random bytes, base64-encoded."
            return
        self._aes = AESGCM(key)
        # Identifies which key sealed a value without revealing the key.
        self.key_id = hashlib.sha256(b"devdoc-secrets-key-id" + key).hexdigest()[:12]

    @property
    def available(self) -> bool:
        return self._aes is not None

    def _require(self) -> AESGCM:
        if self._aes is None:
            raise SecretsUnavailableError(self.problem or "Credentials cannot be stored.")
        return self._aes

    def seal(self, plaintext: str, context: str) -> dict[str, Any]:
        aes = self._require()
        nonce = os.urandom(_NONCE_BYTES)
        ciphertext = aes.encrypt(nonce, plaintext.encode(), context.encode())
        return {"alg": ALGORITHM, "kid": self.key_id, "nonce": _b64(nonce), "data": _b64(ciphertext)}

    def open(self, sealed: dict[str, Any], context: str) -> str:
        aes = self._require()
        if sealed.get("kid") != self.key_id:
            raise SecretsUnavailableError("This credential was stored under a different SECRETS_KEY; enter it again.")
        try:
            nonce = base64.b64decode(sealed["nonce"])
            data = base64.b64decode(sealed["data"])
            return aes.decrypt(nonce, data, context.encode()).decode()
        except (KeyError, TypeError, binascii.Error, InvalidTag) as exc:
            raise SecretsUnavailableError("A stored credential could not be decrypted; enter it again.") from exc
