import { reduceCampaign } from "./machine.ts";
import type { Campaign } from "./types.ts";

export async function runBatches(input: {
  campaign: Campaign;
  addBatch: (listOpen: boolean) => Promise<{ evidence: string }>;
  waitForSurfe: () => Promise<{ done: boolean; loaded: number; evidence: string }>;
  readPage: () => Promise<{ foundOnPage: number; exhausted: boolean }>;
}): Promise<Campaign> {
  let current = input.campaign;
  let listOpen = false;
  while (current.status === "running" && current.imported < current.config.targetContacts) {
    if (current.step === "search") {
      const page = await input.readPage();
      current = reduceCampaign(current, {
        type: "search_page",
        foundOnPage: page.foundOnPage,
        exhausted: page.exhausted,
      });
      continue;
    }
    if (current.step !== "select") {
      break;
    }
    await input.addBatch(listOpen);
    listOpen = true;
    const batch = Math.min(25, current.config.maxBatch);
    current = reduceCampaign(current, { type: "batch_selected", count: batch });
    const loaded = await input.waitForSurfe();
    current = reduceCampaign(current, {
      type: "surfe_loaded",
      done: loaded.done,
      loaded: loaded.loaded,
      evidence: loaded.evidence,
    });
    if (!loaded.done || current.status !== "running" || current.step !== "paginate") {
      break;
    }
    const page = await input.readPage();
    current = reduceCampaign(current, { type: "next_page", exhausted: page.exhausted });
  }
  return current;
}
