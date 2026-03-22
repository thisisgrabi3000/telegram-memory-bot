import { getDatabase } from '../client';

export interface TelegramUser {
  id: number;
  telegram_chat_id: number;
  display_name: string;
  created_at: string;
}

/**
 * Repository für Telegram-Nutzer (Familienmitglieder).
 */
export const userRepository = {
  /**
   * Findet einen Nutzer anhand der Telegram Chat-ID.
   */
  findByChatId(chatId: number): TelegramUser | null {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM telegram_users WHERE telegram_chat_id = ?')
      .get(chatId) as TelegramUser | undefined;
    return row || null;
  },

  /**
   * Erstellt einen neuen Nutzer.
   */
  create(chatId: number, displayName: string): TelegramUser {
    const db = getDatabase();
    const result = db
      .prepare('INSERT INTO telegram_users (telegram_chat_id, display_name) VALUES (?, ?)')
      .run(chatId, displayName);

    return this.findByChatId(chatId)!;
  },

  /**
   * Aktualisiert den Anzeigenamen eines Nutzers.
   */
  updateDisplayName(chatId: number, displayName: string): boolean {
    const db = getDatabase();
    const result = db
      .prepare('UPDATE telegram_users SET display_name = ? WHERE telegram_chat_id = ?')
      .run(displayName, chatId);
    return result.changes > 0;
  },

  /**
   * Löscht einen Nutzer.
   */
  deleteByChatId(chatId: number): boolean {
    const db = getDatabase();
    const result = db
      .prepare('DELETE FROM telegram_users WHERE telegram_chat_id = ?')
      .run(chatId);
    return result.changes > 0;
  },

  /**
   * Findet alle registrierten Nutzer.
   */
  findAll(): TelegramUser[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM telegram_users').all() as TelegramUser[];
  },
};
