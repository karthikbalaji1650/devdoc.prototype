"""Remote test execution servers (DDS-SRS-019), credentials encrypted at
rest (DDS-SRS-075).

- Admins register, edit and remove servers; everyone signed in can list
  them (to choose where a run goes), without any credential.
- A server has an API endpoint URL, an auth method (none, API key, Basic,
  or OAuth2 client credentials) and payload parameters - a JSON object sent
  with every run request.
- Secret fields (API key, password, client secret) are sealed with
  AES-256-GCM before they are stored and are never returned by the API;
  responses only say whether one is set. On an edit, leaving a secret out
  keeps the stored one.
- `call()` is how run triggering (DDS-SRS-020) talks to a server, with
  its stored credentials; `check()` tests the connection.
"""

import base64
import json
import re
import time
import uuid
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.core.errors import ApiError
from app.core.secrets import SecretBox, SecretsUnavailableError
from app.models.user import User
from app.repositories.test_servers import TestServerStore
from app.services.permissions import is_admin

AUTH_TYPES = ("none", "apiKey", "basic", "oauth2")
# The one secret field each auth method has.
SECRET_FIELD = {"apiKey": "apiKey", "basic": "password", "oauth2": "clientSecret"}
DEFAULT_API_KEY_HEADER = "X-API-Key"
MAX_PAYLOAD_BYTES = 16_384
CHECK_TIMEOUT_S = 10.0
_HEADER_NAME = re.compile(r"^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$")


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _require_admin(user: User) -> None:
    if not is_admin(user):
        raise ApiError(403, "Only admins can manage test servers.")


def _text(body: dict[str, Any], field: str, *, required: bool = True, max_len: int = 200) -> str | None:
    value = body.get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise ApiError(400, f"{field} is required.")
        return None
    if not isinstance(value, str):
        raise ApiError(400, f"{field} must be text.")
    value = value.strip()
    if len(value) > max_len:
        raise ApiError(400, f"{field} must be at most {max_len} characters.")
    return value


def _url(body: dict[str, Any], field: str) -> str:
    value = _text(body, field, max_len=2048)
    assert value is not None
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ApiError(400, f"{field} must be an http:// or https:// URL.")
    if parts.username or parts.password:
        raise ApiError(400, f"{field} must not contain credentials; use the auth settings instead.")
    return value


def _payload(body: dict[str, Any]) -> dict[str, Any]:
    value = body.get("payload", {})
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ApiError(400, "payload must be a JSON object.")
    if len(json.dumps(value)) > MAX_PAYLOAD_BYTES:
        raise ApiError(400, f"payload must be at most {MAX_PAYLOAD_BYTES // 1024} KB.")
    return value


def public_view(server: dict[str, Any]) -> dict[str, Any]:
    """What the API returns: everything except the sealed secrets."""
    view = {k: v for k, v in server.items() if k != "secrets"}
    field = SECRET_FIELD.get(server["authType"])
    view["secretSet"] = bool(field and field in server.get("secrets", {}))
    return view


class TestServerService:
    __test__ = False

    def __init__(self, store: TestServerStore, box: SecretBox, http_client: httpx.AsyncClient) -> None:
        self._store = store
        self._box = box
        self._http = http_client

    def _context(self, server_id: str, field: str) -> str:
        return f"test-server:{server_id}:{field}"

    async def list(self, user: User) -> dict[str, Any]:
        servers = [public_view(s) for s in await self._store.list()]
        if not is_admin(user):
            # Non-admins only need to pick a server, not see how it authenticates.
            servers = [{k: s[k] for k in ("id", "name", "endpointUrl")} for s in servers]
        return {"servers": servers, "secretsAvailable": self._box.available}

    async def _get(self, server_id: str) -> dict[str, Any]:
        server = await self._store.get(server_id)
        if server is None:
            raise ApiError(404, "No test server found with that id.")
        return server

    async def create(self, user: User, body: Any) -> dict[str, Any]:
        _require_admin(user)
        now = _now()
        server = {"id": str(uuid.uuid4()), "createdBy": user.name, "createdAt": now, "secrets": {}}
        server = self._apply(server, body, user, now)
        await self._store.put(server)
        return public_view(server)

    async def update(self, user: User, server_id: str, body: Any) -> dict[str, Any]:
        _require_admin(user)
        server = self._apply(await self._get(server_id), body, user, _now())
        await self._store.put(server)
        return public_view(server)

    async def delete(self, user: User, server_id: str) -> None:
        _require_admin(user)
        if not await self._store.delete(server_id):
            raise ApiError(404, "No test server found with that id.")

    def _apply(self, server: dict[str, Any], body: Any, user: User, now: str) -> dict[str, Any]:
        if not isinstance(body, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        auth_type = body.get("authType", "none")
        if auth_type not in AUTH_TYPES:
            raise ApiError(400, f"authType must be one of {', '.join(AUTH_TYPES)}.")
        auth_in = body.get("auth") or {}
        if not isinstance(auth_in, dict):
            raise ApiError(400, "auth must be an object.")

        auth: dict[str, Any] = {}
        if auth_type == "apiKey":
            header = _text(auth_in, "headerName", required=False) or DEFAULT_API_KEY_HEADER
            if not _HEADER_NAME.match(header):
                raise ApiError(400, "headerName is not a valid HTTP header name.")
            auth["headerName"] = header
        elif auth_type == "basic":
            auth["username"] = _text(auth_in, "username")
        elif auth_type == "oauth2":
            auth["tokenUrl"] = _url(auth_in, "tokenUrl")
            auth["clientId"] = _text(auth_in, "clientId")
            auth["scope"] = _text(auth_in, "scope", required=False, max_len=1000)

        # Secrets: a new value is sealed; none keeps the stored one (if the
        # auth method is unchanged); switching methods drops the old secret.
        secrets: dict[str, Any] = {}
        field = SECRET_FIELD.get(auth_type)
        if field:
            new_secret = auth_in.get(field)
            if new_secret is not None and not isinstance(new_secret, str):
                raise ApiError(400, f"{field} must be text.")
            if new_secret:
                if len(new_secret) > 4096:
                    raise ApiError(400, f"{field} must be at most 4096 characters.")
                try:
                    secrets[field] = self._box.seal(new_secret, self._context(server["id"], field))
                except SecretsUnavailableError as exc:
                    raise ApiError(503, str(exc)) from exc
            elif server.get("authType") == auth_type and field in server.get("secrets", {}):
                secrets[field] = server["secrets"][field]
            else:
                raise ApiError(400, f"{field} is required.")

        return {
            **server,
            "name": _text(body, "name", max_len=100),
            "endpointUrl": _url(body, "endpointUrl"),
            "authType": auth_type,
            "auth": auth,
            "payload": _payload(body),
            "secrets": secrets,
            "updatedBy": user.name,
            "updatedAt": now,
        }

    async def auth_headers(self, server: dict[str, Any]) -> dict[str, str]:
        """Headers that authenticate a request to the server. OAuth2 fetches
        an access token with the client-credentials grant each time."""
        auth_type = server["authType"]
        if auth_type == "none":
            return {}
        field = SECRET_FIELD[auth_type]
        sealed = server.get("secrets", {}).get(field)
        if sealed is None:
            raise ApiError(400, f"No {field} is stored for this server.")
        try:
            secret = self._box.open(sealed, self._context(server["id"], field))
        except SecretsUnavailableError as exc:
            raise ApiError(503, str(exc)) from exc
        auth = server["auth"]
        if auth_type == "apiKey":
            return {auth["headerName"]: secret}
        if auth_type == "basic":
            token = base64.b64encode(f"{auth['username']}:{secret}".encode()).decode()
            return {"Authorization": f"Basic {token}"}
        form = {"grant_type": "client_credentials", "client_id": auth["clientId"], "client_secret": secret}
        if auth.get("scope"):
            form["scope"] = auth["scope"]
        try:
            res = await self._http.post(auth["tokenUrl"], data=form, timeout=CHECK_TIMEOUT_S)
        except httpx.HTTPError as exc:
            raise ApiError(502, f"Could not reach the OAuth2 token URL ({type(exc).__name__}).") from exc
        token = None
        if res.status_code == 200:
            try:
                token = res.json().get("access_token")
            except ValueError:
                token = None
        if not isinstance(token, str) or not token:
            raise ApiError(502, f"The OAuth2 token URL did not return an access token (HTTP {res.status_code}).")
        return {"Authorization": f"Bearer {token}"}

    async def check(self, user: User, server_id: str) -> dict[str, Any]:
        """Authenticates and sends GET to the endpoint URL. Reports only the
        HTTP status and timing, never the response body."""
        _require_admin(user)
        server = await self._get(server_id)
        started = time.perf_counter()
        try:
            headers = await self.auth_headers(server)
            res = await self._http.get(
                server["endpointUrl"], headers=headers, timeout=CHECK_TIMEOUT_S, follow_redirects=False
            )
        except ApiError as exc:
            return {"ok": False, "status": None, "latencyMs": None, "error": exc.message}
        except httpx.HTTPError as exc:
            error = f"Could not connect ({type(exc).__name__})."
            return {"ok": False, "status": None, "latencyMs": None, "error": error}
        latency = round((time.perf_counter() - started) * 1000)
        ok = res.status_code < 400
        error = None
        if res.status_code in (401, 403):
            error = f"The server rejected the credentials (HTTP {res.status_code})."
        elif not ok:
            error = f"The server answered HTTP {res.status_code}."
        return {"ok": ok, "status": res.status_code, "latencyMs": latency, "error": error}

    async def get_server(self, server_id: str) -> dict[str, Any]:
        """The stored record, secrets sealed - for server-side use only, never a response."""
        return await self._get(server_id)

    async def call(
        self, server: dict[str, Any], method: str, path: str, json_body: Any = None, timeout_s: float = 30.0
    ) -> httpx.Response:
        """An authenticated request to `{endpointUrl}{path}` on a registered
        server (DDS-SRS-020). Connection problems become a 502 ApiError."""
        headers = await self.auth_headers(server)
        url = server["endpointUrl"].rstrip("/") + path
        try:
            res = await self._http.request(
                method, url, headers=headers, json=json_body, timeout=timeout_s, follow_redirects=False
            )
        except httpx.HTTPError as exc:
            raise ApiError(502, f'Could not reach test server "{server["name"]}" ({type(exc).__name__}).') from exc
        return res
