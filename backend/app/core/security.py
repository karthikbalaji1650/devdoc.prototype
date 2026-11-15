import hmac
import secrets

SESSION_COOKIE = "devdoc_sid"
SESSION_TTL_MS = 12 * 60 * 60 * 1000  # 12 hours


def verify_password(typed: str, stored: str) -> bool:
    """DEV-ONLY: passwords are stored as typed (see migration 0002) until the
    real user directory takes over. Compared in constant time."""
    return hmac.compare_digest(typed.encode("utf-8"), stored.encode("utf-8"))


def generate_session_id() -> str:
    """A random, unguessable session id - not a JWT, so logout (or an
    admin revoking a session) takes effect immediately: deleting the row
    invalidates it, with nothing left holding a still-valid token."""
    return secrets.token_hex(32)
