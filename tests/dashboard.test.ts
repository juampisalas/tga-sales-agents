import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createDashboard } from "../src/server/dashboard.ts";
import { CampaignStore } from "../src/campaign/store.ts";

const PHARMA = "Necesito 200 contactos de empresas farmacéuticas de Chile, con más de 500 empleados, que trabajen en Recursos Humanos o Capacitación.";

async function startServer(installed = true) {
  const store = CampaignStore.open(":memory:");
  const dashboard = createDashboard(store, {
    canSearch: async () => ({ ok: false, reason: "Sin extensión. Importados verificados: 0." }),
  }, async () => ({ ok: installed, reason: "" }));
  await new Promise<void>((resolve) => dashboard.server.listen(0, "127.0.0.1", () => resolve()));
  const address = dashboard.server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${address.port}`,
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
    assert.match(html, /id="agent-floor"/);
    assert.match(html, /El supervisor está arriba/);
    const agents = await fetch(`${server.base}/api/agents`);
    const floor = await agents.json() as { supervisor: { id: string }; agents: { id: string }[] };
    assert.equal(agents.status, 200);
    assert.equal(floor.supervisor.id, "supervisor");
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
