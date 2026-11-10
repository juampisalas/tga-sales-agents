export const surfeHandoffLogPath = "/tmp/tga-segment-handoff.log";

export type AgentState = "working" | "waiting" | "stuck" | "idle" | "done";

export type AgentPost = {
  id: "navigator" | "selection" | "surfe" | "hubspot" | "qualification" | "supervisor";
  name: string;
  state: AgentState;
  doing: string;
  stuckAt: string | null;
};

const STALL_MS = 60_000;
const RELOAD_MS = 3 * 60_000;

export function agentFloor(log: string, now = Date.now()): {
  supervisor: AgentPost;
  agents: AgentPost[];
  stuck: AgentPost | null;
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
  const supervisorBroken = /Command failed|missing|error/i.test(lastLine) && !/Syncing to HubSpot/.test(lastLine);

  const surfe: AgentPost = !last
    ? post("surfe", "Surfe", "idle", "No hay una sincronización a HubSpot.", null)
    : finished
      ? post("surfe", "Surfe", "done", `Terminó ${last.synced} de ${last.total}.`, null)
      : stalled
        ? post("surfe", "Surfe", "stuck", "Sincroniza la lista con HubSpot.", `${last.raw} no avanza.`)
        : post("surfe", "Surfe", "working", "Sincroniza la lista con HubSpot.", null);

  const hubspot: AgentPost = verified
    ? post("hubspot", "HubSpot", "done", "Metió los contactos de esta carga en el segmento.", null)
    : rejected || gaveUp
      ? post("hubspot", "HubSpot", "stuck", "Iba a armar el segmento 05/11/2026 Argentina.", "La carga no quedó verificada.")
      : finished
        ? post("hubspot", "HubSpot", "working", "Arma el segmento 05/11/2026 Argentina.", null)
        : post("hubspot", "HubSpot", "waiting", "Espera a que Surfe cierre el conteo.", null);

  const agents: AgentPost[] = [
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
  const workerStuck = agents.find((agent) => agent.state === "stuck") ?? null;
  const reloaded = Boolean(last && log.includes(`supervisor recarga la lista: ${last.raw}`));
  const resumed = Boolean(last && log.includes(`supervisor reanuda la sincronización: ${last.raw}`));
  const supervisor = supervisorPost(supervisorBroken, workerStuck, reloaded, resumed, Boolean(last));
  const stuck = workerStuck ?? (supervisor.state === "stuck" ? supervisor : null);
  return { supervisor, agents, stuck };
}

export function surfeResumeNeeded(log: string, visibleLine: string, now = Date.now()): string | null {
  if (/syncing to hubspot/i.test(visibleLine)) {
    return null;
  }
  const signature = surfeReloadNeeded(log, now);
  if (signature) {
    return null;
  }
  const floor = agentFloor(log, now);
  const surfe = floor.agents.find((agent) => agent.id === "surfe");
  if (surfe?.state !== "stuck" || !surfe.stuckAt) {
    return null;
  }
  const stalled = surfe.stuckAt.replace(/ no avanza\.$/, "");
  if (!log.includes(`supervisor recarga la lista: ${stalled}`)) {
    return null;
  }
  if (log.includes(`supervisor reanuda la sincronización: ${stalled}`) || log.includes(`supervisor no pudo reanudar: ${stalled}`)) {
    return null;
  }
  return stalled;
}

export function surfeReloadNeeded(log: string, now = Date.now()): string | null {
  const floor = agentFloor(log, now);
  const surfe = floor.agents.find((agent) => agent.id === "surfe");
  if (surfe?.state !== "stuck" || !surfe.stuckAt || stallAge(log, now) < RELOAD_MS) {
    return null;
  }
  const signature = surfe.stuckAt.replace(/ no avanza\.$/, "");
  if (log.includes(`supervisor recarga la lista: ${signature}`) || log.includes(`supervisor no pudo recargar: ${signature}`)) {
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
    if (!/supervisor recarga la lista:|supervisor reanuda la sincronización:/.test(line)) {
      continue;
    }
    const time = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
    if (time?.[1]) {
      at = Date.parse(time[1]);
    }
  }
  return at;
}

function supervisorPost(broken: boolean, fire: AgentPost | null, reloaded: boolean, resumed: boolean, watching: boolean): AgentPost {
  if (broken) {
    return post("supervisor", "Supervisor", "stuck", "Se fija que el resto esté laburando.", "No pudo leer la pestaña de Surfe.");
  }
  if (fire?.stuckAt) {
    const doing = resumed
      ? `Reanudó la sincronización de ${fire.name}.`
      : reloaded
        ? `Recargó la lista de ${fire.name} y el conteo sigue igual.`
        : `Apaga el incendio de ${fire.name}.`;
    return post("supervisor", "Supervisor", "working", doing, fire.stuckAt);
  }
  if (watching) {
    return post("supervisor", "Supervisor", "working", "Se fija que los que tienen trabajo estén laburando.", null);
  }
  return post("supervisor", "Supervisor", "idle", "No hay incendios.", null);
}

function post(id: AgentPost["id"], name: string, state: AgentState, doing: string, stuckAt: string | null): AgentPost {
  return { id, name, state, doing, stuckAt };
}

function progressSamples(log: string): { at: number; synced: number; total: number; raw: string }[] {
  const samples = [];
  for (const line of log.split("\n")) {
    if (line.includes("supervisor ")) {
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
