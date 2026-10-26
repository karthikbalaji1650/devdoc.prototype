import re

from tests.conftest import ADMIN, AUTHOR, TEST_USERS, Api, make_api, test_settings


def login(api: Api, email: str, password: str):
    return api.client.post("/api/auth/login", json={"email": email, "password": password})


class TestLogin:
    def test_signs_in_with_the_right_password_and_sets_a_session_cookie(self, api: Api) -> None:
        res = login(api, ADMIN.email, ADMIN.password)
        assert res.status_code == 200
        user = res.json()["user"]
        assert {k: user[k] for k in ("id", "name", "role")} == {
            "id": "usr-01",
            "name": "Manivannan Thangavel",
            "role": "admin",
        }
        assert "password_hash" not in user
        assert re.match(r"devdoc_sid=.+HttpOnly", res.headers["set-cookie"])

    def test_returns_the_user_with_every_field_in_node_order(self, api: Api) -> None:
        user = login(api, ADMIN.email, ADMIN.password).json()["user"]
        assert list(user) == ["id", "name", "email", "title", "department", "role", "avatarBg", "initials"]

    def test_secure_attribute_is_off_by_default_for_plain_http_deployments(self, api: Api) -> None:
        # Regression carried over from Node: Secure tied to NODE_ENV broke
        # login on the plain-HTTP docker-compose demo.
        assert "Secure" not in login(api, ADMIN.email, ADMIN.password).headers["set-cookie"]

    def test_secure_attribute_is_set_when_cookie_secure_is_exactly_true(self) -> None:
        for api in make_api(test_settings(cookie_secure="true")):
            assert "; Secure" in login(api, ADMIN.email, ADMIN.password).headers["set-cookie"]
        for api in make_api(test_settings(cookie_secure="1")):
            assert "Secure" not in login(api, ADMIN.email, ADMIN.password).headers["set-cookie"]

    def test_cookie_attributes_match_express(self, api: Api) -> None:
        cookie = login(api, ADMIN.email, ADMIN.password).headers["set-cookie"]
        assert re.fullmatch(
            r"devdoc_sid=[0-9a-f]{64}; Max-Age=43200; Path=/; Expires=\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT; "
            r"HttpOnly; SameSite=Lax",
            cookie,
        )

    def test_matches_email_case_insensitively_and_trims_it(self, api: Api) -> None:
        assert login(api, f"  {ADMIN.email.upper()}\u00a0", ADMIN.password).status_code == 200

    def test_rejects_a_wrong_password_with_the_same_message_as_an_unknown_email(self, api: Api) -> None:
        wrong = login(api, ADMIN.email, "nope")
        unknown = login(api, "nobody@example.com", "nope")
        assert wrong.status_code == unknown.status_code == 401
        assert wrong.json() == unknown.json() == {"error": "Invalid email or password."}

    def test_rejects_a_missing_email_or_password(self, api: Api) -> None:
        for body in ({"password": "x"}, {"email": "x@example.com"}, {"email": 5, "password": "x"}, []):
            res = api.client.post("/api/auth/login", json=body)
            assert res.status_code == 400
            assert res.json() == {"error": "Email and password are required."}

    def test_non_json_body_is_treated_as_empty(self, api: Api) -> None:
        res = api.client.post(
            "/api/auth/login",
            content="email=a&password=b",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert res.status_code == 400


class TestSession:
    def test_me_identifies_the_signed_in_user(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        res = agent.get("/api/auth/me")
        assert res.status_code == 200
        assert res.json()["user"]["name"] == "Vaishnavi Aasaithambi"

    def test_me_is_401_without_a_session(self, api: Api) -> None:
        res = api.anonymous().get("/api/auth/me")
        assert res.status_code == 401
        assert res.json() == {"error": "Not signed in."}

    def test_logout_invalidates_the_session_immediately(self, api: Api) -> None:
        agent = api.sign_in(ADMIN)
        res = agent.post("/api/auth/logout")
        assert res.status_code == 204
        assert res.content == b""
        assert res.headers["set-cookie"] == "devdoc_sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
        # Replaying the old cookie proves the server-side session is gone.
        assert agent.get("/api/auth/me").status_code == 401

    def test_logout_without_a_session_still_succeeds(self, api: Api) -> None:
        assert api.anonymous().post("/api/auth/logout").status_code == 204

    def test_a_made_up_session_id_is_rejected(self, api: Api) -> None:
        res = api.client.get("/api/auth/me", headers={"Cookie": "devdoc_sid=not-a-real-session"})
        assert res.status_code == 401

    def test_first_duplicate_cookie_wins_like_cookie_parser(self, api: Api) -> None:
        agent = api.sign_in(ADMIN)
        good = f"devdoc_sid={agent.session_id}"
        assert api.client.get("/api/auth/me", headers={"Cookie": f"{good}; devdoc_sid=bogus"}).status_code == 200
        assert api.client.get("/api/auth/me", headers={"Cookie": f"devdoc_sid=bogus; {good}"}).status_code == 401

    def test_json_cookie_prefix_is_understood(self, api: Api) -> None:
        agent = api.sign_in(ADMIN)
        cookie = f'devdoc_sid=j:"{agent.session_id}"'
        assert api.client.get("/api/auth/me", headers={"Cookie": cookie}).status_code == 200

    def test_all_three_demo_users_can_sign_in(self, api: Api) -> None:
        for user in TEST_USERS:
            assert login(api, user.email, user.password).status_code == 200
