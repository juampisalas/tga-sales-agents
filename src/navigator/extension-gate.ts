import { access, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const PLAYWRIGHT_EXTENSION_ID = "mmlmfjhmonkocbjadbfplnigmagldckm";

export function chromeUserDataDir(): string {
  return join(homedir(), "Library", "Application Support", "Google", "Chrome");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prefsHaveExtension(prefsPath: string): Promise<boolean> {
  try {
    const prefs = JSON.parse(await readFile(prefsPath, "utf8")) as {
      extensions?: { settings?: Record<string, unknown> };
    };
    const record = prefs.extensions?.settings?.[PLAYWRIGHT_EXTENSION_ID];
    return !!record && typeof record === "object" && Object.keys(record).length > 0;
  } catch {
    return false;
  }
}

export async function findPlaywrightExtensionProfile(userDataDir: string): Promise<string | null> {
  let entries: string[] = [];
  try {
    entries = await readdir(userDataDir);
  } catch {
    return null;
  }
  const profiles = entries.filter((entry) => entry === "Default" || /^Profile \d+$/.test(entry));
  for (const profile of profiles) {
    const dir = join(userDataDir, profile);
    if (await exists(join(dir, "Extensions", PLAYWRIGHT_EXTENSION_ID))) {
      return profile;
    }
    if (await prefsHaveExtension(join(dir, "Preferences"))) {
      return profile;
    }
    if (await prefsHaveExtension(join(dir, "Secure Preferences"))) {
      return profile;
    }
  }
  return null;
}

export async function playwrightExtensionReady(userDataDir = chromeUserDataDir()): Promise<{
  ok: boolean;
  reason: string;
}> {
  const profile = await findPlaywrightExtensionProfile(userDataDir);
  if (!profile) {
    return {
      ok: false,
      reason: "La extensión de Playwright no está instalada en Chrome. No se abrió Sales Navigator y no se pulsó Surfe. Importados verificados: 0.",
    };
  }
  return {
    ok: true,
    reason: `La extensión está en ${profile}, pero esta ejecución no abre Sales Navigator ni pulsa Surfe. La URL quedó para revisión. Importados verificados: 0.`,
  };
}
