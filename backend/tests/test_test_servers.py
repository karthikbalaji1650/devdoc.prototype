"""Remote test servers (DDS-SRS-019) with credentials encrypted at rest (DDS-SRS-075)."""

import base64
import json
import os
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
import respx

from app.core.secrets import SecretBox, SecretsUnavailableError
from tests.conftest import ADMIN, AUTHOR, Api, make_api, test_settings

BASE = "/api/test-servers"
KEY = base64.b64encode(os.urandom(32)).decode()
ENDPOINT = "https://testpc.example.com/api/v1/health"
SECRET = "super-secret-api-key-123"


@pytest.fixture
def keyed_api() -> Iterator[Api]:
    yield from make_api(test_settings(secrets_key=KEY))


@pytest.fixture
def mock_http() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        yield router


def server(**overrides: Any) -> dict[str, Any]:
    return {
        "name": "Lab Test PC 1",
        "endpointUrl": ENDPOINT,
        "authType": "apiKey",
        "auth": {"headerName": "X-API-Key", "apiKey": SECRET},
        "payload": {"bmcIp": "192.168.1.100", "retries": 2},
        **overrides,
    }


def create(api: Api, **overrides: Any) -> dict[str, Any]:
    res = api.sign_in(ADMIN).post(BASE, json=server(**overrides))
    assert res.status_code == 200, res.text
    return res.json()["server"]


class TestSecretBox:
    def test_round_trip_and_context_binding(self) -> None:
        box = SecretBox(KEY)
        sealed = box.seal("hello", "ctx-a")
        assert sealed["alg"] == "A256GCM" and "hello" not in json.dumps(sealed)
        assert box.open(sealed, "ctx-a") == "hello"
        with pytest.raises(SecretsUnavailableError):
            box.open(sealed, "ctx-b")  # copied into another record or field

    def test_wrong_key_is_reported(self) -> None:
        sealed = SecretBox(KEY).seal("hello", "ctx")
        other = base64.b64encode(os.urandom(32)).decode()
        with pytest.raises(SecretsUnavailableError, match="different SECRETS_KEY"):
            SecretBox(other).open(sealed, "ctx")

    @pytest.mark.parametrize("key", ["", "not-base64!!", base64.b64encode(b"short").decode()])
    def test_unusable_keys(self, key: str) -> None:
        box = SecretBox(key)
        assert not box.available and box.problem
        with pytest.raises(SecretsUnavailableError):
            box.seal("x", "ctx")


class TestRegistration:
    def test_admin_registers_a_server_and_the_secret_is_never_returned(self, keyed_api: Api) -> None:
        created = create(keyed_api)
        assert created["name"] == "Lab Test PC 1"
        assert created["endpointUrl"] == ENDPOINT
        assert created["auth"] == {"headerName": "X-API-Key"}
        assert created["payload"] == {"bmcIp": "192.168.1.100", "retries": 2}
        assert created["secretSet"] is True
        assert "secrets" not in created and SECRET not in json.dumps(created)

        listed = keyed_api.sign_in(ADMIN).get(BASE).json()
        assert listed["secretsAvailable"] is True
        assert [s["id"] for s in listed["servers"]] == [created["id"]]
        assert SECRET not in json.dumps(listed)

    def test_secret_is_encrypted_in_storage_and_in_the_backup(self, keyed_api: Api) -> None:
        create(keyed_api)
        backup = keyed_api.sign_in(ADMIN).get("/api/admin/backup")
        assert backup.status_code == 200
        assert "dds:tsrv:servers" in backup.text
        assert SECRET not in backup.text
        stored = json.loads(next(iter(backup.json()["redis"]["dds:tsrv:servers"]["value"].values())))
        assert stored["secrets"]["apiKey"]["alg"] == "A256GCM"

    def test_non_admins_can_list_but_not_change(self, keyed_api: Api) -> None:
        created = create(keyed_api)
        manager = keyed_api.sign_in(AUTHOR)
        assert manager.get(BASE).json()["servers"] == [
            {"id": created["id"], "name": "Lab Test PC 1", "endpointUrl": ENDPOINT}
        ]
        assert manager.post(BASE, json=server()).status_code == 403
        assert manager.put(f"{BASE}/{created['id']}", json=server()).status_code == 403
        assert manager.delete(f"{BASE}/{created['id']}").status_code == 403
        assert manager.post(f"{BASE}/{created['id']}/check").status_code == 403

    def test_requires_sign_in(self, keyed_api: Api) -> None:
        assert keyed_api.anonymous().get(BASE).status_code == 401

    def test_edit_without_the_secret_keeps_the_stored_one(self, keyed_api: Api, mock_http: respx.MockRouter) -> None:
        created = create(keyed_api)
        admin = keyed_api.sign_in(ADMIN)
        res = admin.put(f"{BASE}/{created['id']}", json=server(name="Renamed", auth={"headerName": "X-Token"}))
        assert res.status_code == 200, res.text
        assert res.json()["server"]["name"] == "Renamed" and res.json()["server"]["secretSet"] is True
        route = mock_http.get(ENDPOINT).mock(return_value=httpx.Response(200))
        assert admin.post(f"{BASE}/{created['id']}/check").json()["ok"] is True
        assert route.calls.last.request.headers["X-Token"] == SECRET

    def test_switching_auth_method_needs_the_new_secret(self, keyed_api: Api) -> None:
        created = create(keyed_api)
        res = keyed_api.sign_in(ADMIN).put(
            f"{BASE}/{created['id']}", json=server(authType="basic", auth={"username": "qa"})
        )
        assert res.status_code == 400 and "password" in res.json()["error"]

    def test_delete(self, keyed_api: Api) -> None:
        created = create(keyed_api)
        admin = keyed_api.sign_in(ADMIN)
        assert admin.delete(f"{BASE}/{created['id']}").status_code == 204
        assert admin.get(BASE).json()["servers"] == []
        assert admin.delete(f"{BASE}/{created['id']}").status_code == 404

    @pytest.mark.parametrize(
        ("overrides", "message"),
        [
            ({"name": ""}, "name is required"),
            ({"endpointUrl": "ftp://x"}, "http:// or https://"),
            ({"endpointUrl": "https://user:pw@host/x"}, "must not contain credentials"),
            ({"authType": "kerberos"}, "authType must be one of"),
            ({"auth": {"headerName": "bad header", "apiKey": "k"}}, "valid HTTP header"),
            ({"auth": {}}, "apiKey is required"),
            ({"authType": "basic", "auth": {"password": "p"}}, "username is required"),
            ({"authType": "oauth2", "auth": {"clientId": "c", "clientSecret": "s"}}, "tokenUrl is required"),
            ({"payload": ["not", "an", "object"]}, "payload must be a JSON object"),
            ({"payload": {"x": "y" * 20_000}}, "payload must be at most"),
        ],
    )
    def test_validation(self, keyed_api: Api, overrides: dict[str, Any], message: str) -> None:
        res = keyed_api.sign_in(ADMIN).post(BASE, json=server(**overrides))
        assert res.status_code == 400
        assert message in res.json()["error"]

    def test_without_secrets_key_only_credential_free_servers_can_be_saved(self, api: Api) -> None:
        admin = api.sign_in(ADMIN)
        res = admin.post(BASE, json=server())
        assert res.status_code == 503 and "SECRETS_KEY" in res.json()["error"]
        res = admin.post(BASE, json=server(authType="none", auth={}))
        assert res.status_code == 200
        assert admin.get(BASE).json()["secretsAvailable"] is False


class TestConnectionCheck:
    def test_api_key(self, keyed_api: Api, mock_http: respx.MockRouter) -> None:
        created = create(keyed_api)
        route = mock_http.get(ENDPOINT).mock(return_value=httpx.Response(200, text="private body"))
        result = keyed_api.sign_in(ADMIN).post(f"{BASE}/{created['id']}/check").json()
        assert result["ok"] is True and result["status"] == 200 and result["error"] is None
        assert isinstance(result["latencyMs"], int)
        assert "private body" not in json.dumps(result)
        assert route.calls.last.request.headers["X-API-Key"] == SECRET

    def test_basic(self, keyed_api: Api, mock_http: respx.MockRouter) -> None:
        created = create(keyed_api, authType="basic", auth={"username": "qa", "password": "pw"})
        route = mock_http.get(ENDPOINT).mock(return_value=httpx.Response(204))
        assert keyed_api.sign_in(ADMIN).post(f"{BASE}/{created['id']}/check").json()["ok"] is True
        assert route.calls.last.request.headers["Authorization"] == "Basic " + base64.b64encode(b"qa:pw").decode()

    def test_oauth2_client_credentials(self, keyed_api: Api, mock_http: respx.MockRouter) -> None:
        token_url = "https://auth.example.com/oauth/token"
        created = create(
            keyed_api,
            authType="oauth2",
            auth={"tokenUrl": token_url, "clientId": "devdoc", "clientSecret": "cs", "scope": "runs"},
        )
        token = mock_http.post(token_url).mock(return_value=httpx.Response(200, json={"access_token": "tok-1"}))
        route = mock_http.get(ENDPOINT).mock(return_value=httpx.Response(200))
        assert keyed_api.sign_in(ADMIN).post(f"{BASE}/{created['id']}/check").json()["ok"] is True
        form = token.calls.last.request.content.decode()
        assert "grant_type=client_credentials" in form and "client_secret=cs" in form and "scope=runs" in form
        assert route.calls.last.request.headers["Authorization"] == "Bearer tok-1"

    def test_oauth2_without_a_token(self, keyed_api: Api, mock_http: respx.MockRouter) -> None:
        token_url = "https://auth.example.com/oauth/token"
        created = create(
            keyed_api, authType="oauth2", auth={"tokenUrl": token_url, "clientId": "c", "clientSecret": "s"}
        )
        mock_http.post(token_url).mock(return_value=httpx.Response(401, json={"error": "invalid_client"}))
        result = keyed_api.sign_in(ADMIN).post(f"{BASE}/{created['id']}/check").json()
        assert result["ok"] is False and "access token" in result["error"]

    def test_rejected_credentials(self, keyed_api: Api, mock_http: respx.MockRouter) -> None:
        created = create(keyed_api)
        mock_http.get(ENDPOINT).mock(return_value=httpx.Response(401))
        result = keyed_api.sign_in(ADMIN).post(f"{BASE}/{created['id']}/check").json()
        assert result == {**result, "ok": False, "status": 401}
        assert "rejected the credentials" in result["error"]

    def test_unreachable(self, keyed_api: Api, mock_http: respx.MockRouter) -> None:
        created = create(keyed_api)
        mock_http.get(ENDPOINT).mock(side_effect=httpx.ConnectError("refused"))
        result = keyed_api.sign_in(ADMIN).post(f"{BASE}/{created['id']}/check").json()
        assert result["ok"] is False and result["status"] is None and "ConnectError" in result["error"]

    def test_unknown_server(self, keyed_api: Api) -> None:
        assert keyed_api.sign_in(ADMIN).post(f"{BASE}/nope/check").status_code == 404
