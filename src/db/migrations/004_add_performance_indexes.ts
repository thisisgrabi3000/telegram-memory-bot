import type Database from 'better-sqlite3';

/**
 * Performance-Indizes für häufig gefilterte Spalten.
 */
export function up(db: Database.Database): void {
  // Index für processing_status (häufig in WHERE-Klauseln)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_entries_processing_status
    ON memory_entries(processing_status);
  `);

  // Index für child_name (Filter in API)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_entries_child_name
    ON memory_entries(child_name);
  `);

  // Index für location (Filter in API)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_entries_location
    ON memory_entries(location);
  `);

  // Index für is_favorite (Filter in API)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_entries_is_favorite
    ON memory_entries(is_favorite);
  `);

  // Composite Index für häufige Kombination (Datum + Status)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_entries_date_status
    ON memory_entries(source_date, processing_status);
  `);

  // Index für media_attachments Foreign Key (schnellere JOINs)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_media_attachments_memory_entry_id
    ON media_attachments(memory_entry_id);
  `);

  // Index für telegram_users chat_id (schnellere Lookups)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_telegram_users_chat_id
    ON telegram_users(chat_id);
  `);
}

export function down(db: Database.Database): void {
  db.exec('DROP INDEX IF EXISTS idx_memory_entries_processing_status;');
  db.exec('DROP INDEX IF EXISTS idx_memory_entries_child_name;');
  db.exec('DROP INDEX IF EXISTS idx_memory_entries_location;');
  db.exec('DROP INDEX IF EXISTS idx_memory_entries_is_favorite;');
  db.exec('DROP INDEX IF EXISTS idx_memory_entries_date_status;');
  db.exec('DROP INDEX IF EXISTS idx_media_attachments_memory_entry_id;');
  db.exec('DROP INDEX IF EXISTS idx_telegram_users_chat_id;');
}
