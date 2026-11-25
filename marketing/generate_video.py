"""Genera Shorts verticales (1080x1920) en inglés y/o español para TikTok / YouTube Shorts / Reels.

Uso:
    python marketing/generate_video.py --theme under5                 # EN + ES (mismos juegos)
    python marketing/generate_video.py --theme pennies --lang es
    python marketing/generate_video.py --theme hidden --dry-run
    python marketing/generate_video.py --theme under5 --voice-es es-ES-ElviraNeural --min-reviews 3000

Estructura del vídeo (~20-25 s):
    hook (≤3 s)  ->  3 juegos (5-6 s c/u, clip del tráiler de Steam)  ->  CTA (3-4 s)

Si existe marketing/bgm.mp3 se mezcla en bucle al 12 % por debajo de la voz (--bgm para otra ruta).
Requiere ffmpeg/ffprobe en el PATH.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    MARKETING, OUTPUT_DIR, SITE_HOST, SITE_URL, TEMP_DIR, clean_name, eph_of, fmt_eph,
    fmt_eur, fmt_hours, hours_of, is_paid, load_detail, load_games, site_count_label,
)

W, H = 1080, 1920
FPS = 30
HISTORY_FILE = MARKETING / "used_games.json"
HISTORY_WINDOW = 10           # nº de vídeos recientes cuyos juegos no se repiten
POOL_SIZE = 15                # se eligen 3 al azar entre los mejores N candidatos
MIN_REVIEWS = 1500            # juegos reconocibles (configurable con --min-reviews)
TRAILER_OFFSET = 7.0          # segundos que se saltan del tráiler (logos / pantallas negras)
BGM_FILE = MARKETING / "bgm.mp3"
BGM_VOLUME = 0.12
USER_AGENT = "Mozilla/5.0 (compatible; video-generator)"
NBSP = "\u00a0"               # une "5 €" para que no se parta ni pierda el resaltado

YELLOW = (255, 212, 0, 255)
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
RED = (235, 38, 54, 255)

FONT_CANDIDATES = [
    "C:/Windows/Fonts/seguibl.ttf", "C:/Windows/Fonts/impact.ttf", "C:/Windows/Fonts/arialbd.ttf",
    "/System/Library/Fonts/Supplemental/Arial Black.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]


def spoken_name(g: dict) -> str:
    return clean_name(g["name"]).rstrip(".!?")


# --------------------------------------------------------------------------- idiomas

class Lang:
    """Formatos, locuciones y textos fijos de un idioma."""
    code = ""
    default_voice = ""
    base_tags: list[str] = []

    # formatos en pantalla
    def eur(self, v: float) -> str: raise NotImplementedError
    def eph(self, v: float) -> str: raise NotImplementedError
    def hours(self, h: float) -> str: raise NotImplementedError
    def badge(self, g: dict) -> str: raise NotImplementedError
    def rating_line(self, g: dict) -> str: raise NotImplementedError
    def count(self, n: int) -> str: raise NotImplementedError

    # locución
    def speak_eur(self, v: float) -> str: raise NotImplementedError
    def speak_eph(self, v: float) -> str: raise NotImplementedError

    def speech_value(self, g: dict) -> str: raise NotImplementedError
    def caption_value(self, g: dict) -> str: raise NotImplementedError
    def speech_rating(self, g: dict) -> str: raise NotImplementedError
    def caption_rating(self, g: dict) -> str: raise NotImplementedError

    # CTA y descripción
    cta_speech = ""
    cta_free = ""
    cta_link = ""
    def cta_tagline(self, n: int) -> str: raise NotImplementedError
    def caption_file(self, title: str, items: list[str], tags: str, n: int) -> str: raise NotImplementedError


def _split_cents(v: float) -> tuple[int, int]:
    euros, cents = int(v), round((v - int(v)) * 100)
    if cents == 100:
        euros, cents = euros + 1, 0
    return euros, cents


class English(Lang):
    code = "en"
    default_voice = "en-US-ChristopherNeural"
    base_tags = ["#steam", "#pcgaming", "#gaming", "#steamdeals", "#gamingtips", "#indiegames", "#fyp"]
    cta_speech = "Find thousands more at CostX Hour. Link in bio."
    cta_free = "Free · No login"
    cta_link = "LINK IN BIO"

    def eur(self, v): return fmt_eur(v)
    def eph(self, v): return fmt_eph(v)
    def hours(self, h): return fmt_hours(h)
    def count(self, n): return site_count_label(n)

    def badge(self, g):
        return f"{self.eur(g['price'])} | {self.hours(hours_of(g))} HOURS | {self.eph(eph_of(g))}/hr"

    def rating_line(self, g):
        return f"{g['rating']}% positive · {g['ratingCount']:,} reviews"

    def speak_eur(self, v):
        euros, cents = _split_cents(v)
        if euros == 0:
            return f"{cents} cents"
        unit = "euro" if euros == 1 else "euros"
        return f"{euros} {unit} {cents}" if cents else f"{euros} {unit}"

    def speak_eph(self, v):
        cents = float(f"{v:.2f}") * 100   # mismo redondeo que el badge
        if cents < 1:
            return "less than one cent"
        return f"{round(cents)} cents" if cents < 100 else self.speak_eur(v)

    def speech_value(self, g):
        return (f"{spoken_name(g)}. {self.speak_eur(g['price'])} for {int(hours_of(g))} hours. "
                f"Just {self.speak_eph(eph_of(g))} an hour.")

    def caption_value(self, g):
        return f"Just {self.eph(eph_of(g))} per hour of gameplay"

    def speech_rating(self, g):
        return (f"{spoken_name(g)}. {g['rating']} percent positive, "
                f"{int(hours_of(g))} hours, only {self.speak_eur(g['price'])}.")

    def caption_rating(self, g):
        return f"{g['rating']}% positive and only {self.eur(g['price'])}"

    def cta_tagline(self, n):
        return f"Filter {self.count(n)} Steam games by cost per hour"

    def caption_file(self, title, items, tags, n):
        return (f"TITLE:\n{title} #shorts\n\nDESCRIPTION:\n{title}:\n" + "\n".join(items) +
                "\n\nPrices from Steam (EUR) and playtime from HowLongToBeat — prices change, "
                "check before buying.\n"
                f"Filter {self.count(n)} Steam games by cost per hour (free, no login): {SITE_URL}\n\n"
                f"HASHTAGS:\n{tags}\n")


class Spanish(Lang):
    code = "es"
    default_voice = "es-ES-AlvaroNeural"
    base_tags = ["#steam", "#juegospc", "#videojuegos", "#ofertassteam", "#gamingespañol",
                 "#juegosindie", "#fyp"]
    cta_speech = "Encuentra miles más en CostX Hour. Link en la bio."
    cta_free = "Gratis · Sin registro"
    cta_link = "LINK EN LA BIO"

    @staticmethod
    def _num(v: float) -> str:
        return f"{v:.2f}".replace(".", ",")

    def eur(self, v): return f"{self._num(v)}{NBSP}€"
    def eph(self, v): return f"<0,01{NBSP}€" if v < 0.005 else self.eur(v)
    def hours(self, h): return f"+{int(h)}"
    def count(self, n): return f"más de {(n // 100) * 100:,}".replace(",", ".")

    def badge(self, g):
        return f"{self.eur(g['price'])} | {self.hours(hours_of(g))} HORAS | {self.eph(eph_of(g))}/h"

    def rating_line(self, g):
        return f"{g['rating']} % positivas · {g['ratingCount']:,} reseñas".replace(",", ".")

    def speak_eur(self, v):
        euros, cents = _split_cents(v)
        if euros == 0:
            return "1 céntimo" if cents == 1 else f"{cents} céntimos"
        unit = "euro" if euros == 1 else "euros"
        return f"{euros} {unit} con {cents}" if cents else f"{euros} {unit}"

    def speak_eph(self, v):
        cents = float(f"{v:.2f}") * 100
        if cents < 1:
            return "menos de un céntimo"
        if cents < 100:
            c = round(cents)
            return "1 céntimo" if c == 1 else f"{c} céntimos"
        return self.speak_eur(v)

    def speech_value(self, g):
        return (f"{spoken_name(g)}. {self.speak_eur(g['price'])} por {int(hours_of(g))} horas. "
                f"Solo {self.speak_eph(eph_of(g))} la hora.")

    def caption_value(self, g):
        return f"Solo {self.eph(eph_of(g))} por hora de juego"

    def speech_rating(self, g):
        return (f"{spoken_name(g)}. {g['rating']} por ciento de reseñas positivas, "
                f"{int(hours_of(g))} horas, y solo {self.speak_eur(g['price'])}.")

    def caption_rating(self, g):
        return f"{g['rating']} % positivas y solo {self.eur(g['price'])}"

    def cta_tagline(self, n):
        return f"Filtra {self.count(n)} juegos de Steam por coste por hora"

    def caption_file(self, title, items, tags, n):
        return (f"TÍTULO:\n{title} #shorts\n\nDESCRIPCIÓN:\n{title}:\n" + "\n".join(items) +
                "\n\nPrecios de Steam (EUR) y duración de HowLongToBeat — los precios cambian, "
                "revísalos antes de comprar.\n"
                f"Filtra {self.count(n)} juegos de Steam por coste por hora (gratis, sin registro): "
                f"{SITE_URL}\n\nHASHTAGS:\n{tags}\n")


LANGS: dict[str, Lang] = {"en": English(), "es": Spanish()}


# --------------------------------------------------------------------------- temas

@dataclass
class ThemeText:
    hook_text: str           # lo que se lee en pantalla (MAYÚSCULAS y € se resaltan)
    hook_speech: str         # lo que dice la voz (corto: ≤3 s)
    title: str
    hashtags: list[str] = field(default_factory=list)


@dataclass
class Theme:
    key: str
    texts: dict[str, ThemeText]

    def matches(self, g: dict) -> bool:
        raise NotImplementedError

    def sort_key(self, g: dict):
        return eph_of(g)

    def speech_for(self, lang: Lang, g: dict) -> str:
        return lang.speech_value(g)

    def caption_for(self, lang: Lang, g: dict) -> str:
        return lang.caption_value(g)


class Under5(Theme):
    def matches(self, g):
        return g["price"] < 5 and hours_of(g) >= 25 and (g["rating"] or 0) >= 80


class Pennies(Theme):
    def matches(self, g):
        return eph_of(g) < 0.10 and (g["rating"] or 0) >= 75


class Hidden(Theme):
    def matches(self, g):
        return (g["price"] < 10 and (g["rating"] or 0) >= 90
                and (g["ratingCount"] or 0) <= 3000 and hours_of(g) >= 8)

    def sort_key(self, g):
        return (-(g["rating"] or 0), eph_of(g))

    def speech_for(self, lang, g):
        return lang.speech_rating(g)

    def caption_for(self, lang, g):
        return lang.caption_rating(g)


THEMES: dict[str, Theme] = {
    "under5": Under5("under5", {
        "en": ThemeText(
            "3 Steam games under €5 with MASSIVE playtime.",
            "3 Steam games under 5 euros with massive playtime.",
            "3 Steam games under €5 with 25+ hours of gameplay",
            ["#cheapgames", "#budgetgaming"]),
        "es": ThemeText(
            f"3 juegos de Steam por menos de 5{NBSP}€ con DECENAS DE HORAS.",
            "3 juegos de Steam por menos de 5 euros con decenas de horas.",
            "3 juegos de Steam por menos de 5 € con más de 25 horas",
            ["#juegosbaratos", "#chollos"]),
    }),
    "pennies": Pennies("pennies", {
        "en": ThemeText(
            "3 Steam games under 10 CENTS per hour of fun.",
            "3 Steam games under 10 cents per hour of fun.",
            "3 Steam games that cost less than €0.10 per hour",
            ["#cheapgames", "#valueformoney"]),
        "es": ThemeText(
            "3 juegos de Steam a menos de 10 CÉNTIMOS la hora.",
            "3 juegos de Steam a menos de 10 céntimos la hora.",
            "3 juegos de Steam que cuestan menos de 0,10 € la hora",
            ["#juegosbaratos", "#chollosgaming"]),
    }),
    "hidden": Hidden("hidden", {
        "en": ThemeText(
            "3 cheap HIDDEN GEMS on Steam nobody talks about.",
            "3 cheap hidden gems on Steam nobody talks about.",
            "3 cheap hidden gems on Steam you probably missed",
            ["#hiddengems", "#underratedgames"]),
        "es": ThemeText(
            "3 JOYAS OCULTAS baratas de Steam que nadie conoce.",
            "3 joyas ocultas baratas de Steam que nadie conoce.",
            "3 joyas ocultas baratas de Steam que te has perdido",
            ["#joyasocultas", "#juegosinfravalorados"]),
    }),
}


# --------------------------------------------------------------------------- selección

def load_history() -> list[dict]:
    if HISTORY_FILE.exists():
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    return []


def save_history(history: list[dict]) -> None:
    HISTORY_FILE.write_text(json.dumps(history[-100:], indent=2), encoding="utf-8")


def pick_movie_sources(detail: dict) -> list[str]:
    srcs = []
    movies = sorted(detail.get("movies") or [], key=lambda m: not m.get("highlight"))
    for m in movies:
        mp4 = m.get("mp4")
        if isinstance(mp4, dict):
            srcs += [mp4[k] for k in ("max", "480") if mp4.get(k)]
        elif isinstance(mp4, str):
            srcs.append(mp4)
        if m.get("hls"):
            srcs.append(m["hls"])
    return srcs


def select_games(theme: Theme, seed: int | None, min_reviews: int) -> list[tuple[dict, dict]]:
    games, _ = load_games()
    recent = {i for entry in load_history()[-HISTORY_WINDOW:] for i in entry["ids"]}

    base = [g for g in games
            if is_paid(g) and g.get("hasVideo") and hours_of(g) and eph_of(g) is not None
            and (g.get("ratingCount") or 0) >= min_reviews and theme.matches(g)]
    base.sort(key=theme.sort_key)

    fresh = [g for g in base if g["id"] not in recent]
    if len(fresh) < 3:
        print(f"[!] Solo {len(fresh)} juegos sin usar en '{theme.key}'; se permiten repetidos.")
        fresh = base

    rng = random.Random(seed)
    chosen: list[tuple[dict, dict]] = []
    pool = fresh[:POOL_SIZE]
    rng.shuffle(pool)
    for g in pool + fresh[POOL_SIZE:]:
        detail = load_detail(g["id"])
        if detail and (pick_movie_sources(detail) or detail.get("screenshots")):
            chosen.append((g, detail))
        if len(chosen) == 3:
            break
    if len(chosen) < 3:
        sys.exit(f"[x] No hay 3 juegos válidos para el tema '{theme.key}' con ≥{min_reviews} reseñas "
                 f"(prueba con --min-reviews más bajo).")
    # el mejor al final para retener audiencia
    chosen.sort(key=lambda gd: theme.sort_key(gd[0]), reverse=True)
    return chosen


# --------------------------------------------------------------------------- texto / overlays

_font_path: str | None = None


def font(size: int) -> ImageFont.FreeTypeFont:
    global _font_path
    if _font_path is None:
        _font_path = next((p for p in FONT_CANDIDATES if Path(p).exists()), "")
    if _font_path:
        return ImageFont.truetype(_font_path, size)
    return ImageFont.load_default(size)


def words_of(text: str) -> list[str]:
    # split(" ") y no split(): así el espacio duro (NBSP) mantiene "5 €" unido
    return [w for w in text.split(" ") if w]


def wrap(text: str, fnt, max_w: int) -> list[str]:
    lines, cur = [], ""
    for word in words_of(text):
        test = f"{cur} {word}".strip()
        if fnt.getlength(test) <= max_w or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def fit_lines(text: str, max_w: int, max_lines: int, start: int, minimum: int = 36):
    size = start
    while size > minimum:
        fnt = font(size)
        lines = wrap(text, fnt, max_w)
        if len(lines) <= max_lines and all(fnt.getlength(l) <= max_w for l in lines):
            return fnt, lines
        size -= 4
    fnt = font(minimum)
    return fnt, wrap(text, fnt, max_w)[:max_lines]


def draw_block(d: ImageDraw.ImageDraw, text: str, center_y: int, *, size: int, max_lines: int,
               fill=WHITE, stroke=8, max_w: int = W - 120, spacing: float = 1.12) -> int:
    """Dibuja texto centrado (con contorno). Devuelve la Y inferior."""
    fnt, lines = fit_lines(text, max_w, max_lines, size)
    lh = int(fnt.size * spacing)
    y = center_y - (lh * len(lines)) // 2
    for line in lines:
        d.text((W // 2, y), line, font=fnt, fill=fill, anchor="ma",
               stroke_width=stroke, stroke_fill=BLACK)
        y += lh
    return y


def watermark(d: ImageDraw.ImageDraw) -> None:
    d.text((W // 2, 110), SITE_HOST, font=font(38), fill=(255, 255, 255, 220), anchor="ma",
           stroke_width=4, stroke_fill=BLACK)


def overlay_game(lang: Lang, rank: int, g: dict, caption: str, path: Path) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    watermark(d)

    # Ranking + nombre (encima del vídeo centrado, que ocupa ~y 656-1264)
    d.rounded_rectangle((W // 2 - 70, 230, W // 2 + 70, 330), radius=24, fill=YELLOW)
    d.text((W // 2, 280), f"#{rank}", font=font(70), fill=BLACK, anchor="mm")
    draw_block(d, clean_name(g["name"]).upper(), 480, size=92, max_lines=2, stroke=9)

    # Badge de alto contraste debajo del vídeo
    badge = lang.badge(g)
    fnt, _ = fit_lines(badge, W - 160, 1, 76)
    tw = fnt.getlength(badge)
    bx0, by0 = (W - tw) / 2 - 36, 1310
    bx1, by1 = (W + tw) / 2 + 36, by0 + fnt.size + 52
    d.rounded_rectangle((bx0 + 8, by0 + 10, bx1 + 8, by1 + 10), radius=28, fill=BLACK)
    d.rounded_rectangle((bx0, by0, bx1, by1), radius=28, fill=YELLOW, outline=BLACK, width=6)
    d.text((W // 2, (by0 + by1) / 2), badge, font=fnt, fill=BLACK, anchor="mm")

    if g.get("discount"):
        tag = f"-{g['discount']}%"
        tf = font(56)
        tx1 = bx1 + 10
        tx0 = tx1 - tf.getlength(tag) - 40
        d.rounded_rectangle((tx0, by0 - 70, tx1, by0 + 6), radius=18, fill=RED, outline=BLACK, width=4)
        d.text(((tx0 + tx1) / 2, by0 - 32), tag, font=tf, fill=WHITE, anchor="mm")

    d.text((W // 2, by1 + 40), lang.rating_line(g), font=font(40), fill=WHITE, anchor="ma",
           stroke_width=5, stroke_fill=BLACK)

    draw_block(d, caption, 1650, size=58, max_lines=3, stroke=7)
    img.save(path)


def is_hot(word: str) -> bool:
    core = word.strip(".,!?¡¿:;")
    return "€" in word or (len(core) >= 2 and core.isupper())


def overlay_hook(text: str, path: Path) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 110))
    d = ImageDraw.Draw(img)
    watermark(d)
    fnt, lines = fit_lines(text, W - 110, 5, 116)
    lh = int(fnt.size * 1.15)
    y = H // 2 - (lh * len(lines)) // 2
    for line in lines:
        # resalta en amarillo las palabras en mayúsculas / con €
        x = W // 2 - fnt.getlength(line) / 2
        for word in line.split(" "):
            d.text((x, y), word, font=fnt, fill=YELLOW if is_hot(word) else WHITE,
                   stroke_width=10, stroke_fill=BLACK)
            x += fnt.getlength(word + " ")
        y += lh
    img.save(path)


def frame_cta(lang: Lang, headers: list[Path], count: int, path: Path) -> None:
    img = Image.new("RGBA", (W, H), (12, 14, 24, 255))
    # fondo: portadas de los 3 juegos desenfocadas
    for i, hp in enumerate(headers):
        try:
            tile = Image.open(hp).convert("RGBA").resize((W, H // 3))
            img.paste(tile.filter(ImageFilter.GaussianBlur(18)), (0, i * H // 3))
        except Exception:
            pass
    img = Image.alpha_composite(img, Image.new("RGBA", (W, H), (8, 10, 20, 185)))
    d = ImageDraw.Draw(img)
    d.text((W // 2, 520), "CostXHour", font=font(150), fill=YELLOW, anchor="mm",
           stroke_width=10, stroke_fill=BLACK)
    draw_block(d, lang.cta_tagline(count), 820, size=84, max_lines=3, stroke=8)
    uf = font(62)
    tw = uf.getlength(SITE_HOST)
    d.rounded_rectangle(((W - tw) / 2 - 40, 1080, (W + tw) / 2 + 40, 1200), radius=60, fill=YELLOW,
                        outline=BLACK, width=6)
    d.text((W // 2, 1140), SITE_HOST, font=uf, fill=BLACK, anchor="mm")
    d.text((W // 2, 1290), lang.cta_free, font=font(48), fill=WHITE, anchor="ma",
           stroke_width=5, stroke_fill=BLACK)
    d.text((W // 2, 1420), lang.cta_link, font=font(64), fill=WHITE, anchor="ma",
           stroke_width=7, stroke_fill=BLACK)
    img.convert("RGB").save(path)


# --------------------------------------------------------------------------- voz

def tts(text: str, out: Path, voice: str, rate: str = "+15%") -> None:
    import edge_tts
    asyncio.run(edge_tts.Communicate(text, voice, rate=rate).save(str(out)))


def tighten_audio(src: Path, out: Path) -> None:
    """Recorta silencios iniciales/finales y acorta las pausas largas entre frases."""
    if not run_ffmpeg(["-i", str(src), "-af",
                       "silenceremove=start_periods=1:start_threshold=-45dB:"
                       "stop_periods=-1:stop_duration=0.18:stop_threshold=-45dB:stop_silence=0.12,"
                       # el silencio final no siempre se elimina: se recorta al revés
                       "areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                       "-ar", "44100", "-ac", "2", str(out)]):
        shutil.copy(src, out)


def probe_duration(path: Path | str) -> float:
    extra = ["-user_agent", USER_AGENT] if str(path).startswith("http") else []
    r = subprocess.run(["ffprobe", "-v", "error", *extra, "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", str(path)], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


# --------------------------------------------------------------------------- ffmpeg

def best_hls_variant(url: str) -> str:
    """Elige la variante ≤1080p de mayor bitrate para no abrir todas (más rápido)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        text = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "replace")
    except Exception:
        return url
    best, best_score = url, (-1, -1)
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("#EXT-X-STREAM-INF") and i + 1 < len(lines):
            res = re.search(r"RESOLUTION=(\d+)x(\d+)", line)
            bw = re.search(r"BANDWIDTH=(\d+)", line)
            height = int(res.group(2)) if res else 0
            score = (height if height <= 1080 else -height, int(bw.group(1)) if bw else 0)
            if score > best_score:
                best_score, best = score, urllib.parse.urljoin(url, lines[i + 1].strip())
    return best


def run_ffmpeg(args: list[str]) -> bool:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print("    ffmpeg:", r.stderr.strip().splitlines()[-1:] or "error")
    return r.returncode == 0


ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS),
       "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2"]


def trailer_start(total: float, need: float, offset: float = TRAILER_OFFSET) -> float:
    """Salta la intro del tráiler; si es demasiado corto, retrocede lo justo (mínimo 0)."""
    if total <= 0 or total >= offset + need:
        return offset
    return max(0.0, total - need)


def fetch_clip(detail: dict, need: float, out: Path) -> bool:
    """Descarga una sola vez el trozo de tráiler (sin audio) que usan todos los idiomas."""
    for src in pick_movie_sources(detail)[:2]:
        url = best_hls_variant(src) if ".m3u8" in src else src
        total = probe_duration(url)
        starts = [trailer_start(total, need)]
        if starts[0] > 0:
            starts.append(0.0)   # por si la duración no era fiable
        for ss in starts:
            if run_ffmpeg(["-ss", f"{ss:.2f}", "-t", f"{need:.2f}", "-user_agent", USER_AGENT, "-i", url,
                           "-an", "-vf", f"fps={FPS},scale={W}:-2", "-c:v", "libx264", "-preset", "veryfast",
                           "-crf", "16", "-pix_fmt", "yuv420p", str(out)]) and probe_duration(out) > 2:
                print(f"    tráiler desde {ss:.0f}s")
                return True
    return False


def render_segment(visual_args: list[str], overlay: Path, voice: Path, dur: float, out: Path,
                   still: bool = False) -> bool:
    """visual_args: argumentos de entrada de ffmpeg para el vídeo/imagen de fondo."""
    # tpad congela el último frame si el tráiler es más corto que el segmento
    pad = "" if still else "tpad=stop_mode=clone:stop_duration=30,"
    fc = f"[0:v]{pad}fps={FPS},split=2[a][b];"
    fc += (
        f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
        f"boxblur=40:2,eq=brightness=-0.12[bg];"
        f"[b]scale={W}:-2[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2[v1];"
        f"[v1][1:v]overlay=0:0,format=yuv420p[v];"
        f"[2:a]aformat=sample_rates=44100:channel_layouts=stereo,apad[aout]"
    )
    return run_ffmpeg([*visual_args, "-loop", "1", "-i", str(overlay), "-i", str(voice),
                       "-filter_complex", fc, "-map", "[v]", "-map", "[aout]", "-t", f"{dur:.2f}",
                       *ENC, str(out)])


def visual_input(source: Path, is_clip: bool, start: float, dur: float) -> list[str]:
    if is_clip:
        return ["-ss", f"{start:.2f}", "-i", str(source)]
    return ["-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.2f}", "-i", str(source)]


def mix_bgm(video: Path, bgm: Path, out: Path) -> bool:
    """Música en bucle al BGM_VOLUME por debajo de la voz, con fundido de entrada y salida."""
    fade_st = max(0.0, probe_duration(video) - 1.5)
    fc = (f"[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume={BGM_VOLUME},"
          f"afade=t=in:d=0.6,afade=t=out:st={fade_st:.2f}:d=1.5[m];"
          f"[0:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]")
    return run_ffmpeg(["-i", str(video), "-stream_loop", "-1", "-i", str(bgm), "-filter_complex", fc,
                       "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                       "-movflags", "+faststart", str(out)])


def download(url: str, out: Path) -> Path | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        out.write_bytes(urllib.request.urlopen(req, timeout=20).read())
        return out
    except Exception:
        return None


# --------------------------------------------------------------------------- main

def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def build_script(theme: Theme, lang: Lang, chosen: list[tuple[dict, dict]]) -> list[tuple[str, str]]:
    script = [("hook", theme.texts[lang.code].hook_speech)]
    script += [(f"game{i}", theme.speech_for(lang, g)) for i, (g, _) in enumerate(chosen, 1)]
    script.append(("cta", lang.cta_speech))
    return script


def write_caption_file(path: Path, theme: Theme, lang: Lang, chosen: list[tuple[dict, dict]],
                       count: int) -> None:
    hrs = "h" if lang.code == "en" else " h"
    per = "/hr" if lang.code == "en" else "/h"
    items = [f"{i}. {clean_name(g['name'])} — {lang.eur(g['price'])} · {lang.hours(hours_of(g))}{hrs} · "
             f"{lang.eph(eph_of(g))}{per}" for i, (g, _) in enumerate(chosen, 1)]
    text = theme.texts[lang.code]
    tags = " ".join(text.hashtags + lang.base_tags)
    path.write_text(lang.caption_file(text.title, items, tags, count).replace(NBSP, " "), encoding="utf-8")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):   # consola de Windows (cp1252) con €, ≥, ñ...
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser(description="Generador de Shorts de CostXHour")
    ap.add_argument("--theme", choices=THEMES, default="under5")
    ap.add_argument("--lang", choices=["en", "es", "both"], default="both",
                    help="both = un vídeo por idioma con los mismos 3 juegos")
    ap.add_argument("--voice", default=English.default_voice, help="voz de edge-tts en inglés")
    ap.add_argument("--voice-es", default=Spanish.default_voice, help="voz de edge-tts en español")
    ap.add_argument("--min-reviews", type=int, default=MIN_REVIEWS,
                    help=f"mínimo de reseñas en Steam (por defecto {MIN_REVIEWS})")
    ap.add_argument("--bgm", type=Path, default=BGM_FILE,
                    help="música de fondo opcional (se usa solo si el archivo existe)")
    ap.add_argument("--seed", type=int, help="semilla para que la selección sea reproducible")
    ap.add_argument("--dry-run", action="store_true", help="solo muestra juegos y guion")
    ap.add_argument("--keep-temp", action="store_true")
    ap.add_argument("--no-history", action="store_true", help="no registrar en used_games.json")
    args = ap.parse_args()

    for tool in ("ffmpeg", "ffprobe"):
        if not args.dry_run and not shutil.which(tool):
            sys.exit(f"[x] '{tool}' no está en el PATH.")

    voices = {"en": args.voice, "es": args.voice_es}
    langs = [LANGS[c] for c in (["en", "es"] if args.lang == "both" else [args.lang])]
    bgm = args.bgm if args.bgm and args.bgm.is_file() else None

    theme = THEMES[args.theme]
    _, meta = load_games()
    count = meta.get("count", 0)
    chosen = select_games(theme, args.seed, args.min_reviews)
    scripts = {lang.code: build_script(theme, lang, chosen) for lang in langs}

    print(f"Tema: {theme.key} | idiomas: {', '.join(scripts)} | voces: {voices["en"]}, {voices["es"]} | "
          f"≥{args.min_reviews} reseñas | música: {bgm.name if bgm else 'no'}")
    for g, _ in chosen:
        print(f"  - {g['id']:>8}  {clean_name(g['name'])}  ({fmt_eur(g['price'])}, "
              f"{fmt_eph(eph_of(g))}/h, {g['ratingCount']:,} reseñas)")
    for code, script in scripts.items():
        for key, line in script:
            print(f"  [{code}:{key}] {line}")
    if args.dry_run:
        return

    stamp = date.today().isoformat()
    tmp = TEMP_DIR / f"{stamp}_{theme.key}"
    tmp.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1) voz (por idioma)
    durations: dict[str, dict[str, float]] = {}
    limits = {"hook": (2.0, 3.0), "cta": (3.0, 4.5)}
    for code, script in scripts.items():
        durations[code] = {}
        for key, line in script:
            raw, wav = tmp / f"{code}_{key}_raw.mp3", tmp / f"{code}_{key}.wav"
            print(f"[tts:{code}] {key}")
            tts(line, raw, voices[code], rate="+20%" if key == "hook" else "+15%")
            tighten_audio(raw, wav)
            lo, hi = limits.get(key, (5.0, 6.0))
            speech = probe_duration(wav)
            # nunca cortamos la voz: si es más larga que el máximo, el segmento se alarga
            durations[code][key] = max(clamp(speech + 0.25, lo, hi), speech + 0.15)
        if durations[code]["hook"] > 3.05:
            print(f"    [!] hook en '{code}' dura {durations[code]['hook']:.1f}s (>3 s): acorta la frase")

    # 2) clips del tráiler: se descargan una vez y se comparten entre idiomas.
    #    El hook usa el principio del clip del juego #1 y el #1 continúa justo después.
    visuals: list[tuple[Path, bool]] = []
    headers: list[Path] = []
    for i, (g, detail) in enumerate(chosen, 1):
        need = max(d[f"game{i}"] + (d["hook"] if i == 1 else 0) for d in durations.values()) + 0.5
        print(f"[clip] #{i} {clean_name(g['name'])} ({need:.1f}s)")
        clip = tmp / f"clip{i}.mp4"
        if fetch_clip(detail, need, clip):
            visuals.append((clip, True))
        else:
            shots = detail.get("screenshots") or []
            shot = download(shots[0]["full"], tmp / f"shot{i}.jpg") if shots else None
            if not shot:
                sys.exit(f"[x] Sin tráiler ni captura para {g['name']}.")
            print("    (sin tráiler utilizable: se usa una captura)")
            visuals.append((shot, False))
        h = download(g["header"], tmp / f"header{i}.jpg")
        if h:
            headers.append(h)

    empty = tmp / "empty.png"
    Image.new("RGBA", (W, H), (0, 0, 0, 0)).save(empty)

    # 3) render por idioma
    outputs: list[Path] = []
    for lang in langs:
        code, dur = lang.code, durations[lang.code]
        segments: list[Path] = []

        print(f"[video:{code}] hook")
        hook_png = tmp / f"{code}_hook.png"
        overlay_hook(theme.texts[code].hook_text, hook_png)
        seg = tmp / f"{code}_seg0_hook.mp4"
        src, is_clip = visuals[0]
        if not render_segment(visual_input(src, is_clip, 0, dur["hook"]), hook_png,
                              tmp / f"{code}_hook.wav", dur["hook"], seg, still=not is_clip):
            sys.exit("[x] No se pudo renderizar el hook.")
        segments.append(seg)

        for i, (g, _) in enumerate(chosen, 1):
            print(f"[video:{code}] #{i} {clean_name(g['name'])}")
            png = tmp / f"{code}_game{i}.png"
            overlay_game(lang, i, g, theme.caption_for(lang, g), png)
            seg = tmp / f"{code}_seg{i}.mp4"
            src, is_clip = visuals[i - 1]
            start = dur["hook"] if i == 1 else 0
            if not render_segment(visual_input(src, is_clip, start, dur[f"game{i}"]), png,
                                  tmp / f"{code}_game{i}.wav", dur[f"game{i}"], seg, still=not is_clip):
                sys.exit(f"[x] No se pudo renderizar {g['name']}.")
            segments.append(seg)

        print(f"[video:{code}] CTA")
        cta_png = tmp / f"{code}_cta.png"
        frame_cta(lang, headers, count, cta_png)
        seg = tmp / f"{code}_seg9_cta.mp4"
        if not render_segment(visual_input(cta_png, False, 0, dur["cta"]), empty,
                              tmp / f"{code}_cta.wav", dur["cta"], seg, still=True):
            sys.exit("[x] No se pudo renderizar el CTA.")
        segments.append(seg)

        # concatenar (+ música opcional)
        out = OUTPUT_DIR / f"short_{stamp}_{theme.key}_{code}.mp4"
        listing = tmp / f"{code}_concat.txt"
        listing.write_text("".join(f"file '{s.as_posix()}'\n" for s in segments), encoding="utf-8")
        joined = tmp / f"{code}_joined.mp4" if bgm else out
        if not run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy",
                           "-movflags", "+faststart", str(joined)]):
            sys.exit("[x] Falló la concatenación.")
        if bgm:
            print(f"[audio:{code}] música de fondo ({bgm.name}, {BGM_VOLUME:.0%})")
            if not mix_bgm(joined, bgm, out):
                print("    [!] no se pudo mezclar la música; se deja solo la voz")
                shutil.copy(joined, out)

        write_caption_file(out.with_suffix(".txt"), theme, lang, chosen, count)
        outputs.append(out)

    if not args.no_history:
        history = load_history()
        history.append({"date": stamp, "theme": theme.key, "ids": [g["id"] for g, _ in chosen]})
        save_history(history)
    if not args.keep_temp:
        shutil.rmtree(tmp, ignore_errors=True)

    print()
    for out in outputs:
        print(f"[ok] {out}  ({probe_duration(out):.1f}s)")
        print(f"[ok] {out.with_suffix('.txt')}")


if __name__ == "__main__":
    main()
