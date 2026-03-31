import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE media_attachments ADD COLUMN voice_speaker TEXT NULL;`);
}

export function down(db: Database.Database): void {
  // SQLite does not support DROP COLUMN — migration is irreversible
  void db;
}
