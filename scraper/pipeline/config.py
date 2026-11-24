from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
DB_PATH = ROOT_DIR / "data" / "games.db"
EXPORT_DIR = ROOT_DIR / "frontend" / "public" / "data"
EXPORT_INDEX = EXPORT_DIR / "games.json"
EXPORT_DETAILS_DIR = EXPORT_DIR / "details"

# CheapShark rechaza User-Agents genéricos (python-requests/x.y).
USER_AGENT = "SteamValueCatalog/0.1 (open-source hobby data pipeline)"

CHEAPSHARK_DEALS_URL = "https://www.cheapshark.com/api/1.0/deals"
CHEAPSHARK_PAGE_SIZE = 60
CHEAPSHARK_DELAY = 1.0  # s entre páginas

STEAM_APPDETAILS_URL = "https://store.steampowered.com/api/appdetails"
STEAM_CC = "es"
STEAM_LANG = "spanish"
STEAM_DELAY = 1.6  # s entre llamadas (rate limit seguro)
STEAM_PRICE_BATCH = 100  # appids por llamada con filters=price_overview

HLTB_DELAY = 1.0
HLTB_MIN_SIMILARITY = 0.8

MAX_SCREENSHOTS = 12
MAX_MOVIES = 5
