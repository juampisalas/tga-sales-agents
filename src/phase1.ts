import { hubspotStep } from "./hubspot/index.ts";
import { navigatorStep } from "./navigator/index.ts";
import { PERSISTENCE_STATUS } from "./persistence/sqlite.ts";
import { qualificationStep } from "./qualification/index.ts";
import { selectionStep } from "./selection/index.ts";
import { surfeStep, surfeImportTest } from "./surfe/index.ts";

export const PHASE = 1 as const;

export function phase1Status() {
  return {
    phase: PHASE,
    modules: [
      navigatorStep,
      selectionStep,
      surfeStep,
      hubspotStep,
      qualificationStep,
    ],
    persistence: PERSISTENCE_STATUS,
    surfeImportTest,
    linkedInLogin: "not-performed" as const,
    messagesSent: 0 as const,
    phasesNotStarted: [2, 3, 4, 5, 6, 7] as const,
  };
}
