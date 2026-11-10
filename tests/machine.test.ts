import assert from "node:assert/strict";
import test from "node:test";
import { reduceCampaign } from "../src/campaign/machine.ts";
import type { Campaign } from "../src/campaign/types.ts";
import { interpretDefault } from "../src/interpreter/prompt-interpreter.ts";

function campaign(): Campaign {
  return {
    id: "c1",
    instruction: "Configuración predeterminada de TGA",
    mode: "default",
    status: "filters_ready",
    step: "await_start",
    config: { ...interpretDefault(undefined, new Date(Date.UTC(2026, 10, 9, 15, 0, 0))).config, targetContacts: 100 },
    found: 0,
    imported: 0,
    skipped: 0,
    pendingImport: 0,
    errors: [],
    schedule: null,
    queueAfterCurrent: false,
    report: null,
    blockedReason: null,
    createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z",
  };
}

test("un bloqueo del navegador no cuenta importados", () => {
  const running = reduceCampaign(campaign(), { type: "start" });
  const blocked = reduceCampaign(running, { type: "navigator_blocked", reason: "Sin extensión." });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.imported, 0);
  assert.match(blocked.report ?? "", /Importados verificados: 0/);
  assert.doesNotMatch(blocked.report ?? "", /exitosa/i);
});

test("pausar y reanudar solo valen en los estados correspondientes", () => {
  const running = reduceCampaign(campaign(), { type: "start" });
  const paused = reduceCampaign(running, { type: "pause" });
  assert.equal(paused.status, "paused");
  assert.equal(reduceCampaign(paused, { type: "resume" }).status, "running");
  assert.throws(() => reduceCampaign(campaign(), { type: "pause" }), /Pausar/);
});

test("una verificación de seguridad detiene la campaña", () => {
  const running = reduceCampaign(campaign(), { type: "start" });
  const blocked = reduceCampaign(running, { type: "security" });
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.blockedReason ?? "", /seguridad/);
  assert.equal(blocked.imported, 0);
});

test("sin evidencia no se avanza ni se cuenta la importación", () => {
  let current = reduceCampaign(campaign(), { type: "start" });
  current = reduceCampaign(current, { type: "search_page", foundOnPage: 25, exhausted: false });
  current = reduceCampaign(current, { type: "batch_selected", count: 25 });
  const observed = reduceCampaign(current, { type: "import_observation", outcome: "success", count: 25, evidence: null });
  assert.equal(observed.imported, 0);
  assert.equal(observed.step, "import");
  assert.equal(observed.errors.length, 1);
  const ambiguous = reduceCampaign(current, { type: "import_observation", outcome: "ambiguous", count: 25, evidence: "pantalla dudosa" });
  assert.equal(ambiguous.imported, 0);
  assert.equal(ambiguous.step, "import");
});

test("HubSpot cuenta nuevos y pasa los duplicados a omitidos", () => {
  let current = reduceCampaign(campaign(), { type: "start" });
  current = reduceCampaign(current, { type: "search_page", foundOnPage: 25, exhausted: false });
  current = reduceCampaign(current, { type: "duplicate_seen", count: 5 });
  current = reduceCampaign(current, { type: "batch_selected", count: 20 });
  current = reduceCampaign(current, { type: "import_observation", outcome: "success", count: 20, evidence: "confirmación visible" });
  assert.equal(current.imported, 0);
  assert.equal(current.pendingImport, 20);
  current = reduceCampaign(current, { type: "hubspot_check", created: 12, duplicates: 8, evidence: "ids de HubSpot" });
  assert.equal(current.imported, 12);
  assert.equal(current.skipped, 13);
  assert.equal(current.step, "paginate");
});

test("si no hay suficientes contactos informa el número real", () => {
  let current = reduceCampaign(campaign(), { type: "start" });
  current.imported = 40;
  current = reduceCampaign(current, { type: "search_page", foundOnPage: 0, exhausted: true });
  assert.equal(current.status, "partial");
  assert.match(current.report ?? "", /40 de 100/);
});

test("el objetivo verificado cierra la campaña", () => {
  let current = reduceCampaign(campaign(), { type: "start" });
  current.config = { ...current.config, targetContacts: 2 };
  current = reduceCampaign(current, { type: "search_page", foundOnPage: 2, exhausted: false });
  current = reduceCampaign(current, { type: "batch_selected", count: 2 });
  current = reduceCampaign(current, { type: "import_observation", outcome: "success", count: 2, evidence: "ok" });
  current = reduceCampaign(current, { type: "hubspot_check", created: 2, duplicates: 0, evidence: "dos ids" });
  assert.equal(current.status, "completed");
  assert.equal(current.imported, 2);
});
