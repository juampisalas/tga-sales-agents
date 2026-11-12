import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");

/** Fills empty environment variables from a local env file. Existing values stay. */
export function loadEnvFile(path: string, env: NodeJS.ProcessEnv = process.env): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    const current = env[key];
    if (current !== undefined && current.trim() !== "") {
      continue;
    }
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
}

const API_KEYS = {
  openaiApiKey: "OPENAI_API_KEY",
  hubspotAccessToken: "HUBSPOT_ACCESS_TOKEN",
} as const;

export function credentialStatus(env: NodeJS.ProcessEnv = process.env): { openai: boolean; hubspot: boolean } {
  return {
    openai: Boolean(env.OPENAI_API_KEY?.trim()),
    hubspot: Boolean(env.HUBSPOT_ACCESS_TOKEN?.trim()),
  };
}

/** Writes the keys a person typed in the page. The response never includes the secret. */
export function saveApiKeys(
  path: string,
  input: { openaiApiKey?: string; hubspotAccessToken?: string },
  env: NodeJS.ProcessEnv = process.env,
): { openai: boolean; hubspot: boolean } {
  const updates: Record<string, string> = {};
  for (const [field, key] of Object.entries(API_KEYS)) {
    const value = input[field as keyof typeof API_KEYS];
    if (typeof value !== "string" || value.trim() === "") {
      continue;
    }
    if (value.includes("\n") || value.includes("\r")) {
      throw new Error("La clave no puede tener saltos de línea.");
    }
    updates[key] = value.trim();
  }
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  const seen = new Set<string>();
  const lines = text.split("\n").map((line) => {
    const separator = line.indexOf("=");
    if (separator <= 0) {
      return line;
    }
    const key = line.slice(0, separator).trim();
    const value = updates[key];
    if (value === undefined) {
      return line;
    }
    seen.add(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.splice(lines.length - 1, 0, `${key}=${value}`);
      } else {
        lines.push(`${key}=${value}`);
      }
    }
    env[key] = value;
  }
  const body = lines.join("\n").replace(/\n*$/, "\n");
  writeFileSync(path, body, { mode: 0o600 });
  return credentialStatus(env);
}
