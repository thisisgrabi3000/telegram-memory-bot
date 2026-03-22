import type Database from 'better-sqlite3';

/**
 * Migration: Add location and is_favorite columns
 */
export function up(db: Database.Database): void {
  // Add location column for location tags
  db.exec(`
    ALTER TABLE memory_entries ADD COLUMN location TEXT;
  `);

  // Add is_favorite column for favorites feature
  db.exec(`
    ALTER TABLE memory_entries ADD COLUMN is_favorite INTEGER DEFAULT 0;
  `);

  // Create index for favorites
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_entries_favorite
    ON memory_entries(is_favorite);
  `);
}

export function down(db: Database.Database): void {
  // SQLite doesn't support DROP COLUMN easily, so we'd need to recreate the table
  // For simplicity, we'll just leave the columns
}
