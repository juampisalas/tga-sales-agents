const HUBSPOT_API = "https://api.hubapi.com";

export async function findSurfeSyncedContactIds(input: {
  since: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ids: string[] } | { error: string }> {
  if (input.token.trim() === "") {
    return { error: "Falta HUBSPOT_ACCESS_TOKEN. No se consultó HubSpot." };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const ids: string[] = [];
  let after = "";
  for (let page = 0; page < 30; page += 1) {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_object_source_detail_1", operator: "EQ", value: "Surfe" },
            { propertyName: "lastmodifieddate", operator: "GTE", value: input.since },
          ],
        },
      ],
      properties: ["hs_object_id"],
      limit: 100,
    };
    if (after !== "") {
      body.after = after;
    }
    const response = await fetchImpl(`${HUBSPOT_API}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { error: `HubSpot no dejó buscar los contactos de Surfe (${response.status}).` };
    }
    const data = (await response.json()) as {
      results?: { id?: unknown }[];
      paging?: { next?: { after?: unknown } };
    };
    for (const row of data.results ?? []) {
      if (typeof row.id === "string" && /^\d+$/.test(row.id)) {
        ids.push(row.id);
      }
    }
    const next = data.paging?.next?.after;
    if (typeof next !== "string" || next === "") {
      break;
    }
    after = next;
  }
  return { ids: [...new Set(ids)] };
}
