"""Issue tracker connections - Jira and GitHub - for release blockers
(DDS-SRS-044).

- An admin configures one Jira and one GitHub connection. Tokens are
  sealed with the server's SECRETS_KEY (AES-256-GCM, as test-server
  credentials are) and never returned.
    Jira Cloud:            base URL + account email + API token (Basic auth)
    Jira Server / DC:      base URL + personal access token (Bearer)
    GitHub / Enterprise:   API URL (default https://api.github.com) + token
- `issue()` reads one issue; `search()` lists the issues a release's
  blocker query matches: a Jira JQL query, or a GitHub repository + label.
  Each comes back as {tracker, key, title, url, severity, status}.
- Severity comes from Jira's priority (Highest/Blocker -> Blocker, High/
  Critical -> Critical, Medium/Major -> Major, lower -> Minor), and from
  GitHub labels ("critical", "major", "minor" in a label name; otherwise
  Blocker, since the issue is marked as a release blocker).
- Status is Closed when Jira's status category is Done or the GitHub issue
  is closed; Open otherwise.

    dds:trk:config    hash  "jira" / "github" -> connection JSON (token sealed)
"""

import base64
import json
import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote, urlsplit

import httpx
from redis.asyncio import Redis

from app.core.errors import ApiError
from app.core.secrets import SecretBox, SecretsUnavailableError
from app.models.user import User
from app.services.permissions import is_admin

KEY = "dds:trk:config"
KINDS = ("jira", "github")
TIMEOUT_S = 15.0
MAX_ISSUES = 500
_JIRA_KEY = re.compile(r"^[A-Z][A-Z0-9_]+-\d+$")
_GITHUB_KEY = re.compile(r"^([\w.-]+/[\w.-]+)#(\d+)$")
_REPO = re.compile(r"^[\w.-]+/[\w.-]+$")
_JIRA_SEVERITY = {
    "highest": "Blocker", "blocker": "Blocker", "high": "Critical", "critical": "Critical",
    "medium": "Major", "major": "Major", "low": "Minor", "lowest": "Minor", "minor": "Minor", "trivial": "Minor",
}  # fmt: skip


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _http_url(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, f"{field} is required.")
    value = value.strip().rstrip("/")
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.hostname or parts.username:
        raise ApiError(400, f"{field} must be an http:// or https:// URL without credentials.")
    return value


def jira_severity(priority: str | None) -> str:
    return _JIRA_SEVERITY.get((priority or "").strip().lower(), "Major")


def github_severity(labels: list[str]) -> str:
    names = " ".join(labels).lower()
    for word, severity in (("critical", "Critical"), ("major", "Major"), ("minor", "Minor")):
        if word in names:
            return severity
    return "Blocker"


class TrackerService:
    def __init__(self, redis: Redis, box: SecretBox, http: httpx.AsyncClient) -> None:
        self._redis = redis
        self._box = box
        self._http = http

    # ── configuration (admins) ─────────────────────────────────────────
    async def _get(self, kind: str) -> dict[str, Any] | None:
        raw = await self._redis.hget(KEY, kind)
        return json.loads(raw) if raw else None

    @staticmethod
    def _view(config: dict[str, Any] | None) -> dict[str, Any] | None:
        if config is None:
            return None
        return {**{k: v for k, v in config.items() if k != "token"}, "tokenSet": "token" in config}

    async def configured(self) -> dict[str, bool]:
        return {kind: (await self._get(kind)) is not None for kind in KINDS}

    async def get_config(self, user: User) -> dict[str, Any]:
        if not is_admin(user):
            return {"jira": None, "github": None, **{f"{k}Configured": v for k, v in (await self.configured()).items()}}
        return {kind: self._view(await self._get(kind)) for kind in KINDS} | {"secretsAvailable": self._box.available}

    async def save_config(self, user: User, kind: str, body: Any) -> dict[str, Any]:
        if not is_admin(user):
            raise ApiError(403, "Only admins can connect issue trackers.")
        if kind not in KINDS:
            raise ApiError(404, "Unknown tracker.")
        if not isinstance(body, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        existing = await self._get(kind) or {}
        if kind == "jira":
            deployment = body.get("deployment", "cloud")
            if deployment not in ("cloud", "server"):
                raise ApiError(400, "deployment must be cloud or server.")
            config: dict[str, Any] = {"kind": kind, "baseUrl": _http_url(body.get("baseUrl"), "baseUrl"),
                                      "deployment": deployment}  # fmt: skip
            if deployment == "cloud":
                email = body.get("email")
                if not isinstance(email, str) or "@" not in email:
                    raise ApiError(400, "email (the Atlassian account the API token belongs to) is required.")
                config["email"] = email.strip()
        else:
            config = {"kind": kind, "apiUrl": _http_url(body.get("apiUrl") or "https://api.github.com", "apiUrl")}
        token = body.get("token")
        if token is not None and not isinstance(token, str):
            raise ApiError(400, "token must be text.")
        if token:
            try:
                config["token"] = self._box.seal(token.strip(), f"tracker:{kind}:token")
            except SecretsUnavailableError as exc:
                raise ApiError(503, str(exc)) from exc
        elif "token" in existing:
            config["token"] = existing["token"]
        else:
            raise ApiError(400, "token is required.")
        config |= {"updatedBy": user.name, "updatedAt": _now()}
        await self._redis.hset(KEY, kind, json.dumps(config))
        return self._view(config)  # type: ignore[return-value]

    async def delete_config(self, user: User, kind: str) -> None:
        if not is_admin(user):
            raise ApiError(403, "Only admins can connect issue trackers.")
        if not await self._redis.hdel(KEY, kind):
            raise ApiError(404, "That tracker is not connected.")

    async def check(self, user: User, kind: str) -> dict[str, Any]:
        """Signs in and reads the current account: {ok, account | error}."""
        if not is_admin(user):
            raise ApiError(403, "Only admins can connect issue trackers.")
        try:
            if kind == "jira":
                config = await self._config("jira")
                data = await self._request(config, "GET", self._jira_api(config, "/myself"))
                return {"ok": True, "account": data.get("displayName") or data.get("name") or data.get("emailAddress")}
            config = await self._config("github")
            data = await self._request(config, "GET", f"{config['apiUrl']}/user")
            return {"ok": True, "account": data.get("login")}
        except ApiError as exc:
            return {"ok": False, "error": exc.message}

    # ── calls ──────────────────────────────────────────────────────────
    async def _config(self, kind: str) -> dict[str, Any]:
        config = await self._get(kind)
        if config is None:
            raise ApiError(400, f"{'Jira' if kind == 'jira' else 'GitHub'} is not connected (Data Management).")
        return config

    def _headers(self, config: dict[str, Any]) -> dict[str, str]:
        try:
            token = self._box.open(config["token"], f"tracker:{config['kind']}:token")
        except SecretsUnavailableError as exc:
            raise ApiError(503, str(exc)) from exc
        if config["kind"] == "github":
            return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28"}  # fmt: skip
        if config["deployment"] == "cloud":
            basic = base64.b64encode(f"{config['email']}:{token}".encode()).decode()
            return {"Authorization": f"Basic {basic}", "Accept": "application/json"}
        return {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    @staticmethod
    def _jira_api(config: dict[str, Any], path: str) -> str:
        return f"{config['baseUrl']}/rest/api/{'3' if config['deployment'] == 'cloud' else '2'}{path}"

    async def _request(self, config: dict[str, Any], method: str, url: str, **kwargs: Any) -> Any:
        name = "Jira" if config["kind"] == "jira" else "GitHub"
        try:
            res = await self._http.request(
                method, url, headers=self._headers(config), timeout=TIMEOUT_S, follow_redirects=False, **kwargs
            )
        except httpx.HTTPError as exc:
            raise ApiError(502, f"Could not reach {name} ({type(exc).__name__}).") from exc
        if res.status_code in (401, 403):
            raise ApiError(502, f"{name} rejected the credentials (HTTP {res.status_code}).")
        if res.status_code == 404:
            raise ApiError(404, f"{name} has no such issue, or the token cannot see it.")
        if res.status_code >= 400:
            detail = ""
            try:
                body = res.json()
                messages = body.get("errorMessages") or [body.get("message")]
                detail = ": " + "; ".join(m for m in messages if isinstance(m, str))[:300]
            except (ValueError, AttributeError):
                pass
            raise ApiError(502, f"{name} answered HTTP {res.status_code}{detail.rstrip(': ')}")
        try:
            return res.json()
        except ValueError as exc:
            raise ApiError(502, f"{name} returned a reply that is not JSON.") from exc

    def _jira_issue(self, config: dict[str, Any], issue: dict[str, Any]) -> dict[str, Any]:
        fields = issue.get("fields") or {}
        category = ((fields.get("status") or {}).get("statusCategory") or {}).get("key")
        return {
            "tracker": "Jira",
            "key": issue.get("key"),
            "title": (fields.get("summary") or "")[:300] or None,
            "url": f"{config['baseUrl']}/browse/{issue.get('key')}",
            "severity": jira_severity((fields.get("priority") or {}).get("name")),
            "status": "Closed" if category == "done" else "Open",
        }

    @staticmethod
    def _github_issue(repo: str, issue: dict[str, Any]) -> dict[str, Any]:
        labels = [lb.get("name", "") if isinstance(lb, dict) else str(lb) for lb in issue.get("labels") or []]
        return {
            "tracker": "GitHub",
            "key": f"{repo}#{issue.get('number')}",
            "title": (issue.get("title") or "")[:300] or None,
            "url": issue.get("html_url"),
            "severity": github_severity(labels),
            "status": "Closed" if issue.get("state") == "closed" else "Open",
        }

    async def issue(self, tracker: str, key: str) -> dict[str, Any]:
        """One issue: Jira "PROJ-123", GitHub "owner/repo#123"."""
        key = key.strip()
        if tracker == "Jira":
            if not _JIRA_KEY.match(key):
                raise ApiError(400, "A Jira key looks like PROJ-123.")
            config = await self._config("jira")
            url = self._jira_api(config, f"/issue/{quote(key)}")
            return self._jira_issue(
                config, await self._request(config, "GET", url, params={"fields": "summary,status,priority"})
            )
        match = _GITHUB_KEY.match(key)
        if not match:
            raise ApiError(400, "A GitHub key looks like owner/repo#123.")
        config = await self._config("github")
        repo, number = match.groups()
        data = await self._request(config, "GET", f"{config['apiUrl']}/repos/{repo}/issues/{number}")
        return self._github_issue(repo, data)

    async def search(self, query: dict[str, Any]) -> list[dict[str, Any]]:
        """Issues a release's blocker query matches (at most MAX_ISSUES per tracker)."""
        found: list[dict[str, Any]] = []
        jql = (query.get("jira") or {}).get("jql")
        if jql:
            config = await self._config("jira")
            if config["deployment"] == "cloud":  # the enhanced search API; pages by token
                token: str | None = None
                while len(found) < MAX_ISSUES:
                    body: dict[str, Any] = {"jql": jql, "fields": ["summary", "status", "priority"], "maxResults": 100}
                    if token:
                        body["nextPageToken"] = token
                    data = await self._request(config, "POST", self._jira_api(config, "/search/jql"), json=body)
                    found += [self._jira_issue(config, i) for i in data.get("issues") or []]
                    token = data.get("nextPageToken")
                    if not token or data.get("isLast"):
                        break
            else:
                start = 0
                while len(found) < MAX_ISSUES:
                    body = {
                        "jql": jql,
                        "fields": ["summary", "status", "priority"],
                        "startAt": start,
                        "maxResults": 100,
                    }
                    data = await self._request(config, "POST", self._jira_api(config, "/search"), json=body)
                    issues = data.get("issues") or []
                    found += [self._jira_issue(config, i) for i in issues]
                    start += len(issues)
                    if not issues or start >= data.get("total", 0):
                        break
        gh = query.get("github") or {}
        if gh.get("repo"):
            config = await self._config("github")
            repo, label = gh["repo"], gh.get("label") or "release-blocker"
            page, count = 1, 0
            while count < MAX_ISSUES:
                data = await self._request(
                    config, "GET", f"{config['apiUrl']}/repos/{repo}/issues",
                    params={"labels": label, "state": "open", "per_page": 100, "page": page},
                )  # fmt: skip
                if not isinstance(data, list) or not data:
                    break
                issues = [i for i in data if isinstance(i, dict) and "pull_request" not in i]
                found += [self._github_issue(repo, i) for i in issues]
                count += len(data)
                if len(data) < 100:
                    break
                page += 1
        return found


def blocker_query(raw: Any, existing: Any) -> dict[str, Any] | None:
    """Validates a release's blockerQuery: {"jira": {"jql"}, "github": {"repo", "label"}};
    absent keeps the existing one, null clears it."""
    if raw is None:
        return existing if isinstance(existing, dict) or existing is None else None
    if raw == {} or raw is False:
        return None
    if not isinstance(raw, dict):
        raise ApiError(400, "blockerQuery must be an object.")
    out: dict[str, Any] = {}
    jira = raw.get("jira")
    if isinstance(jira, dict) and isinstance(jira.get("jql"), str) and jira["jql"].strip():
        if len(jira["jql"]) > 2000:
            raise ApiError(400, "blockerQuery.jira.jql must be at most 2000 characters.")
        out["jira"] = {"jql": jira["jql"].strip()}
    gh = raw.get("github")
    if isinstance(gh, dict) and isinstance(gh.get("repo"), str) and gh["repo"].strip():
        repo = gh["repo"].strip()
        if not _REPO.match(repo):
            raise ApiError(400, "blockerQuery.github.repo must look like owner/repo.")
        label = gh.get("label") if isinstance(gh.get("label"), str) and gh["label"].strip() else "release-blocker"
        out["github"] = {"repo": repo, "label": label.strip()[:100]}
    return out or None
