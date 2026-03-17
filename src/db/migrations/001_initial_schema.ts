import type Database from 'better-sqlite3';

/**
 * Initiales Datenbankschema für V1
 */
export function up(db: Database.Database): void {
  // Haupttabelle für Erinnerungseinträge
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT (datetime('now')),
      source_date TEXT NOT NULL,
      child_name TEXT,
      source_type TEXT NOT NULL DEFAULT 'voice',
      source_message_id INTEGER NOT NULL,
      telegram_chat_id INTEGER NOT NULL,
      raw_transcript TEXT,
      cleaned_summary TEXT,
      categories TEXT,
      tags TEXT,
      importance_score INTEGER,
      transcript_status TEXT NOT NULL DEFAULT 'pending',
      processing_status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT
    );
  `);

  // Index für schnelle Abfragen nach Datum und Chat
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_entries_source_date
    ON memory_entries(source_date);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_entries_chat_id
    ON memory_entries(telegram_chat_id);
  `);

  // Wochenzusammenfassungen
  db.exec(`
    CREATE TABLE IF NOT EXISTS weekly_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL,
      week_end TEXT NOT NULL,
      child_name TEXT,
      highlights TEXT,
      themes TEXT,
      weekly_summary TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Index für Wochenabfragen
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_weekly_summaries_week
    ON weekly_summaries(week_start, week_end);
  `);

  // Medienanhänge (vorbereitet für V2, noch nicht aktiv genutzt)
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_entry_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      telegram_file_id TEXT NOT NULL,
      local_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (memory_entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE
    );
  `);

  // Migrationslog
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

export function down(db: Database.Database): void {
  db.exec('DROP TABLE IF EXISTS media_attachments;');
  db.exec('DROP TABLE IF EXISTS weekly_summaries;');
  db.exec('DROP TABLE IF EXISTS memory_entries;');
  db.exec('DROP TABLE IF EXISTS migrations;');
}
