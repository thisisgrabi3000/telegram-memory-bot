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
        telegram_chat_id, raw_transcript, transcript_status, processing_status, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      entry.source_date,
      entry.child_name ?? null,
      entry.source_type,
      entry.source_message_id,
      entry.telegram_chat_id,
      entry.raw_transcript ?? null,
      entry.transcript_status ?? 'pending',
      entry.processing_status ?? 'pending',
      entry.recorded_by ?? null
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
          tags = ?, people = ?, importance_score = ?, processing_status = 'summarized'
      WHERE id = ?
    `);

    stmt.run(
      result.child_name,
      result.cleaned_summary,
      JSON.stringify(result.categories),
      JSON.stringify(result.tags),
      JSON.stringify(result.people || []),
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
   * Findet den letzten Eintrag, optional gefiltert nach Chat-ID.
   */
  findLast(chatId?: number): MemoryEntry | null {
    const db = getDatabase();

    if (chatId !== undefined) {
      const stmt = db.prepare(`
        SELECT * FROM memory_entries
        WHERE telegram_chat_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `);
      return (stmt.get(chatId) as MemoryEntry) || null;
    }

    const stmt = db.prepare(`
      SELECT * FROM memory_entries
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

  /**
   * Aktualisiert das Datum eines Eintrags
   */
  updateDate(id: number, date: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE memory_entries SET source_date = ? WHERE id = ?');
    const result = stmt.run(date, id);
    return result.changes > 0;
  },

  /**
   * Aktualisiert die Zusammenfassung/Text eines Eintrags (für manuelle Bearbeitung)
   */
  updateText(id: number, cleanedSummary: string): boolean {
    const db = getDatabase();

    const stmt = db.prepare(`
      UPDATE memory_entries
      SET cleaned_summary = ?
      WHERE id = ?
    `);

    const result = stmt.run(cleanedSummary, id);
    return result.changes > 0;
  },

  /**
   * Findet alle Einträge (nur summarized)
   */
  findAll(limit: number = 100): MemoryEntry[] {
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
   * Aktualisiert den Kindernamen eines Eintrags
   */
  updateChildName(id: number, childName: string | null): boolean {
    const db = getDatabase();

    const stmt = db.prepare(`
      UPDATE memory_entries
      SET child_name = ?
      WHERE id = ?
    `);

    const result = stmt.run(childName, id);
    return result.changes > 0;
  },

  /**
   * Aktualisiert den Ort eines Eintrags
   */
  updateLocation(id: number, location: string | null): boolean {
    const db = getDatabase();

    const stmt = db.prepare(`
      UPDATE memory_entries
      SET location = ?
      WHERE id = ?
    `);

    const result = stmt.run(location, id);
    return result.changes > 0;
  },

  /**
   * Aktualisiert die Koordinaten eines Eintrags
   */
  updateCoordinates(id: number, latitude: number, longitude: number): void {
    const db = getDatabase();

    const stmt = db.prepare(`
      UPDATE memory_entries
      SET latitude = ?, longitude = ?
      WHERE id = ?
    `);

    stmt.run(latitude, longitude, id);
  },

  /**
   * Setzt den Favoriten-Status
   */
  setFavorite(id: number, isFavorite: boolean): boolean {
    const db = getDatabase();

    const stmt = db.prepare(`
      UPDATE memory_entries
      SET is_favorite = ?
      WHERE id = ?
    `);

    const result = stmt.run(isFavorite ? 1 : 0, id);
    return result.changes > 0;
  },

  /**
   * Sucht in Transkripten, Zusammenfassungen, Personen, Tags, Kategorien, etc.
   */
  search(query: string, limit: number = 50): MemoryEntry[] {
    const db = getDatabase();

    const searchTerm = `%${query}%`;

    const stmt = db.prepare(`
      SELECT * FROM memory_entries
      WHERE processing_status = 'summarized'
        AND (
          raw_transcript LIKE ?
          OR cleaned_summary LIKE ?
          OR people LIKE ?
          OR tags LIKE ?
          OR categories LIKE ?
          OR child_name LIKE ?
          OR recorded_by LIKE ?
          OR location LIKE ?
        )
      ORDER BY source_date DESC, created_at DESC
      LIMIT ?
    `);

    return stmt.all(
      searchTerm, searchTerm, searchTerm, searchTerm,
      searchTerm, searchTerm, searchTerm, searchTerm,
      limit
    ) as MemoryEntry[];
  },

  /**
   * Findet Einträge in einem Datumsbereich
   */
  findByDateRange(startDate: string, endDate: string): MemoryEntry[] {
    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT * FROM memory_entries
      WHERE source_date >= ? AND source_date <= ?
        AND processing_status = 'summarized'
      ORDER BY source_date DESC, created_at DESC
    `);

    return stmt.all(startDate, endDate) as MemoryEntry[];
  },

  /**
   * Gibt alle eindeutigen Kindernamen zurück (optimiert mit DISTINCT).
   */
  findDistinctChildren(): string[] {
    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT DISTINCT child_name
      FROM memory_entries
      WHERE processing_status = 'summarized'
        AND child_name IS NOT NULL
      ORDER BY child_name
    `);

    const rows = stmt.all() as Array<{ child_name: string }>;
    return rows.map(r => r.child_name);
  },

  /**
   * Gibt alle eindeutigen Orte zurück (optimiert mit DISTINCT).
   */
  findDistinctLocations(): string[] {
    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT DISTINCT location
      FROM memory_entries
      WHERE processing_status = 'summarized'
        AND location IS NOT NULL
      ORDER BY location
    `);

    const rows = stmt.all() as Array<{ location: string }>;
    return rows.map(r => r.location);
  },
};
