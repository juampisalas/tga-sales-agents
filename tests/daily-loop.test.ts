import assert from "node:assert/strict";
import test from "node:test";
import { addTwentyFive } from "../src/campaign/add-batch.ts";
import { runBatches } from "../src/campaign/run-batches.ts";
import { reduceCampaign } from "../src/campaign/machine.ts";
import type { Campaign } from "../src/campaign/types.ts";
import { interpretInstruction } from "../src/interpreter/prompt-interpreter.ts";
import { countSurfeEmails } from "../src/hubspot/email-count.ts";

const MEXICO_DAY = new Date(Date.UTC(2026, 10, 10, 15, 0, 0));

function atSelect(target: number): Campaign {
  const interpreted = interpretInstruction(`Necesito ${target} contactos de México`, undefined, MEXICO_DAY);
  const campaign: Campaign = {
    id: "batch",
    instruction: `Necesito ${target} contactos de México`,
    mode: interpreted.mode,
    status: "filters_ready",
    step: "await_start",
    config: interpreted.config,
    found: 0,
    imported: 0,
    skipped: 0,
    pendingImport: 0,
    errors: [],
    schedule: null,
    queueAfterCurrent: false,
    report: null,
    blockedReason: null,
    createdAt: "2026-11-10T15:00:00.000Z",
    updatedAt: "2026-11-10T15:00:00.000Z",
  };
  return reduceCampaign(reduceCampaign(campaign, { type: "start" }), {
    type: "search_page",
    foundOnPage: 25,
    exhausted: false,
  });
}

test("el primer Add 25 crea la lista y escribe solo el país", async () => {
  const calls: string[] = [];
  await addTwentyFive({
    country: "México",
    listOpen: false,
    controls: {
      click: async (name) => {
        calls.push(`click:${name}`);
      },
      fillCountry: async (country) => {
        calls.push(`fill:${country}`);
      },
    },
  });
  assert.deepEqual(calls, ["click:Add 25 to a list", "click:Create a new list", "fill:México"]);
});

test("el siguiente Add 25 elige la lista ya creada", async () => {
  const calls: string[] = [];
  await addTwentyFive({
    country: "México",
    listOpen: true,
    controls: {
      click: async (name) => {
        calls.push(`click:${name}`);
      },
      fillCountry: async (country) => {
        calls.push(`fill:${country}`);
      },
    },
  });
  assert.deepEqual(calls, ["click:Add 25 to a list", "click:México"]);
});

test("HubSpot cuenta solo los contactos de Surfe que tienen mail", async () => {
  const calls: unknown[] = [];
  const result = await countSurfeEmails({
    since: "2026-11-10T15:00:00.000Z",
    token: "token",
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return Response.json({
        results: [
          { id: "1", properties: { email: "ada@empresa.com" } },
          { id: "2", properties: { email: "  " } },
          { id: "3", properties: { email: null } },
        ],
      });
    },
  });
  assert.deepEqual(result, { withEmail: 1, withoutEmail: 2 });
  const body = calls[0] as { properties: string[] };
  assert.deepEqual(body.properties, ["email"]);
});

test("sin token no se consulta HubSpot", async () => {
  let called = false;
  const result = await countSurfeEmails({
    since: "2026-11-10T15:00:00.000Z",
    token: " ",
    fetchImpl: async () => {
      called = true;
      return Response.json({});
    },
  });
  assert.equal(called, false);
  assert.equal("error" in result, true);
});

test("el segundo Add 25 espera a que Surfe termine de cargar", async () => {
  const order: string[] = [];
  const finished = await runBatches({
    campaign: atSelect(40),
    addBatch: async (listOpen) => {
      order.push(listOpen ? "append" : "create");
      return { evidence: "Add 25 to a list" };
    },
    waitForSurfe: async () => {
      order.push("surfe");
      return { done: true, loaded: 25, evidence: "Surfe terminó de cargar 25." };
    },
    readPage: async () => ({ foundOnPage: 25, exhausted: false }),
  });
  assert.deepEqual(order, ["create", "surfe", "append", "surfe"]);
  assert.equal(finished.imported, 50);
  assert.equal(finished.status, "completed");
});

test("si Surfe no terminó de cargar no se meten otros 25", async () => {
  let adds = 0;
  const stuck = await runBatches({
    campaign: atSelect(500),
    addBatch: async () => {
      adds += 1;
      return { evidence: "Add 25 to a list" };
    },
    waitForSurfe: async () => ({ done: false, loaded: 0, evidence: "Surfe sigue cargando el lote." }),
    readPage: async () => ({ foundOnPage: 25, exhausted: false }),
  });
  assert.equal(adds, 1);
  assert.equal(stuck.imported, 0);
  assert.equal(stuck.errors.at(-1)?.at, "surfe");
});
