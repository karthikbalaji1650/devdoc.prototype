from redis.asyncio import Redis


def create_redis(url: str) -> Redis:
    """Strings in, strings out: every value stored is JSON text."""
    return Redis.from_url(url, decode_responses=True)
