"""JWT access tokens (DDS-SRS-076).

A signed-in user can exchange their session for a JWT
(POST /api/auth/token) and call any API route with
`Authorization: Bearer <jwt>` - for scripts and tools that cannot hold a
cookie. The token is HS256-signed and names its session (`sid`); every use
also checks that session is still active, so signing out (or the session
expiring) revokes every token issued from it at once - the property the
opaque session cookie was chosen for.

The signing key is JWT_SECRET (at least 32 bytes) or, without it, a key
derived from SECRETS_KEY. With neither, JWTs are switched off.
"""

import base64
import hashlib
import hmac
import time
import uuid
from typing import Any

import jwt

ISSUER = "devdoc-studio"
AUDIENCE = "devdoc-studio-api"
MAX_TTL_S = 60 * 60  # 1 hour
ALGORITHM = "HS256"


def signing_key(jwt_secret: str, secrets_key: str) -> bytes | None:
    if jwt_secret:
        key = jwt_secret.encode()
        return key if len(key) >= 32 else None
    if secrets_key:
        try:
            root = base64.b64decode(secrets_key.strip(), validate=True)
        except ValueError:
            return None
        if len(root) == 32:
            return hmac.new(root, b"devdoc-jwt-signing-key", hashlib.sha256).digest()
    return None


class TokenService:
    def __init__(self, key: bytes | None) -> None:
        self._key = key

    @property
    def available(self) -> bool:
        return self._key is not None

    def issue(self, user_id: str, session_id: str) -> dict[str, Any]:
        """Valid for MAX_TTL_S; each use also requires the session to be active,
        which enforces the session's own expiry and sign-out."""
        assert self._key is not None
        now = int(time.time())
        exp = now + MAX_TTL_S
        claims = {"iss": ISSUER, "aud": AUDIENCE, "sub": user_id, "sid": session_id, "iat": now, "exp": exp,
                  "jti": uuid.uuid4().hex}  # fmt: skip
        token = jwt.encode(claims, self._key, algorithm=ALGORITHM)
        return {"accessToken": token, "tokenType": "Bearer", "expiresIn": exp - now}

    def session_of(self, token: str) -> tuple[str, str] | None:
        """(session id, user id) of a valid, unexpired token; None otherwise."""
        if self._key is None:
            return None
        try:
            claims = jwt.decode(
                token, self._key, algorithms=[ALGORITHM], audience=AUDIENCE, issuer=ISSUER,
                options={"require": ["exp", "iat", "sub", "sid"]},
            )  # fmt: skip
        except jwt.PyJWTError:
            return None
        sid, sub = claims.get("sid"), claims.get("sub")
        return (sid, sub) if isinstance(sid, str) and isinstance(sub, str) else None
