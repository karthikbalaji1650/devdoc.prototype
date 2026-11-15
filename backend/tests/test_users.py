"""The user picker's search (releases: choosing sign-off people).

Any signed-in user can search. Only id, name, title and department are
returned - never an email, role or password.
"""

from app.models.user import User
from tests.conftest import AUTHOR, OTHER, Api

URL = "/api/users"


def _add(api: Api, user_id: str, name: str, title: str | None, department: str | None) -> None:
    api.store.add_user(User(user_id, name, f"{user_id}@sanmina.com", title, department, "user", None, None), "pw")


def test_needs_a_session(api: Api) -> None:
    assert api.anonymous().get(URL).status_code == 401


def test_without_a_search_lists_people_by_name(api: Api) -> None:
    res = api.sign_in(AUTHOR).get(URL)
    assert res.status_code == 200
    names = [u["name"] for u in res.json()["users"]]
    assert names == sorted(names, key=str.lower)
    assert len(names) == 3


def test_returns_only_the_fields_a_picker_needs(api: Api) -> None:
    _add(api, "usr-10", "Priya Raman", "QA Engineer", "Quality")
    users = api.sign_in(AUTHOR).get(URL, params={"q": "priya"}).json()["users"]
    assert users == [{"id": "usr-10", "name": "Priya Raman", "title": "QA Engineer", "department": "Quality"}]


def test_matches_name_title_or_department_ignoring_case_and_spaces(api: Api) -> None:
    _add(api, "usr-10", "Priya Raman", "QA Engineer", "Quality")
    _add(api, "usr-11", "Arun Kumar", "Firmware Lead", "Platform")
    agent = api.sign_in(AUTHOR)

    def ids(q: str) -> list[str]:
        return [u["id"] for u in agent.get(URL, params={"q": q}).json()["users"]]

    assert ids("  RAMAN ") == ["usr-10"]  # name
    assert ids("firmware") == ["usr-11"]  # title
    assert ids("quality") == ["usr-10"]  # department
    assert ids("nobody-called-this") == []


def test_a_person_without_title_or_department_can_still_be_found(api: Api) -> None:
    users = api.sign_in(AUTHOR).get(URL, params={"q": OTHER.name}).json()["users"]
    assert users == [{"id": OTHER.id, "name": OTHER.name, "title": None, "department": None}]


def test_percent_and_underscore_are_searched_as_plain_text(api: Api) -> None:
    _add(api, "usr-10", "Priya Raman", None, None)
    agent = api.sign_in(AUTHOR)
    assert agent.get(URL, params={"q": "%"}).json()["users"] == []
    assert agent.get(URL, params={"q": "_"}).json()["users"] == []


def test_at_most_twenty_people_come_back(api: Api) -> None:
    for i in range(30):
        _add(api, f"usr-{100 + i}", f"Tester {i:02d}", None, None)
    users = api.sign_in(AUTHOR).get(URL, params={"q": "tester"}).json()["users"]
    assert len(users) == 20
    assert users[0]["name"] == "Tester 00"


def test_a_very_long_search_is_not_an_error(api: Api) -> None:
    res = api.sign_in(AUTHOR).get(URL, params={"q": "x" * 5000})
    assert res.status_code == 200
    assert res.json() == {"users": []}
