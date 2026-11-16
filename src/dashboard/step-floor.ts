export const surfeHandoffLogPath = "/tmp/tga-segment-handoff.log";
export const listReloadMark = "recarga la lista:";
export const listReloadFailedMark = "no pudo recargar:";
export const syncResumeMark = "reanuda la sincronización:";
export const syncResumeFailedMark = "no pudo reanudar:";

export type StepState = "working" | "waiting" | "stuck" | "idle" | "done";

export type StepPost = {
  id: "navigator" | "selection" | "surfe" | "hubspot" | "qualification" | "prospecting";
  name: string;
  state: StepState;
  doing: string;
  stuckAt: string | null;
};

const STALL_MS = 60_000;
const RELOAD_MS = 3 * 60_000;

export function stepFloor(log: string, now = Date.now()): {
  steps: StepPost[];
  stuck: StepPost | null;
} {
  const progress = progressSamples(log);
  const interventionAt = lastIntervention(log);
  const afterIntervention = interventionAt === null ? progress : progress.filter((sample) => sample.at >= interventionAt);
  const basis = afterIntervention.length > 0 ? afterIntervention : progress;
  const last = basis.at(-1);
  const sameCountSince = last
    ? basis.find((sample) => sample.synced === last.synced && sample.total === last.total)?.at ?? last.at
    : null;
  const stalled = Boolean(
    last &&
    last.synced < last.total &&
    sameCountSince !== null &&
    (last.at - sameCountSince >= STALL_MS || now - last.at >= STALL_MS),
  );
  const finished = Boolean(last && last.synced === last.total && last.total > 0);
  const verified = /verified=true/.test(log);
  const rejected = /verified=false/.test(log);
  const gaveUp = /No se creó el segmento/.test(log);
  const lines = log.split("\n").map((line) => line.trim()).filter(Boolean);
  const lastLine = lines.at(-1) ?? "";
  const readFailed = /Command failed|missing|error/i.test(lastLine) && !/Syncing to HubSpot/.test(lastLine);

  let surfe: StepPost = !last
    ? post("surfe", "Surfe", "idle", "No hay una sincronización a HubSpot.", null)
    : finished
      ? post("surfe", "Surfe", "done", `Terminó ${last.synced} de ${last.total}.`, null)
      : stalled
        ? post("surfe", "Surfe", "stuck", "Sincroniza la lista con HubSpot.", `${last.raw} no avanza.`)
        : post("surfe", "Surfe", "working", "Sincroniza la lista con HubSpot.", null);
  if (readFailed && surfe.state !== "done" && surfe.state !== "stuck") {
    surfe = post("surfe", "Surfe", "stuck", "Sincroniza la lista con HubSpot.", "No pudo leer la pestaña de Surfe.");
  }

  const hubspot: StepPost = verified
    ? post("hubspot", "HubSpot", "done", "Metió los contactos de esta carga en el segmento.", null)
    : rejected || gaveUp
      ? post("hubspot", "HubSpot", "stuck", "Iba a armar el segmento 05/11/2026 Argentina.", "La carga no quedó verificada.")
      : finished
        ? post("hubspot", "HubSpot", "working", "Arma el segmento 05/11/2026 Argentina.", null)
        : post("hubspot", "HubSpot", "waiting", "Espera a que Surfe cierre el conteo.", null);

  const steps: StepPost[] = [
    post(
      "navigator",
      "Navigator",
      last ? "done" : "idle",
      last ? "La búsqueda ya está en la lista que Surfe sincroniza." : "No hay una búsqueda en curso.",
      null,
    ),
    post(
      "selection",
      "Selección",
      last ? "done" : "idle",
      last ? `La lista en curso tiene ${last.total} perfiles.` : "No hay un lote abierto.",
      null,
    ),
    surfe,
    hubspot,
    post("qualification", "Calificación", "idle", "Todavía no califica contactos.", null),
  ];
  const stuck = steps.find((step) => step.state === "stuck") ?? null;
  return { steps, stuck };
}

export function surfeResumeNeeded(log: string, visibleLine: string, now = Date.now()): string | null {
  if (/syncing to hubspot/i.test(visibleLine)) {
    return null;
  }
  const signature = surfeReloadNeeded(log, now);
  if (signature) {
    return null;
  }
  const floor = stepFloor(log, now);
  const surfe = floor.steps.find((step) => step.id === "surfe");
  if (surfe?.state !== "stuck" || !surfe.stuckAt) {
    return null;
  }
  const stalled = surfe.stuckAt.replace(/ no avanza\.$/, "");
  if (!log.includes(`${listReloadMark} ${stalled}`)) {
    return null;
  }
  if (log.includes(`${syncResumeMark} ${stalled}`) || log.includes(`${syncResumeFailedMark} ${stalled}`)) {
    return null;
  }
  return stalled;
}

export function surfeReloadNeeded(log: string, now = Date.now()): string | null {
  const floor = stepFloor(log, now);
  const surfe = floor.steps.find((step) => step.id === "surfe");
  if (surfe?.state !== "stuck" || !surfe.stuckAt || stallAge(log, now) < RELOAD_MS) {
    return null;
  }
  const signature = surfe.stuckAt.replace(/ no avanza\.$/, "");
  if (log.includes(`${listReloadMark} ${signature}`) || log.includes(`${listReloadFailedMark} ${signature}`)) {
    return null;
  }
  return signature;
}

function stallAge(log: string, now: number): number {
  const progress = progressSamples(log);
  const interventionAt = lastIntervention(log);
  const afterIntervention = interventionAt === null ? progress : progress.filter((sample) => sample.at >= interventionAt);
  const basis = afterIntervention.length > 0 ? afterIntervention : progress;
  const last = basis.at(-1);
  if (!last || last.synced === last.total) {
    return 0;
  }
  const since = basis.find((sample) => sample.synced === last.synced && sample.total === last.total)?.at ?? last.at;
  return Math.max(last.at - since, now - last.at);
}

function lastIntervention(log: string): number | null {
  let at: number | null = null;
  for (const line of log.split("\n")) {
    if (!line.includes(listReloadMark) && !line.includes(syncResumeMark)) {
      continue;
    }
    const time = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
    if (time?.[1]) {
      at = Date.parse(time[1]);
    }
  }
  return at;
}

export function idleProspecting(): StepPost {
  return post(
    "prospecting",
    "Prospección",
    "idle",
    "Busca por su cuenta empresas que quieren capacitarse y perfiles muy senior para TGA.",
    null,
  );
}

function post(id: StepPost["id"], name: string, state: StepState, doing: string, stuckAt: string | null): StepPost {
  return { id, name, state, doing, stuckAt };
}

function progressSamples(log: string): { at: number; synced: number; total: number; raw: string }[] {
  const samples = [];
  for (const line of log.split("\n")) {
    if (
      line.includes(listReloadMark) ||
      line.includes(listReloadFailedMark) ||
      line.includes(syncResumeMark) ||
      line.includes(syncResumeFailedMark)
    ) {
      continue;
    }
    const time = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
    const progress = line.match(/Syncing to HubSpot \((\d+)\/(\d+)\)/);
    const synced = progress?.[1];
    const total = progress?.[2];
    if (!time?.[1] || !progress || synced === undefined || total === undefined) {
      continue;
    }
    samples.push({
      at: Date.parse(time[1]),
      synced: Number(synced),
      total: Number(total),
      raw: progress[0],
    });
  }
  return samples;
}
