import type { Campaign, CampaignEvent } from "./types.ts";

export function reduceCampaign(campaign: Campaign, event: CampaignEvent): Campaign {
  const next = structuredClone(campaign);
  switch (event.type) {
    case "start":
      assertStatus(next, ["filters_ready"], "Iniciar");
      next.status = "running";
      next.step = "search";
      next.report = null;
      return next;
    case "pause":
      assertStatus(next, ["running"], "Pausar");
      next.status = "paused";
      return next;
    case "resume":
      assertStatus(next, ["paused"], "Reanudar");
      next.status = "running";
      return next;
    case "stop":
      assertStatus(next, ["filters_ready", "queued", "running", "paused"], "Detener");
      next.status = "stopped";
      next.step = "report";
      next.report = reportCounts(next, "Campaña detenida.");
      return next;
    case "security":
      assertStatus(next, ["running", "paused"], "Desafío de seguridad");
      next.status = "blocked";
      next.step = "report";
      next.blockedReason = "Apareció una verificación de seguridad. La campaña se detuvo.";
      next.errors.push({ at: "security", message: next.blockedReason });
      next.report = reportCounts(next, next.blockedReason);
      return next;
    case "navigator_blocked":
      assertStatus(next, ["running"], "Bloqueo del navegador");
      next.status = "blocked";
      next.step = "report";
      next.blockedReason = event.reason;
      next.errors.push({ at: "navigator", message: event.reason });
      next.report = reportCounts(next, event.reason);
      return next;
    case "search_page":
      assertStep(next, "search");
      next.found += event.foundOnPage;
      if (event.foundOnPage === 0 && event.exhausted) {
        return finishShort(next);
      }
      next.step = "select";
      return next;
    case "batch_selected":
      assertStep(next, "select");
      if (event.count > next.config.maxBatch) {
        throw new Error(`El lote ${event.count} supera el máximo de ${next.config.maxBatch}.`);
      }
      next.step = "import";
      return next;
    case "next_page":
      assertStep(next, "paginate");
      if (event.exhausted) {
        return finishShort(next);
      }
      next.step = "search";
      return next;
    case "duplicate_seen":
      assertStatus(next, ["running"], "Duplicados");
      next.skipped += event.count;
      return next;
    case "surfe_loaded":
      assertStep(next, "import");
      if (!event.done || event.evidence.trim() === "") {
        next.errors.push({
          at: "surfe",
          message: event.evidence.trim() || "Surfe no terminó de cargar el lote. No se agregan otros 25.",
        });
        return next;
      }
      next.imported += event.loaded;
      next.pendingImport = 0;
      if (next.imported >= next.config.targetContacts) {
        next.status = "completed";
        next.step = "report";
        next.report = reportCounts(next, "Surfe terminó de cargar el objetivo.");
        return next;
      }
      next.step = "paginate";
      return next;
    case "import_observation":
      assertStep(next, "import");
      if (event.outcome !== "success" || !event.evidence || event.evidence.trim() === "") {
        const message = event.outcome === "success"
          ? "Surfe no tiene evidencia. No se cuenta como importado y no se avanza."
          : `Surfe quedó en ${event.outcome}. No se cuenta como importado y no se avanza.`;
        next.errors.push({ at: "surfe", message });
        return next;
      }
      next.pendingImport = event.count;
      next.step = "verify";
      return next;
    case "hubspot_check":
      assertStep(next, "verify");
      if (!event.evidence || event.evidence.trim() === "") {
        next.errors.push({
          at: "hubspot",
          message: "HubSpot no verificó el lote. No se cuenta como importado y no se avanza.",
        });
        return next;
      }
      next.imported += event.created;
      next.skipped += event.duplicates;
      next.pendingImport = 0;
      if (event.created === 0 && event.duplicates === 0) {
        next.errors.push({
          at: "hubspot",
          message: "HubSpot no mostró registros nuevos ni duplicados para este lote.",
        });
      }
      if (next.imported >= next.config.targetContacts) {
        next.status = "completed";
        next.step = "report";
        next.report = reportCounts(next, "Objetivo alcanzado con registros verificados en HubSpot.");
        return next;
      }
      next.step = "paginate";
      return next;
    default:
      return assertNever(event);
  }
}

function finishShort(campaign: Campaign): Campaign {
  const next = campaign;
  next.step = "report";
  if (next.imported >= next.config.targetContacts) {
    next.status = "completed";
    next.report = reportCounts(next, "Búsqueda agotada con el objetivo verificado.");
    return next;
  }
  next.status = "partial";
  next.report = reportCounts(
    next,
    `No hubo suficientes contactos. Se consiguieron ${next.imported} de ${next.config.targetContacts}.`,
  );
  return next;
}

function reportCounts(campaign: Campaign, lead: string): string {
  return `${lead} Encontrados: ${campaign.found}. Importados verificados: ${campaign.imported}. Omitidos: ${campaign.skipped}.`;
}

function assertStatus(campaign: Campaign, allowed: Campaign["status"][], action: string): void {
  if (!allowed.includes(campaign.status)) {
    throw new Error(`${action} no está disponible desde el estado ${campaign.status}.`);
  }
}

function assertStep(campaign: Campaign, step: Campaign["step"]): void {
  if (campaign.status !== "running" || campaign.step !== step) {
    throw new Error(`El paso ${step} no está activo (estado ${campaign.status}, paso ${campaign.step}).`);
  }
}

function assertNever(event: never): never {
  throw new Error(`Evento no soportado: ${JSON.stringify(event)}`);
}
