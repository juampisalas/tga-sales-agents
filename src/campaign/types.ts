import type { CampaignSchedule, InterpretedCampaign } from "../interpreter/prompt-interpreter.ts";

export type CampaignStatus =
  | "filters_ready"
  | "queued"
  | "running"
  | "paused"
  | "stopped"
  | "blocked"
  | "completed"
  | "partial";

export type CampaignStep =
  | "await_start"
  | "search"
  | "select"
  | "import"
  | "verify"
  | "paginate"
  | "report";

export type Campaign = {
  id: string;
  instruction: string;
  mode: InterpretedCampaign["mode"];
  status: CampaignStatus;
  step: CampaignStep;
  config: InterpretedCampaign["config"];
  found: number;
  imported: number;
  skipped: number;
  pendingImport: number;
  errors: { at: string; message: string }[];
  schedule: CampaignSchedule | null;
  queueAfterCurrent: boolean;
  report: string | null;
  blockedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignEvent =
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "security" }
  | { type: "navigator_blocked"; reason: string }
  | { type: "search_page"; foundOnPage: number; exhausted: boolean }
  | { type: "batch_selected"; count: number }
  | { type: "import_observation"; outcome: "success" | "error" | "ambiguous"; count: number; evidence: string | null }
  | { type: "surfe_loaded"; done: boolean; loaded: number; evidence: string }
  | { type: "hubspot_check"; created: number; duplicates: number; evidence: string | null }
  | { type: "duplicate_seen"; count: number }
  | { type: "next_page"; exhausted: boolean };

export function isTerminal(status: CampaignStatus): boolean {
  return status === "stopped" || status === "blocked" || status === "completed" || status === "partial";
}
