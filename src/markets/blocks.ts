import { fold } from "../interpreter/prompt-interpreter.ts";
import type { CountryLabel } from "../config/defaults.ts";

export function blockedCompany(companyName: string, country: CountryLabel): string | null {
  const name = fold(companyName);
  if (/\b(accenture|stefanini)\b/.test(name)) {
    return "Nivel 3: lo llevan Guillermo y Tom.";
  }
  if (country === "Chile" && /\b(mutual|mutualidad|otec)\b/.test(name)) {
    return "En Chile no se prospectan mutualidades ni OTEC.";
  }
  return null;
}
