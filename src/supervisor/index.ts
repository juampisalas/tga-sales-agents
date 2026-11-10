import type { Phase1Module } from "../types.ts";

export const supervisorAgent = {
  id: "supervisor",
  phaseImplemented: 1,
  summary:
    "Run state, errors, resume, current page, last batch, stop on security challenges or repeated errors. Stub only.",
} as const satisfies Phase1Module;

/** Resume, pagination, and the final report are later phases. */
export function planSupervision(): { stopsOnSecurity: true; requiresEvidence: true } {
  return { stopsOnSecurity: true, requiresEvidence: true };
}

export function resumeRun(): never {
  throw new Error("Supervisor resume is not implemented in Phase 1.");
}
