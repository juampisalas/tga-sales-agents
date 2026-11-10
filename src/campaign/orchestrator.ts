import { randomUUID } from "node:crypto";
import {
  COUNTRY_LABELS,
  cloneDefaults,
  type CountryLabel,
  type DefaultConfig,
} from "../config/defaults.ts";
import { fold, interpretDefault, interpretInstruction, splitRequests } from "../interpreter/prompt-interpreter.ts";
import { salesNavigatorQuery } from "../interpreter/sales-navigator.ts";
import { searchFitsCampaign, type SalesSearchRead } from "../navigator/search-snapshot.ts";
import { reduceCampaign } from "./machine.ts";
import { executionPlan } from "./plans.ts";
import { CampaignStore } from "./store.ts";
import { isTerminal, type Campaign, type CampaignEvent } from "./types.ts";

export type LiveSearch =
  | { ok: true; observation: SalesSearchRead }
  | { ok: false; reason: string };

export type BrowserGate = {
  canSearch(): Promise<{ ok: boolean; reason: string }>;
  readSearch?(): Promise<LiveSearch>;
};

export class Orchestrator {
  private readonly store: CampaignStore;
  private readonly gate: BrowserGate;

  constructor(store: CampaignStore, gate: BrowserGate) {
    this.store = store;
    this.gate = gate;
  }

  snapshot() {
    return {
      defaults: this.store.getDefaults(),
      campaigns: this.store.listCampaigns(),
      templates: this.store.listTemplates(),
      events: Object.fromEntries(
        this.store.listCampaigns().map((campaign) => [campaign.id, this.store.listEvents(campaign.id)]),
      ),
    };
  }

  updateDefaults(input: Partial<DefaultConfig>): DefaultConfig {
    const current = this.store.getDefaults();
    const countries = normalizeCountries(input.countries ?? current.countries);
    const requestedPriority = input.priorityCountry ?? current.priorityCountry;
    const priority = COUNTRY_LABELS.find((label) => fold(label) === fold(requestedPriority));
    const next = cloneDefaults({ ...current, ...input, countries, priorityCountry: priority ?? countries[0] ?? current.priorityCountry });
    if (!next.countries.includes(next.priorityCountry)) {
      const fallback = next.countries[0];
      if (!fallback) {
        throw new Error("La configuración necesita al menos un país.");
      }
      next.priorityCountry = fallback;
    }
    if (!Number.isInteger(next.minEmployees) || next.minEmployees < 1) {
      throw new Error("El tamaño mínimo tiene que ser un entero mayor a cero.");
    }
    if (!Number.isInteger(next.targetContacts) || next.targetContacts < 1) {
      throw new Error("La cantidad objetivo tiene que ser un entero mayor a cero.");
    }
    next.maxBatch = Math.min(25, Math.max(1, next.maxBatch));
    next.source = "LinkedIn Sales Navigator";
    next.importTool = "Surfe";
    next.crm = "HubSpot";
    return this.store.saveDefaults(next);
  }

  async prepareInstruction(instruction: string): Promise<{ campaign: Campaign; queued: boolean }> {
    const requests = splitRequests(instruction);
    let first: { campaign: Campaign; queued: boolean } | null = null;
    for (let index = 0; index < requests.length; index += 1) {
      const part = requests[index] ?? instruction;
      const interpreted = interpretInstruction(part, this.store.getDefaults());
      if (index > 0) {
        interpreted.queueAfterCurrent = true;
      }
      const inserted = await this.insertCampaign(part, interpreted);
      first ??= inserted;
    }
    if (!first) {
      throw new Error("La instrucción está vacía.");
    }
    return first;
  }

  async prepareDefault(): Promise<{ campaign: Campaign; queued: boolean }> {
    const interpreted = interpretDefault(this.store.getDefaults());
    return this.insertCampaign("Configuración predeterminada de TGA", interpreted);
  }

  updateFilters(id: string, patch: {
    countries?: string[];
    industries?: string[];
    roles?: string[];
    minEmployees?: number;
    targetContacts?: number;
    maxBatch?: number;
  }): Campaign {
    const campaign = this.require(id);
    if (campaign.status !== "filters_ready" && campaign.status !== "queued") {
      throw new Error("Los filtros solo se editan antes de iniciar.");
    }
    if (patch.countries) {
      campaign.config.countries = normalizeCountries(patch.countries);
    }
    if (patch.industries) {
      campaign.config.industries = patch.industries.map((item) => item.trim()).filter(Boolean);
    }
    if (patch.roles) {
      campaign.config.roles = patch.roles.map((item) => item.trim()).filter(Boolean);
    }
    if (patch.minEmployees !== undefined) {
      campaign.config.minEmployees = patch.minEmployees;
    }
    if (patch.targetContacts !== undefined) {
      campaign.config.targetContacts = patch.targetContacts;
    }
    if (patch.maxBatch !== undefined) {
      campaign.config.maxBatch = Math.min(25, Math.max(1, patch.maxBatch));
    }
    if (campaign.config.countries.length === 0) {
      throw new Error("La campaña necesita al menos un país.");
    }
    if (!campaign.config.countries.includes(campaign.config.priorityCountry)) {
      const fallback = campaign.config.countries[0];
      if (!fallback) {
        throw new Error("La campaña necesita al menos un país.");
      }
      campaign.config.priorityCountry = fallback;
    }
    campaign.config.salesNavigator = salesNavigatorQuery(campaign.config);
    this.persist(campaign);
    return campaign;
  }

  async start(id: string): Promise<Campaign> {
    const current = this.require(id);
    if (current.config.countries.length === 0) {
      throw new Error("La campaña no tiene países. Corregí los filtros antes de iniciar.");
    }
    await this.transition(id, { type: "start" });
    for (const line of executionPlan(this.require(id).config)) {
      this.store.addEvent(id, line, now());
    }
    const gate = await this.gate.canSearch();
    if (!gate.ok || !this.gate.readSearch) {
      return this.transition(id, { type: "navigator_blocked", reason: gate.reason });
    }
    return this.recordOpenSearch(id);
  }

  private async recordOpenSearch(id: string): Promise<Campaign> {
    const readSearch = this.gate.readSearch;
    if (!readSearch) {
      return this.transition(id, { type: "navigator_blocked", reason: "No hay una pestaña de Sales Navigator para leer." });
    }
    const read = await readSearch();
    if (!read.ok) {
      return this.transition(id, { type: "navigator_blocked", reason: read.reason });
    }
    const campaign = this.require(id);
    const decision = searchFitsCampaign(read.observation, campaign.config.countries);
    if (read.observation.kind === "security" || read.observation.kind === "login") {
      const blocked = await this.transition(id, { type: "security" });
      blocked.report = `${decision.text} Encontrados: ${blocked.found}. Importados verificados: ${blocked.imported}. Omitidos: ${blocked.skipped}.`;
      this.persist(blocked);
      return this.require(id);
    }
    if (!decision.fits) {
      return this.transition(id, { type: "navigator_blocked", reason: decision.text });
    }
    const seen = await this.transition(id, {
      type: "search_page",
      foundOnPage: read.observation.visibleLeads,
      exhausted: read.observation.visibleLeads === 0,
    });
    if (seen.status === "running") {
      seen.report = `${decision.text} Encontrados: ${seen.found}. Importados verificados: ${seen.imported}. Omitidos: ${seen.skipped}.`;
      this.persist(seen);
      this.store.addEvent(id, seen.report, now());
    }
    return this.require(id);
  }

  pause(id: string): Promise<Campaign> {
    return this.transition(id, { type: "pause" });
  }

  resume(id: string): Promise<Campaign> {
    return this.transition(id, { type: "resume" });
  }

  stop(id: string): Promise<Campaign> {
    return this.transition(id, { type: "stop" });
  }

  async transition(id: string, event: CampaignEvent): Promise<Campaign> {
    const campaign = this.require(id);
    const next = reduceCampaign(campaign, event);
    next.updatedAt = now();
    this.persist(next);
    this.store.addEvent(id, eventMessage(event, next), next.updatedAt);
    if (isTerminal(next.status)) {
      await this.promoteQueue();
    }
    return this.require(id);
  }

  saveTemplate(campaignId: string): { id: string; name: string; instruction: string; approved: boolean } {
    const campaign = this.require(campaignId);
    const template = {
      id: randomUUID(),
      name: campaign.instruction.slice(0, 80),
      instruction: campaign.instruction,
      approved: false,
      createdAt: now(),
    };
    this.store.saveTemplate(template);
    return template;
  }

  approveTemplate(id: string): void {
    this.store.approveTemplate(id);
  }

  private async insertCampaign(instruction: string, interpreted: ReturnType<typeof interpretInstruction>): Promise<{ campaign: Campaign; queued: boolean }> {
    const approved = this.store.listTemplates().some((template) => template.approved && fold(template.instruction) === fold(instruction));
    const wait = this.shouldQueue(interpreted.queueAfterCurrent);
    const timestamp = now();
    const campaign: Campaign = {
      id: randomUUID(),
      instruction,
      mode: interpreted.mode,
      status: wait ? "queued" : "filters_ready",
      step: "await_start",
      config: interpreted.config,
      found: 0,
      imported: 0,
      skipped: 0,
      pendingImport: 0,
      errors: [],
      schedule: interpreted.schedule,
      queueAfterCurrent: interpreted.queueAfterCurrent,
      report: null,
      blockedReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.persist(campaign);
    this.store.addEvent(campaign.id, wait
      ? "Quedó en la cola. Los filtros se confirman cuando la campaña anterior termina, salvo que la plantilla ya esté aprobada."
      : "Filtros listos. La búsqueda no empieza hasta Iniciar.", timestamp);
    if (!wait && approved) {
      this.store.addEvent(campaign.id, "La plantilla está aprobada: la ejecución empieza sin otro clic.", now());
      return { campaign: await this.start(campaign.id), queued: false };
    }
    return { campaign: this.require(campaign.id), queued: wait };
  }

  private shouldQueue(queueAfterCurrent: boolean): boolean {
    const campaigns = this.store.listCampaigns();
    const active = campaigns.some((campaign) => campaign.status === "running" || campaign.status === "paused");
    if (active) {
      return true;
    }
    if (!queueAfterCurrent) {
      return false;
    }
    return campaigns.some((campaign) => !isTerminal(campaign.status));
  }

  private async promoteQueue(): Promise<void> {
    const campaigns = this.store.listCampaigns();
    if (campaigns.some((campaign) => campaign.status === "running" || campaign.status === "paused" || campaign.status === "filters_ready")) {
      return;
    }
    const next = campaigns.find((campaign) => campaign.status === "queued");
    if (!next) {
      return;
    }
    const approved = this.store.listTemplates().some((template) => template.approved && fold(template.instruction) === fold(next.instruction));
    next.status = "filters_ready";
    next.updatedAt = now();
    this.persist(next);
    this.store.addEvent(next.id, "La campaña anterior terminó. Estos son los filtros.", next.updatedAt);
    if (approved) {
      this.store.addEvent(next.id, "La plantilla está aprobada: la ejecución empieza sin otro clic.", now());
      await this.start(next.id);
    }
  }

  private persist(campaign: Campaign): void {
    this.store.saveCampaign(campaign);
  }

  private require(id: string): Campaign {
    const campaign = this.store.getCampaign(id);
    if (!campaign) {
      throw new Error("No existe esa campaña.");
    }
    return campaign;
  }
}

function normalizeCountries(values: string[]): CountryLabel[] {
  const labels: CountryLabel[] = [];
  for (const value of values) {
    const found = COUNTRY_LABELS.find((label) => fold(label) === fold(value));
    if (!found) {
      throw new Error(`País no disponible en la configuración: ${value}`);
    }
    if (!labels.includes(found)) {
      labels.push(found);
    }
  }
  return labels;
}

function now(): string {
  return new Date().toISOString();
}

function eventMessage(event: CampaignEvent, campaign: Campaign): string {
  switch (event.type) {
    case "start":
      return "Ejecución iniciada. Todavía no hay importaciones.";
    case "pause":
      return "Campaña en pausa.";
    case "resume":
      return "Campaña reanudada.";
    case "stop":
      return campaign.report ?? "Campaña detenida.";
    case "security":
      return campaign.blockedReason ?? "Detenida por una verificación de seguridad.";
    case "navigator_blocked":
      return event.reason;
    case "search_page":
      return `Página registrada: ${event.foundOnPage} encontrados.`;
    case "batch_selected":
      return `Lote seleccionado: ${event.count}. Surfe todavía no se pulsó.`;
    case "surfe_loaded":
      return event.done
        ? `Surfe terminó de cargar ${event.loaded}. ${event.evidence}`
        : event.evidence;
    case "import_observation":
      return event.evidence
        ? `Surfe reportó ${event.outcome} con evidencia. Pendiente de HubSpot: ${event.count}.`
        : "Observación de Surfe sin evidencia. No se avanzó.";
    case "hubspot_check":
      return event.evidence
        ? `HubSpot verificó ${event.created} nuevos y ${event.duplicates} duplicados.`
        : "HubSpot sin evidencia. No se avanzó.";
    case "duplicate_seen":
      return `${event.count} duplicados omitidos. No se contaron como nuevos.`;
    case "next_page":
      return event.exhausted ? "No hay más páginas." : "Siguiente página.";
    default:
      return "Evento registrado.";
  }
}
