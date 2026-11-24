"""Paso 4: cálculo de €/hora y exportación a JSON para el frontend.

- games.json: índice ligero (todo lo necesario para filtrar, ordenar y pintar tarjetas).
- details/{app_id}.json: datos pesados (capturas, vídeos, descripción) cargados bajo demanda
  al abrir el detalle. Así el índice se mantiene pequeño aunque haya miles de juegos.
"""
import json
import logging
import os
from pathlib import Path

from . import db
from .config import EXPORT_DETAILS_DIR, EXPORT_INDEX

log = logging.getLogger(__name__)
SCHEMA_VERSION = 1


def eur_per_hour(price: float | None, hours: float | None) -> float | None:
    if price is None or not hours:
        return None
    return round(price / hours, 3)


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def build_records(conn):
    rows = conn.execute(
        "SELECT * FROM games WHERE steam_status = 'ok' AND COALESCE(coming_soon, 0) = 0 "
        "ORDER BY app_id").fetchall()
    for r in rows:
        price = r["price_final"]
        times = {"main": r["hltb_main"], "extra": r["hltb_extra"], "completionist": r["hltb_completionist"]}
        developers = db.loads(r["developers"])
        index = {
            "id": r["app_id"],
            "name": r["name"] or r["cs_title"],
            "header": r["header_image"],
            "price": price,
            "priceInitial": r["price_initial"],
            "discount": r["discount_percent"] or 0,
            "isFree": bool(r["is_free"]),
            "currency": r["currency"] or "EUR",
            "genres": db.loads(r["genres"]),
            "developer": developers[0] if developers else None,
            "releaseDate": r["release_date"],
            "rating": r["steam_rating_pct"],
            "ratingCount": r["steam_rating_count"],
            "ratingText": r["steam_rating_text"],
            "metacritic": r["metacritic"],
            "hltb": times,
            "eurPerHour": {k: eur_per_hour(price, h) for k, h in times.items()},
            "hasVideo": bool(db.loads(r["movies"])),
            "priceUpdatedAt": r["price_updated_at"],
        }
        detail = {
            "id": r["app_id"],
            "shortDescription": r["short_description"],
            "developers": developers,
            "publishers": db.loads(r["publishers"]),
            "categories": db.loads(r["categories"]),
            "releaseDateRaw": r["release_date_raw"],
            "background": r["background"],
            "screenshots": db.loads(r["screenshots"]),
            "movies": db.loads(r["movies"]),
            "hltbId": r["hltb_id"],
            "hltbName": r["hltb_name"],
        }
        yield index, detail


def run(conn, index_path: Path = EXPORT_INDEX, details_dir: Path = EXPORT_DETAILS_DIR) -> int:
    games = []
    exported_ids = set()
    for index, detail in build_records(conn):
        games.append(index)
        exported_ids.add(index["id"])
        _write_json(details_dir / f"{index['id']}.json", detail)

    # Elimina fichas de detalle de juegos que ya no están en el catálogo.
    if details_dir.exists():
        for f in details_dir.glob("*.json"):
            if f.stem.isdigit() and int(f.stem) not in exported_ids:
                f.unlink()

    payload = {
        "version": SCHEMA_VERSION,
        "generatedAt": db.now_iso(),
        "currency": "EUR",
        "count": len(games),
        "games": games,
    }
    _write_json(index_path, payload)
    with_hltb = sum(1 for g in games if any(g["hltb"].values()))
    log.info("Exportados %s juegos (%s con tiempos HLTB) -> %s", len(games), with_hltb, index_path)
    return len(games)
