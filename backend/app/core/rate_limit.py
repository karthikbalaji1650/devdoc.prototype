"""Port of the express-rate-limit 8 setup the login route used.

`rateLimit({ windowMs: 15 min, limit: 10, standardHeaders: true,
legacyHeaders: false, skipSuccessfulRequests: true })` with its default
MemoryStore: a per-client fixed window that starts at the client's first
hit, draft-6 `RateLimit-*` headers on every response, `Retry-After` on a
429, and a hit refunded once the response turns out to be a success.
"""

import ipaddress
import math
import threading
import time
from dataclasses import dataclass, field


def client_key(ip: str) -> str:
    """ipKeyGenerator: IPv4 (and IPv4-mapped IPv6) as-is, IPv6 by /56 subnet."""
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if isinstance(address, ipaddress.IPv6Address):
        if address.ipv4_mapped is not None:
            return str(address.ipv4_mapped)
        return str(ipaddress.ip_network(f"{ip}/56", strict=False))
    return ip


@dataclass
class _Client:
    hits: int = 0
    reset_at_ms: float = 0.0


@dataclass
class RateLimitInfo:
    key: str
    limit: int
    used: int
    reset_at_ms: float
    window_ms: int

    @property
    def remaining(self) -> int:
        return max(self.limit - self.used, 0)

    @property
    def exceeded(self) -> bool:
        return self.used > self.limit

    def headers(self) -> dict[str, str]:
        reset_seconds = max(0, math.ceil((self.reset_at_ms - _now_ms()) / 1000))
        headers = {
            "RateLimit-Policy": f"{self.limit};w={math.ceil(self.window_ms / 1000)}",
            "RateLimit-Limit": str(self.limit),
            "RateLimit-Remaining": str(self.remaining),
            "RateLimit-Reset": str(reset_seconds),
        }
        if self.exceeded:
            headers["Retry-After"] = str(reset_seconds)
        return headers


def _now_ms() -> float:
    return time.time() * 1000


@dataclass
class RateLimiter:
    window_ms: int
    limit: int
    _clients: dict[str, _Client] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def hit(self, ip: str) -> RateLimitInfo:
        key = client_key(ip)
        now = _now_ms()
        with self._lock:
            client = self._clients.get(key)
            if client is None or client.reset_at_ms <= now:
                client = _Client(hits=0, reset_at_ms=now + self.window_ms)
                self._clients[key] = client
                self._forget_expired(now)
            client.hits += 1
            return RateLimitInfo(key, self.limit, client.hits, client.reset_at_ms, self.window_ms)

    def refund(self, info: RateLimitInfo) -> None:
        """skipSuccessfulRequests: give the hit back, unless the window it
        was counted in has already ended."""
        if _now_ms() >= info.reset_at_ms:
            return
        with self._lock:
            client = self._clients.get(info.key)
            if client is not None and client.hits > 0:
                client.hits -= 1

    def _forget_expired(self, now: float) -> None:
        if len(self._clients) > 10_000:
            for stale in [k for k, c in self._clients.items() if c.reset_at_ms <= now]:
                del self._clients[stale]


def login_rate_limiter() -> RateLimiter:
    return RateLimiter(window_ms=15 * 60 * 1000, limit=10)
