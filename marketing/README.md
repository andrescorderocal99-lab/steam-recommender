# Marketing CostXHour

Scripts para generar Shorts en inglés y español y borradores de posts a partir de `frontend/public/data/`.
Todo lo generado va a `marketing/output/` (ignorado por git).

## Instalación (una vez)

Requiere Python 3.10+ y `ffmpeg` en el PATH (`winget install Gyan.FFmpeg`).

```powershell
python -m venv marketing/.venv
marketing/.venv/Scripts/Activate.ps1        # macOS/Linux: source marketing/.venv/bin/activate
pip install -r marketing/requirements.txt
```

La voz se genera gratis con `edge-tts` (sin claves ni cuentas).

## Vídeo corto (9:16, ~23 s)

```powershell
python marketing/generate_video.py --theme under5     # <5 €, 25+ h, buenas reseñas
python marketing/generate_video.py --theme pennies    # <0,10 €/hora
python marketing/generate_video.py --theme hidden     # joyas ocultas baratas (1.500-3.000 reseñas)
```

Por defecto (`--lang both`) genera dos vídeos con los **mismos 3 juegos**, uno por cuenta:
`output/short_YYYY-MM-DD_<theme>_en.mp4` y `..._es.mp4`, cada uno con su `.txt` (título, descripción
y hashtags en su idioma). Usa `--lang en` o `--lang es` para generar solo uno.

- Hook de ≤3 s y el juego #1 entra justo después (con el mismo tráiler, sin corte brusco).
- Los tráilers empiezan en el segundo 7 para saltar logos y pantallas negras (si son muy cortos, antes).
- Solo juegos con ≥1.500 reseñas en Steam (`--min-reviews N` para cambiarlo).
- **Música de fondo:** si existe `marketing/bgm.mp3` se mezcla en bucle al 12 % por debajo de la voz,
  con fundido de entrada/salida (otra ruta: `--bgm ruta.mp3`). El incluido es propio y sin derechos:
  se genera con `python marketing/generate_bgm.py` (30 s lo-fi/synthwave, bucle perfecto;
  `--seed N` para variar el arpegio).

Los juegos usados se guardan en `used_games.json` y no se repiten en los 10 vídeos siguientes.

Opciones útiles: `--dry-run` (solo ver juegos y guion), `--seed 42`, `--voice en-US-SteffanNeural`,
`--voice-es es-ES-ElviraNeural`, `--no-history`, `--keep-temp`.

## Vídeos diarios automáticos (GitHub Actions)

`.github/workflows/daily-videos.yml` se ejecuta cada día a las 08:00 UTC (9:00 en invierno / 10:00 en
verano en España) y también a mano desde *Actions → Generar vídeos cortos (diario) → Run workflow*,
con el input `theme` (`auto`, `under5`, `pennies`, `hidden`). Con `auto` el tema rota según el día del
año (`día % 3` → `under5`, `pennies`, `hidden`).

Pasos: instala `ffmpeg`, Python y `rclone`, ejecuta `generate_video.py --lang both`, sube
`*_en.mp4`/`*_en.txt` a `gdrive_en:CostXHour Videos` y `*_es.mp4`/`*_es.txt` a
`gdrive_es:CostXHour Videos`, borra de ambas carpetas lo que tenga más de 15 días y hace commit de
`used_games.json` (si cambió) para no repetir juegos.

**Secreto `RCLONE_CONFIG`** (*Settings → Secrets and variables → Actions*): el contenido completo de
un `rclone.conf` con dos remotes de Google Drive llamados exactamente `gdrive_en` y `gdrive_es`
(una cuenta por idioma). Para crearlo en local:

```powershell
rclone config            # n → nombre gdrive_en → tipo drive → autoriza en el navegador; repite con gdrive_es
rclone config file       # muestra la ruta del rclone.conf; pega su contenido en el secreto
```

El token incluye un *refresh token*, así que no caduca mientras no revoques el acceso. Es una
credencial: no la subas nunca al repo.

## Posts semanales (Reddit / foros)

```powershell
python marketing/generate_posts.py            # filtros: --min-discount 30 --min-rating 80 --min-reviews 1500
```

Salida: `output/posts_YYYY-MM-DD.md` con 3 borradores (r/patientgamers, r/GameDeals, español).
Revisa las normas de autopromoción de cada comunidad antes de publicar.
