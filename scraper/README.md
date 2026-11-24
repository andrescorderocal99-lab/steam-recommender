# Pipeline de datos

CheapShark (catálogo Steam) → Steam Store API (metadatos, precio EUR, media) → HowLongToBeat (duración) → `data/games.db` + `frontend/public/data/`.

## Instalación

```powershell
cd scraper
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Uso

| Comando | Qué hace |
|---|---|
| `python run.py --limit 30` | Prueba rápida de extremo a extremo |
| `python run.py` | Catálogo completo. Se puede cortar con Ctrl+C y reanudar |
| `python run.py --pages 10` | Limita CheapShark a 10 páginas (600 deals) |
| `python run.py --update-prices` | Solo refresca precios EUR (lotes de 100 appids por llamada) y re-exporta |
| `python run.py --steps hltb,export --retry-hltb` | Reintenta los juegos sin coincidencia en HLTB |
| `python run.py --refresh-days 30` | Re-descarga metadatos de más de 30 días |
| `python run.py --steps export` | Solo regenera los JSON |

Cada juego se guarda en SQLite en cuanto se procesa, así que una interrupción no pierde datos.

## Salida

- `frontend/public/data/games.json`: índice ligero para filtrar/ordenar (precio, descuento, géneros, valoración, `hltb.{main,extra,completionist}` y `eurPerHour.{main,extra,completionist}`).
- `frontend/public/data/details/{appId}.json`: descripción, capturas (`thumb`/`full`) y vídeos, que se cargan al abrir el detalle.

## Notas

- **Vídeos:** Steam ya no publica `mp4`/`webm` en la mayoría de apps; sirve `hls` (`.m3u8`) y `dash` (`.mpd`). Se guardan todos los formatos disponibles.
- **Precio:** el precio EUR de Steam (`cc=es`) es la referencia; el de CheapShark (USD) solo sirve como catálogo.
- **HLTB:** se busca por el nombre oficial y luego por variantes sin ™/®, sin sufijos de edición y sin apóstrofos tipográficos. Solo se acepta un resultado con similitud ≥ 0.8 y con los mismos números de entrega (para no confundir *Civilization V* con *VI*).
- **Rate limits:** 1,6 s entre llamadas a Steam, con backoff ante 429; 1 s entre páginas de CheapShark y búsquedas HLTB.
