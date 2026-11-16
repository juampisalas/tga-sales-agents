import assert from "node:assert/strict";
import test from "node:test";
import { stepFloor, surfeReloadNeeded, surfeResumeNeeded } from "../src/dashboard/step-floor.ts";

const now = Date.parse("2026-11-05T18:00:00.000Z");

test("sin carga, nadie figura trabajando", () => {
  const floor = stepFloor("", now);
  assert.deepEqual(floor.steps.map((step) => step.id), [
    "navigator",
    "selection",
    "surfe",
    "hubspot",
    "qualification",
  ]);
  assert.equal(floor.steps.some((step) => step.id === "prospecting"), false);
  assert.equal(floor.stuck, null);
  assert.equal(floor.steps.every((step) => step.state === "idle" || step.state === "waiting"), true);
});

test("la lista diaria no incluye a prospección", () => {
  const log = "2026-11-05T17:59:40.000Z Syncing to HubSpot (240/249)";
  const floor = stepFloor(log, now);
  assert.equal(floor.steps.some((step) => step.id === "prospecting"), false);
  assert.equal(floor.steps.find((step) => step.id === "surfe")?.state, "working");
});

test("el mismo conteo durante un minuto deja a Surfe trabado en ese punto", () => {
  const log = [
    "2026-11-05T17:53:03.531Z Syncing to HubSpot (235/249)",
    "2026-11-05T17:54:05.528Z Syncing to HubSpot (235/249)",
  ].join("\n");
  const floor = stepFloor(log, now);
  const surfe = floor.steps.find((step) => step.id === "surfe");
  const hubspot = floor.steps.find((step) => step.id === "hubspot");
  assert.equal(surfe?.state, "stuck");
  assert.equal(surfe?.stuckAt, "Syncing to HubSpot (235/249) no avanza.");
  assert.equal(floor.stuck?.id, "surfe");
  assert.equal(hubspot?.state, "waiting");
  assert.equal(surfeReloadNeeded(log, now), "Syncing to HubSpot (235/249)");
  assert.equal(surfeReloadNeeded(log, Date.parse("2026-11-05T17:54:30.000Z")), null);
});

test("una recarga del mismo conteo no se repite", () => {
  const log = [
    "2026-11-05T17:53:03.531Z Syncing to HubSpot (235/249)",
    "2026-11-05T17:54:05.528Z Syncing to HubSpot (235/249)",
    "2026-11-05T17:55:00.000Z recarga la lista: Syncing to HubSpot (235/249)",
  ].join("\n");
  assert.equal(surfeReloadNeeded(log, now), null);
  assert.equal(surfeResumeNeeded(log, "none", now), "Syncing to HubSpot (235/249)");
});

test("un conteo que acaba de moverse es trabajo, no un trabado", () => {
  const log = "2026-11-05T17:59:40.000Z Syncing to HubSpot (240/249)";
  const surfe = stepFloor(log, now).steps.find((step) => step.id === "surfe");
  assert.equal(surfe?.state, "working");
  assert.equal(surfe?.stuckAt, null);
});

test("con el conteo cerrado HubSpot pasa a armar el segmento", () => {
  const log = "2026-11-05T17:59:40.000Z Syncing to HubSpot (249/249)";
  const floor = stepFloor(log, now);
  assert.equal(floor.steps.find((step) => step.id === "surfe")?.state, "done");
  assert.equal(floor.steps.find((step) => step.id === "hubspot")?.state, "working");
});
