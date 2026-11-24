import logging
import time

import requests

from .config import USER_AGENT

log = logging.getLogger(__name__)

_session = requests.Session()
_session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})


class RateLimiter:
    """Garantiza una pausa mínima entre llamadas consecutivas."""

    def __init__(self, min_interval: float):
        self.min_interval = min_interval
        self._last = 0.0

    def wait(self) -> None:
        elapsed = time.monotonic() - self._last
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last = time.monotonic()


def get_json(url: str, params: dict | None = None, limiter: RateLimiter | None = None,
             retries: int = 4, timeout: float = 25.0):
    """GET con reintentos y backoff ante 429/5xx/errores de red. Devuelve JSON o None."""
    backoff = 30.0
    for attempt in range(1, retries + 1):
        if limiter:
            limiter.wait()
        try:
            resp = _session.get(url, params=params, timeout=timeout)
        except requests.RequestException as exc:
            log.warning("Error de red (%s/%s) %s: %s", attempt, retries, url, exc)
            time.sleep(min(backoff, 10 * attempt))
            continue

        if resp.status_code == 429 or resp.status_code == 403 and "steampowered" in url:
            retry_after = resp.headers.get("Retry-After")
            wait = float(retry_after) if retry_after and retry_after.isdigit() else backoff
            log.warning("Rate limit (%s) en %s. Esperando %.0fs...", resp.status_code, url, wait)
            time.sleep(wait)
            backoff = min(backoff * 2, 300)
            continue
        if resp.status_code >= 500:
            log.warning("HTTP %s en %s (%s/%s)", resp.status_code, url, attempt, retries)
            time.sleep(5 * attempt)
            continue
        if resp.status_code != 200:
            log.error("HTTP %s en %s: %s", resp.status_code, url, resp.text[:200])
            return None
        try:
            return resp.json()
        except ValueError:
            log.warning("Respuesta no JSON en %s", url)
            return None
    log.error("Agotados los reintentos para %s", url)
    return None
