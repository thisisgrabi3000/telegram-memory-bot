import 'dotenv/config';
import { getDatabase, closeDatabase } from './client';
import * as initialSchema from './migrations/001_initial_schema';
import * as telegramUsers from './migrations/002_telegram_users';
import * as addLocationFavorite from './migrations/003_add_location_favorite';
import * as performanceIndexes from './migrations/004_add_performance_indexes';
import * as addPeopleField from './migrations/005_add_people_field';
import * as addCoordinates from './migrations/006_add_coordinates';
import * as addVoiceSpeaker from './migrations/007_add_voice_speaker';
import * as addShareTokens from './migrations/008_add_share_tokens';
import * as addPhotoPeople from './migrations/009_add_photo_people';

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

  const migrations = [
    { name: '001_initial_schema', migration: initialSchema },
    { name: '002_telegram_users', migration: telegramUsers },
    { name: '003_add_location_favorite', migration: addLocationFavorite },
    { name: '004_add_performance_indexes', migration: performanceIndexes },
    { name: '005_add_people_field', migration: addPeopleField },
    { name: '006_add_coordinates', migration: addCoordinates },
    { name: '007_add_voice_speaker', migration: addVoiceSpeaker },
    { name: '008_add_share_tokens', migration: addShareTokens },
    { name: '009_add_photo_people', migration: addPhotoPeople },
  ];

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
