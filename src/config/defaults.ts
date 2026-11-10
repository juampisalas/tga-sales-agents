export const COUNTRY_LABELS = ["Chile", "México", "Brasil", "USA", "Argentina", "Colombia"] as const;

export type CountryLabel = (typeof COUNTRY_LABELS)[number];

export const COUNTRY_ALIASES: { alias: string; label: CountryLabel }[] = [
  { alias: "estados unidos", label: "USA" },
  { alias: "united states", label: "USA" },
  { alias: "chile", label: "Chile" },
  { alias: "mexico", label: "México" },
  { alias: "brasil", label: "Brasil" },
  { alias: "brazil", label: "Brasil" },
  { alias: "usa", label: "USA" },
  { alias: "eeuu", label: "USA" },
  { alias: "argentina", label: "Argentina" },
  { alias: "colombia", label: "Colombia" },
];

export const MARKET_PRIORITY: readonly CountryLabel[] = COUNTRY_LABELS;

export const STUDIO_ROLES = ["L&D", "capacitación", "desarrollo organizacional", "diseño instruccional"] as const;

export const CHILE_ROLES = ["RR. HH.", "capacitación", "HSE", "compliance"] as const;

export type DefaultConfig = {
  countries: CountryLabel[];
  priorityCountry: CountryLabel;
  industries: string[];
  minEmployees: number;
  roles: string[];
  targetContacts: number;
  maxBatch: number;
  source: "LinkedIn Sales Navigator";
  importTool: "Surfe";
  crm: "HubSpot";
  excludeAlreadyImported: boolean;
  avoidProcessedCompanies: boolean;
};

export const TGA_DEFAULTS: DefaultConfig = {
  countries: [...COUNTRY_LABELS],
  priorityCountry: "Chile",
  industries: [
    "retail",
    "supermercados",
    "logística",
    "minería",
    "industria",
    "salud",
    "farmacias",
    "bancos",
    "franquicias",
    "automotriz",
    "educación corporativa",
  ],
  minEmployees: 1000,
  roles: [...STUDIO_ROLES],
  targetContacts: 500,
  maxBatch: 25,
  source: "LinkedIn Sales Navigator",
  importTool: "Surfe",
  crm: "HubSpot",
  excludeAlreadyImported: true,
  avoidProcessedCompanies: true,
};

export function cloneDefaults(config: DefaultConfig = TGA_DEFAULTS): DefaultConfig {
  return {
    countries: [...(config.countries ?? TGA_DEFAULTS.countries)],
    priorityCountry: config.priorityCountry ?? TGA_DEFAULTS.priorityCountry,
    industries: [...(config.industries ?? TGA_DEFAULTS.industries)],
    minEmployees: config.minEmployees ?? TGA_DEFAULTS.minEmployees,
    roles: [...(config.roles ?? TGA_DEFAULTS.roles)],
    targetContacts: config.targetContacts ?? TGA_DEFAULTS.targetContacts,
    maxBatch: config.maxBatch ?? TGA_DEFAULTS.maxBatch,
    source: "LinkedIn Sales Navigator",
    importTool: "Surfe",
    crm: "HubSpot",
    excludeAlreadyImported: config.excludeAlreadyImported ?? TGA_DEFAULTS.excludeAlreadyImported,
    avoidProcessedCompanies: config.avoidProcessedCompanies ?? TGA_DEFAULTS.avoidProcessedCompanies,
  };
}

export function employeeMinimum(countries: readonly CountryLabel[]): number {
  return countries.length > 0 && countries.every((country) => country === "Chile") ? 200 : 1000;
}
