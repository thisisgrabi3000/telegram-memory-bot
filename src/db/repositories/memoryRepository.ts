import { getDatabase } from '../client';
import type {
  MemoryEntry,
  CreateMemoryEntry,
  SummarizationResult,
} from '../../types';

/**
 * Repository für Erinnerungseinträge
 */
export const memoryRepository = {
  /**
   * Erstellt einen neuen Erinnerungseintrag
   */
  create(entry: CreateMemoryEntry): MemoryEntry {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO memory_entries (
        source_date, child_name, source_type, source_message_id,
        telegram_chat_id, raw_transcript, transcript_status, processing_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      entry.source_date,
      entry.child_name ?? null,
      entry.source_type,
      entry.source_message_id,
      entry.telegram_chat_id,
      entry.raw_transcript ?? null,
      entry.transcript_status ?? 'pending',
      entry.processing_status ?? 'pending'
    );

    return this.findById(result.lastInsertRowid as number)!;
  },

  /**
   * Findet einen Eintrag per ID
   */
  findById(id: number): MemoryEntry | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM memory_entries WHERE id = ?');
    return (stmt.get(id) as MemoryEntry) || null;
  },

  /**
   * Aktualisiert das Transkript eines Eintrags
   */
  updateTranscript(
    id: number,
    transcript: string,
    status: 'completed' | 'failed',
    errorMessage?: string
  ): void {
    const db = getDatabase();

    const stmt = db.prepare(`
      UPDATE memory_entries
      SET raw_transcript = ?, transcript_status = ?, error_message = ?
      WHERE id = ?
    `);

    stmt.run(transcript, status, errorMessage ?? null, id);
  },

  /**
   * Aktualisiert die Zusammenfassung eines Eintrags
   */
  updateSummary(id: number, result: SummarizationResult): void {
    const db = getDatabase();

    const stmt = db.prepare(`
      UPDATE memory_entries
      SET child_name = ?, cleaned_summary = ?, categories = ?,
          tags = ?, importance_score = ?, processing_status = 'summarized'
      WHERE id = ?
    `);

    stmt.run(
      result.child_name,
      result.cleaned_summary,
      JSON.stringify(result.categories),
      JSON.stringify(result.tags),
      result.importance_score,
      id
    );
  },

  /**
   * Markiert einen Eintrag als fehlgeschlagen
   */
  markFailed(id: number, errorMessage: string): void {
    const db = getDatabase();

    const stmt = db.prepare(`
      UPDATE memory_entries
      SET processing_status = 'failed', error_message = ?
      WHERE id = ?
    `);

    stmt.run(errorMessage, id);
  },

  /**
   * Findet alle Einträge für eine Kalenderwoche
   */
  findByWeek(weekStart: string, weekEnd: string): MemoryEntry[] {
    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT * FROM memory_entries
      WHERE source_date >= ? AND source_date <= ?
        AND processing_status = 'summarized'
      ORDER BY source_date ASC
    `);

    return stmt.all(weekStart, weekEnd) as MemoryEntry[];
  },

  /**
   * Findet alle Einträge, die noch verarbeitet werden müssen
   */
  findPending(): MemoryEntry[] {
    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT * FROM memory_entries
      WHERE transcript_status = 'completed'
        AND processing_status = 'pending'
      ORDER BY created_at ASC
    `);

    return stmt.all() as MemoryEntry[];
  },

  /**
   * Findet die letzten N Einträge
   */
  findRecent(limit: number = 5): MemoryEntry[] {
    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT * FROM memory_entries
      WHERE processing_status = 'summarized'
      ORDER BY source_date DESC, created_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as MemoryEntry[];
  },

  /**
   * Findet Einträge der aktuellen Woche
   */
  findCurrentWeek(): MemoryEntry[] {
    const db = getDatabase();

    // Berechne Montag dieser Woche
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    const weekStart = monday.toISOString().split('T')[0];

    const stmt = db.prepare(`
      SELECT * FROM memory_entries
      WHERE source_date >= ?
        AND processing_status = 'summarized'
      ORDER BY source_date ASC
    `);

    return stmt.all(weekStart) as MemoryEntry[];
  },

  /**
   * Findet den letzten Eintrag
   */
  findLast(): MemoryEntry | null {
    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT * FROM memory_entries
      WHERE processing_status = 'summarized'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return (stmt.get() as MemoryEntry) || null;
  },

  /**
   * Löscht einen Eintrag per ID
   */
  deleteById(id: number): boolean {
    const db = getDatabase();

    const stmt = db.prepare('DELETE FROM memory_entries WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
  },
};
