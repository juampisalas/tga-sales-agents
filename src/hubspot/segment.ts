const HUBSPOT_API = "https://api.hubapi.com";

export type SegmentPlacement = {
  verified: boolean;
  segmentId: string | null;
  added: number;
  missing: number;
  evidence: string;
};

export async function placeContactsInSegment(input: {
  segmentName: string;
  contactIds: readonly string[];
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<SegmentPlacement> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const name = input.segmentName.trim();
  const ids = [...new Set(input.contactIds.map((id) => id.trim()).filter((id) => id !== ""))];
  if (input.token.trim() === "") {
    return unverified(ids.length, "Falta HUBSPOT_ACCESS_TOKEN. No se consultó HubSpot.");
  }
  if (name === "") {
    return unverified(ids.length, "El segmento no tiene nombre. No se consultó HubSpot.");
  }
  if (ids.length === 0) {
    return unverified(0, "No hay contactos con ID de HubSpot para el segmento.");
  }
  if (ids.some((id) => !/^\d+$/.test(id))) {
    return unverified(ids.length, "Hay identificadores que no son IDs de HubSpot. No se creó el segmento.");
  }

  const headers = {
    Authorization: `Bearer ${input.token.trim()}`,
    "Content-Type": "application/json",
  };
  const found = await fetchImpl(`${HUBSPOT_API}/crm/v3/lists/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: name, count: 20, offset: 0 }),
  });
  if (!found.ok) {
    return unverified(ids.length, `HubSpot no dejó buscar el segmento (${found.status}).`);
  }
  let segmentId = exactListId(await found.json(), name);
  if (!segmentId) {
    const created = await fetchImpl(`${HUBSPOT_API}/crm/v3/lists`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, objectTypeId: "0-1", processingType: "MANUAL" }),
    });
    if (!created.ok) {
      return unverified(ids.length, `HubSpot no creó el segmento (${created.status}).`);
    }
    segmentId = listIdFromCreate(await created.json());
    if (!segmentId) {
      return unverified(ids.length, "HubSpot no devolvió el ID del segmento.");
    }
  }

  let added = 0;
  let missing = 0;
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const response = await fetchImpl(`${HUBSPOT_API}/crm/v3/lists/${segmentId}/memberships/add`, {
      method: "PUT",
      headers,
      body: JSON.stringify(chunk),
    });
    if (!response.ok) {
      return {
        verified: false,
        segmentId,
        added,
        missing: ids.length - added,
        evidence: `HubSpot no agregó contactos al segmento ${segmentId} (${response.status}).`,
      };
    }
    const parsed = membershipCounts(await response.json(), chunk.length);
    if (!parsed) {
      return {
        verified: false,
        segmentId,
        added,
        missing: ids.length - added,
        evidence: `HubSpot no confirmó los miembros del segmento ${segmentId}.`,
      };
    }
    added += parsed.added;
    missing += parsed.missing;
  }

  const verified = missing === 0 && added === ids.length;
  return {
    verified,
    segmentId,
    added,
    missing,
    evidence: verified
      ? `Segmento ${name} (${segmentId}) con ${added} contactos.`
      : `Segmento ${name} (${segmentId}): entraron ${added} y faltaron ${missing}.`,
  };
}

function unverified(missing: number, evidence: string): SegmentPlacement {
  return { verified: false, segmentId: null, added: 0, missing, evidence };
}

function exactListId(body: unknown, name: string): string | null {
  if (!body || typeof body !== "object" || !("lists" in body) || !Array.isArray(body.lists)) {
    return null;
  }
  for (const item of body.lists) {
    if (!item || typeof item !== "object" || !("name" in item) || item.name !== name) {
      continue;
    }
    const id = "listId" in item ? item.listId : undefined;
    if (typeof id === "string" && id !== "") {
      return id;
    }
    if (typeof id === "number") {
      return String(id);
    }
  }
  return null;
}

function listIdFromCreate(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const top = "listId" in body ? body.listId : undefined;
  const nested = "list" in body && body.list && typeof body.list === "object" && "listId" in body.list
    ? body.list.listId
    : undefined;
  const id = nested ?? top;
  if (typeof id === "string" && id !== "") {
    return id;
  }
  if (typeof id === "number") {
    return String(id);
  }
  return null;
}

function membershipCounts(body: unknown, sent: number): { added: number; missing: number } | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  const added = record.recordIdsAdded ?? record.recordsIdsAdded;
  const missing = record.recordIdsMissing ?? record.recordsIdsMissing;
  if (!Array.isArray(added) || !Array.isArray(missing)) {
    return null;
  }
  if (added.length + missing.length !== sent) {
    return null;
  }
  if (!added.every((item) => typeof item === "string") || !missing.every((item) => typeof item === "string")) {
    return null;
  }
  return { added: added.length, missing: missing.length };
}
