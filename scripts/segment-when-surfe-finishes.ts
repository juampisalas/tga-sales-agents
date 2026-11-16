import { appendFileSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { segmentWhenSurfeFinishes } from "../src/campaign/hubspot-transfer.ts";
import {
  listReloadFailedMark,
  listReloadMark,
  surfeHandoffLogPath,
  surfeReloadNeeded,
  surfeResumeNeeded,
  syncResumeFailedMark,
  syncResumeMark,
} from "../src/dashboard/step-floor.ts";

const exec = promisify(execFile);
const since = "2026-11-05T17:15:00.000Z";
const segmentName = "05/11/2026 Argentina";
const listId = "01a1ac68-f3a1-72f2-818e-5885e16132d9";
const logPath = surfeHandoffLogPath;
const waitMs = 45 * 60 * 1000;
const intervalMs = 15000;

function log(line: string): void {
  appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
  console.log(line);
}

async function syncLine(): Promise<string> {
  const script = `
tell application "Google Chrome"
  set target to ""
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      if URL of t contains "${listId}" then
        set target to (id of w as text) & " " & i
        exit repeat
      end if
    end repeat
    if target is not "" then exit repeat
  end repeat
  if target is "" then return "missing"
  set wid to word 1 of target as integer
  set idx to word 2 of target as integer
  return execute (tab idx of window id wid) javascript "(document.body.innerText||'').split('\\\\n').map(function(s){return s.trim()}).find(function(l){return /syncing to hubspot/i.test(l)}) || 'none'"
end tell`;
  const { stdout } = await exec("osascript", ["-e", script]);
  return stdout.trim();
}

function finished(line: string): { synced: number; total: number; evidence: string } | null {
  const match = line.match(/syncing to hubspot \((\d+)\s*\/\s*(\d+)\)/i);
  const syncedText = match?.[1];
  const totalText = match?.[2];
  if (!match || syncedText === undefined || totalText === undefined) {
    return null;
  }
  const synced = Number(syncedText);
  const total = Number(totalText);
  if (total > 0 && synced === total) {
    return { synced, total, evidence: match[0] };
  }
  return null;
}

async function reloadSurfeList(): Promise<string> {
  const script = `
tell application "Google Chrome"
  set target to ""
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      if URL of t contains "${listId}" then
        set target to (id of w as text) & " " & i
        exit repeat
      end if
    end repeat
    if target is not "" then exit repeat
  end repeat
  if target is "" then return "missing"
  set wid to word 1 of target as integer
  set idx to word 2 of target as integer
  tell tab idx of window id wid to reload
  return "ok"
end tell`;
  const { stdout } = await exec("osascript", ["-e", script]);
  return stdout.trim();
}

async function resumeSurfeSync(): Promise<string> {
  const script = `
tell application "Google Chrome"
  set target to ""
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      if URL of t contains "${listId}" then
        set target to (id of w as text) & " " & i
        exit repeat
      end if
    end repeat
    if target is not "" then exit repeat
  end repeat
  if target is "" then return "missing"
  set wid to word 1 of target as integer
  set idx to word 2 of target as integer
  return execute (tab idx of window id wid) javascript "(function(){ var buttons=Array.prototype.slice.call(document.querySelectorAll('button')).filter(function(b){ return /sync all to hubspot/i.test(b.innerText||''); }); var button=buttons[buttons.length-1]; if (!button) return 'no-button'; button.click(); return 'clicked'; })()"
end tell`;
  const { stdout } = await exec("osascript", ["-e", script]);
  return stdout.trim();
}

const deadline = Date.now() + waitMs;
let last = "";
log("esperando el conteo terminado de Surfe");
while (Date.now() < deadline) {
  let line = "missing";
  try {
    line = await syncLine();
  } catch (error) {
    line = error instanceof Error ? error.message : "error";
  }
  if (line !== last) {
    log(line.slice(0, 160));
    last = line;
  }
  const logged = readFileSync(logPath, "utf8");
  const signature = surfeReloadNeeded(logged);
  if (signature) {
    try {
      const reloaded = await reloadSurfeList();
      log(reloaded === "ok" ? `${listReloadMark} ${signature}` : `${listReloadFailedMark} ${signature}`);
    } catch {
      log(`${listReloadFailedMark} ${signature}`);
    }
  }
  const resume = surfeResumeNeeded(readFileSync(logPath, "utf8"), line);
  if (resume) {
    try {
      const clicked = await resumeSurfeSync();
      log(clicked === "clicked" ? `${syncResumeMark} ${resume}` : `${syncResumeFailedMark} ${resume}`);
    } catch {
      log(`${syncResumeFailedMark} ${resume}`);
    }
  }
  const done = finished(line);
  if (done) {
    const result = await segmentWhenSurfeFinishes({
      surfe: { outcome: "success", synced: done.synced, total: done.total, evidence: done.evidence },
      segmentName,
      since,
    });
    log(`verified=${result.verified} added=${result.added} segment=${result.segmentId ?? "none"}`);
    process.exit(result.verified ? 0 : 2);
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
log("Se agotó la espera sin un conteo terminado. No se creó el segmento.");
process.exit(2);
