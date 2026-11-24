"""Paso 3: duraciones desde HowLongToBeat con limpieza de título y validación de similitud."""
import logging
import re
import unicodedata
from difflib import SequenceMatcher

from howlongtobeatpy import HowLongToBeat

from . import db
from .config import HLTB_DELAY, HLTB_MIN_SIMILARITY
from .http import RateLimiter

log = logging.getLogger(__name__)
_limiter = RateLimiter(HLTB_DELAY)
_client = HowLongToBeat(0.0)  # sin filtro interno: la similitud la validamos nosotros

_EDITION_PATTERNS = [
    r"\b(game of the year|goty)(\s+edition)?\b",
    r"\b(definitive|deluxe|digital deluxe|complete|ultimate|gold|premium|enhanced|anniversary|"
    r"special|collector'?s|standard|legendary|royal|platinum|bundle|remastered)\s+(edition|version)\b",
    r"\bdirector'?s\s+cut\b",
    r"\b(edition|edici[oó]n)\s+(definitiva|completa|deluxe)\b",
    r"\(\s*\d{4}\s*\)",  # (2015)
    r"\[[^\]]*\]",
]


def normalize(name: str) -> str:
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def strip_symbols(name: str) -> str:
    text = re.sub(r"[™®©℠]", "", name or "")
    return re.sub(r"\s+", " ", text).strip()


def strip_editions(name: str) -> str:
    text = strip_symbols(name)
    for pattern in _EDITION_PATTERNS:
        text = re.sub(pattern, " ", text, flags=re.IGNORECASE)
    text = re.sub(r"[\s\-–:,]+$", "", text)  # separadores colgantes
    return re.sub(r"\s+", " ", text).strip()


def strip_quotes(name: str) -> str:
    """HLTB devuelve 0 resultados con apóstrofos tipográficos (Sid Meier’s ...): los quitamos."""
    text = re.sub(r"[’‘`´'\"“”]", "", name or "")
    return re.sub(r"\s+", " ", text).strip()


def search_candidates(name: str) -> list[str]:
    out: list[str] = []
    edition_free = strip_editions(name)
    for cand in (name, strip_symbols(name), edition_free, strip_quotes(edition_free)):
        if cand and cand not in out:
            out.append(cand)
    return out


_ROMAN = {"i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"}


def _sequel_tokens(normalized: str) -> set[str]:
    return {t for t in normalized.split() if t.isdigit() or t in _ROMAN}


def similarity(a: str, b: str) -> float:
    na, nb = normalize(a), normalize(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    # "Civilization V" vs "Civilization VI" se parecen un 98%: si los números de entrega
    # difieren, es otro juego.
    if _sequel_tokens(na) != _sequel_tokens(nb):
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def _hours(value) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return round(v, 2) if v > 0 else None


def find_best(name: str, min_similarity: float = HLTB_MIN_SIMILARITY):
    """Devuelve (entry, similitud, consulta) o (None, mejor_similitud, None). Lanza si la red falla en todo."""
    best = (None, 0.0, None)
    any_response = False
    for query in search_candidates(name):
        _limiter.wait()
        try:
            results = _client.search(query, similarity_case_sensitive=False)
        except Exception as exc:  # la librería puede lanzar ante cambios de la web
            log.warning("HLTB error buscando %r: %s", query, exc)
            results = None
        if results is None:
            continue
        any_response = True
        for entry in results:
            refs = [query, strip_editions(name)]
            names = [entry.game_name] + ([entry.game_alias] if entry.game_alias else [])
            score = max(similarity(r, n) for r in refs for n in names if n)
            if score > best[1]:
                best = (entry, score, query)
        if best[1] >= 0.999:
            break  # coincidencia exacta, no hace falta probar más variantes
    if not any_response:
        raise ConnectionError("HowLongToBeat no respondió")
    if best[1] < min_similarity:
        return None, best[1], None
    return best


def fetch_times(conn, app_id: int, name: str, min_similarity: float) -> str:
    now = db.now_iso()
    try:
        entry, score, query = find_best(name, min_similarity)
    except ConnectionError:
        db.upsert(conn, app_id, {"hltb_status": "error", "hltb_fetched_at": now})
        return "error"
    if entry is None:
        db.upsert(conn, app_id, {"hltb_status": "not_found", "hltb_fetched_at": now,
                                 "hltb_similarity": round(score, 3)})
        log.debug("HLTB sin coincidencia para %r (mejor %.2f)", name, score)
        return "not_found"
    db.upsert(conn, app_id, {
        "hltb_status": "ok",
        "hltb_fetched_at": now,
        "hltb_id": int(entry.game_id) if entry.game_id else None,
        "hltb_name": entry.game_name,
        "hltb_similarity": round(score, 3),
        "hltb_main": _hours(entry.main_story),
        "hltb_extra": _hours(entry.main_extra),
        "hltb_completionist": _hours(entry.completionist),
    })
    return "ok"


def run(conn, app_ids: list[int] | None = None, retry_not_found: bool = False,
        refresh_days: float | None = None, min_similarity: float = HLTB_MIN_SIMILARITY) -> dict:
    conds = ["hltb_status IS NULL", "hltb_status = 'error'"]
    params: list = []
    if retry_not_found:
        conds.append("hltb_status = 'not_found'")
    if refresh_days is not None:
        conds.append("hltb_fetched_at < datetime('now', ?)")
        params.append(f"-{refresh_days} days")
    rows = conn.execute(
        f"SELECT app_id, COALESCE(name, cs_title) AS name FROM games "
        f"WHERE steam_status = 'ok' AND COALESCE(coming_soon, 0) = 0 AND ({' OR '.join(conds)})",
        params).fetchall()
    if app_ids is not None:
        wanted = set(app_ids)
        rows = [r for r in rows if r["app_id"] in wanted]

    stats: dict[str, int] = {}
    log.info("HLTB: %s juegos pendientes", len(rows))
    for i, row in enumerate(rows, 1):
        status = fetch_times(conn, row["app_id"], row["name"], min_similarity)
        stats[status] = stats.get(status, 0) + 1
        if i % 10 == 0 or i == len(rows):
            log.info("HLTB: %s/%s %s", i, len(rows), stats)
    return stats
