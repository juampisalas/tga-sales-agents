import { COUNTRY_ALIASES, type CountryLabel } from "../config/defaults.ts";
import { fold } from "../interpreter/prompt-interpreter.ts";

export type SalesSearchRead = {
  kind: "search" | "login" | "security" | "other";
  title: string;
  page: number | null;
  pageCount: number | null;
  resultLabel: string | null;
  visibleLeads: number;
  filterSummary: string;
  pageCountries: CountryLabel[];
  hasSelectAll: boolean;
  surfeVisible: boolean;
};

export function parseSalesSearch(snapshot: string): SalesSearchRead {
  const title = firstMatch(snapshot, /^- Page Title:\s*(.+)$/m) ?? "";
  const url = firstMatch(snapshot, /^- Page URL:\s*(\S+)/m) ?? "";
  const pageMatch = snapshot.match(/Página (\d+) de (\d+)/);
  const resultLabel = resultCount(snapshot);
  const filterSummary = filterLine(snapshot);
  const names = new Set(
    [...snapshot.matchAll(/checkbox "Añadir (.*?) a la selección"/g)].map((match) => match[1]),
  );
  const security = /captcha|checkpoint|challenge|authwall|verificación de seguridad/i.test(`${url}\n${snapshot}`);
  const login = /linkedin\.com\/(?:login|uas\/login)/i.test(url);
  const people = /\/sales\/search\/people/i.test(url);
  const kind = security ? "security" : login ? "login" : people ? "search" : "other";
  return {
    kind,
    title,
    page: pageMatch ? Number(pageMatch[1]) : null,
    pageCount: pageMatch ? Number(pageMatch[2]) : null,
    resultLabel,
    visibleLeads: names.size,
    filterSummary,
    pageCountries: countriesIn(filterSummary),
    hasSelectAll: snapshot.includes("Seleccionar todo"),
    surfeVisible: /surfe/i.test(snapshot),
  };
}

export function searchFitsCampaign(read: SalesSearchRead, campaignCountries: readonly string[]): { fits: boolean; text: string } {
  if (read.kind === "security") {
    return { fits: false, text: "La pestaña muestra una verificación de seguridad. No se seleccionó a nadie." };
  }
  if (read.kind === "login") {
    return { fits: false, text: "La pestaña pide iniciar sesión. No se guardó ninguna contraseña." };
  }
  if (read.kind !== "search") {
    return {
      fits: false,
      text: "La pestaña conectada no es una búsqueda de personas de Sales Navigator. Dejá esa búsqueda abierta y volvé a iniciar.",
    };
  }
  const outside = read.pageCountries.filter((country) => !campaignCountries.includes(country));
  const where = read.filterSummary || "sin filtros leíbles";
  const page = read.page && read.pageCount ? `Página ${read.page} de ${read.pageCount}. ` : "";
  const size = read.resultLabel ? `La búsqueda dice ${read.resultLabel} resultados. ` : "";
  const surfe = read.surfeVisible ? "Surfe está visible. No se pulsó." : "Surfe no aparece en la página.";
  if (read.pageCountries.length === 0 || outside.length > 0) {
    const why = read.pageCountries.length === 0
      ? "No pude leer el país de esa búsqueda."
      : `El país de la pestaña (${outside.join(", ")}) no está en esta campaña.`;
    return {
      fits: false,
      text: `${why} ${page}${size}Filtros vistos: ${where}. No conté esos contactos. No se seleccionó a nadie. ${surfe}`,
    };
  }
  return {
    fits: true,
    text: `Búsqueda leída en la pestaña abierta. ${page}${size}En esta página hay ${read.visibleLeads} contactos visibles. Filtros: ${where}. No se seleccionó a nadie. ${surfe}`,
  };
}

function countriesIn(summary: string): CountryLabel[] {
  const folded = fold(summary);
  const found: CountryLabel[] = [];
  const aliases = [...COUNTRY_ALIASES].sort((left, right) => right.alias.length - left.alias.length);
  for (const country of aliases) {
    if (new RegExp(`\\b${country.alias}\\b`).test(folded) && !found.includes(country.label)) {
      found.push(country.label);
    }
  }
  return found;
}

function resultCount(snapshot: string): string | null {
  const found = snapshot.match(/(\d[\d.\s]*mil\+|\d[\d.]*)\s+resultados encontrados/i);
  if (found?.[1]) {
    return found[1].replace(/\s+/g, " ").trim();
  }
  const lines = [...snapshot.matchAll(/(\d[\d.\s]*mil\+|\d[\d.]*)\s+resultados(?!,)/gi)];
  const last = lines.at(-1);
  return last?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function filterLine(snapshot: string): string {
  const lines = snapshot.split("\n");
  for (let index = 1; index < lines.length; index += 1) {
    if (!/\(\d+ filtros\)/.test(lines[index] ?? "")) {
      continue;
    }
    const previous = lines[index - 1] ?? "";
    const value = previous.includes(":") ? previous.slice(previous.indexOf(":") + 1).trim() : previous.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function firstMatch(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[1]?.trim() ?? null;
}
