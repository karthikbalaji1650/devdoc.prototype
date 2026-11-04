"""DDS-SRS-011: the server records every sign-in; only admins can read it."""

import json
from datetime import UTC, datetime, timedelta

from app.core.security import SESSION_COOKIE
from tests.conftest import ADMIN, AUTHOR, OTHER, Api

URL = "/api/audit/sessions"


def test_needs_a_session_and_an_admin(api: Api) -> None:
    assert api.anonymous().get(URL).status_code == 401
    res = api.sign_in(AUTHOR).get(URL)
    assert res.status_code == 403
    assert res.json() == {"error": "Only admins can view the session audit log."}


def test_logins_and_logouts_are_recorded_newest_first(api: Api) -> None:
    author = api.sign_in(AUTHOR)
    other = api.sign_in(OTHER)
    assert author.post("/api/auth/logout").status_code == 204

    sessions = api.sign_in(ADMIN).get(URL).json()["sessions"]
    assert [s["userName"] for s in sessions] == [ADMIN.name, OTHER.name, AUTHOR.name]
    by_name = {s["userName"]: s for s in sessions}
    assert by_name[AUTHOR.name]["status"] == "signed-out"
    assert by_name[AUTHOR.name]["logoutTime"] is not None
    assert by_name[OTHER.name]["status"] == "active"
    assert by_name[OTHER.name]["logoutTime"] is None
    assert by_name[OTHER.name]["role"] == OTHER.role
    assert other.session_id not in str(sessions)  # the session id itself is never exposed


def test_a_failed_login_or_unknown_logout_records_nothing(api: Api) -> None:
    api.client.post("/api/auth/login", json={"email": AUTHOR.email, "password": "wrong"})
    api.client.post("/api/auth/logout", headers={"Cookie": f"{SESSION_COOKIE}=not-a-session"})
    assert [s["userName"] for s in api.sign_in(ADMIN).get(URL).json()["sessions"]] == [ADMIN.name]


def test_a_session_that_timed_out_shows_as_expired(api: Api) -> None:
    api.sign_in(AUTHOR)
    redis = api.client.app.state.services.session_audit._redis  # type: ignore[attr-defined]

    async def expire() -> None:
        for entry_id, raw in (await redis.hgetall("dds:audit:sessions")).items():
            entry = json.loads(raw)
            entry["expiresAt"] = (datetime.now(UTC) - timedelta(minutes=1)).isoformat().replace("+00:00", "Z")
            await redis.hset("dds:audit:sessions", entry_id, json.dumps(entry))

    api.client.portal.call(expire)  # type: ignore[union-attr]
    sessions = api.sign_in(ADMIN).get(URL).json()["sessions"]
    assert {s["userName"]: s["status"] for s in sessions}[AUTHOR.name] == "expired"
