import assert from "node:assert/strict";
import test from "node:test";
import { agentFloor, surfeReloadNeeded, surfeResumeNeeded } from "../src/dashboard/agent-floor.ts";

const now = Date.parse("2026-11-05T18:00:00.000Z");

test("sin carga, nadie figura trabajando", () => {
  const floor = agentFloor("", now);
  assert.equal(floor.supervisor.id, "supervisor");
  assert.equal(floor.supervisor.state, "idle");
  assert.deepEqual(floor.agents.map((agent) => agent.id), [
    "navigator",
    "selection",
    "surfe",
    "hubspot",
    "qualification",
  ]);
  assert.equal(floor.stuck, null);
  assert.equal(floor.agents.every((agent) => agent.state === "idle" || agent.state === "waiting"), true);
});

test("el mismo conteo durante un minuto deja a Surfe trabado en ese punto", () => {
  const log = [
    "2026-11-05T17:53:03.531Z Syncing to HubSpot (235/249)",
    "2026-11-05T17:54:05.528Z Syncing to HubSpot (235/249)",
  ].join("\n");
  const floor = agentFloor(log, now);
  const surfe = floor.agents.find((agent) => agent.id === "surfe");
  const hubspot = floor.agents.find((agent) => agent.id === "hubspot");
  assert.equal(surfe?.state, "stuck");
  assert.equal(surfe?.stuckAt, "Syncing to HubSpot (235/249) no avanza.");
  assert.equal(floor.stuck?.id, "surfe");
  assert.equal(hubspot?.state, "waiting");
  assert.equal(floor.supervisor.state, "working");
  assert.match(floor.supervisor.doing, /Apaga el incendio de Surfe/);
  assert.equal(surfeReloadNeeded(log, now), "Syncing to HubSpot (235/249)");
  assert.equal(surfeReloadNeeded(log, Date.parse("2026-11-05T17:54:30.000Z")), null);
});

test("el supervisor recarga una sola vez el mismo incendio", () => {
  const log = [
    "2026-11-05T17:53:03.531Z Syncing to HubSpot (235/249)",
    "2026-11-05T17:54:05.528Z Syncing to HubSpot (235/249)",
    "2026-11-05T17:55:00.000Z supervisor recarga la lista: Syncing to HubSpot (235/249)",
  ].join("\n");
  const floor = agentFloor(log, now);
  assert.equal(surfeReloadNeeded(log, now), null);
  assert.equal(surfeResumeNeeded(log, "none", now), "Syncing to HubSpot (235/249)");
  assert.match(floor.supervisor.doing, /Recargó la lista de Surfe/);
});

test("un conteo que acaba de moverse es trabajo, no un trabado", () => {
  const log = "2026-11-05T17:59:40.000Z Syncing to HubSpot (240/249)";
  const surfe = agentFloor(log, now).agents.find((agent) => agent.id === "surfe");
  assert.equal(surfe?.state, "working");
  assert.equal(surfe?.stuckAt, null);
});

test("con el conteo cerrado HubSpot pasa a armar el segmento", () => {
  const log = "2026-11-05T17:59:40.000Z Syncing to HubSpot (249/249)";
  const floor = agentFloor(log, now);
  assert.equal(floor.agents.find((agent) => agent.id === "surfe")?.state, "done");
  assert.equal(floor.agents.find((agent) => agent.id === "hubspot")?.state, "working");
});
