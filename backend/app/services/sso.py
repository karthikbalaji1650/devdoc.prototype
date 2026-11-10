"""Single sign-on with OAuth2 / OpenID Connect (DDS-SRS-076).

Works with any OpenID Connect provider - Microsoft Entra ID, Okta, Google,
Keycloak, Auth0, ... - configured with OIDC_ISSUER, OIDC_CLIENT_ID,
OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI (this API's /api/auth/sso/callback).

The flow is the authorization-code grant with PKCE (S256):
1. /api/auth/sso/login stores a random `state` (bound to a short-lived
   cookie in this browser), a `nonce` and the PKCE verifier, and sends the
   browser to the provider.
2. /api/auth/sso/callback checks the state against both the cookie and the
   stored entry (single use, 10 minutes), swaps the code for tokens, and
   verifies the ID token: signature against the provider's published keys
   (JWKS), issuer, audience = our client id, expiry, and the nonce.
3. The person is matched to an existing DevDoc Studio account by email
   (the `email` claim, else `preferred_username` / `upn` when it is an
   email). Nobody is created automatically: an unknown email is refused,
   so the provider cannot hand out accounts. A provider that says the
   email is unverified (`email_verified: false`) is refused too.
4. A normal session is created - the same cookie, session audit entry
   and sign-out as a password sign-in.
"""

import base64
import hashlib
import json
import secrets
import time
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt
from redis.asyncio import Redis

from app.core.config import Settings
from app.core.errors import ApiError

STATE_TTL_S = 600
STATE_COOKIE = "devdoc_sso_state"
_DISCOVERY_TTL_S = 3600
_ALGORITHMS = ["RS256", "RS384", "RS512", "PS256", "ES256", "ES384"]


class SsoError(Exception):
    """A sign-in that must be refused, with a message for the person."""


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class SsoService:
    def __init__(self, settings: Settings, redis: Redis, http: httpx.AsyncClient) -> None:
        self._issuer = settings.oidc_issuer.rstrip("/")
        self._client_id = settings.oidc_client_id
        self._client_secret = settings.oidc_client_secret
        self._redirect_uri = settings.oidc_redirect_uri
        self._scopes = settings.oidc_scopes or "openid email profile"
        self.provider_name = settings.oidc_provider_name or "SSO"
        self.post_login_url = settings.oidc_post_login_url or (settings.cors_origin_list or ["/"])[0]
        self._redis = redis
        self._http = http
        self._discovery: tuple[float, dict[str, Any]] | None = None
        self._jwks: tuple[float, dict[str, Any]] | None = None

    @property
    def enabled(self) -> bool:
        return bool(self._issuer and self._client_id and self._redirect_uri)

    def config(self) -> dict[str, Any]:
        return {"enabled": self.enabled, "providerName": self.provider_name if self.enabled else None}

    async def _get_json(self, url: str) -> dict[str, Any]:
        try:
            res = await self._http.get(url, timeout=10.0)
            res.raise_for_status()
            data = res.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ApiError(502, f"Could not read the sign-in provider ({type(exc).__name__}).") from exc
        if not isinstance(data, dict):
            raise ApiError(502, "The sign-in provider returned something unexpected.")
        return data

    async def _metadata(self) -> dict[str, Any]:
        if self._discovery and time.time() - self._discovery[0] < _DISCOVERY_TTL_S:
            return self._discovery[1]
        data = await self._get_json(f"{self._issuer}/.well-known/openid-configuration")
        for field in ("authorization_endpoint", "token_endpoint", "jwks_uri", "issuer"):
            if not isinstance(data.get(field), str):
                raise ApiError(502, f"The sign-in provider's configuration has no {field}.")
        self._discovery = (time.time(), data)
        return data

    async def _keys(self, refresh: bool = False) -> dict[str, Any]:
        if not refresh and self._jwks and time.time() - self._jwks[0] < _DISCOVERY_TTL_S:
            return self._jwks[1]
        data = await self._get_json((await self._metadata())["jwks_uri"])
        self._jwks = (time.time(), data)
        return data

    # ── 1. start ───────────────────────────────────────────────────────
    async def start(self) -> tuple[str, str]:
        """(URL to send the browser to, state for the cookie)."""
        if not self.enabled:
            raise ApiError(404, "Single sign-on is not configured.")
        meta = await self._metadata()
        state, nonce, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32), secrets.token_urlsafe(48)
        await self._redis.set(
            f"dds:sso:state:{state}", json.dumps({"nonce": nonce, "verifier": verifier}), ex=STATE_TTL_S
        )
        challenge = _b64url(hashlib.sha256(verifier.encode()).digest())
        query = urlencode({
            "response_type": "code", "client_id": self._client_id, "redirect_uri": self._redirect_uri,
            "scope": self._scopes, "state": state, "nonce": nonce,
            "code_challenge": challenge, "code_challenge_method": "S256",
        })  # fmt: skip
        separator = "&" if "?" in meta["authorization_endpoint"] else "?"
        return f"{meta['authorization_endpoint']}{separator}{query}", state

    # ── 2-3. finish ────────────────────────────────────────────────────
    async def finish(self, params: dict[str, str], cookie_state: str | None) -> str:
        """The verified email address of the person signing in."""
        if not self.enabled:
            raise SsoError("Single sign-on is not configured.")
        if params.get("error"):
            raise SsoError(params.get("error_description") or f"The sign-in provider said: {params['error']}.")
        state, code = params.get("state"), params.get("code")
        if not state or not code:
            raise SsoError("The sign-in provider's reply was incomplete.")
        if not cookie_state or not secrets.compare_digest(state, cookie_state):
            raise SsoError("This sign-in was not started in this browser. Try again.")
        stored = await self._redis.getdel(f"dds:sso:state:{state}")
        if stored is None:
            raise SsoError("This sign-in has expired or was already used. Try again.")
        pending = json.loads(stored)
        meta = await self._metadata()
        try:
            res = await self._http.post(
                meta["token_endpoint"],
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": self._redirect_uri,
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                    "code_verifier": pending["verifier"],
                },
                headers={"Accept": "application/json"},
                timeout=10.0,
            )
            tokens = res.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise SsoError("Could not complete sign-in with the provider.") from exc
        id_token = tokens.get("id_token") if isinstance(tokens, dict) else None
        if res.status_code != 200 or not isinstance(id_token, str):
            raise SsoError("The sign-in provider did not return an ID token.")
        claims = await self._verify(id_token, meta["issuer"], pending["nonce"])
        return self._email(claims)

    async def _verify(self, id_token: str, issuer: str, nonce: str) -> dict[str, Any]:
        try:
            kid = jwt.get_unverified_header(id_token).get("kid")
        except jwt.PyJWTError as exc:
            raise SsoError("The ID token could not be read.") from exc
        key = None
        for refresh in (False, True):  # the provider may have rotated its keys
            jwks = await self._keys(refresh)
            for candidate in jwks.get("keys") or []:
                if isinstance(candidate, dict) and (kid is None or candidate.get("kid") == kid):
                    key = jwt.PyJWK(candidate).key
                    break
            if key is not None:
                break
        if key is None:
            raise SsoError("The ID token is signed with a key the provider does not publish.")
        try:
            claims = jwt.decode(
                id_token, key, algorithms=_ALGORITHMS, audience=self._client_id, issuer=issuer,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]}, leeway=60,
            )  # fmt: skip
        except jwt.PyJWTError as exc:
            raise SsoError(f"The ID token is not valid ({type(exc).__name__}).") from exc
        if not isinstance(claims.get("nonce"), str) or not secrets.compare_digest(claims["nonce"], nonce):
            raise SsoError("The ID token does not belong to this sign-in.")
        return claims

    @staticmethod
    def _email(claims: dict[str, Any]) -> str:
        if claims.get("email_verified") is False:
            raise SsoError("The sign-in provider has not verified this email address.")
        for field in ("email", "preferred_username", "upn"):
            value = claims.get(field)
            if isinstance(value, str) and "@" in value:
                return value.strip().lower()
        raise SsoError("The sign-in provider did not share an email address (add the email scope).")
