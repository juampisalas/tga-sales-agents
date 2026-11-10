import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Orchestrator } from "../src/campaign/orchestrator.ts";
import { CampaignStore } from "../src/campaign/store.ts";

const PHARMA = "Necesito 200 contactos de empresas farmacéuticas de Chile, con más de 500 empleados, que trabajen en Recursos Humanos o Capacitación.";

function orchestrator(filename = ":memory:"): { orchestrator: Orchestrator; store: CampaignStore } {
  const store = CampaignStore.open(filename);
  const engine = new Orchestrator(store, {
    canSearch: async () => ({ ok: false, reason: "Sin extensión. Importados verificados: 0." }),
  });
  return { orchestrator: engine, store };
}

test("preparar no inicia y el arranque queda bloqueado sin importados", async () => {
  const { orchestrator: engine, store } = orchestrator();
  const prepared = await engine.prepareInstruction(PHARMA);
  assert.equal(prepared.campaign.status, "filters_ready");
  assert.equal(prepared.queued, false);
  const started = await engine.start(prepared.campaign.id);
  assert.equal(started.status, "blocked");
  assert.equal(started.imported, 0);
  assert.match(started.report ?? "", /Importados verificados: 0/);
  const events = store.listEvents(started.id).map((event) => event.message).join("\n");
  assert.match(events, /Surfe/);
  assert.match(events, /no se abre/);
  store.close();
});

test("una instrucción durante la ejecución entra en la cola y después muestra filtros", async () => {
  const { orchestrator: engine, store } = orchestrator();
  const first = await engine.prepareInstruction(PHARMA);
  await engine.transition(first.campaign.id, { type: "start" });
  const second = await engine.prepareInstruction("Cuando termines los 200 de Chile, buscame otros 100 de Argentina, pero solamente del sector salud.");
  assert.equal(second.queued, true);
  assert.equal(second.campaign.status, "queued");
  assert.deepEqual(second.campaign.config.countries, ["Argentina"]);
  assert.equal(second.campaign.config.targetContacts, 100);
  await engine.stop(first.campaign.id);
  const promoted = store.getCampaign(second.campaign.id);
  assert.equal(promoted?.status, "filters_ready");
  assert.equal(promoted?.imported, 0);
  store.close();
});

test("una plantilla aprobada inicia la siguiente instrucción igual", async () => {
  const { orchestrator: engine, store } = orchestrator();
  const first = await engine.prepareInstruction(PHARMA);
  const template = engine.saveTemplate(first.campaign.id);
  engine.approveTemplate(template.id);
  const second = await engine.prepareInstruction(PHARMA);
  assert.equal(second.campaign.status, "blocked");
  assert.equal(second.campaign.imported, 0);
  assert.equal(second.campaign.config.targetContacts, 200);
  store.close();
});

test("el progreso se reabre desde SQLite", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tga-campaigns-"));
  const path = join(dir, "campaigns.sqlite");
  const first = orchestrator(path);
  const prepared = await first.orchestrator.prepareInstruction("Solo Chile");
  first.store.close();
  const second = orchestrator(path);
  const restored = second.store.getCampaign(prepared.campaign.id);
  assert.equal(restored?.status, "filters_ready");
  assert.deepEqual(restored?.config.countries, ["Chile"]);
  assert.equal(second.store.getDefaults().targetContacts, 500);
  second.store.close();
});

test("México y después Chile quedan en ese orden", async () => {
  const { orchestrator: engine, store } = orchestrator();
  const prepared = await engine.prepareInstruction("Necesito 300 contactos de México y después 200 de Chile");
  assert.deepEqual(prepared.campaign.config.countries, ["México"]);
  assert.equal(prepared.campaign.config.targetContacts, 300);
  assert.equal(prepared.queued, false);
  const campaigns = store.listCampaigns();
  assert.equal(campaigns.length, 2);
  assert.equal(campaigns[1]?.status, "queued");
  assert.deepEqual(campaigns[1]?.config.countries, ["Chile"]);
  assert.equal(campaigns[1]?.config.targetContacts, 200);
  const started = await engine.start(prepared.campaign.id);
  const events = store.listEvents(started.id).map((event) => event.message).join("\n");
  assert.match(events, /Add 25 to a list/);
  assert.match(events, /Create a new list/);
  assert.match(events, /México/);
  assert.match(events, /no se abre/);
  assert.doesNotMatch(events, /\d{2}\/\d{2}\/2026/);
  store.close();
});

test("la configuración editada queda guardada", () => {
  const { orchestrator: engine, store } = orchestrator();
  const saved = engine.updateDefaults({ targetContacts: 80, countries: ["Chile"], priorityCountry: "Chile" });
  assert.equal(saved.targetContacts, 80);
  assert.deepEqual(saved.countries, ["Chile"]);
  assert.equal(store.getDefaults().targetContacts, 80);
  store.close();
});
