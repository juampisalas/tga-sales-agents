import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyHubSpotImports } from "../src/hubspot/index.ts";
import { inspectNavigator } from "../src/navigator/index.ts";
import {
  openPlaceholderDatabase,
  placeholderDatabasePath,
} from "../src/persistence/sqlite.ts";
import { phase1Status } from "../src/phase1.ts";
import { qualifyContact } from "../src/qualification/index.ts";
import { MAX_BATCH, selectBatch } from "../src/selection/index.ts";
import { resumeRun } from "../src/supervisor/index.ts";
import { startSurfeImport, surfeImportTest } from "../src/surfe/index.ts";

test("phase 1 exposes the six brief modules and leaves later phases unstarted", () => {
  const status = phase1Status();
  assert.equal(status.phase, 1);
  assert.deepEqual(
    status.modules.map((module) => module.id),
    ["navigator", "selection", "surfe", "hubspot", "qualification", "supervisor"],
  );
  assert.equal(status.persistence, "placeholder");
  assert.deepEqual(status.phasesNotStarted, [2, 3, 4, 5, 6, 7]);
  assert.equal(status.linkedInLogin, "not-performed");
  assert.equal(status.messagesSent, 0);
  for (const module of status.modules) {
    assert.equal(module.phaseImplemented, 1);
  }
});

test("surfe import test is not done and the stub does not click", () => {
  assert.equal(surfeImportTest.status, "not-done");
  assert.equal(surfeImportTest.phase, 3);
  assert.throws(() => startSurfeImport(), /Phase 3/);
});

test("later-phase actions stay unimplemented", () => {
  assert.equal(MAX_BATCH, 25);
  assert.throws(() => inspectNavigator(), /Phase 2/);
  assert.throws(() => selectBatch(), /Phase 4/);
  assert.throws(() => verifyHubSpotImports(), /not implemented/);
  assert.throws(() => qualifyContact(), /does not invent/);
  assert.throws(() => resumeRun(), /not implemented/);
});

test("sqlite placeholder round-trips a note in memory", () => {
  const db = openPlaceholderDatabase();
  db.prepare("INSERT INTO phase1_placeholder (note) VALUES (?)").run("phase-1");
  const row = db.prepare("SELECT note FROM phase1_placeholder").get() as
    | { note: string }
    | undefined;
  assert.equal(row?.note, "phase-1");
  db.close();
});

test("database path comes from the environment and does not open a file", () => {
  assert.equal(placeholderDatabasePath({}), "./data/tga-sales-agents.sqlite");
  assert.equal(
    placeholderDatabasePath({ DATABASE_PATH: "  " }),
    "./data/tga-sales-agents.sqlite",
  );
  assert.equal(
    placeholderDatabasePath({ DATABASE_PATH: "./data/custom.sqlite" }),
    "./data/custom.sqlite",
  );
});
