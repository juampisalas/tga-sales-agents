export type SurfeListPage = {
  readText(): Promise<string>;
  clickButton(accessibleName: string): Promise<void>;
};

export type SurfeSyncResult =
  | { outcome: "success"; synced: number; total: number; evidence: string }
  | { outcome: "ambiguous"; evidence: string };

const SYNC_BUTTON = "Sync all to HubSpot";

export async function syncSurfeListToHubSpot(
  page: SurfeListPage,
  options: {
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    timeoutMs?: number;
    intervalMs?: number;
  } = {},
): Promise<SurfeSyncResult> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  const intervalMs = options.intervalMs ?? 2000;
  const started = now();
  let clicked = false;
  let seenProgress = false;
  let lastEvidence = "";

  while (now() - started <= timeoutMs) {
    const text = await page.readText();
    const progress = progressLine(text);
    if (progress && progress.synced === progress.total && progress.total > 0) {
      return {
        outcome: "success",
        synced: progress.synced,
        total: progress.total,
        evidence: progress.evidence,
      };
    }
    if (progress) {
      seenProgress = true;
      lastEvidence = progress.evidence;
      await sleep(intervalMs);
      continue;
    }
    if (hasSyncButton(text) && !clicked) {
      await page.clickButton(SYNC_BUTTON);
      clicked = true;
      lastEvidence = "Se pulsó Sync all to HubSpot. Todavía no hay conteo terminado.";
      await sleep(intervalMs);
      continue;
    }
    if (hasSyncButton(text) && clicked && seenProgress) {
      return {
        outcome: "ambiguous",
        evidence: lastEvidence || "La sincronización se detuvo antes de terminar.",
      };
    }
    await sleep(intervalMs);
  }

  return {
    outcome: "ambiguous",
    evidence: lastEvidence || "Se agotó la espera sin un conteo terminado de HubSpot.",
  };
}

function hasSyncButton(text: string): boolean {
  return text.toLowerCase().includes(SYNC_BUTTON.toLowerCase());
}

function progressLine(text: string): { synced: number; total: number; evidence: string } | null {
  const match = text.match(/syncing to hubspot \(\d+\s*\/\s*\d+\)/i);
  if (!match) {
    return null;
  }
  const numbers = match[0].match(/(\d+)\s*\/\s*(\d+)/);
  const synced = numbers?.[1];
  const total = numbers?.[2];
  if (synced === undefined || total === undefined) {
    return null;
  }
  return { synced: Number(synced), total: Number(total), evidence: match[0] };
}
