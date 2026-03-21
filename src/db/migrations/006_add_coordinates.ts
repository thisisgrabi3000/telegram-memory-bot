import type Database from 'better-sqlite3';

/**
 * Fügt latitude und longitude Spalten zur memory_entries Tabelle hinzu
 * für die Kartendarstellung von Erinnerungen mit GPS-Koordinaten.
 */
export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE memory_entries ADD COLUMN latitude REAL;
  `);

  db.exec(`
    ALTER TABLE memory_entries ADD COLUMN longitude REAL;
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_entries_coordinates
    ON memory_entries(latitude, longitude);
  `);
}

export function down(db: Database.Database): void {
  // SQLite unterstützt ALTER TABLE DROP COLUMN nicht einfach
  // Eine Rollback müsste manuell mit einer neuen Migration erfolgen
}
