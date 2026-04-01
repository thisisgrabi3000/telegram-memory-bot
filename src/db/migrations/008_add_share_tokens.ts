import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS share_tokens (
      token TEXT PRIMARY KEY,
      memory_entry_id INTEGER NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_share_tokens_memory_entry_id
      ON share_tokens(memory_entry_id);
  `);
}

export function down(db: Database.Database): void {
  db.exec('DROP TABLE IF EXISTS share_tokens;');
}
