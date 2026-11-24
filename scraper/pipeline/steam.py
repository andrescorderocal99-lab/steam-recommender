"""Paso 2: metadatos, precio EUR, imágenes y vídeos desde la Steam Store API."""
import logging
import re

from . import db
from .config import (MAX_MOVIES, MAX_SCREENSHOTS, STEAM_APPDETAILS_URL, STEAM_CC, STEAM_DELAY,
                     STEAM_LANG, STEAM_PRICE_BATCH)
from .http import RateLimiter, get_json

log = logging.getLogger(__name__)
_limiter = RateLimiter(STEAM_DELAY)

_ES_MONTHS = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6, "jul": 7,
              "ago": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dic": 12}


def parse_release_date(raw: str | None) -> str | None:
    """'17 SEP 2020' / '17 sep. 2020' / '17 de septiembre de 2020' -> '2020-09-17'."""
    if not raw:
        return None
    text = raw.lower().replace(".", " ").replace(",", " ").replace(" de ", " ")
    m = re.search(r"(\d{1,2})\s+([a-zñ]+)\s+(\d{4})", text)
    if m:
        month = _ES_MONTHS.get(m.group(2)[:4]) or _ES_MONTHS.get(m.group(2)[:3])
        if month:
            return f"{m.group(3)}-{month:02d}-{int(m.group(1)):02d}"
    m = re.search(r"(\d{4})", text)
    return m.group(1) if m else None


def _parse_movies(movies: list) -> list[dict]:
    """Steam sirve hoy HLS/DASH; las apps antiguas aún pueden traer mp4/webm."""
    out = []
    for mv in movies or []:
        mp4 = mv.get("mp4") or {}
        webm = mv.get("webm") or {}
        item = {
            "id": mv.get("id"),
            "name": mv.get("name"),
            "thumbnail": mv.get("thumbnail"),
            "highlight": bool(mv.get("highlight")),
            "hls": mv.get("hls_h264"),
            "dash": mv.get("dash_h264") or mv.get("dash_av1"),
            "mp4": mp4.get("max") or mp4.get("480"),
            "webm": webm.get("max") or webm.get("480"),
        }
        if any(item[k] for k in ("hls", "dash", "mp4", "webm")):
            out.append({k: v for k, v in item.items() if v not in (None, "")})
    out.sort(key=lambda m: not m.get("highlight"))
    return out[:MAX_MOVIES]


def _price_fields(data: dict) -> dict:
    po = data.get("price_overview") if isinstance(data, dict) else None
    if po:
        return {
            "currency": po.get("currency"),
            "price_initial": round(po.get("initial", 0) / 100, 2),
            "price_final": round(po.get("final", 0) / 100, 2),
            "discount_percent": po.get("discount_percent", 0),
        }
    return {}


def fetch_details(conn, app_id: int) -> str:
    """Descarga y guarda los detalles de un app_id. Devuelve el estado resultante."""
    payload = get_json(STEAM_APPDETAILS_URL,
                       params={"appids": app_id, "cc": STEAM_CC, "l": STEAM_LANG},
                       limiter=_limiter)
    now = db.now_iso()
    if payload is None:
        db.upsert(conn, app_id, {"steam_status": "error", "steam_fetched_at": now})
        return "error"

    entry = payload.get(str(app_id)) or {}
    data = entry.get("data")
    if not entry.get("success") or not isinstance(data, dict):
        # No disponible en la región ES o retirado de la tienda.
        db.upsert(conn, app_id, {"steam_status": "unavailable", "steam_fetched_at": now})
        return "unavailable"

    app_type = data.get("type")
    status = "ok" if app_type == "game" else "not_game"
    release = data.get("release_date") or {}
    is_free = bool(data.get("is_free"))
    fields = {
        "steam_status": status,
        "steam_fetched_at": now,
        "app_type": app_type,
        "name": data.get("name"),
        "short_description": data.get("short_description"),
        "developers": data.get("developers") or [],
        "publishers": data.get("publishers") or [],
        "release_date_raw": release.get("date"),
        "release_date": parse_release_date(release.get("date")),
        "coming_soon": int(bool(release.get("coming_soon"))),
        "genres": [g.get("description") for g in data.get("genres") or [] if g.get("description")],
        "categories": [c.get("description") for c in data.get("categories") or [] if c.get("description")],
        "is_free": int(is_free),
        "header_image": data.get("header_image"),
        "background": data.get("background_raw") or data.get("background"),
        "screenshots": [{"thumb": s.get("path_thumbnail"), "full": s.get("path_full")}
                        for s in (data.get("screenshots") or [])[:MAX_SCREENSHOTS]],
        "movies": _parse_movies(data.get("movies")),
        "price_updated_at": now,
    }
    price = _price_fields(data)
    if price:
        fields.update(price)
    elif is_free:
        fields.update({"currency": "EUR", "price_initial": 0.0, "price_final": 0.0, "discount_percent": 0})
    else:
        # De pago pero sin precio en ES (p. ej. no se vende actualmente): sin precio.
        fields.update({"price_initial": None, "price_final": None, "discount_percent": None})
    db.upsert(conn, app_id, fields)
    return status


def pending_app_ids(conn, app_ids: list[int] | None, refresh_days: float | None,
                    retry_errors: bool = True) -> list[int]:
    """Juegos sin detalles de Steam, con error, o con datos más antiguos que refresh_days."""
    conds = ["steam_status IS NULL"]
    if retry_errors:
        conds.append("steam_status = 'error'")
    params: list = []
    if refresh_days is not None:
        conds.append("steam_fetched_at < datetime('now', ?)")
        params.append(f"-{refresh_days} days")
    sql = f"SELECT app_id FROM games WHERE ({' OR '.join(conds)})"
    rows = [r["app_id"] for r in conn.execute(sql, params)]
    if app_ids is not None:
        wanted = set(rows)
        return [a for a in app_ids if a in wanted]
    return rows


def run(conn, app_ids: list[int] | None = None, refresh_days: float | None = None) -> dict:
    todo = pending_app_ids(conn, app_ids, refresh_days)
    stats: dict[str, int] = {}
    log.info("Steam: %s apps pendientes (pausa %.1fs -> ~%.1f min)", len(todo), STEAM_DELAY,
             len(todo) * STEAM_DELAY / 60)
    for i, app_id in enumerate(todo, 1):
        status = fetch_details(conn, app_id)
        stats[status] = stats.get(status, 0) + 1
        if i % 10 == 0 or i == len(todo):
            log.info("Steam: %s/%s %s", i, len(todo), stats)
    return stats


def update_prices(conn, app_ids: list[int] | None = None) -> int:
    """Refresco rápido de precios EUR: lotes de appids con filters=price_overview."""
    if app_ids is None:
        app_ids = [r["app_id"] for r in conn.execute(
            "SELECT app_id FROM games WHERE steam_status = 'ok'")]
    updated = 0
    for start in range(0, len(app_ids), STEAM_PRICE_BATCH):
        batch = app_ids[start:start + STEAM_PRICE_BATCH]
        payload = get_json(STEAM_APPDETAILS_URL, limiter=_limiter, params={
            "appids": ",".join(map(str, batch)), "cc": STEAM_CC, "filters": "price_overview"})
        if not payload:
            continue
        now = db.now_iso()
        for app_id in batch:
            entry = payload.get(str(app_id)) or {}
            if not entry.get("success"):
                continue
            price = _price_fields(entry.get("data"))
            if not price:
                # data == [] -> gratuito o sin precio; respetamos el flag is_free guardado.
                row = conn.execute("SELECT is_free FROM games WHERE app_id=?", (app_id,)).fetchone()
                if row and row["is_free"]:
                    price = {"price_initial": 0.0, "price_final": 0.0, "discount_percent": 0}
                else:
                    price = {"price_initial": None, "price_final": None, "discount_percent": None}
            db.upsert(conn, app_id, {**price, "price_updated_at": now})
            updated += 1
        log.info("Precios: %s/%s actualizados", min(start + STEAM_PRICE_BATCH, len(app_ids)), len(app_ids))
    return updated
