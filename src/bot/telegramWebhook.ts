import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { telegramService } from './telegramService';
import { memoryRepository } from '../db/repositories/memoryRepository';
import { mediaRepository } from '../db/repositories/mediaRepository';
import { userRepository } from '../db/repositories/userRepository';
import { transcribeDetailed } from '../services/transcriptionService';
import { summarizationService } from '../services/summarizationService';
import { extractExifData, canHaveExif } from '../services/exifService';
import { CHILDREN, LOCATIONS } from '../config/children';
import { isChatAllowed, getAllowedChatCount } from '../config/allowedChats';
import { getSpeakerByChatId, analyzeTranscript, formatSpeakerInfo } from '../config/speakers';

/**
 * Pending transcriptions waiting for user confirmation/edit.
 * Key: chat_id, Value: pending data
 */
interface PendingTranscription {
  entryId: number;
  transcript: string;
  chatId: number;
  awaitingEdit: boolean;
  audioFilePath: string; // Temp path to audio file
  telegramFileId: string; // For re-downloading if needed
}

const pendingTranscriptions = new Map<number, PendingTranscription>();

/**
 * Pending location requests after photo save.
 * Key: chat_id, Value: memory entry ID awaiting location
 */
const pendingLocationRequests = new Map<number, number>();

/**
 * Stored locations per chat (from Telegram location sharing).
 * Key: chat_id, Value: location data with name and coordinates
 */
interface StoredLocation {
  name: string;
  latitude: number;
  longitude: number;
}
const chatLocations = new Map<number, StoredLocation>();

/**
 * Verarbeitet und speichert eine Transkription mit Zusammenfassung.
 * Zentrale Funktion für alle Save-Flows (mit/ohne Audio, nach Edit).
 */
async function processAndSaveTranscription(params: {
  entryId: number;
  transcript: string;
  chatId: number;
  withAudio?: boolean;
}): Promise<void> {
  const { entryId, transcript, chatId, withAudio = false } = params;

  // Analysiere Sprecher
  const speakerInfo = analyzeTranscript(transcript, chatId);

  try {
    const summary = await summarizationService.summarize(transcript);
    console.log('Zusammenfassung erstellt:', summary);

    memoryRepository.updateSummary(entryId, summary);

    // Auto-apply location if available
    const storedLoc = chatLocations.get(chatId);
    if (storedLoc) {
      memoryRepository.updateLocation(entryId, storedLoc.name);
      memoryRepository.updateCoordinates(entryId, storedLoc.latitude, storedLoc.longitude);
    }

    // Ermittle erwähnte Personen
    const mentionedNames = speakerInfo.mentioned.map(p => p.name);

    const confirmation = formatConfirmation(
      summary.child_name,
      storedLoc?.name ?? null,
      speakerInfo.author?.name,
      mentionedNames
    );

    await telegramService.sendMessage(
      chatId,
      withAudio ? `🎙️ ${confirmation} (mit Audio)` : confirmation
    );
  } catch (error) {
    console.error('Zusammenfassung fehlgeschlagen:', error);
    memoryRepository.markFailed(entryId, 'Zusammenfassung fehlgeschlagen');
    await telegramService.sendMessage(
      chatId,
      withAudio
        ? `🎙️ Mit Audio gespeichert:\n\n"${transcript}"`
        : `Transkript gespeichert:\n\n"${transcript}"\n\n(Automatische Zusammenfassung fehlgeschlagen)`
    );
  }
}

/**
 * Formatiert eine kurze Bestätigungsnachricht.
 */
function formatConfirmation(
  childName: string | null,
  location: string | null,
  authorName?: string | null,
  mentionedNames?: string[]
): string {
  const parts: string[] = [];

  // Autor (wer hat es gesagt)
  if (authorName) {
    parts.push(`📝 ${authorName}`);
  }

  // Erwähnte Personen
  if (mentionedNames && mentionedNames.length > 0) {
    const child = CHILDREN.find(c => mentionedNames.includes(c.name));
    if (child) {
      parts.push(`${child.emoji} ${mentionedNames.join(', ')}`);
    } else {
      parts.push(mentionedNames.join(', '));
    }
  } else if (childName) {
    // Fallback auf altes child_name
    const child = CHILDREN.find(c => c.name === childName);
    parts.push(child ? `${child.emoji} ${childName}` : childName);
  }

  if (location) {
    const loc = LOCATIONS.find(l => l.name === location);
    parts.push(loc ? `${loc.emoji} ${location}` : `📍 ${location}`);
  }

  if (parts.length > 0) {
    return `✅ Gespeichert – ${parts.join(' · ')}`;
  }
  return '✅ Gespeichert';
}

/**
 * Reverse-geocode coordinates to a location name.
 * First checks against configured locations, then uses a simple city lookup.
 */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    // Simple reverse geocoding using Nominatim (OpenStreetMap)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
      { headers: { 'User-Agent': 'TelegramMemoryBot/1.0' } }
    );

    if (!response.ok) return null;

    const data = await response.json() as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
      };
    };

    const address = data.address;
    return address?.city || address?.town || address?.village || address?.municipality || null;
  } catch (error) {
    console.error('Reverse geocoding failed:', error);
    return null;
  }
}

/**
 * Forward geocode a text query to coordinates using Nominatim.
 * Returns the first result, or null if not found.
 */
async function forwardGeocode(query: string): Promise<{ name: string; latitude: number; longitude: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=de`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TelegramMemoryBot/1.0' },
    });
    if (!response.ok) return null;

    const results = await response.json() as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;

    if (!results || results.length === 0) return null;

    const first = results[0];
    const shortName = first.display_name.split(',')[0].trim();
    return {
      name: shortName,
      latitude: parseFloat(first.lat),
      longitude: parseFloat(first.lon),
    };
  } catch (error) {
    console.error('Forward geocoding failed:', error);
    return null;
  }
}

/**
 * Familienmitglieder für die Registrierung.
 */
const FAMILY_MEMBERS = [
  { name: 'Leni', displayName: 'Mama' },
  { name: 'Grabi', displayName: 'Papa' },
  { name: 'Opa Frank', displayName: 'Opa Frank' },
  { name: 'Oma Eva', displayName: 'Oma Eva' },
  { name: 'Moma', displayName: 'Moma' },
  { name: 'Opa Peter', displayName: 'Opa Peter' },
];

/**
 * Extrahiert die Chat-ID aus einem Telegram Update (beliebiger Typ).
 */
function extractChatId(update: unknown): number | null {
  const u = update as {
    message?: { chat?: { id?: number } };
    callback_query?: { message?: { chat?: { id?: number } } };
  };

  return u?.message?.chat?.id || u?.callback_query?.message?.chat?.id || null;
}

/**
 * Express Router für den Telegram Webhook.
 */
export const telegramWebhook = Router();

/**
 * Formatiert einen Eintrag für die Telegram-Ausgabe.
 */
function formatEntry(entry: {
  source_date: string;
  child_name: string | null;
  cleaned_summary: string | null;
  categories: string | null;
  importance_score: number | null;
}): string {
  const date = entry.source_date;
  const name = entry.child_name || 'Kind';
  const summary = entry.cleaned_summary || '(keine Zusammenfassung)';
  const stars = '⭐'.repeat(entry.importance_score || 1);

  return `📅 ${date} | ${name}\n${summary}\n${stars}`;
}

/**
 * Verarbeitet den /delete oder "lösche letzte" Befehl.
 */
async function handleDelete(chatId: number): Promise<void> {
  // Clear any pending location request for this chat
  pendingLocationRequests.delete(chatId);

  const lastEntry = memoryRepository.findLast(chatId);

  if (!lastEntry) {
    await telegramService.sendMessage(chatId, 'Keine Erinnerungen zum Löschen vorhanden.');
    return;
  }

  const date = lastEntry.source_date;
  const name = lastEntry.child_name || 'Kind';
  const summary = lastEntry.cleaned_summary || '(keine Zusammenfassung)';

  const text = `🗑️ Letzten Eintrag löschen?\n\n📅 ${date} | ${name}\n${summary}\n\nWirklich löschen?`;

  await telegramService.sendMessageWithButtons(chatId, text, [
    { text: '✅ Ja, löschen', callback_data: `delete_confirm_${lastEntry.id}` },
    { text: '❌ Abbrechen', callback_data: 'delete_cancel' },
  ]);
}

/**
 * Verarbeitet den /letzte Befehl.
 */
async function handleLetzte(chatId: number): Promise<void> {
  const entries = memoryRepository.findRecent(5);

  if (entries.length === 0) {
    await telegramService.sendMessage(chatId, 'Noch keine Erinnerungen gespeichert.');
    return;
  }

  let text = `📚 Letzte ${entries.length} Erinnerungen:\n\n`;
  text += entries.map(formatEntry).join('\n\n');

  await telegramService.sendMessage(chatId, text);
}

/**
 * Verarbeitet den /woche Befehl.
 */
async function handleWoche(chatId: number): Promise<void> {
  const entries = memoryRepository.findCurrentWeek();

  if (entries.length === 0) {
    await telegramService.sendMessage(chatId, 'Diese Woche noch keine Erinnerungen.');
    return;
  }

  // Erstelle Wochenzusammenfassung mit LLM
  await telegramService.sendMessage(chatId, `${entries.length} Einträge diese Woche. Erstelle Zusammenfassung...`);

  try {
    const summaryData = entries.map(e => ({
      child_name: e.child_name,
      cleaned_summary: e.cleaned_summary || '',
    }));

    const weekly = await summarizationService.createWeeklySummary(summaryData);

    let text = `📊 Wochenzusammenfassung\n\n`;
    text += `✨ Highlights:\n`;
    text += weekly.highlights.map(h => `• ${h}`).join('\n');
    text += `\n\n🏷️ Themen: ${weekly.themes.join(', ')}`;
    text += `\n\n📝 ${weekly.weekly_summary}`;

    await telegramService.sendMessage(chatId, text);

  } catch (error) {
    console.error('Wochenzusammenfassung fehlgeschlagen:', error);

    // Fallback: zeige einfach die Einträge
    let text = `📊 Diese Woche (${entries.length} Einträge):\n\n`;
    text += entries.map(formatEntry).join('\n\n');

    await telegramService.sendMessage(chatId, text);
  }
}

/**
 * POST /webhook/telegram
 * Empfängt Updates von Telegram.
 */
telegramWebhook.post('/telegram', async (req: Request, res: Response) => {
  // Sofort 200 OK senden, um Telegram-Timeout zu vermeiden
  res.sendStatus(200);

  try {
    const update = req.body;

    console.log('Telegram Update empfangen:', JSON.stringify(update, null, 2));

    // Prüfe ob der Chat erlaubt ist
    const chatId = extractChatId(update);
    if (chatId) {
      if (!isChatAllowed(chatId)) {
        console.log(`Chat ${chatId} nicht erlaubt (${getAllowedChatCount()} Chats konfiguriert)`);
        await telegramService.sendMessage(
          chatId,
          'Dieser Bot ist privat.'
        );
        return;
      }
    }

    // Prüfe auf Callback-Query (Button-Klick)
    const callbackQuery = telegramService.extractCallbackQuery(update);
    if (callbackQuery) {
      console.log('Callback Query erkannt:', callbackQuery.data);

      if (callbackQuery.data.startsWith('delete_confirm_')) {
        const entryId = parseInt(callbackQuery.data.replace('delete_confirm_', ''), 10);
        const deleted = memoryRepository.deleteById(entryId);

        await telegramService.answerCallbackQuery(callbackQuery.callback_query_id);

        if (deleted) {
          await telegramService.sendMessage(callbackQuery.chat_id, '✅ Erinnerung gelöscht.');
        } else {
          await telegramService.sendMessage(callbackQuery.chat_id, '❌ Eintrag nicht gefunden.');
        }
        return;
      }

      if (callbackQuery.data === 'delete_cancel') {
        await telegramService.answerCallbackQuery(callbackQuery.callback_query_id);
        await telegramService.sendMessage(callbackQuery.chat_id, '❌ Löschen abgebrochen.');
        return;
      }

      // Transkription MIT AUDIO speichern (muss VOR transcription_save_ geprüft werden!)
      if (callbackQuery.data.startsWith('transcription_save_audio_')) {
        const entryId = parseInt(callbackQuery.data.replace('transcription_save_audio_', ''), 10);
        const pending = pendingTranscriptions.get(callbackQuery.chat_id);

        if (!pending || pending.entryId !== entryId) {
          await telegramService.answerCallbackQuery(callbackQuery.callback_query_id, 'Sitzung abgelaufen');
          return;
        }

        await telegramService.answerCallbackQuery(callbackQuery.callback_query_id, 'Wird mit Audio gespeichert...');

        // Audio permanent speichern
        try {
          const audioFileName = await telegramService.downloadVoiceFilePermanent(pending.telegramFileId);
          mediaRepository.create({
            memory_entry_id: entryId,
            media_type: 'audio',
            telegram_file_id: pending.telegramFileId,
            local_path: audioFileName,
          });
          console.log('Audio permanent gespeichert:', audioFileName);
        } catch (audioError) {
          console.error('Audio speichern fehlgeschlagen:', audioError);
        }

        // Lösche temp-Datei
        try { fs.unlinkSync(pending.audioFilePath); } catch { /* ignore */ }

        // Verarbeite und speichere Transkription
        await processAndSaveTranscription({
          entryId,
          transcript: pending.transcript,
          chatId: callbackQuery.chat_id,
          withAudio: true,
        });

        pendingTranscriptions.delete(callbackQuery.chat_id);
        return;
      }

      // Transkription speichern (NUR Text, Audio wird gelöscht)
      if (callbackQuery.data.startsWith('transcription_save_')) {
        const entryId = parseInt(callbackQuery.data.replace('transcription_save_', ''), 10);
        const pending = pendingTranscriptions.get(callbackQuery.chat_id);

        if (!pending || pending.entryId !== entryId) {
          await telegramService.answerCallbackQuery(callbackQuery.callback_query_id, 'Sitzung abgelaufen');
          return;
        }

        await telegramService.answerCallbackQuery(callbackQuery.callback_query_id, 'Wird gespeichert...');

        // Lösche temp Audio-Datei (nur Text wird gespeichert)
        try { fs.unlinkSync(pending.audioFilePath); } catch { /* ignore */ }

        // Verarbeite und speichere Transkription
        await processAndSaveTranscription({
          entryId,
          transcript: pending.transcript,
          chatId: callbackQuery.chat_id,
        });

        pendingTranscriptions.delete(callbackQuery.chat_id);
        return;
      }

      // Transkription bearbeiten (User will korrigieren)
      if (callbackQuery.data.startsWith('transcription_edit_')) {
        const entryId = parseInt(callbackQuery.data.replace('transcription_edit_', ''), 10);
        const pending = pendingTranscriptions.get(callbackQuery.chat_id);

        if (!pending || pending.entryId !== entryId) {
          await telegramService.answerCallbackQuery(callbackQuery.callback_query_id, 'Sitzung abgelaufen');
          return;
        }

        // Markiere als "warte auf Korrektur"
        pending.awaitingEdit = true;
        pendingTranscriptions.set(callbackQuery.chat_id, pending);

        await telegramService.answerCallbackQuery(callbackQuery.callback_query_id);
        await telegramService.sendMessage(
          callbackQuery.chat_id,
          `✏️ Bitte sende mir den korrigierten Text.\n\nOriginal: "${pending.transcript}"`
        );
        return;
      }

      // Nutzer-Registrierung
      if (callbackQuery.data.startsWith('register_')) {
        const memberName = callbackQuery.data.replace('register_', '');
        const member = FAMILY_MEMBERS.find(m => m.name === memberName);

        if (member) {
          // Speichere oder aktualisiere Nutzer
          const existingUser = userRepository.findByChatId(callbackQuery.chat_id);
          if (existingUser) {
            userRepository.updateDisplayName(callbackQuery.chat_id, member.displayName);
          } else {
            userRepository.create(callbackQuery.chat_id, member.displayName);
          }

          await telegramService.answerCallbackQuery(callbackQuery.callback_query_id);
          await telegramService.sendMessage(
            callbackQuery.chat_id,
            `👋 Hallo ${member.name}! Du bist jetzt als "${member.displayName}" registriert.\n\n` +
            '🎙️ Tippe /record oder sende direkt eine Sprachnachricht.\n\n' +
            'Befehle:\n' +
            '/record - Erinnerung aufnehmen\n' +
            '/letzte - Letzte 5 Erinnerungen\n' +
            '/woche - Wochenzusammenfassung\n' +
            '/delete - Letzten Eintrag löschen\n' +
            '/werbinich - Wer bin ich?'
          );
        }
        return;
      }
    }

    // Prüfe auf Textnachrichten wie "lösche letzte"
    const textMessage = telegramService.extractTextMessage(update);
    if (textMessage) {
      // Prüfe zuerst, ob eine Transkription auf Korrektur wartet
      const pending = pendingTranscriptions.get(textMessage.chat_id);
      if (pending && pending.awaitingEdit) {
        console.log('Korrigierte Transkription erhalten:', textMessage.text);

        // Lösche temp Audio-Datei (nur Text wird gespeichert nach Bearbeitung)
        try { fs.unlinkSync(pending.audioFilePath); } catch { /* ignore */ }

        // Aktualisiere das Transkript in der Datenbank
        memoryRepository.updateTranscript(pending.entryId, textMessage.text, 'completed');

        // Verarbeite und speichere Transkription (mit korrigiertem Text)
        await processAndSaveTranscription({
          entryId: pending.entryId,
          transcript: textMessage.text,
          chatId: textMessage.chat_id,
        });

        pendingTranscriptions.delete(textMessage.chat_id);
        return;
      }

      // Check if awaiting a location for a photo
      const pendingMemoryId = pendingLocationRequests.get(textMessage.chat_id);
      if (pendingMemoryId !== undefined) {
        pendingLocationRequests.delete(textMessage.chat_id);

        const lText = textMessage.text.trim();

        // Allow skipping
        if (lText === '/skip' || lText.toLowerCase() === 'skip' || lText.toLowerCase() === 'überspringen') {
          await telegramService.sendMessage(textMessage.chat_id, '👍 Kein Ort gespeichert.');
          return;
        }

        // Geocode the text
        const geoResult = await forwardGeocode(lText);
        if (geoResult) {
          memoryRepository.updateLocation(pendingMemoryId, geoResult.name);
          memoryRepository.updateCoordinates(pendingMemoryId, geoResult.latitude, geoResult.longitude);
          await telegramService.sendMessage(
            textMessage.chat_id,
            `📍 Ort gespeichert: ${geoResult.name}`
          );
        } else {
          // Save as text-only location (no coordinates)
          memoryRepository.updateLocation(pendingMemoryId, lText);
          await telegramService.sendMessage(
            textMessage.chat_id,
            `📍 Ort gespeichert: ${lText} (keine Koordinaten gefunden)`
          );
        }
        return;
      }

      const lowerText = textMessage.text.toLowerCase().trim();
      if (lowerText === 'lösche letzte' || lowerText === 'lösche letzten' || lowerText === 'letzten löschen') {
        await handleDelete(textMessage.chat_id);
        return;
      }
    }

    // Prüfe auf Befehle
    const command = telegramService.extractCommand(update);
    if (command) {
      console.log('Befehl erkannt:', command.command);

      switch (command.command) {
        case '/woche':
          await handleWoche(command.chat_id);
          return;
        case '/letzte':
          await handleLetzte(command.chat_id);
          return;
        case '/start': {
          // Prüfe ob Nutzer bereits registriert ist
          const existingUser = userRepository.findByChatId(command.chat_id);

          if (existingUser) {
            await telegramService.sendMessage(
              command.chat_id,
              `👋 Willkommen zurück, ${existingUser.display_name}!\n\n` +
              '🎙️ Tippe /record oder sende direkt eine Sprachnachricht.\n\n' +
              'Befehle:\n' +
              '/record - Erinnerung aufnehmen\n' +
              '/letzte - Letzte 5 Erinnerungen\n' +
              '/woche - Wochenzusammenfassung\n' +
              '/delete - Letzten Eintrag löschen\n' +
              '/werbinich - Wer bin ich?'
            );
          } else {
            // Zeige Registrierungs-Buttons
            const buttons = FAMILY_MEMBERS.map(m => ({
              text: m.name,
              callback_data: `register_${m.name}`,
            }));

            await telegramService.sendMessageWithButtonGrid(
              command.chat_id,
              '👋 Hallo! Wer bist du?',
              buttons,
              2
            );
          }
          return;
        }
        case '/delete':
          await handleDelete(command.chat_id);
          return;
        case '/record':
          await telegramService.sendMessage(
            command.chat_id,
            '🎙️ Jetzt Sprachnachricht aufnehmen!\n\n' +
            'Halte das Mikrofon-Symbol gedrückt und erzähle von deiner Erinnerung.'
          );
          return;
        case '/werbinich': {
          const user = userRepository.findByChatId(command.chat_id);
          const speaker = getSpeakerByChatId(command.chat_id);

          let message = `📱 Deine Chat-ID: \`${command.chat_id}\`\n\n`;

          if (speaker) {
            message += `✅ In der Config als "${speaker.emoji} ${speaker.name}" eingetragen.\n\n`;
          } else {
            message += `⚠️ Noch nicht in der Config eingetragen.\n`;
            message += `Trage diese ID in src/config/speakers.ts ein.\n\n`;
          }

          if (user) {
            message += `👤 Registriert als: ${user.display_name}`;
          } else {
            message += `👤 Noch nicht registriert. Tippe /start`;
          }

          await telegramService.sendMessage(command.chat_id, message);
          return;
        }
        case '/skip': {
          const pendingId = pendingLocationRequests.get(command.chat_id);
          if (pendingId !== undefined) {
            pendingLocationRequests.delete(command.chat_id);
            await telegramService.sendMessage(command.chat_id, '👍 Kein Ort gespeichert.');
          }
          return;
        }
        default:
          await telegramService.sendMessage(
            command.chat_id,
            'Unbekannter Befehl. Nutze /record, /letzte, /woche oder /delete'
          );
          return;
      }
    }

    // Prüfe auf Standort-Nachricht
    const locationMessage = telegramService.extractLocationMessage(update);
    if (locationMessage) {
      console.log('Standort empfangen:', locationMessage);

      try {
        // Reverse geocode to get location name
        const locationName = await reverseGeocode(locationMessage.latitude, locationMessage.longitude);

        if (locationName) {
          // Store location for this chat (will be used for next memory)
          chatLocations.set(locationMessage.chat_id, {
            name: locationName,
            latitude: locationMessage.latitude,
            longitude: locationMessage.longitude,
          });

          // Also update the most recent memory if within last 10 minutes
          const lastEntry = memoryRepository.findLast(locationMessage.chat_id);
          const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

          if (lastEntry && new Date(lastEntry.created_at).getTime() > tenMinutesAgo && !lastEntry.location) {
            memoryRepository.updateLocation(lastEntry.id, locationName);
            memoryRepository.updateCoordinates(lastEntry.id, locationMessage.latitude, locationMessage.longitude);
            await telegramService.sendMessage(
              locationMessage.chat_id,
              `📍 Standort "${locationName}" zur letzten Erinnerung hinzugefügt`
            );
          } else {
            await telegramService.sendMessage(
              locationMessage.chat_id,
              `📍 Standort "${locationName}" für nächste Erinnerung gespeichert`
            );
          }
        } else {
          await telegramService.sendMessage(
            locationMessage.chat_id,
            '📍 Standort empfangen, konnte aber nicht zugeordnet werden'
          );
        }
      } catch (error) {
        console.error('Fehler bei Standort-Verarbeitung:', error);
      }

      return;
    }

    // Prüfe auf Foto oder Bild-Datei (Document)
    const isCompressedPhoto = !!telegramService.extractPhotoMessage(update);
    const photoMessage = telegramService.extractPhotoMessage(update) || telegramService.extractDocumentMessage(update);
    if (photoMessage) {
      console.log('Foto/Bild empfangen:', photoMessage, isCompressedPhoto ? '(komprimiert)' : '(als Datei)');

      // Hole registrierten Nutzer
      const photoUser = userRepository.findByChatId(photoMessage.chat_id);

      try {
        // Lade Foto herunter
        const localPath = await telegramService.downloadPhotoFile(photoMessage.file_id);
        const fileName = path.basename(localPath);
        console.log('Foto gespeichert:', localPath);

        // Extrahiere EXIF-Daten (GPS, Aufnahmedatum)
        let exifLocation: string | null = null;
        let exifDate: string | null = null;
        let exifCoords: { latitude: number; longitude: number } | null = null;

        if (canHaveExif(localPath)) {
          const exifData = await extractExifData(localPath);
          console.log('EXIF-Daten:', exifData);

          // Verwende EXIF-Datum wenn vorhanden
          if (exifData.dateTaken) {
            exifDate = exifData.dateTaken;
            console.log('EXIF-Datum gefunden:', exifDate);
          }

          // Reverse-Geocode EXIF-GPS-Koordinaten
          if (exifData.latitude !== null && exifData.longitude !== null) {
            console.log('EXIF-GPS gefunden:', exifData.latitude, exifData.longitude);
            exifCoords = { latitude: exifData.latitude, longitude: exifData.longitude };
            exifLocation = await reverseGeocode(exifData.latitude, exifData.longitude);
            if (exifLocation) {
              console.log('EXIF-Ort erkannt:', exifLocation);
            }
          }
        }

        // Finde den letzten Eintrag (innerhalb der letzten 5 Minuten)
        const lastEntry = memoryRepository.findLast(photoMessage.chat_id);
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

        if (lastEntry && new Date(lastEntry.created_at).getTime() > fiveMinutesAgo) {
          // Ordne dem letzten Eintrag zu
          // Clear any pending location request since we're attaching to an existing entry
          pendingLocationRequests.delete(photoMessage.chat_id);
          mediaRepository.create({
            memory_entry_id: lastEntry.id,
            media_type: 'photo',
            telegram_file_id: photoMessage.file_id,
            local_path: fileName,
          });

          // Aktualisiere Ort wenn aus EXIF und noch nicht gesetzt
          if (exifLocation && !lastEntry.location) {
            memoryRepository.updateLocation(lastEntry.id, exifLocation);
          }

          // Speichere EXIF-GPS-Koordinaten
          if (exifCoords) {
            memoryRepository.updateCoordinates(lastEntry.id, exifCoords.latitude, exifCoords.longitude);
          }

          const locationInfo = exifLocation ? ` | 📍 ${exifLocation}` : '';
          await telegramService.sendMessage(
            photoMessage.chat_id,
            `📷 Foto zur letzten Erinnerung hinzugefügt${photoMessage.caption ? ` (${photoMessage.caption})` : ''}${locationInfo}`
          );
        } else {
          // Erstelle neuen Eintrag nur für das Foto
          // Verwende EXIF-Datum wenn vorhanden, sonst Telegram-Datum
          const sourceDate = exifDate || new Date(photoMessage.date * 1000).toISOString().split('T')[0];

          const entry = memoryRepository.create({
            source_date: sourceDate,
            source_type: 'photo',
            source_message_id: photoMessage.message_id,
            telegram_chat_id: photoMessage.chat_id,
            raw_transcript: photoMessage.caption || null,
            transcript_status: 'completed',
            processing_status: 'pending',
            recorded_by: photoUser?.display_name ?? null,
          });

          // Setze Ort aus EXIF oder gespeichertem Chat-Ort
          const storedLocation = chatLocations.get(photoMessage.chat_id);
          const finalLocation = exifLocation || storedLocation?.name || null;
          if (finalLocation) {
            memoryRepository.updateLocation(entry.id, finalLocation);
          }

          // Speichere GPS-Koordinaten (EXIF oder gespeicherter Standort)
          if (exifCoords) {
            memoryRepository.updateCoordinates(entry.id, exifCoords.latitude, exifCoords.longitude);
          } else if (storedLocation) {
            memoryRepository.updateCoordinates(entry.id, storedLocation.latitude, storedLocation.longitude);
          }

          // Speichere Medienanhang
          mediaRepository.create({
            memory_entry_id: entry.id,
            media_type: 'photo',
            telegram_file_id: photoMessage.file_id,
            local_path: fileName,
          });

          // Baue EXIF-Info für Bestätigung
          const exifInfo: string[] = [];
          if (exifDate) {
            exifInfo.push(`📅 ${exifDate}`);
          }
          if (finalLocation) {
            exifInfo.push(`📍 ${finalLocation}`);
          }
          const exifText = exifInfo.length > 0 ? `\n${exifInfo.join(' | ')}` : '';

          // Wenn Caption vorhanden, erstelle Zusammenfassung
          if (photoMessage.caption && photoMessage.caption.length > 10) {
            try {
              const summary = await summarizationService.summarize(photoMessage.caption);
              memoryRepository.updateSummary(entry.id, summary);

              await telegramService.sendMessage(
                photoMessage.chat_id,
                `📷 Foto-Erinnerung gespeichert!${exifText}\n\n📝 ${summary.cleaned_summary}\n🏷️ ${summary.categories.join(', ')}`
              );
            } catch {
              // Fallback: Markiere als summarized ohne Zusammenfassung
              memoryRepository.updateSummary(entry.id, {
                child_name: null,
                cleaned_summary: photoMessage.caption || '',
                categories: [],
                tags: [],
                people: [],
                importance_score: 3,
              });
              await telegramService.sendMessage(
                photoMessage.chat_id,
                `📷 Foto-Erinnerung gespeichert!${exifText}`
              );
            }
          } else {
            // Foto ohne Caption: Markiere trotzdem als summarized
            memoryRepository.updateSummary(entry.id, {
              child_name: null,
              cleaned_summary: '',
              categories: [],
              tags: [],
              people: [],
              importance_score: 3,
            });
            await telegramService.sendMessage(
              photoMessage.chat_id,
              `📷 Foto gespeichert!${exifText}`
            );
          }

          // Ask for location if no coordinates available
          if (!exifCoords && !storedLocation) {
            pendingLocationRequests.set(photoMessage.chat_id, entry.id);
            await telegramService.sendMessage(
              photoMessage.chat_id,
              '📍 Wo wurde das aufgenommen? (Ort eingeben oder überspringen mit /skip)'
            );
          }
        }
        // Hinweis: Komprimierte Fotos verlieren EXIF-Daten
        if (isCompressedPhoto && !exifCoords) {
          await telegramService.sendMessage(
            photoMessage.chat_id,
            '💡 Tipp: Sende Fotos als Datei (Büroklammer > Datei), um GPS-Daten und Aufnahmedatum zu behalten.'
          );
        }
      } catch (error) {
        console.error('Fehler beim Foto-Upload:', error);
        await telegramService.sendMessage(
          photoMessage.chat_id,
          '❌ Fehler beim Speichern des Fotos.'
        );
      }

      return;
    }

    // Prüfe auf Video-Nachricht
    const videoMessage = telegramService.extractVideoMessage(update);
    if (videoMessage) {
      console.log('Video empfangen:', videoMessage);

      const videoUser = userRepository.findByChatId(videoMessage.chat_id);

      try {
        const fileName = await telegramService.downloadVideoFile(videoMessage.file_id);
        console.log('Video gespeichert:', fileName);

        // Finde den letzten Eintrag (innerhalb der letzten 5 Minuten)
        const lastEntry = memoryRepository.findLast(videoMessage.chat_id);
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

        if (lastEntry && new Date(lastEntry.created_at).getTime() > fiveMinutesAgo) {
          mediaRepository.create({
            memory_entry_id: lastEntry.id,
            media_type: 'video',
            telegram_file_id: videoMessage.file_id,
            local_path: fileName,
          });
          await telegramService.sendMessage(videoMessage.chat_id, `🎥 Video zur letzten Erinnerung hinzugefügt`);
        } else {
          const sourceDate = new Date(videoMessage.date * 1000).toISOString().split('T')[0];
          const entry = memoryRepository.create({
            source_date: sourceDate,
            source_type: 'photo',
            source_message_id: videoMessage.message_id,
            telegram_chat_id: videoMessage.chat_id,
            raw_transcript: videoMessage.caption || null,
            transcript_status: 'completed',
            processing_status: 'pending',
            recorded_by: videoUser?.display_name ?? null,
          });

          const storedLocation = chatLocations.get(videoMessage.chat_id);
          if (storedLocation) {
            memoryRepository.updateLocation(entry.id, storedLocation.name);
            memoryRepository.updateCoordinates(entry.id, storedLocation.latitude, storedLocation.longitude);
          }

          mediaRepository.create({
            memory_entry_id: entry.id,
            media_type: 'video',
            telegram_file_id: videoMessage.file_id,
            local_path: fileName,
          });

          memoryRepository.updateSummary(entry.id, {
            child_name: null,
            cleaned_summary: videoMessage.caption || '',
            categories: [],
            tags: [],
            people: [],
            importance_score: 3,
          });

          await telegramService.sendMessage(videoMessage.chat_id, `🎥 Video-Erinnerung gespeichert!`);
        }
      } catch (error) {
        console.error('Fehler beim Video-Upload:', error);
        await telegramService.sendMessage(videoMessage.chat_id, '❌ Fehler beim Speichern des Videos.');
      }

      return;
    }

    // Extrahiere Voice Message
    const voiceMessage = telegramService.extractVoiceMessage(update);

    if (!voiceMessage) {
      return;
    }

    console.log('Voice Message erkannt:', voiceMessage);

    // Hole registrierten Nutzer
    const voiceUser = userRepository.findByChatId(voiceMessage.chat_id);

    // 1. Erstelle Datenbankeintrag
    const sourceDate = new Date(voiceMessage.date * 1000).toISOString().split('T')[0];

    const entry = memoryRepository.create({
      source_date: sourceDate,
      source_type: 'voice',
      source_message_id: voiceMessage.message_id,
      telegram_chat_id: voiceMessage.chat_id,
      transcript_status: 'pending',
      processing_status: 'pending',
      recorded_by: voiceUser?.display_name ?? null,
    });

    console.log('Datenbankeintrag erstellt:', entry.id);

    // 2. Lade Audiodatei temporär herunter (für Transkription)
    let audioPath: string;
    try {
      audioPath = await telegramService.downloadVoiceFile(voiceMessage.file_id);
      console.log('Audiodatei temporär gespeichert:', audioPath);
    } catch (downloadError) {
      console.error('Fehler beim Download:', downloadError);
      memoryRepository.markFailed(entry.id, 'Download fehlgeschlagen');
      await telegramService.sendMessage(
        voiceMessage.chat_id,
        'Fehler beim Herunterladen der Sprachnachricht.'
      );
      return;
    }

    // 3. Detaillierte Transkription (mit Füllwörtern, Lachen, etc.)
    await telegramService.sendMessage(
      voiceMessage.chat_id,
      `🎙️ Sprachnachricht empfangen (${voiceMessage.duration}s). Transkribiere...`
    );

    const transcription = await transcribeDetailed(audioPath);

    if (!transcription.success || !transcription.transcript) {
      console.error('Transkription fehlgeschlagen:', transcription.error);
      memoryRepository.updateTranscript(entry.id, '', 'failed', transcription.error);
      // Lösche temp-Datei
      try { fs.unlinkSync(audioPath); } catch { /* ignore */ }
      await telegramService.sendMessage(
        voiceMessage.chat_id,
        'Fehler bei der Transkription.'
      );
      return;
    }

    // Transkript speichern (aber noch nicht zusammenfassen)
    memoryRepository.updateTranscript(entry.id, transcription.transcript, 'completed');
    console.log('Transkription erfolgreich:', transcription.transcript);

    // 4. Speichere als pending und zeige Bestätigungs-Buttons (3 Optionen)
    pendingTranscriptions.set(voiceMessage.chat_id, {
      entryId: entry.id,
      transcript: transcription.transcript,
      chatId: voiceMessage.chat_id,
      awaitingEdit: false,
      audioFilePath: audioPath,
      telegramFileId: voiceMessage.file_id,
    });

    await telegramService.sendMessageWithButtonGrid(
      voiceMessage.chat_id,
      `🎤 Transkription:\n\n"${transcription.transcript}"\n\nStimmt das so?`,
      [
        { text: '✅ Speichern', callback_data: `transcription_save_${entry.id}` },
        { text: '🎙️ Mit Audio', callback_data: `transcription_save_audio_${entry.id}` },
        { text: '✏️ Bearbeiten', callback_data: `transcription_edit_${entry.id}` },
      ],
      3 // 3 Buttons in einer Reihe
    );

  } catch (error) {
    console.error('Fehler bei Webhook-Verarbeitung:', error);
  }
});

/**
 * GET /webhook/telegram
 * Health Check für den Webhook.
 */
telegramWebhook.get('/telegram', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Telegram Webhook aktiv' });
});
