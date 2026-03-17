import { Router, Request, Response } from 'express';
import { telegramService } from './telegramService';
import { memoryRepository } from '../db/repositories/memoryRepository';
import { transcriptionService } from '../services/transcriptionService';
import { summarizationService } from '../services/summarizationService';

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
  const lastEntry = memoryRepository.findLast();

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
    }

    // Prüfe auf Textnachrichten wie "lösche letzte"
    const textMessage = telegramService.extractTextMessage(update);
    if (textMessage) {
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
        case '/start':
          await telegramService.sendMessage(
            command.chat_id,
            '👋 Hallo! Sende mir eine Sprachnachricht und ich speichere sie als Erinnerung.\n\n' +
            'Befehle:\n' +
            '/letzte - Zeigt die letzten 5 Erinnerungen\n' +
            '/woche - Zeigt die Wochenzusammenfassung\n' +
            '/delete - Löscht den letzten Eintrag'
          );
          return;
        case '/delete':
          await handleDelete(command.chat_id);
          return;
        default:
          await telegramService.sendMessage(
            command.chat_id,
            'Unbekannter Befehl. Nutze /letzte, /woche oder /delete'
          );
          return;
      }
    }

    // Extrahiere Voice Message
    const voiceMessage = telegramService.extractVoiceMessage(update);

    if (!voiceMessage) {
      return;
    }

    console.log('Voice Message erkannt:', voiceMessage);

    // 1. Erstelle Datenbankeintrag
    const sourceDate = new Date(voiceMessage.date * 1000).toISOString().split('T')[0];

    const entry = memoryRepository.create({
      source_date: sourceDate,
      source_type: 'voice',
      source_message_id: voiceMessage.message_id,
      telegram_chat_id: voiceMessage.chat_id,
      transcript_status: 'pending',
      processing_status: 'pending',
    });

    console.log('Datenbankeintrag erstellt:', entry.id);

    // 2. Lade Audiodatei herunter
    let audioPath: string;
    try {
      audioPath = await telegramService.downloadVoiceFile(voiceMessage.file_id);
      console.log('Audiodatei heruntergeladen:', audioPath);
    } catch (downloadError) {
      console.error('Fehler beim Download:', downloadError);
      memoryRepository.markFailed(entry.id, 'Download fehlgeschlagen');
      await telegramService.sendMessage(
        voiceMessage.chat_id,
        'Fehler beim Herunterladen der Sprachnachricht.'
      );
      return;
    }

    // 3. Transkription
    await telegramService.sendMessage(
      voiceMessage.chat_id,
      `Sprachnachricht empfangen (${voiceMessage.duration}s). Verarbeite...`
    );

    const transcription = await transcriptionService.transcribe(audioPath);

    if (!transcription.success || !transcription.transcript) {
      console.error('Transkription fehlgeschlagen:', transcription.error);
      memoryRepository.updateTranscript(entry.id, '', 'failed', transcription.error);
      await telegramService.sendMessage(
        voiceMessage.chat_id,
        'Fehler bei der Transkription.'
      );
      return;
    }

    // Transkript speichern
    memoryRepository.updateTranscript(entry.id, transcription.transcript, 'completed');
    console.log('Transkription erfolgreich:', transcription.transcript);

    // 4. Zusammenfassung erstellen
    try {
      const summary = await summarizationService.summarize(transcription.transcript);
      console.log('Zusammenfassung erstellt:', summary);

      // In Datenbank speichern
      memoryRepository.updateSummary(entry.id, summary);

      // Formatierte Antwort senden
      const categoryText = summary.categories.join(', ');
      const tagText = summary.tags.map(t => `#${t}`).join(' ');

      let responseText = `✅ Erinnerung gespeichert!\n\n`;
      if (summary.child_name) {
        responseText += `👤 ${summary.child_name}\n`;
      }
      responseText += `📝 ${summary.cleaned_summary}\n\n`;
      responseText += `🏷️ ${categoryText}\n`;
      responseText += `${tagText}\n`;
      responseText += `${'⭐'.repeat(summary.importance_score)}`;

      await telegramService.sendMessage(voiceMessage.chat_id, responseText);

    } catch (summaryError) {
      console.error('Zusammenfassung fehlgeschlagen:', summaryError);
      memoryRepository.markFailed(entry.id, 'Zusammenfassung fehlgeschlagen');

      // Trotzdem Transkript zeigen
      await telegramService.sendMessage(
        voiceMessage.chat_id,
        `Transkript gespeichert:\n\n"${transcription.transcript}"\n\n(Automatische Zusammenfassung fehlgeschlagen)`
      );
    }

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
