"""Genera borradores semanales para Reddit / foros con los mejores chollos de games.json.

Uso:
    python marketing/generate_posts.py
    python marketing/generate_posts.py --min-discount 40

Salida: marketing/output/posts_YYYY-MM-DD.md (3 borradores listos para copiar y pegar).
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    OUTPUT_DIR, SITE_URL, clean_name, eph_of, fmt_eph, fmt_eur, hours_of, is_paid, load_games,
    site_count_label, steam_url,
)


def md_name(g: dict) -> str:
    name = clean_name(g["name"]).replace("|", "/").replace("[", "(").replace("]", ")")
    return f"[{name}]({steam_url(g['id'])})"


def deals(games: list[dict], min_discount: int, min_rating: int, min_reviews: int) -> list[dict]:
    out = [g for g in games
           if is_paid(g) and (g.get("discount") or 0) >= min_discount
           and (g.get("rating") or 0) >= min_rating and (g.get("ratingCount") or 0) >= min_reviews
           and hours_of(g) and eph_of(g) is not None]
    # mejor €/hora primero; a igualdad, más descuento
    out.sort(key=lambda g: (eph_of(g), -g["discount"]))
    return out


def table_en(rows: list[dict]) -> str:
    lines = ["| # | Game | Price | Discount | Hours (main) | €/hour | Reviews |",
             "|---|---|---|---|---|---|---|"]
    for i, g in enumerate(rows, 1):
        lines.append(f"| {i} | {md_name(g)} | {fmt_eur(g['price'])} ~~{fmt_eur(g['priceInitial'])}~~ | "
                     f"-{g['discount']}% | {hours_of(g):.0f}h | {fmt_eph(eph_of(g))} | {g['rating']}% |")
    return "\n".join(lines)


def table_es(rows: list[dict]) -> str:
    lines = ["| # | Juego | Precio | Dto. | Horas | €/hora | Valoración |",
             "|---|---|---|---|---|---|---|"]
    for i, g in enumerate(rows, 1):
        price = f"{g['price']:.2f} €".replace(".", ",")
        eph = fmt_eph(eph_of(g)).replace("€", "").replace(".", ",") + " €"
        lines.append(f"| {i} | {md_name(g)} | {price} | -{g['discount']}% | {hours_of(g):.0f} h | "
                     f"{eph} | {g['rating']} % |")
    return "\n".join(lines)


def post_patientgamers(rows: list[dict], count_label: str) -> str:
    best = rows[0]
    return f"""**Title:** I ranked this week's Steam sales by cost per hour of gameplay — {clean_name(best['name'])} comes out at {fmt_eph(eph_of(best))}/hour

**Body:**

I've always found "price" alone a pretty bad way to judge a deal. A €40 game you play for 100 hours is a better deal than a €10 one you finish in an afternoon. So I took the games currently on sale on Steam, matched them with HowLongToBeat main-story times, and sorted by **euros per hour**.

Only games with 80%+ positive reviews and a decent number of reviews made the cut. Here's the top 10 right now:

{table_en(rows[:10])}

A few notes:

- Hours are HLTB "main story", so completionists will get an even better ratio.
- Prices are EUR from the Steam store and change constantly — double-check before buying.
- Multiplayer/endless games are a bit unfair in this ranking since HLTB times don't really capture them.

I built a free, no-login tool called CostXHour to track this across {count_label} Steam games (filters by genre, price, hours and €/hour): {SITE_URL} — feedback welcome, especially on which games' playtime feels off.

What's the best hours-per-euro game you've ever bought?
"""


def post_gamedeals(rows: list[dict]) -> str:
    cheap = sorted([g for g in rows if g["price"] < 5], key=lambda g: (-g["discount"], eph_of(g)))[:8]
    if not cheap:
        return "_No hay ofertas activas por debajo de 5 € con los filtros actuales._\n"
    items = "\n".join(
        f"- **{clean_name(g['name'])}** — {fmt_eur(g['price'])} (-{g['discount']}%, was {fmt_eur(g['priceInitial'])}) · "
        f"~{hours_of(g):.0f}h · {fmt_eph(eph_of(g))}/hr · {g['rating']}% positive — {steam_url(g['id'])}"
        for g in cheap
    )
    top = cheap[0]
    return f"""**Title (link post):** [Steam] {clean_name(top['name'])} ({fmt_eur(top['price'])} / -{top['discount']}%)
**URL:** {steam_url(top['id'])}

**Comment / short post — Steam deals under €5 with the most playtime per euro:**

{items}

Sorted by cost per hour (HLTB main story). I keep the full list filterable at {SITE_URL} if anyone wants to dig further.
"""


def post_es(rows: list[dict], count_label: str) -> str:
    best = rows[0]
    eph_best = fmt_eph(eph_of(best)).replace("€", "").replace(".", ",")
    return f"""**Título:** He ordenado las ofertas de Steam de esta semana por €/hora de juego — {clean_name(best['name'])} sale a {eph_best} €/hora

**Cuerpo:**

Buenas! Llevo tiempo dándole vueltas a que el precio por sí solo no dice mucho: un juego de 40 € al que le echas 100 horas es mejor compra que uno de 10 € que te pasas en una tarde.

Así que he cruzado las ofertas actuales de Steam con las duraciones de HowLongToBeat y las he ordenado por **euros por hora**. Solo entran juegos con +80 % de reseñas positivas. Estos son los 8 mejores chollos ahora mismo:

{table_es(rows[:8])}

Las horas son de la historia principal (si sois completistas, os sale aún más barato). Los precios cambian rápido, así que revisadlos antes de comprar.

Lo saco de una web que he hecho yo, gratis y sin registro, que se llama CostXHour: {SITE_URL} — permite filtrar {count_label} juegos de Steam por género, precio, horas y €/hora. Cualquier sugerencia o fallo que veáis, me ayuda mucho.

¿Cuál ha sido vuestra mejor compra en horas por euro?
"""


def main() -> None:
    ap = argparse.ArgumentParser(description="Borradores semanales para Reddit/foros")
    ap.add_argument("--min-discount", type=int, default=30)
    ap.add_argument("--min-rating", type=int, default=80)
    ap.add_argument("--min-reviews", type=int, default=200)
    args = ap.parse_args()

    games, meta = load_games()
    rows = deals(games, args.min_discount, args.min_rating, args.min_reviews)
    if len(rows) < 10:
        sys.exit(f"[x] Solo {len(rows)} ofertas cumplen los filtros; prueba a relajarlos.")
    count_label = site_count_label(meta.get("count", len(games)))

    generated = meta.get("generatedAt", "")
    try:
        generated = datetime.fromisoformat(generated).strftime("%Y-%m-%d %H:%M UTC")
    except ValueError:
        pass

    stamp = date.today().isoformat()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUTPUT_DIR / f"posts_{stamp}.md"
    out.write_text(
        f"# Borradores CostXHour — {stamp}\n\n"
        f"Datos de `games.json` generados el {generated}. {len(rows)} ofertas cumplen los filtros "
        f"(dto. ≥{args.min_discount}%, valoración ≥{args.min_rating}%, ≥{args.min_reviews} reseñas).\n\n"
        "> Antes de publicar: revisa las normas de cada subreddit/foro sobre autopromoción "
        "(r/GameDeals exige posts de enlace directo a la oferta; en r/patientgamers aporta valor primero).\n\n"
        "---\n\n## 1. r/patientgamers / r/pcgaming (EN)\n\n" + post_patientgamers(rows, count_label) +
        "\n---\n\n## 2. r/GameDeals — ofertas por debajo de 5 € (EN)\n\n" + post_gamedeals(rows) +
        "\n---\n\n## 3. r/esGaming / Mediavida / Forocoches (ES)\n\n" + post_es(rows, count_label),
        encoding="utf-8",
    )
    print(f"[ok] {out}  ({len(rows)} ofertas)")


if __name__ == "__main__":
    main()
