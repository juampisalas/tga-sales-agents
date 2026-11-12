import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { credentialStatus, loadEnvFile, saveApiKeys } from "../src/config/load-env.ts";

test("the env file fills an empty token and leaves an existing one", () => {
  const dir = mkdtempSync(join(tmpdir(), "tga-env-"));
  const path = join(dir, ".env");
  writeFileSync(path, "# comentario\nHUBSPOT_ACCESS_TOKEN=desde-archivo\nDATABASE_PATH=./data/x.sqlite\n");
  const env: NodeJS.ProcessEnv = { HUBSPOT_ACCESS_TOKEN: "   ", DATABASE_PATH: "ya-puesto" };
  loadEnvFile(path, env);
  assert.equal(env.HUBSPOT_ACCESS_TOKEN, "desde-archivo");
  assert.equal(env.DATABASE_PATH, "ya-puesto");
});

test("guardar una clave la deja en el archivo y no la devuelve", () => {
  const dir = mkdtempSync(join(tmpdir(), "tga-keys-"));
  const path = join(dir, ".env");
  writeFileSync(path, "DATABASE_PATH=./data/x.sqlite\n");
  const env: NodeJS.ProcessEnv = {};
  const status = saveApiKeys(path, { openaiApiKey: "sk-test-openai", hubspotAccessToken: "pat-test-hubspot" }, env);
  assert.deepEqual(status, { openai: true, hubspot: true });
  assert.equal(JSON.stringify(status).includes("sk-test-openai"), false);
  const stored = readFileSync(path, "utf8");
  assert.match(stored, /OPENAI_API_KEY=sk-test-openai/);
  assert.match(stored, /HUBSPOT_ACCESS_TOKEN=pat-test-hubspot/);
  assert.match(stored, /DATABASE_PATH=\.\/data\/x\.sqlite/);
  assert.equal(env.OPENAI_API_KEY, "sk-test-openai");
  assert.deepEqual(credentialStatus(env), { openai: true, hubspot: true });
});

test("a missing env file leaves the environment unchanged", () => {
  const env: NodeJS.ProcessEnv = {};
  loadEnvFile(join(tmpdir(), "tga-env-missing", ".env"), env);
  assert.equal(env.HUBSPOT_ACCESS_TOKEN, undefined);
});
