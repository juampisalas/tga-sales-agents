import assert from "node:assert/strict";
import test from "node:test";
import { cloneDefaults, TGA_DEFAULTS } from "../src/config/defaults.ts";
import { interpretDefault, interpretInstruction, interpretSequence } from "../src/interpreter/prompt-interpreter.ts";

const CHILE_DAY = new Date(Date.UTC(2026, 10, 9, 15, 0, 0));
const MEXICO_DAY = new Date(Date.UTC(2026, 10, 10, 15, 0, 0));
const BRASIL_DAY = new Date(Date.UTC(2026, 10, 11, 15, 0, 0));

const PHARMA = "Necesito 200 contactos de empresas farmacéuticas de Chile, con más de 500 empleados, que trabajen en Recursos Humanos o Capacitación.";

test("la instrucción de farmacia reemplaza solo lo que está escrito", () => {
  const result = interpretInstruction(PHARMA);
  assert.equal(result.mode, "custom");
  assert.equal(result.config.targetContacts, 200);
  assert.equal(result.config.requestedCompanies, null);
  assert.deepEqual(result.config.countries, ["Chile"]);
  assert.equal(result.config.priorityCountry, "Chile");
  assert.deepEqual(result.config.industries, ["farmacéutica"]);
  assert.equal(result.config.minEmployees, 500);
  assert.deepEqual(result.config.roles, ["RR. HH.", "capacitación"]);
  assert.equal(result.config.maxBatch, 25);
  assert.equal(result.config.excludeAlreadyImported, true);
  assert.equal(result.config.source, "LinkedIn Sales Navigator");
  assert.equal(result.config.importTool, "Surfe");
  assert.equal(result.config.crm, "HubSpot");
  const query = decodeURIComponent(new URL(result.config.salesNavigator.url).searchParams.get("query") ?? "");
  assert.match(query, /104621616/);
  assert.match(query, /COMPANY_HEADCOUNT/);
  assert.match(query, /id:F/);
  assert.doesNotMatch(query, /100446943/);
  assert.match(query, /id:15/);
});

test("200 empresas no cambia la cantidad de contactos", () => {
  const result = interpretInstruction("Necesito 200 empresas de Chile.");
  assert.equal(result.config.targetContacts, TGA_DEFAULTS.targetContacts);
  assert.equal(result.config.requestedCompanies, 200);
  assert.deepEqual(result.config.countries, ["Chile"]);
  assert.equal(result.config.minEmployees, 200);
  assert.ok(result.config.warnings.some((warning) => warning.includes("empresas")));
});

test("solo Chile excluye los otros países y conserva el resto", () => {
  const result = interpretInstruction("Solo Chile");
  assert.deepEqual(result.config.countries, ["Chile"]);
  assert.deepEqual(result.config.industries, TGA_DEFAULTS.industries);
  assert.equal(result.config.minEmployees, 200);
  assert.equal(result.config.targetContacts, TGA_DEFAULTS.targetContacts);
  assert.equal(result.config.offer, "portal-mla");
  assert.equal(result.config.listCountry, "Chile");
});

test("Chile y Argentina quedan como únicos países", () => {
  const result = interpretInstruction("Quiero contactos de Chile y Argentina");
  assert.deepEqual(result.config.countries, ["Chile", "Argentina"]);
  assert.equal(result.config.priorityCountry, "Chile");
  assert.equal(result.config.minEmployees, 1000);
});

test("México tiene prioridad sobre Argentina", () => {
  const result = interpretInstruction("Quiero contactos de Argentina y México");
  assert.deepEqual(result.config.countries, ["Argentina", "México"]);
  assert.equal(result.config.priorityCountry, "México");
  assert.equal(result.config.listCountry, "México");
  assert.equal(result.config.offer, "studio");
});

test("sin Brasil en el día de México se queda en México", () => {
  const result = interpretInstruction("Buscá contactos sin Brasil", cloneDefaults(), MEXICO_DAY);
  assert.deepEqual(result.config.countries, ["México"]);
});

test("sin Brasil el día de Brasil no completa con otro país", () => {
  const result = interpretInstruction("Buscá contactos sin Brasil", cloneDefaults(), BRASIL_DAY);
  assert.deepEqual(result.config.countries, []);
  assert.ok(result.config.warnings.some((warning) => warning.includes("Brasil")));
});

test("varias industrias reemplazan la lista y una exclusión las recorta", () => {
  const many = interpretInstruction("Necesito contactos de retail y logística");
  assert.deepEqual(many.config.industries, ["logística", "retail"]);
  const excluded = interpretInstruction("Necesito contactos, excepto minería y retail", cloneDefaults(), MEXICO_DAY);
  assert.deepEqual(excluded.config.industries, [
    "supermercados",
    "logística",
    "industria",
    "salud",
    "farmacias",
    "bancos",
    "franquicias",
    "automotriz",
    "educación corporativa",
  ]);
});

test("sin industria mencionada conserva las predeterminadas", () => {
  const result = interpretInstruction("Necesito 80 contactos", cloneDefaults(), CHILE_DAY);
  assert.deepEqual(result.config.industries, TGA_DEFAULTS.industries);
  assert.deepEqual(result.config.countries, ["Chile"]);
  assert.equal(result.config.targetContacts, 80);
  assert.equal(result.config.minEmployees, 200);
});

test("directores de capacitación reemplaza los cargos", () => {
  const result = interpretInstruction("Directores de capacitación en Argentina");
  assert.deepEqual(result.config.roles, ["Directores de capacitación"]);
  assert.deepEqual(result.config.countries, ["Argentina"]);
  assert.equal(result.config.priorityCountry, "Argentina");
  assert.equal(result.config.minEmployees, 1000);
  assert.equal(result.config.offer, "studio");
});

test("responsables, minería, Chile y 500 empleados", () => {
  const result = interpretInstruction("Necesito 150 responsables de capacitación de empresas mineras de Chile, con más de 500 empleados.");
  assert.equal(result.config.targetContacts, 150);
  assert.deepEqual(result.config.roles, ["Responsables de capacitación"]);
  assert.deepEqual(result.config.industries, ["minería"]);
  assert.deepEqual(result.config.countries, ["Chile"]);
  assert.equal(result.config.minEmployees, 500);
});

test("bancos en Brasil cambia país, rubro y cantidad", () => {
  const result = interpretInstruction("quiero 200 contactos de bancos en Brasil");
  assert.deepEqual(result.config.countries, ["Brasil"]);
  assert.deepEqual(result.config.industries, ["bancos"]);
  assert.equal(result.config.targetContacts, 200);
  assert.equal(result.config.minEmployees, TGA_DEFAULTS.minEmployees);
  assert.deepEqual(result.config.roles, TGA_DEFAULTS.roles);
});

test("la continuación queda en cola con Argentina y salud", () => {
  const result = interpretInstruction("Cuando termines los 200 de Chile, buscame otros 100 de Argentina, pero solamente del sector salud.");
  assert.equal(result.queueAfterCurrent, true);
  assert.equal(result.config.targetContacts, 100);
  assert.deepEqual(result.config.countries, ["Argentina"]);
  assert.deepEqual(result.config.industries, ["salud"]);
  assert.equal(result.config.minEmployees, 1000);
  assert.equal(result.config.offer, "studio");
});

test("un horario guarda el modo recurrente", () => {
  const result = interpretInstruction("Necesito 50 contactos de Chile todos los lunes a las 9");
  assert.equal(result.mode, "recurring");
  assert.deepEqual(result.schedule, { days: ["lunes"], time: "09:00" });
  assert.equal(result.config.targetContacts, 50);
});

test("el lote pedido por encima de 25 se ajusta", () => {
  const result = interpretInstruction("Necesito 10 contactos en lotes de 40");
  assert.equal(result.config.maxBatch, 25);
  assert.ok(result.config.warnings.some((warning) => warning.includes("25")));
});

test("la configuración predeterminada no trae cambios", () => {
  const result = interpretDefault(cloneDefaults(), CHILE_DAY);
  assert.equal(result.mode, "default");
  assert.deepEqual(result.config.explicitFields, []);
  assert.equal(result.config.targetContacts, 500);
  assert.deepEqual(result.config.countries, ["Chile"]);
  assert.equal(result.config.minEmployees, 200);
  assert.equal(result.config.offer, "portal-mla");
});

test("500 de México usa ese país y esa cantidad", () => {
  const result = interpretInstruction("Necesito 500 contactos de México de retail");
  assert.deepEqual(result.config.countries, ["México"]);
  assert.equal(result.config.targetContacts, 500);
  assert.deepEqual(result.config.industries, ["retail"]);
  assert.equal(result.config.minEmployees, 1000);
  assert.equal(result.config.listCountry, "México");
  assert.equal(result.config.offer, "studio");
  assert.ok(result.config.salesNavigator.pending.includes("México"));
});

test("300 de México y después 200 de Chile son dos listas", () => {
  const [mexico, chile] = interpretSequence("Necesito 300 contactos de México y después 200 de Chile");
  assert.equal(mexico?.queueAfterCurrent, false);
  assert.deepEqual(mexico?.config.countries, ["México"]);
  assert.equal(mexico?.config.targetContacts, 300);
  assert.equal(mexico?.config.minEmployees, 1000);
  assert.equal(chile?.queueAfterCurrent, true);
  assert.deepEqual(chile?.config.countries, ["Chile"]);
  assert.equal(chile?.config.targetContacts, 200);
  assert.equal(chile?.config.minEmployees, 200);
  assert.equal(chile?.config.offer, "portal-mla");
});
