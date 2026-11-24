"""CLI del pipeline de datos.

Ejemplos:
  python run.py --limit 30                 # prueba rápida de extremo a extremo
  python run.py                            # catálogo completo (reanudable con Ctrl+C)
  python run.py --update-prices            # solo refresca precios EUR y re-exporta
  python run.py --steps hltb,export --retry-hltb
  python run.py --steps export             # solo regenera games.json
"""
import argparse
import logging
import sys
import time
from pathlib import Path

from pipeline import cheapshark, config, db, export, hltb, steam

ALL_STEPS = ("catalog", "steam", "hltb", "export")


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Pipeline Steam + CheapShark + HowLongToBeat")
    p.add_argument("--limit", type=int, help="Máximo de juegos a traer de CheapShark (y procesar en esta ejecución)")
    p.add_argument("--pages", type=int, help="Máximo de páginas de CheapShark (60 deals/página)")
    p.add_argument("--steps", default=",".join(ALL_STEPS),
                   help=f"Pasos separados por comas: {','.join(ALL_STEPS)}")
    p.add_argument("--update-prices", action="store_true",
                   help="Solo refresca precios EUR de los juegos ya guardados (lotes rápidos) y exporta")
    p.add_argument("--refresh-days", type=float,
                   help="Re-descarga metadatos de Steam/HLTB más antiguos que N días")
    p.add_argument("--retry-hltb", action="store_true", help="Reintenta los juegos sin coincidencia en HLTB")
    p.add_argument("--min-similarity", type=float, default=config.HLTB_MIN_SIMILARITY,
                   help="Umbral de similitud de nombre para aceptar un resultado de HLTB")
    p.add_argument("--db", type=Path, default=config.DB_PATH, help="Ruta de la base SQLite")
    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args(argv)


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    args = parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    log = logging.getLogger("run")

    steps = ("export",) if args.update_prices else tuple(s.strip() for s in args.steps.split(",") if s.strip())
    unknown = set(steps) - set(ALL_STEPS)
    if unknown:
        log.error("Pasos desconocidos: %s", ", ".join(sorted(unknown)))
        return 2

    conn = db.connect(args.db)
    started = time.monotonic()
    scope: list[int] | None = None  # con --limit, los pasos siguientes se ciñen a estos juegos
    try:
        if args.update_prices:
            n = steam.update_prices(conn)
            log.info("Precios refrescados: %s", n)
        if "catalog" in steps:
            ids = cheapshark.fetch_catalog(conn, limit=args.limit, max_pages=args.pages)
            log.info("Catálogo: %s juegos de CheapShark", len(ids))
            if args.limit:
                scope = ids
        if "steam" in steps:
            log.info("Steam: %s", steam.run(conn, scope, args.refresh_days))
        if "hltb" in steps:
            log.info("HLTB: %s", hltb.run(conn, scope, args.retry_hltb, args.refresh_days, args.min_similarity))
        if "export" in steps:
            export.run(conn)
    except KeyboardInterrupt:
        log.warning("Interrumpido. El progreso está guardado en %s; vuelve a ejecutar para reanudar.", args.db)
        return 130
    finally:
        conn.close()
    log.info("Terminado en %.1fs", time.monotonic() - started)
    return 0


if __name__ == "__main__":
    sys.exit(main())
