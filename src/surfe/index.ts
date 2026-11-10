import type { Phase1Module } from "../types.ts";

export const surfeAgent = {
  id: "surfe",
  phaseImplemented: 1,
  summary:
    "Visible Surfe UI, start import, wait for observable confirmation. Stub only. Success is never assumed.",
} as const satisfies Phase1Module;

/** The first Surfe action test is Phase 3 and has not been run. */
export const surfeImportTest = {
  status: "not-done",
  phase: 3,
  reason:
    "The import button and its confirmation are a Phase 3 test. Phase 1 does not click Surfe.",
} as const;

/** Does not look for or click the Surfe import control. */
export function planSurfe(): typeof surfeImportTest {
  return surfeImportTest;
}

export function startSurfeImport(): never {
  throw new Error(
    "Surfe import is Phase 3 and is not implemented. No import button is clicked.",
  );
}
