import type { CountryLabel, DefaultConfig } from "../config/defaults.ts";

/**
 * Region ids published together as Brazil, Mexico, Argentina, Chile, Colombia.
 * Brazil 106057199 also appears in that reference's country table.
 * They are not read from Juan's Sales Navigator session. The review screen shows them before the first run.
 */
const REGION_IDS: Record<CountryLabel, string | null> = {
  Chile: "104621616",
  México: null,
  Brasil: "106057199",
  USA: null,
  Argentina: "100446943",
  Colombia: null,
};

/** Direct label matches only. Unknown industries stay without an id. */
const INDUSTRY_IDS: Record<string, string> = {
  retail: "27",
  logística: "116",
  salud: "14",
  farmacéutica: "15",
};

const HEADCOUNT = [
  { id: "B", label: "1-10", min: 1 },
  { id: "C", label: "11-50", min: 11 },
  { id: "D", label: "51-200", min: 51 },
  { id: "E", label: "201-500", min: 201 },
  { id: "F", label: "501-1000", min: 501 },
  { id: "G", label: "1001-5000", min: 1001 },
  { id: "H", label: "5001-10000", min: 5001 },
  { id: "I", label: "10001+", min: 10001 },
] as const;

export type SalesNavigatorQuery = {
  url: string;
  regions: { label: string; id: string | null; confirmedInSession: false }[];
  headcount: { id: string; label: string }[];
  industries: { label: string; id: string | null; confirmedInSession: false }[];
  titles: string[];
  keywords: string;
  pending: string[];
  notes: string[];
};

export function salesNavigatorQuery(config: Pick<
  DefaultConfig,
  "countries" | "industries" | "minEmployees" | "roles"
>): SalesNavigatorQuery {
  const regions = config.countries.map((label) => ({
    label,
    id: REGION_IDS[label],
    confirmedInSession: false as const,
  }));
  const headcount = HEADCOUNT.filter((bucket) => bucket.min >= config.minEmployees).map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
  }));
  const industries = config.industries.map((label) => ({
    label,
    id: INDUSTRY_IDS[label] ?? null,
    confirmedInSession: false as const,
  }));
  const pendingIndustries = industries.filter((industry) => industry.id === null).map((industry) => industry.label);
  const pending = [
    ...regions.filter((region) => region.id === null).map((region) => region.label),
    ...pendingIndustries,
  ];
  const keywordParts = [...config.roles, ...pendingIndustries];
  const keywords = keywordParts.join(" ").replace(/[(),:]/g, " ").replace(/\s+/g, " ").trim();
  const notes = [
    `El mínimo de ${config.minEmployees} empleados usa los tramos de Sales Navigator desde ${headcount[0]?.label ?? "sin tramo"}.`,
    "Los IDs de región e industria no se leyeron de la sesión de Sales Navigator. Hay que revisarlos antes de la primera ejecución.",
  ];

  const filters: string[] = [];
  const regionFilters = regions.filter((region) => region.id !== null);
  if (regionFilters.length > 0) {
    const values = regionFilters
      .map((region) => `(id:${region.id},text:${region.label},selectionType:INCLUDED)`)
      .join(",");
    filters.push(`(type:REGION,values:List(${values}))`);
  }
  if (headcount.length > 0) {
    const values = headcount
      .map((bucket) => `(id:${bucket.id},text:${bucket.label},selectionType:INCLUDED)`)
      .join(",");
    filters.push(`(type:COMPANY_HEADCOUNT,values:List(${values}))`);
  }
  const industryFilters = industries.filter((industry) => industry.id !== null);
  if (industryFilters.length > 0) {
    const values = industryFilters
      .map((industry) => `(id:${industry.id},text:${industry.label},selectionType:INCLUDED)`)
      .join(",");
    filters.push(`(type:INDUSTRY,values:List(${values}))`);
  }
  const query = `(spellCorrectionEnabled:true,filters:List(${filters.join(",")})${keywords ? `,keywords:${keywords}` : ""})`;
  const url = `https://www.linkedin.com/sales/search/people?query=${encodeURIComponent(query)}`;
  return { url, regions, headcount, industries, titles: [...config.roles], keywords, pending, notes };
}
