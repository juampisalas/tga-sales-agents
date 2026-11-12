import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDashboard } from "../src/server/dashboard.ts";
import { CampaignStore } from "../src/campaign/store.ts";

const PHARMA = "Necesito 200 contactos de empresas farmacéuticas de Chile, con más de 500 empleados, que trabajen en Recursos Humanos o Capacitación.";

async function startServer(
  installed = true,
  envPath = join(mkdtempSync(join(tmpdir(), "tga-dash-")), ".env"),
  prospectingRun: () => Promise<string> = async () => "No hay señal todavía.",
) {
  const store = CampaignStore.open(":memory:");
  const env: NodeJS.ProcessEnv = {};
  const dashboard = createDashboard(store, {
    canSearch: async () => ({ ok: false, reason: "Sin extensión. Importados verificados: 0." }),
  }, async () => ({ ok: installed, reason: "" }), {
    path: envPath,
    env,
    probe: async (current) => ({
      openai: { saved: Boolean(current.OPENAI_API_KEY?.trim()), connected: current.OPENAI_API_KEY === "sk-pagina-openai" },
      hubspot: { saved: Boolean(current.HUBSPOT_ACCESS_TOKEN?.trim()), connected: current.HUBSPOT_ACCESS_TOKEN === "pat-pagina-hubspot" },
    }),
  }, prospectingRun);
  await new Promise<void>((resolve) => dashboard.server.listen(0, "127.0.0.1", () => resolve()));
  const address = dashboard.server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${address.port}`,
    envPath,
    close: async () => {
      await new Promise<void>((resolve, reject) => dashboard.server.close((error) => error ? reject(error) : resolve()));
      store.close();
    },
  };
}

test("el panel muestra el chat y los controles", async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.base}/`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /TGA AI Sales Commander/);
    assert.match(html, /Preparar esta búsqueda/);
    assert.match(html, /Usar configuración predeterminada/);
    assert.match(html, /Iniciar búsqueda/);
    assert.match(html, /Pausar/);
    assert.match(html, /Reanudar/);
    assert.match(html, /Detener/);
    assert.match(html, /Guardar plantilla/);
    assert.match(html, /id="keys"/);
    assert.match(html, /Guardar claves/);
    assert.match(html, /id="openai-connected"/);
    assert.match(html, /Conectada/);
    assert.match(html, /id="agent-floor"/);
    assert.match(html, /El supervisor está arriba/);
    assert.match(html, /Por su cuenta/);
    assert.match(html, /id="start-prospecting"/);
    assert.match(html, /Arrancar prospección/);
    const agents = await fetch(`${server.base}/api/agents`);
    const floor = await agents.json() as { supervisor: { id: string }; agents: { id: string }[]; prospecting: { id: string } };
    assert.equal(agents.status, 200);
    assert.equal(floor.supervisor.id, "supervisor");
    assert.equal(floor.prospecting.id, "prospecting");
    assert.deepEqual(floor.agents.map((agent) => agent.id), [
      "navigator",
      "selection",
      "surfe",
      "hubspot",
      "qualification",
    ]);
  } finally {
    await server.close();
  }
});

test("arrancar prospección no mezcla su resultado con la lista diaria", async () => {
  const server = await startServer();
  try {
    const started = await fetch(`${server.base}/api/prospecting/start`, { method: "POST" });
    const body = await started.json() as { id: string; state: string; report: string };
    assert.equal(started.status, 200);
    assert.equal(body.id, "prospecting");
    assert.equal(body.state, "done");
    assert.equal(body.report, "No hay señal todavía.");
    const floor = await (await fetch(`${server.base}/api/agents`)).json() as { agents: { id: string }[]; prospecting: { report: string } };
    assert.equal(floor.agents.some((agent) => agent.id === "prospecting"), false);
    assert.equal(floor.prospecting.report, "No hay señal todavía.");
  } finally {
    await server.close();
  }
});

test("preparar e iniciar desde el panel no declara una importación", async () => {
  const server = await startServer();
  try {
    const prepared = await fetch(`${server.base}/api/interpret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: PHARMA }),
    });
    const preparedBody = await prepared.json() as { campaign: { id: string; status: string; config: { targetContacts: number } } };
    assert.equal(prepared.status, 200);
    assert.equal(preparedBody.campaign.status, "filters_ready");
    assert.equal(preparedBody.campaign.config.targetContacts, 200);
    const started = await fetch(`${server.base}/api/campaigns/${preparedBody.campaign.id}/start`, { method: "POST" });
    const startedBody = await started.json() as { status: string; imported: number; report: string };
    assert.equal(started.status, 200);
    assert.equal(startedBody.status, "blocked");
    assert.equal(startedBody.imported, 0);
    assert.match(startedBody.report, /Importados verificados: 0/);
    const paused = await fetch(`${server.base}/api/campaigns/${preparedBody.campaign.id}/pause`, { method: "POST" });
    assert.equal(paused.status, 400);
  } finally {
    await server.close();
  }
});

test("la configuración de la página guarda la clave y no la muestra", async () => {
  const server = await startServer();
  try {
    const page = await fetch(`${server.base}/`);
    const html = await page.text();
    assert.match(html, /id="openai-key"/);
    assert.match(html, /id="hubspot-key"/);
    const saved = await fetch(`${server.base}/api/credentials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ openaiApiKey: "sk-pagina-openai", hubspotAccessToken: "pat-pagina-hubspot" }),
    });
    const body = await saved.json() as { openai: { saved: boolean; connected: boolean }; hubspot: { saved: boolean; connected: boolean } };
    assert.equal(saved.status, 200);
    assert.deepEqual(body, {
      openai: { saved: true, connected: true },
      hubspot: { saved: true, connected: true },
    });
    assert.equal(JSON.stringify(body).includes("sk-pagina-openai"), false);
    const stored = readFileSync(server.envPath, "utf8");
    assert.match(stored, /OPENAI_API_KEY=sk-pagina-openai/);
    const again = await fetch(`${server.base}/api/credentials`);
    const againBody = await again.json() as { openai: { connected: boolean }; hubspot: { connected: boolean } };
    assert.deepEqual(againBody, {
      openai: { saved: true, connected: true },
      hubspot: { saved: true, connected: true },
    });
    assert.equal(JSON.stringify(againBody).includes("sk-pagina-openai"), false);
  } finally {
    await server.close();
  }
});

test("sin extensión bloquea el panel y la API", async () => {
  const server = await startServer(false);
  try {
    const response = await fetch(server.base + "/");
    const html = await response.text();
    assert.match(html, /Instalá Playwright para entrar/);
    assert.match(html, /chromewebstore.google.com/);
    assert.doesNotMatch(html, /id="agent-floor"/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const status = await fetch(server.base + "/api/extension");
    assert.deepEqual(await status.json(), { ok: false });
    for (const path of ["/api/state", "/api/agents", "/api/events", "/api/interpret"]) {
      const blocked = await fetch(server.base + path, { method: path === "/api/interpret" ? "POST" : "GET" });
      assert.equal(blocked.status, 403);
      assert.equal((await blocked.json()).code, "PLAYWRIGHT_EXTENSION_REQUIRED");
    }
  } finally { await server.close(); }
});
