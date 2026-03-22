import type Database from 'better-sqlite3';

/**
 * Telegram-Nutzer für Familienmitglieder und recorded_by Feld
 */
export function up(db: Database.Database): void {
  // Telegram-Nutzer Tabelle
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_chat_id INTEGER NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_telegram_users_chat_id
    ON telegram_users(telegram_chat_id);
  `);

  // Füge recorded_by Spalte zu memory_entries hinzu
  db.exec(`
    ALTER TABLE memory_entries ADD COLUMN recorded_by TEXT;
  `);
}

export function down(db: Database.Database): void {
  db.exec('DROP TABLE IF EXISTS telegram_users;');
  // SQLite unterstützt kein DROP COLUMN, daher lassen wir recorded_by
}
