import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS games (
    app_id              INTEGER PRIMARY KEY,
    cs_title            TEXT,
    cs_game_id          TEXT,
    cs_sale_price_usd   REAL,
    cs_normal_price_usd REAL,
    cs_savings          REAL,
    steam_rating_text   TEXT,
    steam_rating_pct    INTEGER,
    steam_rating_count  INTEGER,
    metacritic          INTEGER,
    cs_updated_at       TEXT,

    -- Steam Store
    steam_status        TEXT,          -- ok | not_game | unavailable | error
    steam_fetched_at    TEXT,
    app_type            TEXT,
    name                TEXT,
    short_description   TEXT,
    developers          TEXT,          -- JSON list
    publishers          TEXT,          -- JSON list
    release_date        TEXT,          -- ISO si se pudo parsear
    release_date_raw    TEXT,
    coming_soon         INTEGER,
    genres              TEXT,          -- JSON list
    categories          TEXT,          -- JSON list
    is_free             INTEGER,
    currency            TEXT,
    price_initial       REAL,          -- EUR
    price_final         REAL,          -- EUR
    discount_percent    INTEGER,
    price_updated_at    TEXT,
    header_image        TEXT,
    background          TEXT,
    screenshots         TEXT,          -- JSON list {thumb, full}
    movies              TEXT,          -- JSON list {id, name, thumbnail, hls, dash, mp4, webm}

    -- HowLongToBeat
    hltb_status         TEXT,          -- ok | not_found | error
    hltb_fetched_at     TEXT,
    hltb_id             INTEGER,
    hltb_name           TEXT,
    hltb_similarity     REAL,
    hltb_main           REAL,
    hltb_extra          REAL,
    hltb_completionist  REAL
);
CREATE INDEX IF NOT EXISTS idx_games_steam_status ON games(steam_status);
CREATE INDEX IF NOT EXISTS idx_games_hltb_status ON games(hltb_status);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn


def upsert(conn: sqlite3.Connection, app_id: int, fields: dict) -> None:
    """Inserta o actualiza solo las columnas indicadas y hace commit (progreso incremental)."""
    fields = {k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v)
              for k, v in fields.items()}
    cols = ["app_id", *fields.keys()]
    placeholders = ", ".join("?" for _ in cols)
    updates = ", ".join(f"{c}=excluded.{c}" for c in fields)
    sql = f"INSERT INTO games ({', '.join(cols)}) VALUES ({placeholders})"
    sql += f" ON CONFLICT(app_id) DO UPDATE SET {updates}" if updates else " ON CONFLICT DO NOTHING"
    conn.execute(sql, [app_id, *fields.values()])
    conn.commit()


def loads(value, default=None):
    if value in (None, ""):
        return default if default is not None else []
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default if default is not None else []
