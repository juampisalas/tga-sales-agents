import assert from "node:assert/strict";
import test from "node:test";
import { marketOn } from "../src/markets/rotation.ts";
import { blockedCompany } from "../src/markets/blocks.ts";

const noon = (day: number, month = 11) => new Date(Date.UTC(2026, month - 1, day, 15, 0, 0));

test("la semana 1 sigue la rotación y el fin de semana no corre", () => {
  assert.equal(marketOn(noon(6)), null);
  assert.equal(marketOn(noon(9)), "Chile");
  assert.equal(marketOn(noon(10)), "México");
  assert.equal(marketOn(noon(11)), "Brasil");
  assert.equal(marketOn(noon(12)), "Chile");
  assert.equal(marketOn(noon(13)), "USA");
  assert.equal(marketOn(noon(14)), null);
  assert.equal(marketOn(noon(15)), null);
});

test("un día no corrido no corre la tabla", () => {
  assert.equal(marketOn(noon(16)), "Argentina");
  assert.equal(marketOn(noon(17)), "Colombia");
  assert.equal(marketOn(noon(23)), "Chile");
});

test("en Chile se frenan mutualidades, OTEC y el nivel 3", () => {
  assert.match(blockedCompany("Mutual de Seguridad", "Chile") ?? "", /mutualidades/);
  assert.match(blockedCompany("OTEC Capacita", "Chile") ?? "", /OTEC/);
  assert.equal(blockedCompany("Mutual de Seguridad", "México"), null);
  assert.match(blockedCompany("Accenture", "USA") ?? "", /nivel 3/i);
  assert.equal(blockedCompany("Cencosud", "Chile"), null);
});
