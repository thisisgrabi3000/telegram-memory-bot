import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    ALTER TABLE memory_entries ADD COLUMN people TEXT DEFAULT '[]';
  `);

  // Migriere bestehende child_name Werte zu people Array
  const entries = db.prepare(`
    SELECT id, child_name FROM memory_entries WHERE child_name IS NOT NULL
  `).all() as Array<{ id: number; child_name: string }>;

  const updateStmt = db.prepare(`
    UPDATE memory_entries SET people = ? WHERE id = ?
  `);

  for (const entry of entries) {
    updateStmt.run(JSON.stringify([entry.child_name]), entry.id);
  }
}

export function down(db: Database): void {
  // SQLite unterstützt kein DROP COLUMN direkt
  db.exec(`
    CREATE TABLE memory_entries_backup AS SELECT
      id, created_at, source_date, child_name, source_type, source_message_id,
      telegram_chat_id, raw_transcript, cleaned_summary, categories, tags,
      importance_score, transcript_status, processing_status, error_message,
      recorded_by, location, is_favorite
    FROM memory_entries;

    DROP TABLE memory_entries;

    ALTER TABLE memory_entries_backup RENAME TO memory_entries;
  `);
}
