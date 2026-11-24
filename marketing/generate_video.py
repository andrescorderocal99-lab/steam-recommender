"""Genera un Short vertical (1080x1920, inglés) para TikTok / YouTube Shorts / Reels.

Uso:
    python marketing/generate_video.py --theme under5
    python marketing/generate_video.py --theme pennies --dry-run
    python marketing/generate_video.py --theme hidden --tts elevenlabs

Estructura del vídeo (~20-30 s):
    hook (0-3 s)  ->  3 juegos (5-6 s c/u, clip del tráiler de Steam)  ->  CTA (3-4 s)

Requiere ffmpeg/ffprobe en el PATH.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
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
USER_AGENT = "Mozilla/5.0 (compatible; video-generator)"

YELLOW = (255, 212, 0, 255)
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
RED = (235, 38, 54, 255)

FONT_CANDIDATES = [
    "C:/Windows/Fonts/seguibl.ttf", "C:/Windows/Fonts/impact.ttf", "C:/Windows/Fonts/arialbd.ttf",
    "/System/Library/Fonts/Supplemental/Arial Black.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]


# --------------------------------------------------------------------------- temas

@dataclass
class Theme:
    key: str
    hook_text: str           # lo que se lee en pantalla
    hook_speech: str         # lo que dice la voz
    title: str
    hashtags: list[str] = field(default_factory=list)

    def matches(self, g: dict) -> bool:
        raise NotImplementedError

    def sort_key(self, g: dict):
        return eph_of(g)

    def speech_for(self, i: int, g: dict) -> str:
        return (f"{spoken_name(g)}. {speak_eur(g['price'])} for {int(hours_of(g))} hours. "
                f"Just {speak_eph(eph_of(g))} an hour.")

    def caption_for(self, g: dict) -> str:
        return f"Just {fmt_eph(eph_of(g))} per hour of gameplay"


class Under5(Theme):
    def matches(self, g):
        return g["price"] < 5 and hours_of(g) >= 25 and (g["rating"] or 0) >= 80


class Pennies(Theme):
    def matches(self, g):
        return eph_of(g) < 0.10 and (g["rating"] or 0) >= 75


class Hidden(Theme):
    def matches(self, g):
        return (g["price"] < 10 and (g["rating"] or 0) >= 90
                and 100 <= (g["ratingCount"] or 0) <= 3000 and hours_of(g) >= 8)

    def sort_key(self, g):
        return (-(g["rating"] or 0), eph_of(g))

    def speech_for(self, i, g):
        return (f"{spoken_name(g)}. {g['rating']} percent positive, "
                f"{int(hours_of(g))} hours, only {speak_eur(g['price'])}.")

    def caption_for(self, g):
        return f"{g['rating']}% positive and only {fmt_eur(g['price'])}"


BASE_TAGS = ["#steam", "#pcgaming", "#gaming", "#steamdeals", "#gamingtips", "#indiegames", "#fyp"]

THEMES: dict[str, Theme] = {
    "under5": Under5(
        "under5",
        "Stop paying €70 for 10-hour games. Here are 3 Steam games under €5 with MASSIVE playtime.",
        "Stop paying 70 euros for 10 hour games. 3 Steam games under 5 euros with massive playtime.",
        "3 Steam games under €5 with 25+ hours of gameplay",
        ["#cheapgames", "#budgetgaming"],
    ),
    "pennies": Pennies(
        "pennies",
        "These 3 Steam games cost less than 10 CENTS per hour of fun.",
        "These 3 Steam games cost less than 10 cents per hour of fun.",
        "3 Steam games that cost less than €0.10 per hour",
        ["#cheapgames", "#valueforMoney"],
    ),
    "hidden": Hidden(
        "hidden",
        "3 cheap HIDDEN GEMS on Steam that almost nobody talks about.",
        "3 cheap hidden gems on Steam that almost nobody talks about.",
        "3 cheap hidden gems on Steam you probably missed",
        ["#hiddengems", "#underratedgames"],
    ),
}


def spoken_name(g: dict) -> str:
    return clean_name(g["name"]).rstrip(".!?")


def speak_eur(v: float) -> str:
    euros, cents = int(v), round((v - int(v)) * 100)
    if cents == 100:
        euros, cents = euros + 1, 0
    if euros == 0:
        return f"{cents} cents"
    unit = "euro" if euros == 1 else "euros"
    return f"{euros} {unit} {cents}" if cents else f"{euros} {unit}"


def speak_eph(v: float) -> str:
    cents = float(f"{v:.2f}") * 100   # mismo redondeo que el badge
    if cents < 1:
        return "less than one cent"
    return f"{round(cents)} cents" if cents < 100 else speak_eur(v)


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


def select_games(theme: Theme, seed: int | None) -> list[tuple[dict, dict]]:
    games, _ = load_games()
    recent = {i for entry in load_history()[-HISTORY_WINDOW:] for i in entry["ids"]}

    base = [g for g in games
            if is_paid(g) and g.get("hasVideo") and hours_of(g) and eph_of(g) is not None
            and (g.get("ratingCount") or 0) >= 100 and theme.matches(g)]
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
        sys.exit(f"[x] No hay 3 juegos válidos para el tema '{theme.key}'.")
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


def wrap(text: str, fnt, max_w: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
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


def overlay_game(rank: int, g: dict, caption: str, path: Path) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    watermark(d)

    # Ranking + nombre (encima del vídeo centrado, que ocupa ~y 656-1264)
    d.rounded_rectangle((W // 2 - 70, 230, W // 2 + 70, 330), radius=24, fill=YELLOW)
    d.text((W // 2, 280), f"#{rank}", font=font(70), fill=BLACK, anchor="mm")
    draw_block(d, clean_name(g["name"]).upper(), 480, size=92, max_lines=2, stroke=9)

    # Badge de alto contraste debajo del vídeo
    badge = f"{fmt_eur(g['price'])} | {fmt_hours(hours_of(g))} HOURS | {fmt_eph(eph_of(g))}/hr"
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

    rating = f"{g['rating']}% positive · {g['ratingCount']:,} reviews"
    d.text((W // 2, by1 + 40), rating, font=font(40), fill=WHITE, anchor="ma",
           stroke_width=5, stroke_fill=BLACK)

    draw_block(d, caption, 1650, size=58, max_lines=3, stroke=7)
    img.save(path)


def overlay_hook(text: str, path: Path) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 110))
    d = ImageDraw.Draw(img)
    watermark(d)
    fnt, lines = fit_lines(text, W - 110, 7, 104)
    lh = int(fnt.size * 1.15)
    y = H // 2 - (lh * len(lines)) // 2
    for line in lines:
        # resalta en amarillo las palabras en mayúsculas / con €
        x = W // 2 - fnt.getlength(line) / 2
        for word in line.split(" "):
            hot = "€" in word or (len(word) > 2 and word.isupper())
            d.text((x, y), word, font=fnt, fill=YELLOW if hot else WHITE,
                   stroke_width=10, stroke_fill=BLACK)
            x += fnt.getlength(word + " ")
        y += lh
    img.save(path)


def frame_cta(headers: list[Path], count_label: str, path: Path) -> None:
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
    draw_block(d, f"Filter {count_label} Steam games by cost per hour", 820, size=84, max_lines=3, stroke=8)
    uf = font(62)
    tw = uf.getlength(SITE_HOST)
    d.rounded_rectangle(((W - tw) / 2 - 40, 1080, (W + tw) / 2 + 40, 1200), radius=60, fill=YELLOW,
                        outline=BLACK, width=6)
    d.text((W // 2, 1140), SITE_HOST, font=uf, fill=BLACK, anchor="mm")
    d.text((W // 2, 1290), "Free · No login", font=font(48), fill=WHITE, anchor="ma",
           stroke_width=5, stroke_fill=BLACK)
    d.text((W // 2, 1420), "LINK IN BIO", font=font(64), fill=WHITE, anchor="ma",
           stroke_width=7, stroke_fill=BLACK)
    img.convert("RGB").save(path)


# --------------------------------------------------------------------------- voz

def tts(text: str, out: Path, engine: str, voice: str) -> None:
    if engine == "elevenlabs":
        key = os.environ["ELEVENLABS_API_KEY"]
        voice_id = os.environ.get("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")
        req = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            data=json.dumps({"text": text, "model_id": os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")}).encode(),
            headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            out.write_bytes(r.read())
        return

    import edge_tts
    asyncio.run(edge_tts.Communicate(text, voice, rate="+15%").save(str(out)))


def tighten_audio(src: Path, out: Path) -> None:
    """Recorta silencios iniciales/finales y acorta las pausas largas entre frases."""
    if not run_ffmpeg(["-i", str(src), "-af",
                       "silenceremove=start_periods=1:start_threshold=-45dB:"
                       "stop_periods=-1:stop_duration=0.18:stop_threshold=-45dB:stop_silence=0.12",
                       "-ar", "44100", "-ac", "2", str(out)]):
        shutil.copy(src, out)


def probe_duration(path: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
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


def render_from_game(detail: dict, offset: float, overlay: Path, voice: Path, dur: float, out: Path) -> bool:
    for src in pick_movie_sources(detail)[:2]:
        url = best_hls_variant(src) if ".m3u8" in src else src
        for ss in (offset, 0):
            args = ["-ss", f"{ss}", "-t", f"{dur + 0.5:.2f}", "-user_agent", USER_AGENT, "-i", url]
            if render_segment(args, overlay, voice, dur, out) and probe_duration(out) > dur - 0.5:
                return True
    shots = detail.get("screenshots") or []
    if shots:
        print("    (sin tráiler utilizable: se usa una captura)")
        args = ["-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.2f}", "-i", shots[0]["full"]]
        return render_segment(args, overlay, voice, dur, out, still=True)
    return False


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


def write_caption_file(path: Path, theme: Theme, chosen: list[tuple[dict, dict]], count_label: str) -> None:
    lines = [f"{i}. {clean_name(g['name'])} — {fmt_eur(g['price'])} · {fmt_hours(hours_of(g))}h · "
             f"{fmt_eph(eph_of(g))}/hr" for i, (g, _) in enumerate(chosen, 1)]
    tags = " ".join(theme.hashtags + BASE_TAGS)
    path.write_text(
        f"TITLE:\n{theme.title} #shorts\n\n"
        f"DESCRIPTION:\n{theme.title}:\n" + "\n".join(lines) +
        f"\n\nPrices from Steam (EUR) and playtime from HowLongToBeat — prices change, check before buying.\n"
        f"Filter {count_label} Steam games by cost per hour (free, no login): {SITE_URL}\n\n"
        f"HASHTAGS:\n{tags}\n",
        encoding="utf-8",
    )


def main() -> None:
    try:
        from dotenv import load_dotenv
        load_dotenv(MARKETING / ".env")
    except ImportError:
        pass

    ap = argparse.ArgumentParser(description="Generador de Shorts de CostXHour")
    ap.add_argument("--theme", choices=THEMES, default="under5")
    ap.add_argument("--tts", choices=["auto", "edge", "elevenlabs"], default="auto",
                    help="auto = ElevenLabs si hay ELEVENLABS_API_KEY, si no edge-tts")
    ap.add_argument("--voice", default="en-US-ChristopherNeural", help="voz de edge-tts")
    ap.add_argument("--seed", type=int, help="semilla para que la selección sea reproducible")
    ap.add_argument("--dry-run", action="store_true", help="solo muestra juegos y guion")
    ap.add_argument("--keep-temp", action="store_true")
    ap.add_argument("--no-history", action="store_true", help="no registrar en used_games.json")
    args = ap.parse_args()

    for tool in ("ffmpeg", "ffprobe"):
        if not args.dry_run and not shutil.which(tool):
            sys.exit(f"[x] '{tool}' no está en el PATH.")

    engine = args.tts
    if engine == "auto":
        engine = "elevenlabs" if os.environ.get("ELEVENLABS_API_KEY") else "edge"

    theme = THEMES[args.theme]
    _, meta = load_games()
    count_label = site_count_label(meta.get("count", 0))
    chosen = select_games(theme, args.seed)

    script = [("hook", theme.hook_speech)]
    script += [(f"game{i}", theme.speech_for(i, g)) for i, (g, _) in enumerate(chosen, 1)]
    script.append(("cta", "Find thousands more at CostX Hour. Link in bio."))

    print(f"Tema: {theme.key} | voz: {engine}")
    for g, _ in chosen:
        print(f"  - {g['id']:>8}  {clean_name(g['name'])}  ({fmt_eur(g['price'])}, {fmt_eph(eph_of(g))}/h)")
    for key, line in script:
        print(f"  [{key}] {line}")
    if args.dry_run:
        return

    stamp = date.today().isoformat()
    tmp = TEMP_DIR / f"{stamp}_{theme.key}"
    tmp.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1) voz
    durations: dict[str, float] = {}
    limits = {"hook": (3.0, 4.5), "cta": (3.0, 4.5)}
    for key, line in script:
        raw, wav = tmp / f"{key}_raw.mp3", tmp / f"{key}.wav"
        print(f"[tts] {key}")
        tts(line, raw, engine, args.voice)
        tighten_audio(raw, wav)
        lo, hi = limits.get(key, (5.0, 6.0))
        speech = probe_duration(wav)
        # nunca cortamos la voz: si es más larga que el máximo, el segmento se alarga
        durations[key] = max(clamp(speech + 0.3, lo, hi), speech + 0.15)

    # 2) segmentos
    segments: list[Path] = []
    first_detail = chosen[0][1]

    hook_png = tmp / "hook.png"
    overlay_hook(theme.hook_text, hook_png)
    print("[video] hook")
    seg = tmp / "seg0_hook.mp4"
    if not render_from_game(first_detail, 30, hook_png, tmp / "hook.wav", durations["hook"], seg):
        sys.exit("[x] No se pudo renderizar el hook.")
    segments.append(seg)

    headers = []
    for i, (g, detail) in enumerate(chosen, 1):
        print(f"[video] #{i} {clean_name(g['name'])}")
        png = tmp / f"game{i}.png"
        overlay_game(i, g, theme.caption_for(g), png)
        seg = tmp / f"seg{i}.mp4"
        if not render_from_game(detail, 12, png, tmp / f"game{i}.wav", durations[f"game{i}"], seg):
            sys.exit(f"[x] No se pudo renderizar {g['name']}.")
        segments.append(seg)
        h = download(g["header"], tmp / f"header{i}.jpg")
        if h:
            headers.append(h)

    print("[video] CTA")
    cta_png = tmp / "cta.png"
    frame_cta(headers, count_label, cta_png)
    empty = tmp / "empty.png"
    Image.new("RGBA", (W, H), (0, 0, 0, 0)).save(empty)
    seg = tmp / "seg9_cta.mp4"
    cta_args = ["-loop", "1", "-framerate", str(FPS), "-t", f"{durations['cta']:.2f}", "-i", str(cta_png)]
    if not render_segment(cta_args, empty, tmp / "cta.wav", durations["cta"], seg, still=True):
        sys.exit("[x] No se pudo renderizar el CTA.")
    segments.append(seg)

    # 3) concatenar
    out = OUTPUT_DIR / f"short_{stamp}_{theme.key}.mp4"
    listing = tmp / "concat.txt"
    listing.write_text("".join(f"file '{s.as_posix()}'\n" for s in segments), encoding="utf-8")
    if not run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy",
                       "-movflags", "+faststart", str(out)]):
        sys.exit("[x] Falló la concatenación.")

    write_caption_file(out.with_suffix(".txt"), theme, chosen, count_label)

    if not args.no_history:
        history = load_history()
        history.append({"date": stamp, "theme": theme.key, "ids": [g["id"] for g, _ in chosen]})
        save_history(history)
    if not args.keep_temp:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\n[ok] {out}  ({probe_duration(out):.1f}s)")
    print(f"[ok] {out.with_suffix('.txt')}")


if __name__ == "__main__":
    main()
