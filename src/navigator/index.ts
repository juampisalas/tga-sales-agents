import type { Phase1Module } from "../types.ts";

export const navigatorStep = {
  id: "navigator",
  phaseImplemented: 1,
  summary:
    "Sales Navigator search URL, existing session, results, pagination, and identifiers. Stub only.",
} as const satisfies Phase1Module;

/** Phase 2 inspects the live Sales Navigator page. Phase 1 does not log in or open it. */
export function planSearch(url: string): { opensBrowser: false; url: string } {
  return { opensBrowser: false, url };
}

export function inspectNavigator(): never {
  throw new Error(
    "Sales Navigator inspection is Phase 2 and is not implemented. Phase 1 does not log in.",
  );
}
