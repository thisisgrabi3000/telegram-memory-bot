import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';

let db: Database.Database | null = null;

/**
 * Gibt die Datenbankverbindung zurück.
 * Erstellt sie beim ersten Aufruf.
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = env.DATABASE_PATH;
  const absolutePath = path.resolve(dbPath);

  // Stelle sicher, dass das Verzeichnis existiert
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(absolutePath);

  // WAL-Modus für bessere Performance
  db.pragma('journal_mode = WAL');

  return db;
}

/**
 * Schließt die Datenbankverbindung.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
