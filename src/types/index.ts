/**
 * Haupttypen für den Telegram Memory Bot
 */

// Erlaubte Kategorien für Erinnerungen
export const ALLOWED_CATEGORIES = [
  'Gesundheit',
  'Schule',
  'Familie',
  'Freunde',
  'Freizeit',
  'Sport',
  'Emotion',
  'Entwicklung',
  'Besonderes',
] as const;

export type Category = (typeof ALLOWED_CATEGORIES)[number];

// Quellentyp (vorbereitet für spätere Erweiterung)
export type SourceType = 'voice' | 'photo' | 'text' | 'web';

// Status der Transkription
export type TranscriptStatus = 'pending' | 'completed' | 'failed';

// Status der Verarbeitung
export type ProcessingStatus = 'pending' | 'summarized' | 'failed';

/**
 * Erinnerungseintrag in der Datenbank
 */
export interface MemoryEntry {
  id: number;
  created_at: string;
  source_date: string;
  child_name: string | null;
  source_type: SourceType;
  source_message_id: number;
  telegram_chat_id: number;
  raw_transcript: string | null;
  cleaned_summary: string | null;
  categories: string | null; // JSON-Array als String
  tags: string | null; // JSON-Array als String
  people: string | null; // JSON-Array als String - alle erwähnten Familienmitglieder
  importance_score: number | null;
  transcript_status: TranscriptStatus;
  processing_status: ProcessingStatus;
  error_message: string | null;
  recorded_by: string | null; // Wer hat diese Erinnerung aufgenommen
  location: string | null; // Ort der Erinnerung
  is_favorite: number; // 0 oder 1
  latitude: number | null;
  longitude: number | null;
}

/**
 * Neuer Eintrag zum Erstellen (ohne auto-generierte Felder)
 */
export interface CreateMemoryEntry {
  source_date: string;
  child_name?: string | null;
  source_type: SourceType;
  source_message_id: number;
  telegram_chat_id: number;
  raw_transcript?: string | null;
  transcript_status?: TranscriptStatus;
  processing_status?: ProcessingStatus;
  recorded_by?: string | null;
}

/**
 * Wochenzusammenfassung
 */
export interface WeeklySummary {
  id: number;
  week_start: string;
  week_end: string;
  child_name: string | null;
  highlights: string | null; // JSON-Array als String
  themes: string | null; // JSON-Array als String
  weekly_summary: string | null;
  created_at: string;
}

/**
 * Medienanhang (vorbereitet für V2)
 */
export interface MediaAttachment {
  id: number;
  memory_entry_id: number;
  media_type: 'photo' | 'audio' | 'video';
  telegram_file_id: string;
  local_path: string | null;
  created_at: string;
  voice_speaker: string | null;
  photo_people: string | null;
}

/**
 * Telegram Voice Message Daten
 */
export interface TelegramVoiceMessage {
  chat_id: number;
  message_id: number;
  file_id: string;
  date: number; // Unix timestamp
  duration: number;
  file_size?: number;
}

/**
 * Ergebnis der LLM-Zusammenfassung
 */
export interface SummarizationResult {
  child_name: string | null;
  cleaned_summary: string;
  categories: Category[];
  tags: string[];
  people: string[]; // Alle erwähnten Familienmitglieder
  importance_score: number; // 1-5
}

/**
 * Transkriptionsergebnis
 */
export interface TranscriptionResult {
  success: boolean;
  transcript?: string;
  provider: string;
  error?: string;
}
