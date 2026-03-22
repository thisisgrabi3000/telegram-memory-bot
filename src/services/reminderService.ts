/**
 * Service für tägliche Erinnerungen.
 * Sendet um 20:00 eine sanfte Erinnerung, falls heute keine Memory gespeichert wurde.
 */

import cron, { ScheduledTask } from 'node-cron';
import { memoryRepository } from '../db/repositories/memoryRepository';
import { telegramService } from '../bot/telegramService';
import { ALLOWED_CHAT_IDS } from '../config/allowedChats';
import { userRepository } from '../db/repositories/userRepository';

let scheduledTask: ScheduledTask | null = null;

/**
 * Prüft, ob heute eine Erinnerung gespeichert wurde.
 */
function hasMemoryToday(): boolean {
  const today = new Date().toISOString().split('T')[0];
  const entries = memoryRepository.findByDateRange(today, today);
  return entries.length > 0;
}

/**
 * Sendet eine sanfte Erinnerung an alle konfigurierten Chats.
 */
async function sendDailyReminder(): Promise<void> {
  // Nur senden, wenn heute noch keine Erinnerung gespeichert wurde
  if (hasMemoryToday()) {
    console.log('📝 Heute bereits Erinnerungen gespeichert - keine Reminder nötig');
    return;
  }

  // Hole alle Chat-IDs (entweder aus Konfiguration oder aus registrierten Nutzern)
  let chatIds: number[] = [];

  if (ALLOWED_CHAT_IDS.length > 0) {
    // Verwende konfigurierte Chat-IDs
    chatIds = ALLOWED_CHAT_IDS;
  } else {
    // Fallback: Hole alle registrierten Nutzer
    const users = userRepository.findAll();
    chatIds = users.map(u => u.telegram_chat_id);
  }

  if (chatIds.length === 0) {
    console.log('📝 Keine Chats für Reminder konfiguriert');
    return;
  }

  console.log(`📝 Sende Reminder an ${chatIds.length} Chats...`);

  const reminderMessage =
    '📝 Heute noch keine Erinnerung gespeichert – gibt es etwas Schönes zu teilen?\n\n' +
    '🎙️ Tippe auf /record oder sende direkt eine Sprachnachricht!';

  for (const chatId of chatIds) {
    try {
      await telegramService.sendMessage(chatId, reminderMessage);
      console.log(`✅ Reminder an Chat ${chatId} gesendet`);
    } catch (error) {
      console.error(`❌ Fehler beim Senden an Chat ${chatId}:`, error);
    }
  }
}

/**
 * Startet den täglichen Reminder-Cronjob.
 * Läuft jeden Tag um 20:00 Uhr (lokale Zeit).
 */
export function startReminderScheduler(): void {
  // Cron-Ausdruck: "0 20 * * *" = jeden Tag um 20:00
  scheduledTask = cron.schedule('0 20 * * *', async () => {
    console.log('⏰ Täglicher Reminder-Check um 20:00...');
    await sendDailyReminder();
  }, {
    timezone: 'Europe/Berlin', // Deutsche Zeitzone
  });

  console.log('⏰ Reminder-Scheduler gestartet (täglich 20:00 Uhr)');
}

/**
 * Stoppt den Reminder-Cronjob (für Graceful Shutdown).
 */
export function stopReminderScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('⏰ Reminder-Scheduler gestoppt');
  }
}

/**
 * Sendet sofort einen Test-Reminder (für Debugging).
 */
export async function sendTestReminder(): Promise<void> {
  console.log('🧪 Test-Reminder wird gesendet...');
  await sendDailyReminder();
}
