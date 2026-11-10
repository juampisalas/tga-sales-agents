import {
  CHILE_ROLES,
  cloneDefaults,
  COUNTRY_ALIASES,
  employeeMinimum,
  MARKET_PRIORITY,
  type CountryLabel,
  type DefaultConfig,
} from "../config/defaults.ts";
import { marketOn } from "../markets/rotation.ts";
import { salesNavigatorQuery, type SalesNavigatorQuery } from "./sales-navigator.ts";

export type CampaignMode = "default" | "custom" | "recurring";

export type Weekday =
  | "lunes"
  | "martes"
  | "miércoles"
  | "jueves"
  | "viernes"
  | "sábado"
  | "domingo";

export type CampaignSchedule = {
  days: Weekday[];
  time: string;
};

export type InterpretedCampaign = {
  mode: CampaignMode;
  config: DefaultConfig & {
    requestedCompanies: number | null;
    warnings: string[];
    explicitFields: string[];
    salesNavigator: SalesNavigatorQuery;
    offer: "studio" | "portal-mla";
    listCountry: string;
  };
  queueAfterCurrent: boolean;
  schedule: CampaignSchedule | null;
};

const INDUSTRY_ALIASES: { alias: string; label: string }[] = [
  { alias: "farmaceuticas", label: "farmacéutica" },
  { alias: "farmaceutica", label: "farmacéutica" },
  { alias: "franquicias", label: "franquicias" },
  { alias: "franquicia", label: "franquicias" },
  { alias: "logistica", label: "logística" },
  { alias: "mineras", label: "minería" },
  { alias: "mineros", label: "minería" },
  { alias: "mineria", label: "minería" },
  { alias: "industrias", label: "industria" },
  { alias: "industrial", label: "industria" },
  { alias: "industria", label: "industria" },
  { alias: "pharma", label: "farmacéutica" },
  { alias: "retail", label: "retail" },
  { alias: "salud", label: "salud" },
  { alias: "bancos", label: "bancos" },
  { alias: "banca", label: "bancos" },
  { alias: "supermercados", label: "supermercados" },
  { alias: "supermercado", label: "supermercados" },
  { alias: "farmacias", label: "farmacias" },
  { alias: "farmacia", label: "farmacias" },
  { alias: "droguerias", label: "farmacias" },
  { alias: "drogueria", label: "farmacias" },
  { alias: "automotrices", label: "automotriz" },
  { alias: "automotriz", label: "automotriz" },
  { alias: "educacion corporativa", label: "educación corporativa" },
  { alias: "universidad corporativa", label: "educación corporativa" },
];

const ROLE_ALIASES: { alias: string; label: string }[] = [
  { alias: "recursos humanos", label: "RR. HH." },
  { alias: "rrhh", label: "RR. HH." },
  { alias: "rr hh", label: "RR. HH." },
  { alias: "desarrollo organizacional", label: "desarrollo organizacional" },
  { alias: "capacitacion", label: "capacitación" },
  { alias: "talento", label: "talento" },
  { alias: "l&d", label: "L&D" },
  { alias: "l y d", label: "L&D" },
  { alias: "diseno instruccional", label: "diseño instruccional" },
  { alias: "hse", label: "HSE" },
  { alias: "compliance", label: "compliance" },
];

const UNKNOWN_COUNTRIES = ["peru", "uruguay", "espana"];

const WEEKDAYS: { alias: string; label: Weekday }[] = [
  { alias: "lunes", label: "lunes" },
  { alias: "martes", label: "martes" },
  { alias: "miercoles", label: "miércoles" },
  { alias: "jueves", label: "jueves" },
  { alias: "viernes", label: "viernes" },
  { alias: "sabado", label: "sábado" },
  { alias: "domingo", label: "domingo" },
];

const TITLE_KINDS: Record<string, string> = {
  directores: "Directores",
  directoras: "Directoras",
  responsables: "Responsables",
  gerentes: "Gerentes",
  jefes: "Jefes",
  jefas: "Jefas",
};

export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function interpretInstruction(
  instruction: string,
  defaults: DefaultConfig = cloneDefaults(),
  now: Date = new Date(),
): InterpretedCampaign {
  const config = cloneDefaults(defaults);
  const warnings: string[] = [];
  const explicit = new Set<string>();
  const { text, queueAfterCurrent } = splitQueuedRequest(instruction);
  const folded = fold(text);
  const { scanText, excludedIndustries, excludedCountries, excludedRoles } = exclusions(folded);

  const requestedCompanies = readCompanyCount(folded);
  const contactCount = readContactCount(folded);
  if (contactCount !== null) {
    config.targetContacts = contactCount;
    explicit.add("targetContacts");
  } else if (requestedCompanies !== null) {
    warnings.push(
      `${requestedCompanies} se leyó como empresas, no como contactos. La cantidad objetivo sigue en ${config.targetContacts}.`,
    );
  }

  const employees = readEmployees(folded);
  if (employees !== null) {
    config.minEmployees = employees;
    explicit.add("minEmployees");
  }

  const countries = readCountries(scanText, excludedCountries);
  const unknown = UNKNOWN_COUNTRIES.filter((name) => new RegExp(`\\b${name}\\b`).test(scanText));
  if (unknown.length > 0) {
    warnings.push(
      `No hay un filtro de país cargado para: ${unknown.join(", ")}. No lo agregué.`,
    );
  }
  if (countries.explicit) {
    config.countries = countries.labels;
    explicit.add("countries");
    if (countries.labels.length === 0) {
      warnings.push("La instrucción dejó la campaña sin países. Corregila antes de iniciar.");
    }
  } else if (excludedCountries.size > 0) {
    assignToday(config, warnings, now, excludedCountries);
    explicit.add("countries");
  } else if (unknown.length > 0) {
    config.countries = [];
    explicit.add("countries");
    warnings.push("La instrucción dejó la campaña sin países. Corregila antes de iniciar.");
  } else {
    assignToday(config, warnings, now, new Set());
  }

  const priority = folded.match(/\bprioridad\s+(estados unidos|united states|chile|mexico|argentina|brasil|brazil|colombia|usa|eeuu)\b/);
  if (priority?.[1]) {
    config.priorityCountry = countryLabel(priority[1]);
    explicit.add("priorityCountry");
  }

  const industries = readIndustries(scanText);
  if (industries.length > 0) {
    config.industries = industries.filter((label) => !excludedIndustries.has(label));
    explicit.add("industries");
  } else if (excludedIndustries.size > 0) {
    config.industries = config.industries.filter((label) => !excludedIndustries.has(label));
    explicit.add("industries");
  }

  const roles = readRoles(scanText);
  if (roles.length > 0) {
    config.roles = roles.filter((label) => !excludedRoles.has(fold(label)) && !excludedRoles.has(label));
    explicit.add("roles");
  } else if (excludedRoles.size > 0) {
    config.roles = config.roles.filter((label) => !roleExcluded(label, excludedRoles));
    explicit.add("roles");
  }

  const batch = folded.match(/\blotes?\s+de\s+(\d+)\b/);
  if (batch?.[1]) {
    const requested = Number(batch[1]);
    config.maxBatch = Math.min(25, Math.max(1, requested));
    explicit.add("maxBatch");
    if (requested > 25) {
      warnings.push("El lote máximo de TGA es 25. El valor pedido se ajustó a 25.");
    }
  }

  if (/\bincluye duplicados\b|\bincluye ya importados\b/.test(folded)) {
    config.excludeAlreadyImported = false;
    explicit.add("excludeAlreadyImported");
  }
  if (/\bincluye empresas ya procesadas\b/.test(folded)) {
    config.avoidProcessedCompanies = false;
    explicit.add("avoidProcessedCompanies");
  }

  const schedule = readSchedule(folded);
  const mode: CampaignMode = schedule ? "recurring" : "custom";
  const market = applyMarketRules(config, explicit, warnings);
  return {
    mode,
    queueAfterCurrent,
    schedule,
    config: {
      ...config,
      requestedCompanies,
      warnings,
      explicitFields: [...explicit],
      salesNavigator: salesNavigatorQuery(config),
      offer: market.offer,
      listCountry: market.listCountry,
    },
  };
}

export function interpretDefault(defaults: DefaultConfig = cloneDefaults(), now: Date = new Date()): InterpretedCampaign {
  const config = cloneDefaults(defaults);
  const warnings: string[] = [];
  assignToday(config, warnings, now, new Set());
  const market = applyMarketRules(config, new Set(), warnings);
  return {
    mode: "default",
    queueAfterCurrent: false,
    schedule: null,
    config: {
      ...config,
      requestedCompanies: null,
      warnings,
      explicitFields: [],
      salesNavigator: salesNavigatorQuery(config),
      offer: market.offer,
      listCountry: market.listCountry,
    },
  };
}

export function splitRequests(instruction: string): string[] {
  const parts = instruction.split(/\s+y\s+despu[eé]s\s+/i).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [instruction.trim()];
}

export function interpretSequence(
  instruction: string,
  defaults: DefaultConfig = cloneDefaults(),
  now: Date = new Date(),
): InterpretedCampaign[] {
  return splitRequests(instruction).map((part, index) => {
    const interpreted = interpretInstruction(part, defaults, now);
    if (index > 0) {
      interpreted.queueAfterCurrent = true;
    }
    return interpreted;
  });
}

function assignToday(
  config: DefaultConfig,
  warnings: string[],
  now: Date,
  excluded: Set<CountryLabel>,
): void {
  const today = marketOn(now);
  if (today && excluded.has(today)) {
    config.countries = [];
    warnings.push(`${today} es el mercado de hoy y la instrucción lo excluye. No completé con otro país.`);
    return;
  }
  if (today) {
    config.countries = [today];
    return;
  }
  config.countries = [];
  warnings.push("Hoy no hay mercado en la rotación. Nombrá el país.");
}

function applyMarketRules(
  config: DefaultConfig,
  explicit: Set<string>,
  warnings: string[],
): { offer: "studio" | "portal-mla"; listCountry: string } {
  if (!explicit.has("minEmployees")) {
    if (config.countries.includes("Chile") && config.countries.some((country) => country !== "Chile")) {
      warnings.push("Chile junto con otros países usa el mínimo de 1000. Para empresas chilenas desde 200, pedila en una lista aparte.");
    }
    config.minEmployees = employeeMinimum(config.countries);
  }
  if (!explicit.has("roles") && config.countries.length === 1 && config.countries[0] === "Chile") {
    config.roles = [...CHILE_ROLES];
  }
  if (!explicit.has("priorityCountry")) {
    const ranked = MARKET_PRIORITY.find((country) => config.countries.includes(country));
    if (ranked) {
      config.priorityCountry = ranked;
    }
  }
  const listCountry = config.countries.includes(config.priorityCountry)
    ? config.priorityCountry
    : (config.countries[0] ?? "");
  return { offer: listCountry === "Chile" ? "portal-mla" : "studio", listCountry };
}

function splitQueuedRequest(instruction: string): { text: string; queueAfterCurrent: boolean } {
  const folded = fold(instruction);
  const queueAfterCurrent = /cuando termines|cuando acabes|despues de (esta|la campana|terminar)/.test(folded);
  if (!queueAfterCurrent) {
    return { text: instruction, queueAfterCurrent: false };
  }
  const afterComma = instruction.match(/cuando termines[^,]*,\s*([\s\S]+)/i);
  if (afterComma?.[1]) {
    return { text: afterComma[1], queueAfterCurrent: true };
  }
  const afterVerb = instruction.match(/cuando termines\s+.+?\s+(busc[\s\S]+)/i);
  if (afterVerb?.[1]) {
    return { text: afterVerb[1], queueAfterCurrent: true };
  }
  return { text: instruction, queueAfterCurrent: true };
}

function exclusions(folded: string): {
  scanText: string;
  excludedIndustries: Set<string>;
  excludedCountries: Set<CountryLabel>;
  excludedRoles: Set<string>;
} {
  const excludedIndustries = new Set<string>();
  const excludedCountries = new Set<CountryLabel>();
  const excludedRoles = new Set<string>();
  const clauses = [...folded.matchAll(/(?:sin|excepto|menos|que no sean de|que no sea de|no quiero)\s+([^.,]+)/g)]
    .map((match) => match[1] ?? "");
  for (const clause of clauses) {
    for (const industry of matchAliases(clause, INDUSTRY_ALIASES)) {
      excludedIndustries.add(industry);
    }
    for (const country of COUNTRY_ALIASES) {
      if (new RegExp(`\\b${country.alias}\\b`).test(clause)) {
        excludedCountries.add(country.label);
      }
    }
    for (const role of matchAliases(clause, ROLE_ALIASES)) {
      excludedRoles.add(fold(role));
    }
  }
  const scanText = folded.replace(/(?:sin|excepto|menos|que no sean de|que no sea de|no quiero)\s+[^.,]+/g, " ");
  return { scanText, excludedIndustries, excludedCountries, excludedRoles };
}

function readContactCount(folded: string): number | null {
  const labeled = folded.match(/\b(\d+)\s*(contactos|personas|perfiles|prospectos|responsables|directores|gerentes|jefes)\b/);
  if (labeled?.[1]) {
    return Number(labeled[1]);
  }
  const others = folded.match(/\botros\s+(\d+)\b/);
  if (others?.[1]) {
    return Number(others[1]);
  }
  const ofCountry = folded.match(new RegExp(`\\b(\\d+)\\s+de\\s+(?:${countryAliasPattern()})\\b`));
  if (ofCountry?.[1]) {
    return Number(ofCountry[1]);
  }
  return null;
}

function readCompanyCount(folded: string): number | null {
  const match = folded.match(/\b(\d+)\s*empresas\b/);
  return match?.[1] ? Number(match[1]) : null;
}

function readEmployees(folded: string): number | null {
  const match = folded.match(/\bmas de\s+(\d+)\s+empleados\b/)
    ?? folded.match(/\b(\d+)\s*\+\s*empleados\b/)
    ?? folded.match(/\bminimo(?: de)?\s+(\d+)\s+empleados\b/);
  return match?.[1] ? Number(match[1]) : null;
}

function readCountries(scanText: string, excluded: Set<CountryLabel>): {
  explicit: boolean;
  labels: CountryLabel[];
} {
  const aliases = countryAliasPattern();
  const solo = scanText.match(
    new RegExp(`\\b(?:solo|solamente|unicamente)\\s+(?:en\\s+|de\\s+)?(${aliases})(?:\\s+y\\s+(${aliases}))?`),
  );
  let labels: CountryLabel[] = [];
  let explicit = false;
  if (solo?.[1]) {
    explicit = true;
    labels = [countryLabel(solo[1])];
    if (solo[2]) {
      labels.push(countryLabel(solo[2]));
    }
  } else {
    const hits: { index: number; label: CountryLabel }[] = [];
    for (const country of [...COUNTRY_ALIASES].sort((left, right) => right.alias.length - left.alias.length)) {
      const match = new RegExp(`\\b${country.alias}\\b`).exec(scanText);
      if (match?.index !== undefined && !hits.some((hit) => hit.label === country.label)) {
        hits.push({ index: match.index, label: country.label });
      }
    }
    hits.sort((left, right) => left.index - right.index);
    labels = hits.map((hit) => hit.label);
    explicit = labels.length > 0;
  }
  return { explicit, labels: labels.filter((label) => !excluded.has(label)) };
}

function readIndustries(scanText: string): string[] {
  return matchAliases(scanText, [...INDUSTRY_ALIASES].sort((a, b) => b.alias.length - a.alias.length));
}

function readRoles(scanText: string): string[] {
  const titles: string[] = [];
  const pattern = new RegExp(`\\b(directores|directoras|responsables|gerentes|jefes|jefas)\\s+de\\s+([a-z& ]+?)(?=\\s+de\\s+empresas|\\s+en\\s+(?:${countryAliasPattern()})|,|\\s+con\\b|\\s+que\\b|$)`, "g");
  for (const match of scanText.matchAll(pattern)) {
    const kind = match[1];
    const rest = match[2]?.trim();
    if (!kind || !rest) {
      continue;
    }
    const kindLabel = TITLE_KINDS[kind] ?? kind;
    const restLabel = rest.replace(/\bcapacitacion\b/g, "capacitación");
    titles.push(`${kindLabel} de ${restLabel}`);
  }
  if (titles.length > 0) {
    return titles;
  }
  return matchAliases(scanText, [...ROLE_ALIASES].sort((a, b) => b.alias.length - a.alias.length));
}

function readSchedule(folded: string): CampaignSchedule | null {
  const days = WEEKDAYS.filter((day) => new RegExp(`\\b${day.alias}\\b`).test(folded)).map((day) => day.label);
  const timeMatch = folded.match(/\ba las\s+(\d{1,2})(?::(\d{2}))?\b/);
  if (days.length === 0) {
    return null;
  }
  const hour = timeMatch?.[1] ? Number(timeMatch[1]) : 9;
  const minute = timeMatch?.[2] ? Number(timeMatch[2]) : 0;
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { days, time };
}

function matchAliases<T extends { alias: string; label: string }>(text: string, aliases: T[]): string[] {
  const found: string[] = [];
  for (const entry of aliases) {
    if (new RegExp(`\\b${escapeRegExp(entry.alias)}\\b`).test(text) && !found.includes(entry.label)) {
      found.push(entry.label);
    }
  }
  return found;
}

function countryAliasPattern(): string {
  return [...COUNTRY_ALIASES]
    .sort((left, right) => right.alias.length - left.alias.length)
    .map((country) => country.alias)
    .join("|");
}

function countryLabel(alias: string): CountryLabel {
  const found = COUNTRY_ALIASES.find((country) => country.alias === fold(alias));
  if (!found) {
    throw new Error(`País no disponible: ${alias}`);
  }
  return found.label;
}

function roleExcluded(label: string, excluded: Set<string>): boolean {
  return excluded.has(fold(label));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
