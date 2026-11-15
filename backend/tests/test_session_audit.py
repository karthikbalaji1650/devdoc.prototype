"""DDS-SRS-011: the server records every sign-in. Admins read everyone's;
everyone else reads only their own."""

from datetime import UTC, datetime, timedelta

from app.core.security import SESSION_COOKIE
from tests.conftest import ADMIN, AUTHOR, OTHER, Api

URL = "/api/audit/sessions"


def test_needs_a_session(api: Api) -> None:
    assert api.anonymous().get(URL).status_code == 401


def test_a_non_admin_sees_only_their_own_sign_ins(api: Api) -> None:
    first = api.sign_in(AUTHOR)
    api.sign_in(OTHER)
    api.sign_in(ADMIN)
    assert first.post("/api/auth/logout").status_code == 204
    author = api.sign_in(AUTHOR)

    res = author.get(URL)
    assert res.status_code == 200
    sessions = res.json()["sessions"]
    assert [(s["userName"], s["status"]) for s in sessions] == [(AUTHOR.name, "active"), (AUTHOR.name, "signed-out")]
    assert {s["userId"] for s in sessions} == {AUTHOR.id}


def test_an_admin_still_sees_everyone(api: Api) -> None:
    api.sign_in(AUTHOR)
    api.sign_in(OTHER)
    names = [s["userName"] for s in api.sign_in(ADMIN).get(URL).json()["sessions"]]
    assert names == [ADMIN.name, OTHER.name, AUTHOR.name]


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
    for entry in api.store.session_audit:  # move the sign-in's expiry into the past
        entry["expiresAt"] = (datetime.now(UTC) - timedelta(minutes=1)).isoformat().replace("+00:00", "Z")
    sessions = api.sign_in(ADMIN).get(URL).json()["sessions"]
    assert {s["userName"]: s["status"] for s in sessions}[AUTHOR.name] == "expired"


def test_nothing_is_ever_trimmed(api: Api) -> None:
    """The Redis store dropped everything past the newest 1,000 entries."""
    for _ in range(1005):
        api.client.post("/api/auth/login", json={"email": AUTHOR.email, "password": AUTHOR.password})
    api.client.cookies.clear()
    assert len(api.store.session_audit) == 1005
