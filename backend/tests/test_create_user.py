"""The create_user command's password handling (no database needed: create_user itself is replaced)."""

import pytest

from app.db import create_user as tool
from app.db.create_user import UserInputError, check_password


class TestCheckPassword:
    @pytest.mark.parametrize("password", ["sahith", "pass word", "päss-wörd-✓", " leading and trailing ", "a"])
    def test_accepts_ordinary_passwords_including_spaces_and_unicode(self, password: str) -> None:
        check_password(password)

    @pytest.mark.parametrize(
        "password",
        ["\x1b[sahith", "sa\x1b[Dhith", "tab\there", "line\nbreak", "null\x00byte", "del\x7fchar"],
    )
    def test_refuses_control_characters_such_as_a_stray_arrow_key(self, password: str) -> None:
        with pytest.raises(UserInputError, match="control character"):
            check_password(password)

    def test_refuses_an_empty_password(self) -> None:
        with pytest.raises(UserInputError, match="Password is required"):
            check_password("")


class TestCreateUserRefusesABadPasswordBeforeTouchingTheDatabase:
    def test_a_control_character_is_refused_even_with_the_password_flag(self) -> None:
        # The URL points nowhere: if validation ran after connecting, this would be a connection error instead.
        with pytest.raises(UserInputError, match="control character"):
            tool.create_user(
                "postgresql://nobody@127.0.0.1:1/none",
                name="Ada",
                email="ada@x.com",
                password="\x1b[sahith",
                is_admin=False,
                title="T",
                department="D",
            )


class Terminal:
    """Stands in for the keyboard: scripted answers for input() and getpass()."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch, answers: list[str], secrets: list[str]) -> None:
        self.created: list[dict[str, object]] = []
        self.secret_prompts: list[str] = []
        answers_iter, secrets_iter = iter(answers), iter(secrets)
        monkeypatch.setattr("builtins.input", lambda prompt="": next(answers_iter))

        def fake_getpass(prompt: str = "") -> str:
            self.secret_prompts.append(prompt)
            return next(secrets_iter)

        monkeypatch.setattr(tool.getpass, "getpass", fake_getpass)

        def fake_create(url: str, **details: object) -> str:
            self.created.append(details)
            return "usr-test"

        monkeypatch.setattr(tool, "create_user", fake_create)
        monkeypatch.setenv("ALEMBIC_DATABASE_URL", "postgresql://unused")


ANSWERS = ["Ada Lovelace", "ada@x.com", "n", "Mathematician", "Engines"]  # name, email, admin?, title, department


class TestThePrompts:
    def test_asks_for_the_password_twice_and_uses_it_when_they_match(self, monkeypatch: pytest.MonkeyPatch) -> None:
        terminal = Terminal(monkeypatch, ANSWERS, ["sahith", "sahith"])
        tool.main([])
        assert len(terminal.secret_prompts) == 2
        assert terminal.created[0]["password"] == "sahith"

    def test_asks_again_when_the_two_entries_differ_then_accepts_a_matching_pair(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        terminal = Terminal(monkeypatch, ANSWERS, ["sahith", "sahlth", "second", "second"])
        tool.main([])
        assert "do not match" in capsys.readouterr().out
        assert terminal.created[0]["password"] == "second"

    def test_gives_up_after_three_mismatches_and_creates_nobody(self, monkeypatch: pytest.MonkeyPatch) -> None:
        terminal = Terminal(monkeypatch, ANSWERS, ["a", "b", "c", "d", "e", "f"])
        with pytest.raises(SystemExit, match="do not match"):
            tool.main([])
        assert terminal.created == []

    def test_a_control_character_is_refused_at_the_first_entry_and_asked_again(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        terminal = Terminal(monkeypatch, ANSWERS, ["\x1b[sahith", "sahith", "sahith"])
        tool.main([])
        assert "control character" in capsys.readouterr().out
        assert terminal.created[0]["password"] == "sahith"

    def test_the_password_flag_skips_the_prompts(self, monkeypatch: pytest.MonkeyPatch) -> None:
        terminal = Terminal(monkeypatch, ["Ada Lovelace", "ada@x.com", "n", "Mathematician", "Engines"], [])
        tool.main(["--password", "sahith"])
        assert terminal.secret_prompts == []
        assert terminal.created[0]["password"] == "sahith"
