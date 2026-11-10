import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const PERSISTENCE_STATUS = "placeholder" as const;

/**
 * Opens a SQLite database and ensures a placeholder table exists.
 * Pass ":memory:" in tests. A file path is not opened unless a caller asks for it.
 * Run progress, duplicates, and resume state are Phase 5, not this table.
 */
export function openPlaceholderDatabase(filename = ":memory:"): DatabaseSync {
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE IF NOT EXISTS phase1_placeholder (
      id INTEGER PRIMARY KEY,
      note TEXT NOT NULL
    )
  `);
  return db;
}

/** Default file path from the environment. Does not open the database. */
export function placeholderDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DATABASE_PATH;
  if (configured && configured.trim().length > 0) {
    return configured;
  }
  return "./data/tga-sales-agents.sqlite";
}
