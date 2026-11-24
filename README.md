# Euro por Hora

Catálogo web (sin registro) para descubrir juegos de Steam **baratos y con muchas horas de contenido**: filtra por precio, duración según HowLongToBeat y **euros por hora** (€/h).

```
steam-recommender/
├── scraper/          Pipeline de datos en Python: CheapShark → Steam Store → HowLongToBeat
├── data/games.db     Base SQLite con todo lo descargado (se versiona: la usa GitHub Actions)
├── frontend/         Web en Vite + React + TypeScript + Tailwind (preparada para Capacitor)
│   └── public/data/  Catálogo exportado: games.json + details/{appId}.json
└── netlify.toml      Configuración de despliegue (Netlify)
```

La web **nunca** consulta Steam ni HowLongToBeat en tiempo real: el scraper genera ficheros JSON estáticos y el navegador filtra en local.

---

## 1. Arranque en local

Requisitos: **Python 3.11+** y **Node.js 22.12+** (o 20.19+, lo mínimo que acepta Vite 8). Los comandos son para PowerShell (Windows); en macOS/Linux cambia `.\.venv\Scripts\python.exe` por `.venv/bin/python`.

### Scraper (primera vez)

```powershell
cd scraper
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# Prueba rápida: 30 juegos de extremo a extremo (~3 min)
.\.venv\Scripts\python.exe run.py --limit 30
```

### Frontend

```powershell
cd frontend
npm install
npm run dev          # http://localhost:5173 (en el móvil: la URL "Network" que muestra Vite)
```

Otros comandos: `npm run build` (build de producción en `frontend/dist`), `npm run preview` (sirve ese build) y `npm run typecheck`.

---

## 2. Poblar el catálogo

Todos los comandos se ejecutan desde `scraper/` con el Python del entorno virtual:

```powershell
cd scraper
$py = ".\.venv\Scripts\python.exe"
```

### Carga inicial por lotes

La primera carga es lenta a propósito, para respetar los límites de cada API: **1,6 s por juego en Steam** y **~4 s por juego en HowLongToBeat** (a veces prueba varias variantes del título). En total, **unos 6 s por juego nuevo**. Cada juego se guarda en SQLite en cuanto se procesa, así que **puedes cortar con Ctrl+C en cualquier momento y relanzar el mismo comando**: retoma donde lo dejó, sin repetir nada.

| Lote | Comando | Deals de CheapShark | Tiempo aprox. (1.ª vez) |
|---|---|---|---|
| 1 | `& $py run.py --pages 10` | ~600 | ~1 h |
| 2 | `& $py run.py --pages 40` | ~2.400 (solo procesa los ~1.800 nuevos) | ~3 h |
| 3 | `& $py run.py` | catálogo completo | varias horas más |

Cada lote amplía el anterior: los juegos ya descargados no se vuelven a pedir a Steam ni a HowLongToBeat. Al terminar, cada ejecución regenera `frontend/public/data/`.

Si hubo fallos de red o juegos sin coincidencia en HowLongToBeat:

```powershell
& $py run.py --steps hltb,export --retry-hltb
```

### Refrescar precios (diario)

```powershell
& $py run.py --update-prices
```

Pide a Steam solo `price_overview`, **en lotes de 100 juegos por llamada**: 5.000 juegos son ~50 llamadas, unos **80 segundos**. Después regenera los JSON.

### Programar las actualizaciones

| Frecuencia | Comando | Para qué |
|---|---|---|
| Diaria | `run.py --update-prices` | Precios y descuentos en EUR |
| Semanal | `run.py --pages 40` | Incorporar juegos nuevos en oferta |
| Mensual | `run.py --steps steam,hltb,export --refresh-days 30` | Refrescar metadatos, tráileres y duraciones |

Ejemplo en **Windows (Programador de tareas)**, precios cada día a las 6:00:

```powershell
schtasks /Create /SC DAILY /ST 06:00 /TN "EuroPorHora-precios" `
  /TR "cmd /c cd /d C:\ruta\steam-recommender\scraper && .venv\Scripts\python.exe run.py --update-prices >> update.log 2>&1"
```

Ejemplo en **Linux/macOS (cron)**:

```cron
0 6 * * *  cd /ruta/steam-recommender/scraper && .venv/bin/python run.py --update-prices >> update.log 2>&1
0 4 * * 1  cd /ruta/steam-recommender/scraper && .venv/bin/python run.py --pages 40 >> update.log 2>&1
```

Tras cada actualización hay que **publicar los JSON nuevos** (ver despliegue). Si el repositorio está conectado a Netlify o Vercel, basta con hacer commit y push de `frontend/public/data/`.

### Automático con GitHub Actions (gratis)

El repositorio incluye dos workflows en `.github/workflows/` que hacen todo lo anterior sin tu PC encendido:

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `update-prices.yml` | Cada día a las 06:00 UTC (07:00/08:00 en España) | `run.py --update-prices` |
| `discover-games.yml` | Domingos a las 04:00 UTC | `run.py --pages 5`: añade poco a poco ofertas y lanzamientos nuevos |

Si hay cambios en `data/games.db` o `frontend/public/data/`, el propio workflow hace commit y push, y Netlify despliega solo.

**Para activarlos solo hay que subir el repo a GitHub** (con `data/games.db` y `frontend/public/data/` incluidos, que no están en `.gitignore`). A partir de ahí:

1. **Comprueba los permisos:** en *Settings → Actions → General → Workflow permissions*, marca **Read and write permissions** para que los workflows puedan hacer push. Los workflows ya piden `contents: write`, pero algunas cuentas y organizaciones lo bloquean por defecto.
2. **Lánzalos a mano (opcional):** en la pestaña *Actions*, elige el workflow y pulsa **Run workflow**. En `discover-games` puedes cambiar el número de páginas (60 deals por página, ~6 s por juego nuevo; con 5 páginas son como mucho ~30 min).
3. **Ten en cuenta que** GitHub pausa los workflows programados de un repo público tras **60 días sin actividad**. Como estos workflows hacen commits, normalmente se mantienen activos solos. Si se pausan, se reactivan desde la pestaña *Actions*.

Los dos workflows comparten un grupo de concurrencia, así que nunca escriben en la base a la vez. Antes de cambiar el catálogo a mano en local, haz `git pull`: `games.db` es binario y no se puede fusionar.

Referencia completa de opciones del scraper: [`scraper/README.md`](scraper/README.md).

---

## 3. Despliegue estático

El build es 100 % estático, con rutas relativas (`base: './'`) y navegación por hash (`#/app/{id}`), así que funciona en cualquier hosting estático o subcarpeta sin reglas de reescritura.

### Netlify

1. Conecta el repositorio. `netlify.toml` (en la raíz) ya define `base = "frontend"`, el comando `npm run build` y la carpeta `dist`.
2. Cada push despliega. Las cabeceras ya vienen configuradas: `/data/*` siempre se revalida (precios frescos) y tiene CORS abierto; `/assets/*` se cachea para siempre (los nombres llevan hash).

### Vercel

1. Importa el repositorio y pon **Root Directory = `frontend`**. Vercel detecta Vite automáticamente.
2. `frontend/vercel.json` aplica las mismas cabeceras de caché y CORS.

### Manual (cualquier hosting)

```powershell
cd frontend
npm run build      # sube el contenido de frontend/dist/
```

### `VITE_DATA_URL`: de dónde se lee el catálogo

El frontend descarga `games.json` y `details/{appId}.json` de una misma base, configurable **en tiempo de build**:

| Valor | Uso |
|---|---|
| *(sin definir)* → `./data` | Por defecto: los datos van dentro del propio build (`public/data`). |
| `https://tu-web.com/data` | **App Capacitor**: la app instalada descarga los precios del día de la web, sin republicar en las tiendas. |
| `https://cdn.ejemplo.com/catalogo` | Datos en un CDN/bucket aparte: actualizar precios = subir los JSON, sin rebuild de la web. |

Se define en `frontend/.env.production` (ver `frontend/.env.example`), o como variable de entorno en Netlify/Vercel:

```env
VITE_DATA_URL=https://tu-web.com/data
```

Si los datos se sirven desde otro dominio, ese servidor debe enviar `Access-Control-Allow-Origin` (ya configurado en `netlify.toml` y `vercel.json`).

---

## 4. Rendimiento

El grid está **virtualizado** (`@tanstack/react-virtual` sobre el scroll de la ventana): solo existen en el DOM las filas visibles, sea cual sea el tamaño del catálogo. Al cerrar el detalle se conserva exactamente la posición de scroll.

Prueba con **5.000 juegos sintéticos** (build de producción, Edge headless):

| Métrica | Escritorio 1440×900 | Móvil 390×844, CPU 4× más lenta |
|---|---|---|
| Filtros y orden (acción → resultado pintado) | mediana 30 ms · peor 43 ms | mediana 59 ms · peor 149 ms |
| Scroll continuo | 60 fps, 0 tareas largas | 58–60 fps, 0 tareas largas |
| Tarjetas en el DOM (máx.) | 30 | 10 |
| Posición al volver del detalle | idéntica al píxel | idéntica al píxel |

Para repetir la prueba:

```powershell
cd frontend
node scripts/generate-stress-data.mjs 5000         # crea public/stress-data/
$env:VITE_DATA_URL = './stress-data'; npm run dev
# ...probar...
Remove-Item Env:VITE_DATA_URL
node scripts/generate-stress-data.mjs --clean      # ¡bórralo antes de desplegar!
```

> Vite copia todo `public/` al build: si dejas `public/stress-data/`, se desplegarían ~25 MB de datos falsos.

**Límite conocido:** el catálogo se guarda en `localStorage` para arrancar al instante. Este almacenamiento suele limitarse a ~5 MB, que da para unos 8.000 juegos. Por encima, la app sigue funcionando igual, pero sin el arranque instantáneo desde caché; la solución sería pasar esa caché a IndexedDB (o a Filesystem en Capacitor).

---

## 5. Preparado para Capacitor

| Pieza | Web hoy | Cambio al empaquetar |
|---|---|---|
| `src/utils/platform.ts` → `openExternalUrl()` | `window.open` | `Browser.open()` de `@capacitor/browser` |
| `src/utils/storage.ts` (API asíncrona) | `localStorage` | `@capacitor/preferences` |
| `src/services/gamesService.ts` | `./data` | `VITE_DATA_URL` apuntando a la web |
| Navegación | Hash `#/app/{id}` | Sin cambios; el botón "atrás" de Android cierra el detalle |
| Vídeo | HLS nativo / `hls.js` | Sin cambios (`playsInline`, HLS nativo en iOS/Android) |

El diseño ya respeta las zonas seguras (`env(safe-area-inset-*)`), usa controles táctiles de 44 px o más y muestra los filtros en un panel inferior en móvil.

---

## Fuentes de datos

- [CheapShark API](https://apidocs.cheapshark.com/): catálogo de ofertas de Steam.
- Steam Store API (`appdetails`): precios en EUR, metadatos, capturas y tráileres.
- [HowLongToBeat](https://howlongtobeat.com/), vía [`howlongtobeatpy`](https://github.com/ScrappyCocco/HowLongToBeat-PythonAPI): duraciones.

Proyecto sin afiliación con Valve, CheapShark ni HowLongToBeat.
