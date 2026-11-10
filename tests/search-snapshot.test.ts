import assert from "node:assert/strict";
import test from "node:test";
import { Orchestrator } from "../src/campaign/orchestrator.ts";
import { CampaignStore } from "../src/campaign/store.ts";
import { parseSalesSearch, searchFitsCampaign, type SalesSearchRead } from "../src/navigator/search-snapshot.ts";

const SNAPSHOT = `
- Page URL: https://www.linkedin.com/sales/search/people?page=4
- Page Title: Buscar | Sales Navigator
- generic: 201-500, Recursos humanos, Argentina
- generic: (3 filtros)
- checkbox "Añadir Ana Pérez a la selección"
- generic: Añadir Ana Pérez a la selección
- checkbox "Añadir Luis Díaz a la selección"
- generic: Seleccionar todo
- generic: 416 resultados, fijado
- generic: 3 mil+ resultados, fijado
- generic: Página 4 de 100
- generic: 17 mil+ resultados
`;

test("la búsqueda abierta se lee sin contar el total de LinkedIn como encontrados", () => {
  const read = parseSalesSearch(SNAPSHOT);
  assert.equal(read.kind, "search");
  assert.equal(read.page, 4);
  assert.equal(read.pageCount, 100);
  assert.equal(read.visibleLeads, 2);
  assert.equal(read.resultLabel, "17 mil+");
  assert.deepEqual(read.pageCountries, ["Argentina"]);
  assert.equal(read.hasSelectAll, true);
  assert.equal(read.surfeVisible, false);
  const fit = searchFitsCampaign(read, ["Argentina", "Chile"]);
  assert.equal(fit.fits, true);
  assert.match(fit.text, /2 contactos visibles/);
  assert.match(fit.text, /No se seleccionó a nadie/);
});

test("estados unidos se lee como USA", () => {
  const read = parseSalesSearch(SNAPSHOT.replace("Argentina", "Estados Unidos"));
  assert.deepEqual(read.pageCountries, ["USA"]);
});

test("un país distinto no se cuenta para la campaña", () => {
  const read = parseSalesSearch(SNAPSHOT);
  const fit = searchFitsCampaign(read, ["Chile"]);
  assert.equal(fit.fits, false);
  assert.match(fit.text, /Argentina/);
});

test("un inicio de sesión o un desafío no parecen una búsqueda", () => {
  const login = parseSalesSearch("- Page URL: https://www.linkedin.com/login\n- Page Title: Iniciar sesión");
  assert.equal(login.kind, "login");
  const security = parseSalesSearch("- Page URL: https://www.linkedin.com/checkpoint/challenge\n- Page Title: Verificación");
  assert.equal(security.kind, "security");
});

test("al iniciar cuenta solo los contactos visibles de una búsqueda compatible", async () => {
  const store = CampaignStore.open(":memory:");
  const engine = new Orchestrator(store, {
    canSearch: async () => ({ ok: true, reason: "extensión lista" }),
    readSearch: async () => ({ ok: true, observation: parseSalesSearch(SNAPSHOT) }),
  });
  const argentina = await engine.prepareInstruction("Necesito 10 contactos de Argentina.");
  const started = await engine.start(argentina.campaign.id);
  assert.equal(started.status, "running");
  assert.equal(started.step, "select");
  assert.equal(started.found, 2);
  assert.equal(started.imported, 0);
  assert.match(started.report ?? "", /Importados verificados: 0/);
  assert.match(started.report ?? "", /Surfe no aparece/);
  await engine.stop(started.id);

  const chile = await engine.prepareInstruction("Solo Chile, 10 contactos.");
  const blocked = await engine.start(chile.campaign.id);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.found, 0);
  assert.equal(blocked.imported, 0);
  store.close();
});

test("el tipo de lectura acepta una búsqueda ya interpretada", () => {
  const read: SalesSearchRead = parseSalesSearch(SNAPSHOT);
  assert.equal(read.title, "Buscar | Sales Navigator");
});
