import assert from "node:assert/strict";
import test from "node:test";
import { nextListStep } from "../src/campaign/list-policy.ts";

test("el primer Add 25 to a list crea la lista y solo escribe el país", () => {
  const step = nextListStep({ country: "México", openListCountry: null });
  assert.equal(step.control, "Add 25 to a list");
  assert.equal(step.list, "create");
  assert.equal(step.country, "México");
  assert.equal(step.typedName, "México");
});

test("el siguiente Add 25 to a list entra en la lista abierta", () => {
  const step = nextListStep({ country: "México", openListCountry: "México" });
  assert.equal(step.list, "append");
  assert.equal(step.typedName, "");
});

test("el país siguiente crea otra lista recién cuando el anterior terminó", () => {
  const step = nextListStep({ country: "Chile", openListCountry: null });
  assert.equal(step.list, "create");
  assert.equal(step.typedName, "Chile");
});
