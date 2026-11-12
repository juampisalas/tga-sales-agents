import assert from "node:assert/strict";
import test from "node:test";
import { probeCredentials } from "../src/config/probe-credentials.ts";

test("una clave que responde queda conectada y una rechazada no", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    const ok = url.includes("openai");
    return new Response(ok ? "{}" : "no", { status: ok ? 200 : 401 });
  };
  const status = await probeCredentials({
    OPENAI_API_KEY: "sk-real",
    HUBSPOT_ACCESS_TOKEN: "pat-bad",
  }, fetchImpl);
  assert.deepEqual(status, {
    openai: { saved: true, connected: true },
    hubspot: { saved: true, connected: false },
  });
  assert.equal(JSON.stringify(status).includes("sk-real"), false);
  assert.equal(calls.length, 2);
});

test("sin clave no consulta el servicio", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  };
  const status = await probeCredentials({}, fetchImpl);
  assert.deepEqual(status, {
    openai: { saved: false, connected: false },
    hubspot: { saved: false, connected: false },
  });
  assert.equal(calls, 0);
});
