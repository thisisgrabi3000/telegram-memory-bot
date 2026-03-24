import fs from 'fs';
import path from 'path';
import type { TelegramVoiceMessage } from '../types';
import { env } from '../config/env';

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

export interface TelegramPhotoMessage {
  chat_id: number;
  message_id: number;
  file_id: string;
  date: number;
  width: number;
  height: number;
  file_size?: number;
  caption?: string;
}

const TELEGRAM_API = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}`;

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
   * Lädt eine Audiodatei von Telegram herunter (temporär für Transkription).
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
   * Lädt eine Audiodatei von Telegram herunter und speichert sie permanent.
   * Gibt den Dateinamen (ohne Pfad) zurück.
   */
  async downloadVoiceFilePermanent(fileId: string): Promise<string> {
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

    // 3. Speichere in uploads/ Verzeichnis (permanent)
    const uploadsDir = path.resolve('./uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `voice_${Date.now()}_${fileId.slice(-8)}.ogg`;
    const localPath = path.join(uploadsDir, fileName);

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    fs.writeFileSync(localPath, buffer);

    return fileName; // Nur Dateiname, nicht voller Pfad
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
   * Sendet eine Nachricht mit Inline-Buttons (eine Reihe).
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
   * Sendet eine Nachricht mit Inline-Buttons in mehreren Reihen.
   */
  async sendMessageWithButtonGrid(
    chatId: number,
    text: string,
    buttons: Array<{ text: string; callback_data: string }>,
    buttonsPerRow: number = 2
  ): Promise<void> {
    // Teile Buttons in Reihen auf
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < buttons.length; i += buttonsPerRow) {
      rows.push(buttons.slice(i, i + buttonsPerRow));
    }

    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        reply_markup: {
          inline_keyboard: rows,
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

  /**
   * Extrahiert Foto-Daten aus einem Telegram Update.
   * Wählt die größte verfügbare Auflösung.
   */
  extractPhotoMessage(update: unknown): TelegramPhotoMessage | null {
    const u = update as {
      message?: {
        chat?: { id?: number };
        message_id?: number;
        date?: number;
        caption?: string;
        photo?: Array<{
          file_id?: string;
          width?: number;
          height?: number;
          file_size?: number;
        }>;
      };
    };

    const message = u?.message;
    const photos = message?.photo;

    if (!photos || photos.length === 0) {
      return null;
    }

    // Wähle das größte Foto (letztes im Array)
    const largestPhoto = photos[photos.length - 1];

    if (!largestPhoto.file_id) {
      return null;
    }

    return {
      chat_id: message!.chat!.id!,
      message_id: message!.message_id!,
      file_id: largestPhoto.file_id,
      date: message!.date!,
      width: largestPhoto.width ?? 0,
      height: largestPhoto.height ?? 0,
      file_size: largestPhoto.file_size,
      caption: message?.caption,
    };
  },

  /**
   * Lädt ein Foto von Telegram herunter.
   * Gibt den lokalen Dateipfad zurück.
   */
  async downloadPhotoFile(fileId: string): Promise<string> {
    // 1. Hole file_path von Telegram
    const fileInfoResponse = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoResponse.json() as {
      ok: boolean;
      result?: { file_path?: string };
    };

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      throw new Error('Konnte Foto-Info nicht abrufen');
    }

    const filePath = fileInfo.result.file_path;
    const extension = path.extname(filePath) || '.jpg';

    // 2. Lade Datei herunter
    const fileUrl = `${TELEGRAM_FILE_API}/${filePath}`;
    const fileResponse = await fetch(fileUrl);

    if (!fileResponse.ok) {
      throw new Error('Konnte Foto nicht herunterladen');
    }

    // 3. Speichere in uploads/ Verzeichnis
    const uploadsDir = path.resolve('./uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `photo_${Date.now()}_${fileId.slice(-8)}${extension}`;
    const localPath = path.join(uploadsDir, fileName);

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    fs.writeFileSync(localPath, buffer);

    return localPath;
  },

  /**
   * Extrahiert Video-Daten aus einem Telegram Update.
   */
  extractVideoMessage(update: unknown): { chat_id: number; message_id: number; file_id: string; date: number; duration: number; file_size?: number; caption?: string } | null {
    const u = update as {
      message?: {
        chat?: { id?: number };
        message_id?: number;
        date?: number;
        caption?: string;
        video?: {
          file_id?: string;
          duration?: number;
          file_size?: number;
          mime_type?: string;
        };
      };
    };

    const message = u?.message;
    const video = message?.video;

    if (!video || !video.file_id) {
      return null;
    }

    return {
      chat_id: message!.chat!.id!,
      message_id: message!.message_id!,
      file_id: video.file_id,
      date: message!.date!,
      duration: video.duration ?? 0,
      file_size: video.file_size,
      caption: message?.caption,
    };
  },

  /**
   * Lädt ein Video von Telegram herunter und speichert es permanent.
   * Gibt den Dateinamen (ohne Pfad) zurück.
   */
  async downloadVideoFile(fileId: string): Promise<string> {
    const fileInfoResponse = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoResponse.json() as {
      ok: boolean;
      result?: { file_path?: string };
    };

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      throw new Error('Konnte Video-Info nicht abrufen');
    }

    const filePath = fileInfo.result.file_path;
    const extension = path.extname(filePath) || '.mp4';

    const fileUrl = `${TELEGRAM_FILE_API}/${filePath}`;
    const fileResponse = await fetch(fileUrl);

    if (!fileResponse.ok) {
      throw new Error('Konnte Video nicht herunterladen');
    }

    const uploadsDir = path.resolve('./uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `video_${Date.now()}_${fileId.slice(-8)}${extension}`;
    const localPath = path.join(uploadsDir, fileName);

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    fs.writeFileSync(localPath, buffer);

    return fileName;
  },

  /**
   * Extrahiert Standort-Daten aus einem Telegram Update.
   * Unterstützt sowohl normale Standorte als auch Live-Standorte.
   */
  extractLocationMessage(update: unknown): { chat_id: number; latitude: number; longitude: number } | null {
    const u = update as {
      message?: {
        chat?: { id?: number };
        location?: {
          latitude?: number;
          longitude?: number;
          live_period?: number;
        };
      };
    };

    const message = u?.message;
    const location = message?.location;

    if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
      return null;
    }

    return {
      chat_id: message!.chat!.id!,
      latitude: location.latitude,
      longitude: location.longitude,
    };
  },

  /**
   * Extrahiert Dokument/Datei-Nachrichten (für Bilder als Datei gesendet).
   * Behält EXIF-Daten im Gegensatz zu komprimierten Fotos.
   */
  extractDocumentMessage(update: unknown): TelegramPhotoMessage | null {
    const u = update as {
      message?: {
        chat?: { id?: number };
        message_id?: number;
        date?: number;
        caption?: string;
        document?: {
          file_id?: string;
          file_name?: string;
          mime_type?: string;
          file_size?: number;
        };
      };
    };

    const message = u?.message;
    const doc = message?.document;

    if (!doc || !doc.file_id) {
      return null;
    }

    // Nur Bilder akzeptieren
    const mimeType = doc.mime_type || '';
    if (!mimeType.startsWith('image/')) {
      return null;
    }

    return {
      chat_id: message!.chat!.id!,
      message_id: message!.message_id!,
      file_id: doc.file_id,
      date: message!.date!,
      width: 0,
      height: 0,
      file_size: doc.file_size,
      caption: message?.caption,
    };
  },
};
