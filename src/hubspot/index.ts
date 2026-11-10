import { loadEnvFile, projectEnvPath } from "../config/load-env.ts";
import type { Phase1Module } from "../types.ts";

export const hubspotAgent = {
  id: "hubspot",
  phaseImplemented: 1,
  summary:
    "Official HubSpot API: imported contacts, duplicates, IDs, country, industry, campaign. Stub only.",
} as const satisfies Phase1Module;

/** No HubSpot request is made in Phase 1. The token stays in the environment, never in source. */
export function planHubSpot(env: NodeJS.ProcessEnv = process.env): { verified: false; reason: string } {
  if (env === process.env) {
    loadEnvFile(projectEnvPath, env);
  }
  if (!env.HUBSPOT_ACCESS_TOKEN || env.HUBSPOT_ACCESS_TOKEN.trim() === "") {
    return {
      verified: false,
      reason: "Falta HUBSPOT_ACCESS_TOKEN. No se consultó HubSpot y no se crea el segmento.",
    };
  }
  return {
    verified: false,
    reason:
      "La herramienta sincroniza la lista de Surfe y crea el segmento cuando el conteo termina. Esta preparación no llama a HubSpot.",
  };
}

export function verifyHubSpotImports(): never {
  throw new Error("HubSpot API verification is not implemented in Phase 1.");
}
