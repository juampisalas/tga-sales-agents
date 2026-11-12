import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Runs the prospecting agent on its own. The campaign loop does not call this. */
export function runProspectingAgent(): Promise<string> {
  const venvPython = resolve(root, ".venv/bin/python");
  const python = existsSync(venvPython) ? venvPython : "python3";
  return new Promise((resolvePromise, reject) => {
    const child = spawn(python, ["-m", "agents.prospecting"], { cwd: root, env: process.env });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("La prospección tardó demasiado."));
    }, 60_000);
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error("La prospección no pudo arrancar."));
        return;
      }
      resolvePromise(out.trim());
    });
  });
}
