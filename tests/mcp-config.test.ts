import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const EXPECTED_MCP_JSON = `{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--extension"
      ]
    }
  }
}
`;

test("existing Playwright MCP config is unchanged", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const raw = readFileSync(join(root, ".cursor", "mcp.json"), "utf8");
  assert.equal(raw, EXPECTED_MCP_JSON);
});
