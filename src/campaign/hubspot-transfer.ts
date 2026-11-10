import { loadEnvFile, projectEnvPath } from "../config/load-env.ts";
import { placeContactsInSegment } from "../hubspot/segment.ts";
import { findSurfeSyncedContactIds } from "../hubspot/synced-contacts.ts";
import { syncSurfeListToHubSpot, type SurfeListPage, type SurfeSyncResult } from "../surfe/list-sync.ts";

export type ListTransfer = {
  verified: boolean;
  surfe: SurfeSyncResult;
  segmentId: string | null;
  added: number;
  evidence: string;
};

/** Sends one Surfe list to HubSpot and puts the verified contact IDs in a segment. */
export async function transferSurfeListToSegment(input: {
  page: SurfeListPage;
  segmentName: string;
  contactIds: readonly string[];
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<ListTransfer> {
  const surfe = await syncSurfeListToHubSpot(input.page, input);
  if (surfe.outcome !== "success") {
    return { verified: false, surfe, segmentId: null, added: 0, evidence: surfe.evidence };
  }
  if (!input.env) {
    loadEnvFile(projectEnvPath);
  }
  const token = (input.env ?? process.env).HUBSPOT_ACCESS_TOKEN ?? "";
  const segment = await placeContactsInSegment({
    segmentName: input.segmentName,
    contactIds: input.contactIds,
    token,
    fetchImpl: input.fetchImpl,
  });
  return {
    verified: segment.verified,
    surfe,
    segmentId: segment.segmentId,
    added: segment.added,
    evidence: `${surfe.evidence} ${segment.evidence}`,
  };
}

/**
 * HubSpot runs only after Surfe has shown a finished count.
 * It puts the contacts from that load into one segment.
 */
export async function segmentWhenSurfeFinishes(input: {
  surfe: SurfeSyncResult;
  segmentName: string;
  since: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ListTransfer> {
  if (input.surfe.outcome !== "success") {
    return {
      verified: false,
      surfe: input.surfe,
      segmentId: null,
      added: 0,
      evidence: input.surfe.evidence,
    };
  }
  if (!input.env) {
    loadEnvFile(projectEnvPath);
  }
  const token = (input.env ?? process.env).HUBSPOT_ACCESS_TOKEN ?? "";
  const found = await findSurfeSyncedContactIds({
    since: input.since,
    token,
    fetchImpl: input.fetchImpl,
  });
  if ("error" in found) {
    return {
      verified: false,
      surfe: input.surfe,
      segmentId: null,
      added: 0,
      evidence: `${input.surfe.evidence} ${found.error}`,
    };
  }
  const segment = await placeContactsInSegment({
    segmentName: input.segmentName,
    contactIds: found.ids,
    token,
    fetchImpl: input.fetchImpl,
  });
  const verified = segment.verified && segment.added === input.surfe.total;
  const gap = segment.added === input.surfe.total
    ? segment.evidence
    : `Surfe terminó en ${input.surfe.total} y HubSpot identificó ${found.ids.length} con origen Surfe. ${segment.evidence}`;
  return {
    verified,
    surfe: input.surfe,
    segmentId: segment.segmentId,
    added: segment.added,
    evidence: `${input.surfe.evidence} ${gap}`,
  };
}
