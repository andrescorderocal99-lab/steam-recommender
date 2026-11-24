"""Paso 1: catálogo y precios de referencia desde CheapShark (solo tienda Steam)."""
import logging

from . import db
from .config import CHEAPSHARK_DEALS_URL, CHEAPSHARK_DELAY, CHEAPSHARK_PAGE_SIZE
from .http import RateLimiter, get_json

log = logging.getLogger(__name__)
_limiter = RateLimiter(CHEAPSHARK_DELAY)


def _num(value, cast=float):
    try:
        return cast(float(value))
    except (TypeError, ValueError):
        return None


def fetch_catalog(conn, limit: int | None = None, max_pages: int | None = None,
                  sort_by: str = "Deal Rating") -> list[int]:
    """Recorre las páginas de deals y guarda/actualiza cada juego. Devuelve los app_ids vistos."""
    seen: list[int] = []
    seen_set: set[int] = set()
    page = 0
    while True:
        if max_pages is not None and page >= max_pages:
            break
        params = {"storeID": 1, "pageSize": CHEAPSHARK_PAGE_SIZE, "pageNumber": page, "sortBy": sort_by}
        deals = get_json(CHEAPSHARK_DEALS_URL, params=params, limiter=_limiter)
        if not deals or not isinstance(deals, list):
            break

        now = db.now_iso()
        for deal in deals:
            app_id = _num(deal.get("steamAppID"), int)
            if not app_id or app_id in seen_set:
                continue
            db.upsert(conn, app_id, {
                "cs_title": deal.get("title"),
                "cs_game_id": deal.get("gameID"),
                "cs_sale_price_usd": _num(deal.get("salePrice")),
                "cs_normal_price_usd": _num(deal.get("normalPrice")),
                "cs_savings": round(_num(deal.get("savings")) or 0, 1),
                "steam_rating_text": deal.get("steamRatingText"),
                "steam_rating_pct": _num(deal.get("steamRatingPercent"), int) or None,
                "steam_rating_count": _num(deal.get("steamRatingCount"), int),
                "metacritic": _num(deal.get("metacriticScore"), int) or None,
                "cs_updated_at": now,
            })
            seen.append(app_id)
            seen_set.add(app_id)
            if limit and len(seen) >= limit:
                log.info("CheapShark: alcanzado el límite de %s juegos", limit)
                return seen

        log.info("CheapShark: página %s -> %s juegos acumulados", page, len(seen))
        if len(deals) < CHEAPSHARK_PAGE_SIZE:
            break
        page += 1
    return seen
