import { loadEnvFile, projectEnvPath } from "./config/load-env.ts";
import { playwrightExtensionReady, findPlaywrightExtensionProfile, chromeUserDataDir } from "./navigator/extension-gate.ts";
import { ExtensionSearchReader } from "./navigator/extension-session.ts";
import { parseSalesSearch } from "./navigator/search-snapshot.ts";
import { placeholderDatabasePath } from "./persistence/sqlite.ts";
import { createDashboard } from "./server/dashboard.ts";
import { CampaignStore } from "./campaign/store.ts";

loadEnvFile(projectEnvPath);

const store = CampaignStore.open(placeholderDatabasePath());
const reader = new ExtensionSearchReader();
const dashboard = createDashboard(store, {
  canSearch: () => playwrightExtensionReady(),
  readSearch: async () => {
    const profile = await findPlaywrightExtensionProfile(chromeUserDataDir());
    if (!profile) {
      return { ok: false, reason: "La extensión de Playwright no está instalada en Chrome." };
    }
    const read = await reader.read(profile);
    if (!read.ok) {
      return read;
    }
    return { ok: true, observation: parseSalesSearch(read.snapshot) };
  },
});
const port = Number(process.env.PORT ?? 8787);
dashboard.server.listen(port, "0.0.0.0", () => {
  console.log(`TGA AI Sales Commander en http://127.0.0.1:${port}`);
  console.log(`En el celular, con la misma red Wi-Fi, abrí http://<IP de esta Mac>:${port}`);
});
