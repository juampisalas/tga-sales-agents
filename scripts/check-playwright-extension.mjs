/**
 * Phase 1 browser check.
 * Scans the local Chrome profiles the same way Playwright MCP --extension does,
 * then asks the MCP server for one read-only snapshot.
 * Does not navigate, log in, store passwords, or click Surfe.
 * Exits 1 when the extension is not installed. That is the current blocker.
 */
import { spawn } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const EXTENSION_ID = "mmlmfjhmonkocbjadbfplnigmagldckm";
const INSTALL_URL = `https://chromewebstore.google.com/detail/playwright-extension/${EXTENSION_ID}`;
const userDataDir = join(homedir(), "Library", "Application Support", "Google", "Chrome");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prefsHaveExtension(prefsPath) {
  try {
    const prefs = JSON.parse(await readFile(prefsPath, "utf8"));
    const record = prefs?.extensions?.settings?.[EXTENSION_ID];
    return !!record && typeof record === "object" && Object.keys(record).length > 0;
  } catch {
    return false;
  }
}

async function installedInProfile(profileDir) {
  if (await exists(join(profileDir, "Extensions", EXTENSION_ID))) {
    return true;
  }
  if (await prefsHaveExtension(join(profileDir, "Preferences"))) {
    return true;
  }
  return prefsHaveExtension(join(profileDir, "Secure Preferences"));
}

function profileRank(name) {
  return name === "Default" ? -1 : Number(name.slice("Profile ".length));
}

async function scanProfiles() {
  let entries = [];
  try {
    entries = await readdir(userDataDir);
  } catch {
    return { lastUsed: null, names: new Map(), profiles: [], selected: null };
  }
  const profileNames = entries
    .filter((entry) => entry === "Default" || /^Profile \d+$/.test(entry))
    .sort((a, b) => profileRank(a) - profileRank(b));

  let lastUsed = null;
  const names = new Map();
  try {
    const localState = JSON.parse(await readFile(join(userDataDir, "Local State"), "utf8"));
    if (typeof localState?.profile?.last_used === "string") {
      lastUsed = localState.profile.last_used;
    }
    const cache = localState?.profile?.info_cache ?? {};
    for (const name of profileNames) {
      const display = cache?.[name]?.name;
      names.set(name, typeof display === "string" ? display : "");
    }
  } catch {
    lastUsed = null;
  }

  const ordered =
    lastUsed && profileNames.includes(lastUsed)
      ? [lastUsed, ...profileNames.filter((name) => name !== lastUsed)]
      : profileNames;

  const profiles = [];
  let selected = null;
  for (const name of ordered) {
    const installed = await installedInProfile(join(userDataDir, name));
    profiles.push({ directory: name, displayName: names.get(name) ?? "", installed });
    if (installed && !selected) {
      selected = name;
    }
  }
  return { lastUsed, profiles, selected };
}

function send(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function probeMcp() {
  return new Promise((resolve) => {
    const child = spawn("npx", ["--yes", "@playwright/mcp@latest", "--extension"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const messages = [];
    let buffer = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({
        ok: false,
        timedOut: true,
        text: "Timed out waiting for Playwright MCP. If the extension is installed, the connection page may be waiting for Allow & select.",
      });
    }, 15000);

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
        if (!line) {
          continue;
        }
        try {
          messages.push(JSON.parse(line));
        } catch {
          messages.push({ unparsed: line.slice(0, 200) });
        }
      }
      const init = messages.find((message) => message.id === 1);
      const call = messages.find((message) => message.id === 2);
      if (init && !messages.some((message) => message.method === "notifications/initialized-sent")) {
        messages.push({ method: "notifications/initialized-sent" });
        send(child, { jsonrpc: "2.0", method: "notifications/initialized" });
        send(child, {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "browser_snapshot", arguments: {} },
        });
      }
      if (call) {
        const text = call.result?.content?.map((part) => part.text ?? "").join("\n") ?? JSON.stringify(call.error ?? call);
        finish({
          ok: call.result?.isError !== true && !call.error,
          timedOut: false,
          text,
        });
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", () => {
      if (!settled) {
        finish({ ok: false, timedOut: false, text: stderr.slice(0, 500) || "Playwright MCP exited before a snapshot." });
      }
    });

    send(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "tga-phase1-check", version: "0.1.0" },
      },
    });
  });
}

const scan = await scanProfiles();
console.log(`Chrome user data: ${userDataDir}`);
console.log(`last_used profile: ${scan.lastUsed ?? "(unreadable)"}`);
for (const profile of scan.profiles) {
  const label = profile.displayName ? `${profile.directory} (${profile.displayName})` : profile.directory;
  console.log(`- ${label}: extension ${profile.installed ? "installed" : "not installed"}`);
}
console.log(`profile Playwright would attach to: ${scan.selected ?? "none"}`);
console.log(`install URL: ${INSTALL_URL}`);

const probe = await probeMcp();
console.log(`mcp browser_snapshot ok: ${probe.ok}`);
console.log(probe.text);

if (!probe.ok) {
  process.exit(1);
}
