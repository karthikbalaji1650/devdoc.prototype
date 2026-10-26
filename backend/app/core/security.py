import secrets

import bcrypt

SESSION_COOKIE = "devdoc_sid"
SESSION_TTL_MS = 12 * 60 * 60 * 1000  # 12 hours
BCRYPT_ROUNDS = 12
_BCRYPT_MAX_BYTES = 72


def _password_bytes(plain: str) -> bytes:
    # bcryptjs silently used only the first 72 bytes; the `bcrypt` package
    # refuses longer input instead, so truncate the same way it did.
    return plain.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def verify_password(plain: str, password_hash: str) -> bool:
    """CPU-bound (cost 12, ~250 ms): call it from a worker thread."""
    try:
        return bcrypt.checkpw(_password_bytes(plain), password_hash.encode("utf-8"))
    except ValueError:
        return False


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_password_bytes(plain), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("ascii")


def generate_session_id() -> str:
    """A random, unguessable session id - not a JWT, so logout (or an
    admin revoking a session) takes effect immediately: deleting the row
    invalidates it, with nothing left holding a still-valid token."""
    return secrets.token_hex(32)
