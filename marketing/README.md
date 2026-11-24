# Marketing CostXHour

Scripts para generar Shorts en inglés y borradores de posts a partir de `frontend/public/data/`.
Todo lo generado va a `marketing/output/` (ignorado por git).

## Instalación (una vez)

Requiere Python 3.10+ y `ffmpeg` en el PATH (`winget install Gyan.FFmpeg`).

```powershell
python -m venv marketing/.venv
marketing/.venv/Scripts/Activate.ps1        # macOS/Linux: source marketing/.venv/bin/activate
pip install -r marketing/requirements.txt
```

Opcional, voz de ElevenLabs: crea `marketing/.env` con `ELEVENLABS_API_KEY=...`
(y si quieres `ELEVENLABS_VOICE_ID=...`). Sin clave se usa `edge-tts` gratis.

## Vídeo corto (9:16, ~25 s)

```powershell
python marketing/generate_video.py --theme under5     # <5 €, 25+ h, buenas reseñas
python marketing/generate_video.py --theme pennies    # <0,10 €/hora
python marketing/generate_video.py --theme hidden     # joyas ocultas baratas
```

Salida: `output/short_YYYY-MM-DD_<theme>.mp4` + `.txt` con título, descripción y hashtags.
Los juegos usados se guardan en `used_games.json` y no se repiten en los 10 vídeos siguientes.

Opciones útiles: `--dry-run` (solo ver juegos y guion), `--seed 42`, `--voice en-US-SteffanNeural`,
`--tts edge|elevenlabs`, `--no-history`, `--keep-temp`.

## Posts semanales (Reddit / foros)

```powershell
python marketing/generate_posts.py            # filtros: --min-discount 30 --min-rating 80 --min-reviews 200
```

Salida: `output/posts_YYYY-MM-DD.md` con 3 borradores (r/patientgamers, r/GameDeals, español).
Revisa las normas de autopromoción de cada comunidad antes de publicar.
