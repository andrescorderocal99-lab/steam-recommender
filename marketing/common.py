"""Utilidades compartidas por los scripts de marketing de CostXHour."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKETING = ROOT / "marketing"
DATA_DIR = ROOT / "frontend" / "public" / "data"
OUTPUT_DIR = MARKETING / "output"
TEMP_DIR = MARKETING / "temp"

SITE_URL = "https://costxhour.netlify.app"
SITE_HOST = "costxhour.netlify.app"


def load_games() -> tuple[list[dict], dict]:
    """Devuelve (juegos, metadatos) de games.json."""
    with open(DATA_DIR / "games.json", encoding="utf-8") as f:
        data = json.load(f)
    return data["games"], {k: v for k, v in data.items() if k != "games"}


def load_detail(app_id: int) -> dict | None:
    path = DATA_DIR / "details" / f"{app_id}.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def hours_of(game: dict) -> float | None:
    """Horas de la historia principal (o main+extra si no hay main)."""
    h = game.get("hltb") or {}
    return h.get("main") or h.get("extra")


def eph_of(game: dict) -> float | None:
    """€/hora coherente con hours_of()."""
    e = game.get("eurPerHour") or {}
    h = game.get("hltb") or {}
    return e.get("main") if h.get("main") else e.get("extra")


def is_paid(game: dict) -> bool:
    return not game.get("isFree") and (game.get("price") or 0) > 0


def clean_name(name: str) -> str:
    return re.sub(r"[™®©]", "", name).strip()


def fmt_eur(v: float) -> str:
    return f"€{v:.2f}"


def fmt_eph(v: float) -> str:
    return "<€0.01" if v < 0.005 else f"€{v:.2f}"


def fmt_hours(h: float) -> str:
    return f"{int(h)}+"


def steam_url(app_id: int) -> str:
    return f"https://store.steampowered.com/app/{app_id}/"


def site_count_label(count: int) -> str:
    """2952 -> '2,900+' (redondeo hacia abajo para no exagerar)."""
    return f"{(count // 100) * 100:,}+"
