import { hubspotAgent } from "./hubspot/index.ts";
import { navigatorAgent } from "./navigator/index.ts";
import { PERSISTENCE_STATUS } from "./persistence/sqlite.ts";
import { qualificationAgent } from "./qualification/index.ts";
import { selectionAgent } from "./selection/index.ts";
import { supervisorAgent } from "./supervisor/index.ts";
import { surfeAgent, surfeImportTest } from "./surfe/index.ts";

export const PHASE = 1 as const;

export function phase1Status() {
  return {
    phase: PHASE,
    modules: [
      navigatorAgent,
      selectionAgent,
      surfeAgent,
      hubspotAgent,
      qualificationAgent,
      supervisorAgent,
    ],
    persistence: PERSISTENCE_STATUS,
    surfeImportTest,
    linkedInLogin: "not-performed" as const,
    messagesSent: 0 as const,
    phasesNotStarted: [2, 3, 4, 5, 6, 7] as const,
  };
}
