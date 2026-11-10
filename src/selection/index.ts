import type { Phase1Module } from "../types.ts";

/** Brief limit. Selection itself is not implemented. */
export const MAX_BATCH = 25;

export const selectionAgent = {
  id: "selection",
  phaseImplemented: 1,
  summary: `Select up to ${MAX_BATCH} contacts per batch, skip already processed, confirm the count. Stub only.`,
} as const satisfies Phase1Module;

/** Batch selection is Phase 4. */
export function planSelection(maxBatch: number): { maxBatch: number; skipProcessed: true } {
  return { maxBatch: Math.min(maxBatch, MAX_BATCH), skipProcessed: true };
}

export function selectBatch(): never {
  throw new Error("Selection of up to 25 contacts is Phase 4 and is not implemented.");
}
