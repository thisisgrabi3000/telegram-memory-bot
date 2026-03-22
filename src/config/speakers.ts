/**
 * Sprecher-Konfiguration basierend auf Telegram Chat-IDs.
 * Jede Chat-ID entspricht einer bestimmten Person.
 *
 * So findest du deine Chat-ID:
 * 1. Sende /werbinich an den Bot
 * 2. Der Bot antwortet mit deiner Chat-ID
 * 3. Trage sie hier ein
 */

export interface Speaker {
  chatId: number;
  name: string;
  emoji: string;
}

export interface Person {
  name: string;
  aliases: string[];
  emoji: string;
}

/**
 * Chat-ID zu Sprecher-Zuordnung.
 * WICHTIG: Ersetze die Platzhalter-IDs mit echten Chat-IDs!
 */
export const SPEAKERS: Speaker[] = [
  // Eltern
  { chatId: 0, name: 'Papa', emoji: '👨' },      // TODO: Echte Chat-ID eintragen
  { chatId: 0, name: 'Mama', emoji: '👩' },      // TODO: Echte Chat-ID eintragen

  // Großeltern mütterlicherseits
  { chatId: 0, name: 'Oma', emoji: '👵' },       // TODO: Echte Chat-ID eintragen (Oma Eva)
  { chatId: 0, name: 'Opa', emoji: '👴' },       // TODO: Echte Chat-ID eintragen (Opa Frank)

  // Großeltern väterlicherseits
  { chatId: 0, name: 'Moma', emoji: '👵' },      // TODO: Echte Chat-ID eintragen
  { chatId: 0, name: 'Opa Peter', emoji: '👴' }, // TODO: Echte Chat-ID eintragen

  // Kinder (falls sie eigene Handys haben)
  { chatId: 0, name: 'Junis', emoji: '🧒' },     // TODO: Echte Chat-ID eintragen
  { chatId: 0, name: 'Noah', emoji: '👦' },      // TODO: Echte Chat-ID eintragen
];

/**
 * Alle bekannten Personen mit Aliases für die Erkennung in Transkripten.
 */
export const PERSONS: Person[] = [
  // Kinder
  { name: 'Junis', aliases: ['junis', 'juno', 'jonas', 'younes'], emoji: '🧒' },
  { name: 'Noah', aliases: ['noah', 'noa', 'fieti'], emoji: '👦' },

  // Eltern
  { name: 'Papa', aliases: ['papa', 'grabi', 'michel', 'papi'], emoji: '👨' },
  { name: 'Mama', aliases: ['mama', 'leni', 'lensi', 'mami'], emoji: '👩' },

  // Großeltern mütterlicherseits
  { name: 'Oma', aliases: ['oma eva', 'eva', 'oma', 'omi'], emoji: '👵' },
  { name: 'Opa', aliases: ['opa frank', 'frank', 'opa', 'opi'], emoji: '👴' },

  // Großeltern väterlicherseits
  { name: 'Moma', aliases: ['moma'], emoji: '👵' },
  { name: 'Opa Peter', aliases: ['opa peter', 'peter'], emoji: '👴' },

  // Haustiere
  { name: 'Bowie', aliases: ['bowie'], emoji: '🐱' },
];

/**
 * Erste-Person-Pronomen für Sprecher-Erkennung.
 */
const FIRST_PERSON_PRONOUNS = ['ich', 'mir', 'mich', 'mein', 'meine', 'meinen', 'meinem', 'meiner'];

/**
 * Findet den Sprecher anhand der Chat-ID.
 */
export function getSpeakerByChatId(chatId: number): Speaker | null {
  return SPEAKERS.find(s => s.chatId === chatId) || null;
}

/**
 * Findet alle erwähnten Personen im Text.
 * Gibt die Namen der erkannten Personen zurück.
 */
export function findMentionedPersons(text: string): Person[] {
  const lowerText = text.toLowerCase();
  const found: Person[] = [];

  for (const person of PERSONS) {
    for (const alias of person.aliases) {
      // Suche nach dem Alias als ganzes Wort
      const regex = new RegExp(`\\b${alias}\\b`, 'i');
      if (regex.test(lowerText)) {
        if (!found.some(p => p.name === person.name)) {
          found.push(person);
        }
        break;
      }
    }
  }

  return found;
}

/**
 * Prüft ob der Text Erste-Person-Pronomen enthält.
 * Wenn ja, ist der Sprecher der Autor der Erinnerung.
 */
export function containsFirstPerson(text: string): boolean {
  const lowerText = text.toLowerCase();

  for (const pronoun of FIRST_PERSON_PRONOUNS) {
    const regex = new RegExp(`\\b${pronoun}\\b`, 'i');
    if (regex.test(lowerText)) {
      return true;
    }
  }

  return false;
}

/**
 * Analysiert einen Text und gibt Sprecher-Info zurück.
 */
export function analyzeTranscript(text: string, senderChatId: number): {
  author: Speaker | null;
  mentioned: Person[];
  isFirstPerson: boolean;
} {
  const speaker = getSpeakerByChatId(senderChatId);
  const isFirstPerson = containsFirstPerson(text);
  const mentioned = findMentionedPersons(text);

  // Wenn der Sprecher bekannt ist und "ich" verwendet, ist er der Autor
  const author = isFirstPerson ? speaker : null;

  // Entferne den Autor aus den erwähnten Personen (er spricht ja selbst)
  const mentionedWithoutAuthor = author
    ? mentioned.filter(p => p.name !== author.name)
    : mentioned;

  return {
    author,
    mentioned: mentionedWithoutAuthor,
    isFirstPerson,
  };
}

/**
 * Formatiert Autor und erwähnte Personen für die Anzeige.
 */
export function formatSpeakerInfo(author: Speaker | null, mentioned: Person[]): string {
  const parts: string[] = [];

  if (author) {
    parts.push(`${author.emoji} ${author.name}`);
  }

  if (mentioned.length > 0) {
    const mentionedStr = mentioned.map(p => `${p.emoji} ${p.name}`).join(', ');
    parts.push(`über ${mentionedStr}`);
  }

  return parts.join(' ');
}
