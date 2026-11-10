import assert from "node:assert/strict";
import { test } from "node:test";
import { segmentWhenSurfeFinishes, transferSurfeListToSegment } from "../src/campaign/hubspot-transfer.ts";
import { planHubSpot, verifyHubSpotImports } from "../src/hubspot/index.ts";
import { placeContactsInSegment } from "../src/hubspot/segment.ts";
import { startSurfeImport } from "../src/surfe/index.ts";
import { syncSurfeListToHubSpot, type SurfeListPage } from "../src/surfe/list-sync.ts";

test("the phase 1 stubs still do not call Surfe or HubSpot", () => {
  assert.throws(() => startSurfeImport(), /Phase 3/);
  assert.throws(() => verifyHubSpotImports(), /not implemented/);
  assert.match(planHubSpot({}).reason, /No se consultó HubSpot/);
});

test("Surfe sync succeeds only when the visible count finishes", async () => {
  const states = [
    "Sync all to HubSpot\n249 Profiles\nAda Lopez",
    "Syncing to HubSpot (10/249)\nAda Lopez",
    "Syncing to HubSpot (249/249)",
  ];
  let clicks = 0;
  const page: SurfeListPage = {
    async readText() {
      return states.shift() ?? "Syncing to HubSpot (249/249)";
    },
    async clickButton(name) {
      assert.equal(name, "Sync all to HubSpot");
      clicks += 1;
    },
  };
  const clock = clockOf(0);
  const result = await syncSurfeListToHubSpot(page, { ...clock, timeoutMs: 1000, intervalMs: 1 });
  assert.equal(clicks, 1);
  assert.deepEqual(result, {
    outcome: "success",
    synced: 249,
    total: 249,
    evidence: "Syncing to HubSpot (249/249)",
  });
  assert.equal(result.evidence.includes("Ada"), false);
});

test("an already running sync is not clicked again", async () => {
  let clicks = 0;
  const page: SurfeListPage = {
    async readText() {
      return "Syncing to HubSpot (249/249)";
    },
    async clickButton() {
      clicks += 1;
    },
  };
  const result = await syncSurfeListToHubSpot(page, { ...clockOf(0), timeoutMs: 10, intervalMs: 1 });
  assert.equal(clicks, 0);
  assert.equal(result.outcome, "success");
});

test("a sync that returns to the button without finishing is not a success", async () => {
  const states = ["Sync all to HubSpot", "Syncing to HubSpot (4/249)", "Sync all to HubSpot"];
  const page: SurfeListPage = {
    async readText() {
      return states.shift() ?? "Sync all to HubSpot";
    },
    async clickButton() {},
  };
  const result = await syncSurfeListToHubSpot(page, { ...clockOf(0), timeoutMs: 1000, intervalMs: 1 });
  assert.equal(result.outcome, "ambiguous");
  assert.match(result.evidence, /4\/249/);
});

test("waiting out without a finished count is not a success", async () => {
  const page: SurfeListPage = {
    async readText() {
      return "Sync all to HubSpot";
    },
    async clickButton() {},
  };
  const result = await syncSurfeListToHubSpot(page, { ...clockOf(0), timeoutMs: 0, intervalMs: 5 });
  assert.equal(result.outcome, "ambiguous");
});

test("a missing token never calls HubSpot", async () => {
  let calls = 0;
  const result = await placeContactsInSegment({
    segmentName: "05/11/2026 Argentina",
    contactIds: ["10"],
    token: "  ",
    fetchImpl: async () => {
      calls += 1;
      return Response.json({});
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.verified, false);
  assert.match(result.evidence, /No se consultó HubSpot/);
});

test("the segment is created and only exact membership counts verify", async () => {
  const calls: { url: string; body: unknown }[] = [];
  const result = await placeContactsInSegment({
    segmentName: "05/11/2026 Argentina",
    contactIds: ["10", "10", "11"],
    token: "test-token",
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-token");
      if (String(input).endsWith("/search")) {
        return Response.json({ lists: [{ listId: "9", name: "05/11/2026 Argentina copia" }] });
      }
      if (String(input).endsWith("/lists")) {
        return Response.json({ list: { listId: "42", name: "05/11/2026 Argentina" } });
      }
      return Response.json({ recordIdsAdded: ["10", "11"], recordIdsMissing: [] });
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.segmentId, "42");
  assert.equal(result.added, 2);
  assert.deepEqual(calls[2]?.body, ["10", "11"]);
});

test("an existing segment with the same name is reused", async () => {
  const urls: string[] = [];
  const result = await placeContactsInSegment({
    segmentName: "05/11/2026 Argentina",
    contactIds: ["10"],
    token: "test-token",
    fetchImpl: async (input) => {
      urls.push(String(input));
      if (String(input).endsWith("/search")) {
        return Response.json({ lists: [{ listId: "7", name: "05/11/2026 Argentina" }] });
      }
      return Response.json({ recordIdsAdded: ["10"], recordIdsMissing: [] });
    },
  });
  assert.equal(result.segmentId, "7");
  assert.equal(urls.some((url) => url.endsWith("/crm/v3/lists")), false);
});

test("a partial membership response does not count as verified", async () => {
  const result = await placeContactsInSegment({
    segmentName: "05/11/2026 Argentina",
    contactIds: ["10", "11"],
    token: "test-token",
    fetchImpl: async (input) => {
      if (String(input).endsWith("/search")) {
        return Response.json({ lists: [{ listId: "7", name: "05/11/2026 Argentina" }] });
      }
      return Response.json({ recordIdsAdded: ["10"], recordIdsMissing: ["11"] });
    },
  });
  assert.equal(result.verified, false);
  assert.equal(result.added, 1);
  assert.equal(result.missing, 1);
});

test("the transfer does not open HubSpot until Surfe shows a finished count", async () => {
  let calls = 0;
  const result = await transferSurfeListToSegment({
    page: {
      async readText() {
        return "Syncing to HubSpot (3/10)";
      },
      async clickButton() {},
    },
    segmentName: "05/11/2026 Argentina",
    contactIds: ["10"],
    env: { HUBSPOT_ACCESS_TOKEN: "test-token" },
    fetchImpl: async () => {
      calls += 1;
      return Response.json({});
    },
    ...clockOf(0),
    timeoutMs: 2,
    intervalMs: 5,
  });
  assert.equal(calls, 0);
  assert.equal(result.verified, false);
});

test("HubSpot does not build the segment before Surfe finishes", async () => {
  let calls = 0;
  const result = await segmentWhenSurfeFinishes({
    surfe: { outcome: "ambiguous", evidence: "Syncing to HubSpot (3/10)" },
    segmentName: "05/11/2026 Argentina",
    since: "2026-11-05T17:15:00.000Z",
    env: { HUBSPOT_ACCESS_TOKEN: "test-token" },
    fetchImpl: async () => {
      calls += 1;
      return Response.json({});
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.verified, false);
  assert.equal(result.segmentId, null);
});

test("a finished Surfe count puts those contacts in the segment", async () => {
  const result = await segmentWhenSurfeFinishes({
    surfe: { outcome: "success", synced: 2, total: 2, evidence: "Syncing to HubSpot (2/2)" },
    segmentName: "05/11/2026 Argentina",
    since: "2026-11-05T17:15:00.000Z",
    env: { HUBSPOT_ACCESS_TOKEN: "test-token" },
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/contacts/search")) {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.filterGroups[0].filters[1].value, "2026-11-05T17:15:00.000Z");
        return Response.json({ results: [{ id: "10" }, { id: "11" }] });
      }
      if (url.endsWith("/lists/search")) {
        return Response.json({ lists: [] });
      }
      if (url.endsWith("/crm/v3/lists")) {
        return Response.json({ list: { listId: "42" } });
      }
      return Response.json({ recordIdsAdded: ["10", "11"], recordIdsMissing: [] });
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.segmentId, "42");
  assert.equal(result.added, 2);
});

test("fewer HubSpot matches than the finished Surfe count stay unverified", async () => {
  const result = await segmentWhenSurfeFinishes({
    surfe: { outcome: "success", synced: 2, total: 2, evidence: "Syncing to HubSpot (2/2)" },
    segmentName: "05/11/2026 Argentina",
    since: "2026-11-05T17:15:00.000Z",
    env: { HUBSPOT_ACCESS_TOKEN: "test-token" },
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith("/contacts/search")) {
        return Response.json({ results: [{ id: "10" }] });
      }
      if (url.endsWith("/lists/search")) {
        return Response.json({ lists: [{ listId: "7", name: "05/11/2026 Argentina" }] });
      }
      return Response.json({ recordIdsAdded: ["10"], recordIdsMissing: [] });
    },
  });
  assert.equal(result.verified, false);
  assert.equal(result.added, 1);
  assert.match(result.evidence, /identificó 1/);
});

function clockOf(start: number): { now: () => number; sleep: (ms: number) => Promise<void> } {
  let clock = start;
  return {
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
  };
}
