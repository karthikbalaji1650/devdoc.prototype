"""JWT access tokens and single sign-on over OpenID Connect (DDS-SRS-076)."""

import base64
import json
import os
import time
from collections.abc import Iterator
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import jwt
import pytest
import respx
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.security import SESSION_COOKIE
from tests.conftest import ADMIN, OTHER, Api, make_api, test_settings

KEY = base64.b64encode(os.urandom(32)).decode()
IDP = "https://idp.example.com/realms/acme"
CLIENT = "devdoc-studio"
CALLBACK = "http://api.test/api/auth/sso/callback"
LANDING = "http://app.test/"

PRIVATE = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_PRIVATE = rsa.generate_private_key(public_exponent=65537, key_size=2048)
JWK = {
    **json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(PRIVATE.public_key())),
    "kid": "k1",
    "use": "sig",
    "alg": "RS256",
}


# ── JWT access tokens ────────────────────────────────────────────────


@pytest.fixture
def jwt_api() -> Iterator[Api]:
    yield from make_api(test_settings(secrets_key=KEY))


def token_for(api: Api) -> tuple[str, Any]:
    agent = api.sign_in(ADMIN)
    res = agent.post("/api/auth/token")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["tokenType"] == "Bearer" and body["expiresIn"] == 3600
    return body["accessToken"], agent


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_a_jwt_works_on_any_route_until_the_session_ends(jwt_api: Api) -> None:
    token, agent = token_for(jwt_api)
    claims = jwt.decode(token, options={"verify_signature": False})
    assert claims["iss"] == "devdoc-studio" and claims["aud"] == "devdoc-studio-api" and claims["sub"] == ADMIN.id
    client = jwt_api.client
    assert client.get("/api/auth/me", headers=bearer(token)).json()["user"]["email"] == ADMIN.email
    assert client.get("/api/documents", headers=bearer(token)).status_code == 200
    assert agent.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me", headers=bearer(token)).status_code == 401  # revoked with the session


def test_tampered_expired_and_foreign_tokens_are_refused(jwt_api: Api) -> None:
    token, _ = token_for(jwt_api)
    claims = jwt.decode(token, options={"verify_signature": False})
    head, body, sig = token.split(".")
    forged = jwt.encode({**claims, "sub": OTHER.id}, "x" * 32, algorithm="HS256")
    expired = jwt.encode(
        {**claims, "exp": int(time.time()) - 10}, "irrelevant-key-of-enough-length!", algorithm="HS256"
    )
    none_alg = jwt.encode({**claims}, None, algorithm="none")
    for bad in (f"{head}.{body}.{sig[:-2]}AA", forged, expired, none_alg, "not-a-jwt"):
        assert jwt_api.client.get("/api/auth/me", headers=bearer(bad)).status_code == 401, bad


def test_a_token_needs_a_session_and_a_key(jwt_api: Api, api: Api) -> None:
    assert jwt_api.anonymous().post("/api/auth/token").status_code == 401
    res = api.sign_in(ADMIN).post("/api/auth/token")  # no JWT_SECRET, no SECRETS_KEY
    assert res.status_code == 501 and "JWT_SECRET" in res.json()["error"]


def test_a_jwt_is_not_a_ci_token_and_a_ci_token_is_not_a_jwt(jwt_api: Api) -> None:
    token, agent = token_for(jwt_api)
    assert jwt_api.client.post("/api/ci/runs", json={}, headers=bearer(token)).status_code == 401
    ci = agent.post("/api/ci/tokens", json={"name": "x"}).json()["token"]
    assert jwt_api.client.get("/api/auth/me", headers=bearer(ci)).status_code == 401


def test_jwt_secret_takes_precedence_and_must_be_long_enough() -> None:
    from app.services.tokens import signing_key

    assert signing_key("s" * 32, KEY) == b"s" * 32
    assert signing_key("short", KEY) is None
    assert len(signing_key("", KEY) or b"") == 32
    assert signing_key("", "") is None


# ── single sign-on ───────────────────────────────────────────────────


@pytest.fixture
def sso_api() -> Iterator[Api]:
    yield from make_api(
        test_settings(
            oidc_issuer=IDP, oidc_client_id=CLIENT, oidc_client_secret="client-secret",
            oidc_redirect_uri=CALLBACK, oidc_provider_name="Keycloak", oidc_post_login_url=LANDING,
        )
    )  # fmt: skip


class Idp:
    """A fake OpenID provider: discovery, JWKS, and a token endpoint that
    returns whatever ID token the test sets up."""

    def __init__(self, router: respx.MockRouter) -> None:
        self.claims: dict[str, Any] = {}
        self.key = PRIVATE
        self.token_requests: list[dict[str, list[str]]] = []
        router.get(f"{IDP}/.well-known/openid-configuration").mock(
            return_value=httpx.Response(
                200,
                json={
                    "issuer": IDP,
                    "authorization_endpoint": f"{IDP}/protocol/openid-connect/auth",
                    "token_endpoint": f"{IDP}/protocol/openid-connect/token",
                    "jwks_uri": f"{IDP}/certs",
                },
            )
        )
        router.get(f"{IDP}/certs").mock(return_value=httpx.Response(200, json={"keys": [JWK]}))
        router.post(f"{IDP}/protocol/openid-connect/token").mock(side_effect=self._token)

    def _token(self, request: httpx.Request) -> httpx.Response:
        self.token_requests.append(parse_qs(request.content.decode()))
        now = int(time.time())
        claims = {"iss": IDP, "aud": CLIENT, "sub": "kc-123", "iat": now, "exp": now + 300, **self.claims}
        id_token = jwt.encode(claims, self.key, algorithm="RS256", headers={"kid": "k1"})
        return httpx.Response(200, json={"id_token": id_token, "access_token": "at", "token_type": "Bearer"})


@pytest.fixture
def idp() -> Iterator[Idp]:
    with respx.mock(assert_all_called=False) as router:
        yield Idp(router)


def start_login(api: Api) -> tuple[dict[str, list[str]], str]:
    res = api.client.get("/api/auth/sso/login", follow_redirects=False)
    assert res.status_code == 302, res.text
    location = urlsplit(res.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == f"{IDP}/protocol/openid-connect/auth"
    cookie = res.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=Lax" in cookie and "Path=/api/auth/sso" in cookie
    return parse_qs(location.query), cookie.split(";")[0].split("=", 1)[1]


def callback(api: Api, state: str, cookie_state: str | None, code: str = "auth-code", **extra: str) -> httpx.Response:
    headers = {"Cookie": f"devdoc_sso_state={cookie_state}"} if cookie_state else {}
    api.client.cookies.clear()
    return api.client.get(
        "/api/auth/sso/callback",
        params={"state": state, "code": code, **extra},
        headers=headers,
        follow_redirects=False,
    )


def landing_error(res: httpx.Response) -> str | None:
    assert res.status_code == 302 and res.headers["location"].startswith(LANDING)
    return parse_qs(urlsplit(res.headers["location"]).query).get("sso_error", [None])[0]


def test_config(sso_api: Api, api: Api) -> None:
    assert sso_api.client.get("/api/auth/sso/config").json() == {"enabled": True, "providerName": "Keycloak"}
    assert api.client.get("/api/auth/sso/config").json() == {"enabled": False, "providerName": None}
    assert api.client.get("/api/auth/sso/login", follow_redirects=False).status_code == 404


def test_a_full_sign_in_with_pkce_state_and_nonce(sso_api: Api, idp: Idp) -> None:
    query, state = start_login(sso_api)
    assert query["client_id"] == [CLIENT] and query["redirect_uri"] == [CALLBACK]
    assert query["response_type"] == ["code"] and query["code_challenge_method"] == ["S256"]
    assert query["state"] == [state] and query["scope"] == ["openid email profile"]
    idp.claims = {"email": ADMIN.email.upper(), "email_verified": True, "nonce": query["nonce"][0]}

    res = callback(sso_api, state, state)
    assert landing_error(res) is None and res.headers["location"] == f"{LANDING}?sso=1"
    cookies = res.headers.get_list("set-cookie")
    session = next(c for c in cookies if c.startswith(f"{SESSION_COOKIE}="))
    assert "HttpOnly" in session
    session_id = session.split(";")[0].split("=", 1)[1]
    me = sso_api.client.get("/api/auth/me", headers={"Cookie": f"{SESSION_COOKIE}={session_id}"})
    assert me.json()["user"]["email"] == ADMIN.email

    # PKCE: the verifier sent matches the challenge in the authorize request.
    import hashlib

    verifier = idp.token_requests[-1]["code_verifier"][0]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    assert challenge == query["code_challenge"][0]
    assert idp.token_requests[-1]["client_secret"] == ["client-secret"]

    # The sign-in is in the session audit log like any other.
    audit = sso_api.sign_in(ADMIN).get("/api/audit/sessions").json()["sessions"]
    assert any(s["userName"] == ADMIN.name for s in audit)

    # The state is single use.
    assert "expired or was already used" in (landing_error(callback(sso_api, state, state)) or "")


@pytest.mark.parametrize(
    ("setup", "message"),
    [
        (
            lambda q, idp: setattr(idp, "claims", {"email": "nobody@example.com", "nonce": q["nonce"][0]}),
            "no DevDoc Studio account",
        ),
        (
            lambda q, idp: setattr(
                idp, "claims", {"email": ADMIN.email, "email_verified": False, "nonce": q["nonce"][0]}
            ),
            "not verified",
        ),
        (
            lambda q, idp: setattr(idp, "claims", {"email": ADMIN.email, "nonce": "someone-elses"}),
            "does not belong to this sign-in",
        ),
        (
            lambda q, idp: setattr(idp, "claims", {"email": ADMIN.email, "nonce": q["nonce"][0], "aud": "other-app"}),
            "InvalidAudienceError",
        ),
        (
            lambda q, idp: setattr(
                idp, "claims", {"email": ADMIN.email, "nonce": q["nonce"][0], "iss": "https://evil.example"}
            ),
            "InvalidIssuerError",
        ),
        (
            lambda q, idp: setattr(idp, "claims", {"email": ADMIN.email, "nonce": q["nonce"][0], "exp": 1}),
            "ExpiredSignatureError",
        ),
        (
            lambda q, idp: (
                setattr(idp, "key", OTHER_PRIVATE),
                setattr(idp, "claims", {"email": ADMIN.email, "nonce": q["nonce"][0]}),
            ),
            "InvalidSignatureError",
        ),
        (lambda q, idp: setattr(idp, "claims", {"sub": "x", "nonce": q["nonce"][0]}), "did not share an email"),
    ],
)
def test_sign_ins_that_are_refused(sso_api: Api, idp: Idp, setup: Any, message: str) -> None:
    query, state = start_login(sso_api)
    setup(query, idp)
    error = landing_error(callback(sso_api, state, state))
    assert error is not None and message in error, error
    assert not any(
        c.startswith(f"{SESSION_COOKIE}=") for c in callback(sso_api, state, state).headers.get_list("set-cookie")
    )


def test_a_reply_from_another_browser_is_refused(sso_api: Api, idp: Idp) -> None:
    _, state = start_login(sso_api)
    assert "not started in this browser" in (landing_error(callback(sso_api, state, None)) or "")
    assert "not started in this browser" in (landing_error(callback(sso_api, state, "other")) or "")


def test_a_provider_error_is_shown(sso_api: Api) -> None:
    res = sso_api.client.get(
        "/api/auth/sso/callback",
        params={"error": "access_denied", "error_description": "User cancelled"},
        follow_redirects=False,
    )
    assert landing_error(res) == "User cancelled"
