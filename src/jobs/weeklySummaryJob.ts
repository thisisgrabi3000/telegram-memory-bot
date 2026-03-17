import { memoryRepository } from '../db/repositories/memoryRepository';
import { summarizationService } from '../services/summarizationService';
import { getDatabase } from '../db/client';
import type { WeeklySummary } from '../types';

/**
 * Berechnet Start und Ende der letzten Kalenderwoche.
 */
function getLastWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();

  // Letzten Montag finden
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - dayOfWeek - 6);
  lastMonday.setHours(0, 0, 0, 0);

  // Letzten Sonntag finden
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  lastSunday.setHours(23, 59, 59, 999);

  return {
    start: lastMonday.toISOString().split('T')[0],
    end: lastSunday.toISOString().split('T')[0],
  };
}

/**
 * Job zur Erstellung der Wochenzusammenfassung.
 * Sollte einmal pro Woche ausgeführt werden (z.B. Sonntag Abend oder Montag Morgen).
 */
export async function runWeeklySummaryJob(): Promise<void> {
  console.log('Starte Wochenzusammenfassungs-Job...');

  const { start, end } = getLastWeekRange();
  console.log(`Verarbeite Woche: ${start} bis ${end}`);

  // Lade alle Einträge der Woche
  const entries = memoryRepository.findByWeek(start, end);

  if (entries.length === 0) {
    console.log('Keine Einträge für diese Woche gefunden.');
    return;
  }

  console.log(`${entries.length} Einträge gefunden.`);

  // TODO: Implementierung in Phase 6
  // 1. Gruppiere Einträge nach child_name
  // 2. Erstelle Zusammenfassung pro Kind (oder gesamt wenn child_name = null)
  // 3. Speichere in weekly_summaries Tabelle

  throw new Error('Noch nicht implementiert');
}

/**
 * Speichert eine Wochenzusammenfassung in der Datenbank.
 */
function saveSummary(
  weekStart: string,
  weekEnd: string,
  childName: string | null,
  data: { highlights: string[]; themes: string[]; weekly_summary: string }
): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO weekly_summaries (week_start, week_end, child_name, highlights, themes, weekly_summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    weekStart,
    weekEnd,
    childName,
    JSON.stringify(data.highlights),
    JSON.stringify(data.themes),
    data.weekly_summary
  );
}
