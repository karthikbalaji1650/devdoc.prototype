from tests.conftest import ADMIN, AUTHOR, Api


def attempt(api: Api, email: str, password: str):
    return api.client.post("/api/auth/login", json={"email": email, "password": password})


def test_blocks_further_attempts_after_repeated_failures_but_not_early(api: Api) -> None:
    last = None
    for _ in range(10):
        last = attempt(api, ADMIN.email, "wrong")
    assert last is not None and last.status_code == 401  # the 10th failure is still a normal rejection

    blocked = attempt(api, ADMIN.email, ADMIN.password)
    assert blocked.status_code == 429
    assert blocked.json() == {"error": "Too many sign-in attempts. Try again in a few minutes."}
    assert blocked.headers["ratelimit-remaining"] == "0"
    assert 0 < int(blocked.headers["retry-after"]) <= 900


def test_does_not_count_a_successful_login_against_the_limit(api: Api) -> None:
    for _ in range(9):
        attempt(api, AUTHOR.email, "wrong")
    assert attempt(api, AUTHOR.email, AUTHOR.password).status_code == 200  # 10th attempt, correct
    assert attempt(api, AUTHOR.email, "wrong").status_code == 401  # the success was refunded


def test_sends_draft_6_headers_on_every_login_response(api: Api) -> None:
    first = attempt(api, ADMIN.email, "wrong")
    assert first.headers["ratelimit-policy"] == "10;w=900"
    assert first.headers["ratelimit-limit"] == "10"
    assert first.headers["ratelimit-remaining"] == "9"
    assert first.headers["ratelimit-reset"] == "900"
    assert "retry-after" not in first.headers
    assert "x-ratelimit-limit" not in first.headers  # legacyHeaders: false


def test_only_the_login_route_is_limited(api: Api) -> None:
    assert "ratelimit-limit" not in api.client.get("/api/auth/me").headers
