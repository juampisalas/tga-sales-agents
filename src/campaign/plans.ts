import type { Campaign } from "./types.ts";
import { nextListStep } from "./list-policy.ts";
import { planHubSpot } from "../hubspot/index.ts";
import { planSearch } from "../navigator/index.ts";
import { planQualification } from "../qualification/index.ts";
import { planSelection } from "../selection/index.ts";
import { planSurfe } from "../surfe/index.ts";

export function executionPlan(config: Campaign["config"]): string[] {
  const search = planSearch(config.salesNavigator.url);
  const selection = planSelection(config.maxBatch);
  const surfe = planSurfe();
  const hubspot = planHubSpot();
  const qualification = planQualification({ industries: config.industries, roles: config.roles });
  const listCountry = config.listCountry || config.countries[0] || "el país del pedido";
  const list = nextListStep({ country: listCountry, openListCountry: null });
  const offer = config.offer === "portal-mla" ? "Portal MLA y sus juegos" : "Early Bird Studio";
  const chileBlock = config.countries.includes("Chile") ? " En Chile tampoco mutualidades ni OTEC." : "";
  return [
    `Navigator: hace clic en los filtros en la pestaña ya abierta. El navegador no se abre. Oferta ${offer}. ${search.url}`,
    `Lista: el primer ${list.control} elige Create a new list y el paso escribe ${list.typedName}. Surfe pone la fecha. Los siguientes Add 25 to a list entran en esa lista.`,
    `Selection: lote máximo ${selection.maxBatch}. No entran consultoras de nivel 3.${chileBlock} Se omiten contactos ya importados y, si corresponde, empresas ya procesadas.`,
    `Surfe: revisa errores de carga, cuenta solo contactos con mail en HubSpot y recién ahí habilita otro Add 25 to a list. ${surfe.reason}`,
    `HubSpot: ${hubspot.reason}`,
    `Qualification: los filtros ya salieron del pedido (${qualification.criteria.roles.join(", ")}). No se puntúa cada ficha y no se inventan contactos.`,
  ];
}
