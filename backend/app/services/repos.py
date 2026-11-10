"""Connect existing code (DDS-SRS-030): Git repositories cloned into the
code editor's workspace (repos/<name>), so tests and scripts can be built
against them with the AI code editor.

- Anyone signed in can connect a repository; the person who connected it
  and admins can pull or remove it.
- A private repository's access token is sealed with SECRETS_KEY and
  never returned. Git gets it as a per-command HTTP header through the
  code editor's file bridge (sandbox/file_bridge.py), so it is not stored
  in the clone's .git/config either.
    GitHub:     username "x-access-token" (default) + a token
    Bitbucket:  your username + an app password / API token
    GitLab:     username "oauth2" + a token
- The bridge is reached at BRIDGE_URL, with BRIDGE_TOKEN if set.

    dds:repos    hash  repository name -> record JSON (token sealed)
"""

import base64
import json
import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

import httpx
from redis.asyncio import Redis

from app.core.errors import ApiError
from app.core.secrets import SecretBox, SecretsUnavailableError
from app.models.user import User
from app.services.permissions import is_admin

KEY = "dds:repos"
CLONE_TIMEOUT_S = 660.0  # the bridge allows git 600 s
_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")
_BRANCH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$")
_SCP = re.compile(r"^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._/~-]+$")


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def default_name(url: str) -> str:
    """ "https://github.com/acme/bmc-fw.git" -> "bmc-fw"."""
    tail = re.split(r"[/:]", url.rstrip("/"))[-1].removesuffix(".git")
    name = re.sub(r"[^A-Za-z0-9._-]", "-", tail).strip(".-_")[:100]
    return name or "repo"


class RepoService:
    def __init__(
        self, redis: Redis, box: SecretBox, http: httpx.AsyncClient, bridge_url: str, bridge_token: str
    ) -> None:
        self._redis = redis
        self._box = box
        self._http = http
        self._bridge = bridge_url.rstrip("/")
        self._bridge_token = bridge_token

    # ── the bridge ─────────────────────────────────────────────────────
    async def _bridge_call(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        if not self._bridge:
            raise ApiError(503, "The code editor is not connected to this server (set BRIDGE_URL).")
        headers = {"Authorization": f"Bearer {self._bridge_token}"} if self._bridge_token else {}
        try:
            res = await self._http.request(
                method, f"{self._bridge}{path}", json=body, headers=headers, timeout=CLONE_TIMEOUT_S
            )
        except httpx.HTTPError as exc:
            raise ApiError(502, f"Could not reach the code editor's workspace ({type(exc).__name__}).") from exc
        try:
            data = res.json()
        except ValueError:
            data = {}
        if res.status_code == 401:
            raise ApiError(502, "The code editor refused this server's BRIDGE_TOKEN.")
        if res.status_code >= 400:
            message = data.get("error") if isinstance(data, dict) else None
            raise ApiError(
                res.status_code if res.status_code in (400, 404, 409) else 502,
                message or f"Workspace error (HTTP {res.status_code}).",
            )
        return data

    def _auth_header(self, record: dict[str, Any]) -> str | None:
        sealed = record.get("token")
        if not sealed:
            return None
        try:
            token = self._box.open(sealed, f"repo:{record['name']}:token")
        except SecretsUnavailableError as exc:
            raise ApiError(503, str(exc)) from exc
        basic = base64.b64encode(f"{record.get('username') or 'x-access-token'}:{token}".encode()).decode()
        return f"Authorization: Basic {basic}"

    # ── records ────────────────────────────────────────────────────────
    async def _get(self, name: str) -> dict[str, Any]:
        raw = await self._redis.hget(KEY, name)
        if raw is None:
            raise ApiError(404, "No connected repository with that name.")
        return json.loads(raw)

    @staticmethod
    def _view(record: dict[str, Any], live: dict[str, Any] | None) -> dict[str, Any]:
        view = {k: v for k, v in record.items() if k != "token"}
        view["tokenSet"] = "token" in record
        view["workspace"] = live  # branch, commit, last commit - None if not in the workspace
        return view

    async def list(self) -> dict[str, Any]:
        records = sorted(
            (json.loads(v) for v in (await self._redis.hgetall(KEY)).values()), key=lambda r: r["connectedAt"]
        )
        live: dict[str, Any] = {}
        error = None
        if records:
            try:
                live = {r["name"]: r for r in (await self._bridge_call("GET", "/git/repos")).get("repos", [])}
            except ApiError as exc:
                error = exc.message
        return {"repos": [self._view(r, live.get(r["name"])) for r in records], "workspaceError": error,
                "available": bool(self._bridge)}  # fmt: skip

    @staticmethod
    def _require_owner(user: User, record: dict[str, Any]) -> None:
        if not (is_admin(user) or record.get("connectedBy") == user.name):
            raise ApiError(403, "Only the person who connected this repository, or an admin, can change it.")

    async def connect(self, user: User, body: Any) -> dict[str, Any]:
        if not isinstance(body, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        url = body.get("url")
        if not isinstance(url, str) or not url.strip():
            raise ApiError(400, "url is required.")
        url = url.strip()
        parts = urlsplit(url)
        if not _SCP.match(url) and parts.scheme not in ("https", "http", "ssh", "git"):
            raise ApiError(400, "url must be an https://, ssh:// or git@host:owner/repo address.")
        if parts.password:
            raise ApiError(400, "Put the access token in the token field, not in the URL.")
        name = body.get("name") or default_name(url)
        if not isinstance(name, str) or not _NAME.match(name):
            raise ApiError(400, "name may contain letters, digits, '.', '_' and '-'.")
        branch = body.get("branch") or None
        if branch is not None and (not isinstance(branch, str) or not _BRANCH.match(branch)):
            raise ApiError(400, "branch is not a valid branch name.")
        if await self._redis.hexists(KEY, name):
            raise ApiError(409, f'A repository named "{name}" is already connected.')
        record: dict[str, Any] = {
            "name": name,
            "url": url,
            "branch": branch,
            "username": (body.get("username") or "").strip() or None,
            "connectedBy": user.name,
            "connectedAt": _now(),
        }
        token = body.get("token")
        if token:
            if not isinstance(token, str) or len(token) > 4096:
                raise ApiError(400, "token must be text.")
            if not url.startswith(("https://", "http://")):
                raise ApiError(400, "A token works with https:// URLs; ssh needs a key in the code editor.")
            try:
                record["token"] = self._box.seal(token.strip(), f"repo:{name}:token")
            except SecretsUnavailableError as exc:
                raise ApiError(503, str(exc)) from exc
        live = await self._bridge_call(
            "POST", "/git/clone", {"name": name, "url": url, "branch": branch, "authHeader": self._auth_header(record)}
        )
        await self._redis.hset(KEY, name, json.dumps(record))
        return self._view(record, live)

    async def pull(self, user: User, name: str) -> dict[str, Any]:
        record = await self._get(name)
        self._require_owner(user, record)
        live = await self._bridge_call("POST", "/git/pull", {"name": name, "authHeader": self._auth_header(record)})
        record["pulledAt"] = _now()
        await self._redis.hset(KEY, name, json.dumps(record))
        return self._view(record, live)

    async def remove(self, user: User, name: str) -> None:
        record = await self._get(name)
        self._require_owner(user, record)
        await self._bridge_call("POST", "/git/remove", {"name": name})
        await self._redis.hdel(KEY, name)
