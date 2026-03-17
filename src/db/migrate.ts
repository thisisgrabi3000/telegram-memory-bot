import 'dotenv/config';
import { getDatabase, closeDatabase } from './client';
import * as initialSchema from './migrations/001_initial_schema';

/**
 * Führt alle ausstehenden Migrationen aus.
 */
function runMigrations(): void {
  const db = getDatabase();

  // Stelle sicher, dass die Migrationstabelle existiert
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const migrations = [{ name: '001_initial_schema', migration: initialSchema }];

  for (const { name, migration } of migrations) {
    // Prüfe, ob Migration bereits angewendet wurde
    const existing = db
      .prepare('SELECT id FROM migrations WHERE name = ?')
      .get(name);

    if (existing) {
      console.log(`Migration "${name}" bereits angewendet, übersprungen.`);
      continue;
    }

    console.log(`Führe Migration "${name}" aus...`);

    try {
      migration.up(db);

      // Markiere als angewendet
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(name);

      console.log(`Migration "${name}" erfolgreich.`);
    } catch (error) {
      console.error(`Fehler bei Migration "${name}":`, error);
      throw error;
    }
  }

  closeDatabase();
  console.log('Alle Migrationen abgeschlossen.');
}

runMigrations();
