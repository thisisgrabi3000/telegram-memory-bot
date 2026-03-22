/**
 * Konfiguration für erlaubte Telegram-Chats.
 *
 * Wenn ALLOWED_CHAT_IDS leer ist, sind ALLE Chats erlaubt (offener Modus).
 * Wenn Chat-IDs eingetragen sind, werden nur diese Chats akzeptiert.
 *
 * Chat-IDs können über /start im Bot ermittelt werden (wird in den Logs angezeigt).
 */

// Chat-IDs aus Umgebungsvariable laden (kommasepariert)
const chatIdsEnv = process.env.ALLOWED_TELEGRAM_CHAT_IDS || '';

export const ALLOWED_CHAT_IDS: number[] = chatIdsEnv
  .split(',')
  .map(id => id.trim())
  .filter(id => id !== '')
  .map(id => parseInt(id, 10))
  .filter(id => !isNaN(id));

/**
 * Prüft, ob ein Chat erlaubt ist.
 * Gibt true zurück, wenn:
 * - Keine Chat-IDs konfiguriert sind (offener Modus)
 * - Die Chat-ID in der Liste der erlaubten Chats ist
 */
export function isChatAllowed(chatId: number): boolean {
  // Offener Modus: wenn keine IDs konfiguriert, alle erlauben
  if (ALLOWED_CHAT_IDS.length === 0) {
    return true;
  }

  return ALLOWED_CHAT_IDS.includes(chatId);
}

/**
 * Gibt die Anzahl der konfigurierten Chat-IDs zurück.
 */
export function getAllowedChatCount(): number {
  return ALLOWED_CHAT_IDS.length;
}
