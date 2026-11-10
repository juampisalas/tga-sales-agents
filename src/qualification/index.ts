import type { Phase1Module } from "../types.ts";

export const qualificationAgent = {
  id: "qualification",
  phaseImplemented: 1,
  summary:
    "ICP fit for TGA (training, talent, HR, organizational development). Stub only. Does not invent data.",
} as const satisfies Phase1Module;

/** Refuses to score a contact. Phase 1 has no ICP data to score. */
export function planQualification(criteria: { industries: string[]; roles: string[] }): {
  invented: false;
  criteria: { industries: string[]; roles: string[] };
} {
  return { invented: false, criteria };
}

export function qualifyContact(): never {
  throw new Error(
    "Qualification is not implemented. Phase 1 does not invent ICP data.",
  );
}
