import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { cloneDefaults, TGA_DEFAULTS, type DefaultConfig } from "../config/defaults.ts";
import type { Campaign } from "./types.ts";

type CampaignRow = {
  id: string;
  instruction: string;
  mode: Campaign["mode"];
  status: Campaign["status"];
  step: Campaign["step"];
  config_json: string;
  found: number;
  imported: number;
  skipped: number;
  pending_import: number;
  errors_json: string;
  schedule_json: string | null;
  queue_after: number;
  report: string | null;
  blocked_reason: string | null;
  created_at: string;
  updated_at: string;
};

export class CampaignStore {
  private readonly db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.db = db;
  }

  static open(filename: string): CampaignStore {
    if (filename !== ":memory:") {
      mkdirSync(dirname(filename), { recursive: true });
    }
    const db = new DatabaseSync(filename);
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        instruction TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        step TEXT NOT NULL,
        config_json TEXT NOT NULL,
        found INTEGER NOT NULL,
        imported INTEGER NOT NULL,
        skipped INTEGER NOT NULL,
        pending_import INTEGER NOT NULL,
        errors_json TEXT NOT NULL,
        schedule_json TEXT,
        queue_after INTEGER NOT NULL,
        report TEXT,
        blocked_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS campaign_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL,
        at TEXT NOT NULL,
        message TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        instruction TEXT NOT NULL,
        approved INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS processed_contacts (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    return new CampaignStore(db);
  }

  close(): void {
    this.db.close();
  }

  getDefaults(): DefaultConfig {
    const row = this.db.prepare("SELECT value_json FROM settings WHERE key = ?").get("defaults") as
      | { value_json: string }
      | undefined;
    if (!row) {
      return cloneDefaults(TGA_DEFAULTS);
    }
    return cloneDefaults(JSON.parse(row.value_json) as DefaultConfig);
  }

  saveDefaults(config: DefaultConfig): DefaultConfig {
    const stored = cloneDefaults(config);
    this.db.prepare(`
      INSERT INTO settings (key, value_json) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
    `).run("defaults", JSON.stringify(stored));
    return stored;
  }

  saveCampaign(campaign: Campaign): void {
    this.db.prepare(`
      INSERT INTO campaigns (
        id, instruction, mode, status, step, config_json, found, imported, skipped, pending_import,
        errors_json, schedule_json, queue_after, report, blocked_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        instruction = excluded.instruction,
        mode = excluded.mode,
        status = excluded.status,
        step = excluded.step,
        config_json = excluded.config_json,
        found = excluded.found,
        imported = excluded.imported,
        skipped = excluded.skipped,
        pending_import = excluded.pending_import,
        errors_json = excluded.errors_json,
        schedule_json = excluded.schedule_json,
        queue_after = excluded.queue_after,
        report = excluded.report,
        blocked_reason = excluded.blocked_reason,
        updated_at = excluded.updated_at
    `).run(
      campaign.id,
      campaign.instruction,
      campaign.mode,
      campaign.status,
      campaign.step,
      JSON.stringify(campaign.config),
      campaign.found,
      campaign.imported,
      campaign.skipped,
      campaign.pendingImport,
      JSON.stringify(campaign.errors),
      campaign.schedule ? JSON.stringify(campaign.schedule) : null,
      campaign.queueAfterCurrent ? 1 : 0,
      campaign.report,
      campaign.blockedReason,
      campaign.createdAt,
      campaign.updatedAt,
    );
  }

  getCampaign(id: string): Campaign | null {
    const row = this.db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as CampaignRow | undefined;
    return row ? rowToCampaign(row) : null;
  }

  listCampaigns(): Campaign[] {
    const rows = this.db.prepare("SELECT * FROM campaigns ORDER BY created_at ASC, rowid ASC").all() as CampaignRow[];
    return rows.map(rowToCampaign);
  }

  addEvent(campaignId: string, message: string, at: string): void {
    this.db.prepare("INSERT INTO campaign_events (campaign_id, at, message) VALUES (?, ?, ?)").run(campaignId, at, message);
  }

  listEvents(campaignId: string): { at: string; message: string }[] {
    return this.db.prepare(
      "SELECT at, message FROM campaign_events WHERE campaign_id = ? ORDER BY id ASC",
    ).all(campaignId) as { at: string; message: string }[];
  }

  saveTemplate(template: { id: string; name: string; instruction: string; approved: boolean; createdAt: string }): void {
    this.db.prepare(`
      INSERT INTO templates (id, name, instruction, approved, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, instruction = excluded.instruction, approved = excluded.approved
    `).run(template.id, template.name, template.instruction, template.approved ? 1 : 0, template.createdAt);
  }

  listTemplates(): { id: string; name: string; instruction: string; approved: boolean; createdAt: string }[] {
    const rows = this.db.prepare("SELECT * FROM templates ORDER BY created_at ASC").all() as {
      id: string;
      name: string;
      instruction: string;
      approved: number;
      created_at: string;
    }[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      instruction: row.instruction,
      approved: row.approved === 1,
      createdAt: row.created_at,
    }));
  }

  approveTemplate(id: string): void {
    this.db.prepare("UPDATE templates SET approved = 1 WHERE id = ?").run(id);
  }

  recordContacts(campaignId: string, contacts: { id: string; status: "imported" | "duplicate" }[], at: string): void {
    const insert = this.db.prepare(
      "INSERT INTO processed_contacts (id, campaign_id, status, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, campaign_id = excluded.campaign_id",
    );
    for (const contact of contacts) {
      insert.run(contact.id, campaignId, contact.status, at);
    }
  }

  countContacts(status: "imported" | "duplicate"): number {
    const row = this.db.prepare("SELECT COUNT(*) AS total FROM processed_contacts WHERE status = ?").get(status) as
      | { total: number }
      | undefined;
    return row?.total ?? 0;
  }
}

function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    instruction: row.instruction,
    mode: row.mode,
    status: row.status,
    step: row.step,
    config: JSON.parse(row.config_json) as Campaign["config"],
    found: row.found,
    imported: row.imported,
    skipped: row.skipped,
    pendingImport: row.pending_import,
    errors: JSON.parse(row.errors_json) as Campaign["errors"],
    schedule: row.schedule_json ? JSON.parse(row.schedule_json) as Campaign["schedule"] : null,
    queueAfterCurrent: row.queue_after === 1,
    report: row.report,
    blockedReason: row.blocked_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
