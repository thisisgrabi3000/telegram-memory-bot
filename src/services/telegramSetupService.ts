/**
 * Service zum Einrichten des Telegram-Bots (Menü, Befehle).
 */

import { env } from '../config/env';

const TELEGRAM_API = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

/**
 * Registriert die Bot-Befehle bei Telegram.
 * Diese erscheinen im Befehlsmenü, wenn der Nutzer "/" tippt.
 */
export async function setupBotCommands(): Promise<void> {
  const commands = [
    { command: 'record', description: '🎙️ Erinnerung aufnehmen' },
    { command: 'letzte', description: '📚 Letzte 5 Erinnerungen' },
    { command: 'woche', description: '📊 Wochenzusammenfassung' },
    { command: 'delete', description: '🗑️ Letzten Eintrag löschen' },
    { command: 'werbinich', description: '👤 Wer bin ich?' },
    { command: 'start', description: '👋 Bot starten' },
  ];

  try {
    const response = await fetch(`${TELEGRAM_API}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands }),
    });

    const result = await response.json() as { ok: boolean; description?: string };

    if (result.ok) {
      console.log('✅ Bot-Befehle registriert');
    } else {
      console.error('❌ Fehler beim Registrieren der Befehle:', result.description);
    }
  } catch (error) {
    console.error('❌ Fehler beim Registrieren der Befehle:', error);
  }
}

/**
 * Setzt den Menü-Button für einen bestimmten Chat.
 * Der Button erscheint unten links neben dem Eingabefeld.
 */
export async function setupChatMenuButton(chatId: number): Promise<void> {
  try {
    // Setze einen Web App Button oder einen Commands Button
    // Wir verwenden den Commands-Button, der das Menü öffnet
    const response = await fetch(`${TELEGRAM_API}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        menu_button: {
          type: 'commands',
        },
      }),
    });

    const result = await response.json() as { ok: boolean; description?: string };

    if (result.ok) {
      console.log(`✅ Menü-Button für Chat ${chatId} eingerichtet`);
    } else {
      console.error(`❌ Fehler beim Einrichten des Menü-Buttons:`, result.description);
    }
  } catch (error) {
    console.error('❌ Fehler beim Einrichten des Menü-Buttons:', error);
  }
}

/**
 * Setzt den Standard-Menü-Button für alle Chats.
 */
export async function setupDefaultMenuButton(): Promise<void> {
  try {
    const response = await fetch(`${TELEGRAM_API}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: {
          type: 'commands',
        },
      }),
    });

    const result = await response.json() as { ok: boolean; description?: string };

    if (result.ok) {
      console.log('✅ Standard-Menü-Button eingerichtet');
    } else {
      console.error('❌ Fehler beim Einrichten des Menü-Buttons:', result.description);
    }
  } catch (error) {
    console.error('❌ Fehler beim Einrichten des Menü-Buttons:', error);
  }
}

/**
 * Führt alle Setup-Schritte aus.
 */
export async function initializeTelegramBot(): Promise<void> {
  console.log('🤖 Initialisiere Telegram-Bot...');
  await setupBotCommands();
  await setupDefaultMenuButton();
  console.log('🤖 Telegram-Bot initialisiert');
}
