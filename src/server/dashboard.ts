import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DefaultConfig } from "../config/defaults.ts";
import { projectEnvPath, saveApiKeys } from "../config/load-env.ts";
import { probeCredentials, type CredentialLinks } from "../config/probe-credentials.ts";
import { stepFloor, idleProspecting, surfeHandoffLogPath, type StepPost } from "../dashboard/step-floor.ts";
import { runProspecting } from "../prospecting/run.ts";
import { Orchestrator, type BrowserGate } from "../campaign/orchestrator.ts";
import { CampaignStore } from "../campaign/store.ts";

const extensionPagePath = join(dirname(fileURLToPath(import.meta.url)), "..", "dashboard", "public", "extension.html");
const htmlPath = join(dirname(fileURLToPath(import.meta.url)), "..", "dashboard", "public", "index.html");

export type Dashboard = {
  server: Server;
  orchestrator: Orchestrator;
  store: CampaignStore;
};

export function createDashboard(
  store: CampaignStore,
  gate: BrowserGate,
  checkAccess: BrowserGate["canSearch"] = () => gate.canSearch(),
  credentials: {
    path: string;
    env: NodeJS.ProcessEnv;
    probe?: (env: NodeJS.ProcessEnv) => Promise<CredentialLinks>;
  } = { path: projectEnvPath, env: process.env },
  prospectingRun: () => Promise<string> = runProspecting,
): Dashboard {
  const probe = credentials.probe ?? ((env: NodeJS.ProcessEnv) => probeCredentials(env));
  let prospecting = idleProspecting();
  let prospectingReport = "";
  const orchestrator = new Orchestrator(store, gate);
  const clients = new Set<ServerResponse>();
  const notify = () => {
    const payload = `data: ${JSON.stringify({ type: "update" })}\n\n`;
    for (const client of clients) {
      client.write(payload);
    }
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const access = await checkAccess();
      res.setHeader("cache-control", "no-store");
      if (req.method === "GET" && url.pathname === "/api/extension") {
        return sendJson(res, 200, { ok: access.ok });
      }
      if (req.method === "GET" && url.pathname === "/api/credentials") {
        return sendJson(res, 200, await probe(credentials.env));
      }
      if (req.method === "POST" && url.pathname === "/api/credentials") {
        const posted = await readBody(req);
        saveApiKeys(credentials.path, {
          openaiApiKey: optionalSecret(posted, "openaiApiKey"),
          hubspotAccessToken: optionalSecret(posted, "hubspotAccessToken"),
        }, credentials.env);
        return sendJson(res, 200, await probe(credentials.env));
      }
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(readFileSync(access.ok ? htmlPath : extensionPagePath));
        return;
      }
      if (!access.ok) {
        return sendJson(res, 403, { error: "Instalá la extensión de Playwright en Chrome para entrar.", code: "PLAYWRIGHT_EXTENSION_REQUIRED" });
      }
      if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write("data: {\"type\":\"ready\"}\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/state") {
        return sendJson(res, 200, orchestrator.snapshot());
      }
      if (req.method === "GET" && url.pathname === "/api/steps") {
        let log = "";
        try {
          log = readFileSync(surfeHandoffLogPath, "utf8");
        } catch {
          log = "";
        }
        return sendJson(res, 200, { ...stepFloor(log), prospecting: prospectingView() });
      }
      if (req.method === "POST" && url.pathname === "/api/prospecting/start") {
        if (prospecting.state !== "working") {
          prospecting = { ...idleProspecting(), state: "working", doing: "Busca señales de capacitación y perfiles muy senior." };
          try {
            const report = (await prospectingRun()).trim();
            prospectingReport = report || "No hay señal todavía.";
            prospecting = { ...idleProspecting(), state: "done", doing: "Terminó esta búsqueda por su cuenta." };
          } catch {
            prospectingReport = "";
            prospecting = { ...idleProspecting(), state: "stuck", doing: "No pudo arrancar.", stuckAt: "La búsqueda por su cuenta no respondió." };
          }
          notify();
        }
        return sendJson(res, 200, prospectingView());
      }
      const body = await readBody(req);
      const campaignId = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/(start|pause|resume|stop|filters|template)$/);
      if (req.method === "POST" && url.pathname === "/api/interpret") {
        const instruction = stringField(body, "instruction");
        const result = await orchestrator.prepareInstruction(instruction);
        notify();
        return sendJson(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/default") {
        const result = await orchestrator.prepareDefault();
        notify();
        return sendJson(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/defaults") {
        const saved = orchestrator.updateDefaults(body as Partial<DefaultConfig>);
        notify();
        return sendJson(res, 200, saved);
      }
      if (req.method === "POST" && campaignId?.[2] === "start") {
        const campaign = await orchestrator.start(decodeURIComponent(campaignId[1] ?? ""));
        notify();
        return sendJson(res, 200, campaign);
      }
      if (req.method === "POST" && campaignId?.[2] === "pause") {
        const campaign = await orchestrator.pause(decodeURIComponent(campaignId[1] ?? ""));
        notify();
        return sendJson(res, 200, campaign);
      }
      if (req.method === "POST" && campaignId?.[2] === "resume") {
        const campaign = await orchestrator.resume(decodeURIComponent(campaignId[1] ?? ""));
        notify();
        return sendJson(res, 200, campaign);
      }
      if (req.method === "POST" && campaignId?.[2] === "stop") {
        const campaign = await orchestrator.stop(decodeURIComponent(campaignId[1] ?? ""));
        notify();
        return sendJson(res, 200, campaign);
      }
      if (req.method === "POST" && campaignId?.[2] === "filters") {
        const campaign = orchestrator.updateFilters(decodeURIComponent(campaignId[1] ?? ""), {
          countries: arrayField(body, "countries"),
          industries: arrayField(body, "industries"),
          roles: arrayField(body, "roles"),
          minEmployees: numberField(body, "minEmployees"),
          targetContacts: numberField(body, "targetContacts"),
          maxBatch: numberField(body, "maxBatch"),
        });
        notify();
        return sendJson(res, 200, campaign);
      }
      if (req.method === "POST" && campaignId?.[2] === "template") {
        const template = orchestrator.saveTemplate(decodeURIComponent(campaignId[1] ?? ""));
        notify();
        return sendJson(res, 200, template);
      }
      const templateApprove = url.pathname.match(/^\/api\/templates\/([^/]+)\/approve$/);
      if (req.method === "POST" && templateApprove?.[1]) {
        orchestrator.approveTemplate(decodeURIComponent(templateApprove[1]));
        notify();
        return sendJson(res, 200, { ok: true });
      }
      sendJson(res, 404, { error: "Ruta no encontrada." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
      sendJson(res, 400, { error: message });
    }
  });
  function prospectingView(): StepPost & { report: string } {
    return { ...prospecting, report: prospectingReport };
  }

  return { server, orchestrator, store };
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("El cuerpo tiene que ser un objeto JSON.");
  }
  return parsed as Record<string, unknown>;
}

function optionalSecret(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${key} tiene que ser texto.`);
  }
  return value;
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Falta ${key}.`);
  }
  return value;
}

function arrayField(body: Record<string, unknown>, key: string): string[] | undefined {
  const value = body[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${key} tiene que ser una lista de textos.`);
  }
  return value;
}

function numberField(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${key} tiene que ser un entero.`);
  }
  return value;
}
