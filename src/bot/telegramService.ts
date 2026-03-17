import fs from 'fs';
import path from 'path';
import type { TelegramVoiceMessage } from '../types';

export interface TelegramCommand {
  command: string;
  chat_id: number;
}

export interface TelegramCallbackQuery {
  callback_query_id: string;
  chat_id: number;
  data: string;
}

export interface TelegramTextMessage {
  chat_id: number;
  text: string;
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

/**
 * Service für Telegram-spezifische Operationen.
 * Kapselt alle Telegram API Aufrufe.
 */
export const telegramService = {
  /**
   * Extrahiert einen Befehl aus einem Telegram Update.
   * Gibt null zurück, wenn kein Befehl vorhanden.
   */
  extractCommand(update: unknown): TelegramCommand | null {
    const u = update as {
      message?: {
        chat?: { id?: number };
        text?: string;
        entities?: Array<{ type: string; offset: number; length: number }>;
      };
    };

    const message = u?.message;
    if (!message?.text || !message?.chat?.id) {
      return null;
    }

    // Prüfe ob es ein Bot-Befehl ist
    const entities = message.entities || [];
    const botCommand = entities.find(e => e.type === 'bot_command' && e.offset === 0);

    if (!botCommand) {
      return null;
    }

    const command = message.text.slice(0, botCommand.length).toLowerCase();

    return {
      command,
      chat_id: message.chat.id,
    };
  },

  /**
   * Extrahiert Voice-Message-Daten aus einem Telegram Update.
   * Gibt null zurück, wenn keine Voice Message vorhanden.
   */
  extractVoiceMessage(update: unknown): TelegramVoiceMessage | null {
    const u = update as {
      message?: {
        chat?: { id?: number };
        message_id?: number;
        date?: number;
        voice?: {
          file_id?: string;
          duration?: number;
          file_size?: number;
        };
      };
    };

    const message = u?.message;
    const voice = message?.voice;

    if (!voice || !voice.file_id) {
      return null;
    }

    return {
      chat_id: message!.chat!.id!,
      message_id: message!.message_id!,
      file_id: voice.file_id,
      date: message!.date!,
      duration: voice.duration ?? 0,
      file_size: voice.file_size,
    };
  },

  /**
   * Lädt eine Audiodatei von Telegram herunter.
   * Gibt den lokalen Dateipfad zurück.
   */
  async downloadVoiceFile(fileId: string): Promise<string> {
    // 1. Hole file_path von Telegram
    const fileInfoResponse = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoResponse.json() as {
      ok: boolean;
      result?: { file_path?: string };
    };

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      throw new Error('Konnte Datei-Info nicht abrufen');
    }

    const filePath = fileInfo.result.file_path;

    // 2. Lade Datei herunter
    const fileUrl = `${TELEGRAM_FILE_API}/${filePath}`;
    const fileResponse = await fetch(fileUrl);

    if (!fileResponse.ok) {
      throw new Error('Konnte Datei nicht herunterladen');
    }

    // 3. Speichere in temp/ Verzeichnis
    const tempDir = path.resolve('./temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileName = `voice_${Date.now()}_${fileId.slice(-8)}.ogg`;
    const localPath = path.join(tempDir, fileName);

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    fs.writeFileSync(localPath, buffer);

    return localPath;
  },

  /**
   * Sendet eine Textnachricht an einen Chat.
   */
  async sendMessage(chatId: number, text: string): Promise<void> {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Nachricht senden fehlgeschlagen: ${error}`);
    }
  },

  /**
   * Sendet eine Nachricht mit Inline-Buttons.
   */
  async sendMessageWithButtons(
    chatId: number,
    text: string,
    buttons: Array<{ text: string; callback_data: string }>
  ): Promise<void> {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        reply_markup: {
          inline_keyboard: [buttons],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Nachricht senden fehlgeschlagen: ${error}`);
    }
  },

  /**
   * Beantwortet eine Callback-Query (Button-Klick).
   */
  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
      }),
    });
  },

  /**
   * Extrahiert eine Callback-Query aus einem Telegram Update.
   */
  extractCallbackQuery(update: unknown): TelegramCallbackQuery | null {
    const u = update as {
      callback_query?: {
        id?: string;
        message?: { chat?: { id?: number } };
        data?: string;
      };
    };

    const cq = u?.callback_query;
    if (!cq?.id || !cq?.data || !cq?.message?.chat?.id) {
      return null;
    }

    return {
      callback_query_id: cq.id,
      chat_id: cq.message.chat.id,
      data: cq.data,
    };
  },

  /**
   * Extrahiert eine Text-Nachricht (ohne Befehl) aus einem Telegram Update.
   */
  extractTextMessage(update: unknown): TelegramTextMessage | null {
    const u = update as {
      message?: {
        chat?: { id?: number };
        text?: string;
        entities?: Array<{ type: string }>;
      };
    };

    const message = u?.message;
    if (!message?.text || !message?.chat?.id) {
      return null;
    }

    // Ignoriere Bot-Befehle
    const entities = message.entities || [];
    if (entities.some(e => e.type === 'bot_command')) {
      return null;
    }

    return {
      chat_id: message.chat.id,
      text: message.text,
    };
  },
};
