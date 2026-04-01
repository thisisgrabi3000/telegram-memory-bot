import { getDatabase } from '../client';
import type { MediaAttachment } from '../../types';

/**
 * Repository für Medienanhänge
 */
export const mediaRepository = {
  /**
   * Erstellt einen neuen Medienanhang
   */
  create(attachment: {
    memory_entry_id: number;
    media_type: 'photo' | 'audio' | 'video';
    telegram_file_id: string;
    local_path: string;
    voice_speaker?: string | null;
  }): MediaAttachment {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO media_attachments (memory_entry_id, media_type, telegram_file_id, local_path, voice_speaker)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      attachment.memory_entry_id,
      attachment.media_type,
      attachment.telegram_file_id,
      attachment.local_path,
      attachment.voice_speaker ?? null
    );

    return this.findById(result.lastInsertRowid as number)!;
  },

  /**
   * Findet einen Anhang per ID
   */
  findById(id: number): MediaAttachment | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM media_attachments WHERE id = ?');
    return (stmt.get(id) as MediaAttachment) || null;
  },

  /**
   * Findet alle Anhänge für einen Memory-Eintrag
   */
  findByMemoryId(memoryEntryId: number): MediaAttachment[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM media_attachments
      WHERE memory_entry_id = ?
      ORDER BY created_at ASC
    `);
    return stmt.all(memoryEntryId) as MediaAttachment[];
  },

  /**
   * Findet alle Anhänge für mehrere Memory-Einträge
   */
  findByMemoryIds(memoryEntryIds: number[]): MediaAttachment[] {
    if (memoryEntryIds.length === 0) return [];

    const db = getDatabase();
    const placeholders = memoryEntryIds.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT * FROM media_attachments
      WHERE memory_entry_id IN (${placeholders})
      ORDER BY memory_entry_id, created_at ASC
    `);
    return stmt.all(...memoryEntryIds) as MediaAttachment[];
  },

  /**
   * Löscht einen Anhang per ID
   */
  deleteById(id: number): boolean {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM media_attachments WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  /**
   * Löscht alle Anhänge für einen Memory-Eintrag
   */
  deleteByMemoryId(memoryEntryId: number): number {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM media_attachments WHERE memory_entry_id = ?');
    const result = stmt.run(memoryEntryId);
    return result.changes;
  },

  /**
   * Findet alle Memory-Einträge mit Audio-Dateien für einen bestimmten Sprecher
   */
  findByVoiceSpeaker(speaker: string): number[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT DISTINCT memory_entry_id
      FROM media_attachments
      WHERE media_type = 'audio' AND voice_speaker = ?
    `);
    const rows = stmt.all(speaker) as Array<{ memory_entry_id: number }>;
    return rows.map(r => r.memory_entry_id);
  },

  /**
   * Aktualisiert den Sprecher einer Audio-Aufnahme
   */
  updateSpeaker(id: number, speaker: string | null): boolean {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE media_attachments SET voice_speaker = ? WHERE id = ?');
    const result = stmt.run(speaker, id);
    return result.changes > 0;
  },
};
