# TGA Sales Agents

El panel conversacional se llama TGA AI Sales Commander. Desde esta carpeta:

```bash
npm install
npm run dashboard
```

Abre http://127.0.0.1:8787. Escribí el pedido, revisá los filtros y recién después usá **Iniciar búsqueda**. Una instrucción mientras hay una campaña en curso queda en la cola. Las campañas y la configuración se guardan en SQLite (`DATABASE_PATH` o `./data/tga-sales-agents.sqlite`).

Iniciar no abre Chrome ni pulsa Surfe mientras la extensión de Playwright no esté conectada. Una importación no se marca como exitosa sin evidencia.

## Comprobaciones

```bash
npm run typecheck
npm test
```

`npm run check` ejecuta las dos. `npm run check:extension` solo informa si la extensión está instalada. No inicia sesión en LinkedIn.

## Extensión de Chrome

`npm run check:extension` no abre LinkedIn y no hace clic. Comprueba si la extensión oficial de Playwright está en algún perfil de Chrome y pide a Playwright MCP un snapshot de solo lectura. En la verificación de esta fase salió con código 1.

Resultado de esa corrida: el último perfil usado era **Profile 4 (tgacompany.com)**. La extensión no estaba en Profile 4, Default (Work), Profile 1 (cafemartinez.com.ar), Profile 2 (Kiraz) ni Profile 3 (northlands.edu.ar). Playwright MCP 0.0.84 respondió: `Playwright Extension not found` en la carpeta de usuario de Chrome. No se fijó `PLAYWRIGHT_MCP_EXECUTABLE_PATH`: eso no usa la extensión ni la sesión ya abierta. No se instalaron binarios de navegador de Playwright; `--extension` no los necesita.

Para desbloquearlo, en el perfil de Chrome que ya muestra Sales Navigator autenticado:

1. Abrir [Playwright Extension](https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm).
2. Pulsar **Add to Chrome**.
3. En el diálogo, pulsar **Add extension**.
4. Dejar abierta la pestaña de Sales Navigator que ya está autenticada. No iniciar sesión otra vez.
5. Cuando Chrome abra la página de conexión de Playwright, pulsar **Allow & select** solo en esa pestaña de Sales Navigator.

Playwright, con la config actual (sin `--profile-dir-name`), se engancha al último perfil usado que tenga la extensión. Si ese perfil no la tiene, recorre Default y después Profile 1, Profile 2, etc. Instalarla solo en el perfil de Sales Navigator. No hace falta instalar navegadores de Playwright: `--extension` usa el Chrome que ya está abierto.

La prueba de acción de Surfe (botón de importación y confirmación) es la fase 3 y no está hecha. Esta fase no describe controles de Surfe porque la extensión no llegó a conectar.

## Pasos

Una sola clave, en `.env`:

```bash
OPENAI_API_KEY=
HUBSPOT_ACCESS_TOKEN=
```

`.env` está en `.gitignore`. Prospección importa el cliente compartido:

```python
from shared.openai_client import client
```

El modelo está en `config.py`. Para verlo sin llamar a OpenAI:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python main.py
.venv/bin/python -m unittest tests/test_shared_openai_client.py
```

`python main.py` seguido de un pedido se lo manda a prospección.

## Módulos

`src/navigator`, `src/selection`, `src/surfe`, `src/hubspot`, `src/qualification` y el placeholder SQLite en `src/persistence/sqlite.ts` (Node `node:sqlite`). Las variables de entorno de ejemplo están en `.env.example`, sin secretos.
