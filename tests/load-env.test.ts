import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadEnvFile } from "../src/config/load-env.ts";

test("the env file fills an empty token and leaves an existing one", () => {
  const dir = mkdtempSync(join(tmpdir(), "tga-env-"));
  const path = join(dir, ".env");
  writeFileSync(path, "# comentario\nHUBSPOT_ACCESS_TOKEN=desde-archivo\nDATABASE_PATH=./data/x.sqlite\n");
  const env: NodeJS.ProcessEnv = { HUBSPOT_ACCESS_TOKEN: "   ", DATABASE_PATH: "ya-puesto" };
  loadEnvFile(path, env);
  assert.equal(env.HUBSPOT_ACCESS_TOKEN, "desde-archivo");
  assert.equal(env.DATABASE_PATH, "ya-puesto");
});

test("a missing env file leaves the environment unchanged", () => {
  const env: NodeJS.ProcessEnv = {};
  loadEnvFile(join(tmpdir(), "tga-env-missing", ".env"), env);
  assert.equal(env.HUBSPOT_ACCESS_TOKEN, undefined);
});
