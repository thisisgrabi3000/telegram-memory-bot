import fs from 'fs';
import OpenAI from 'openai';
import type { TranscriptionResult } from '../types';

/**
 * Provider-Schnittstelle für Transkription.
 * Erlaubt später einfachen Wechsel zwischen Anbietern.
 */
export interface TranscriptionProvider {
  name: string;
  transcribe(audioFilePath: string): Promise<TranscriptionResult>;
}

/**
 * OpenAI Whisper Provider
 */
export const openAIProvider: TranscriptionProvider = {
  name: 'openai-whisper',

  async transcribe(audioFilePath: string): Promise<TranscriptionResult> {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    try {
      const audioFile = fs.createReadStream(audioFilePath);

      const response = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'de', // Deutsch
      });

      return {
        success: true,
        transcript: response.text,
        provider: 'openai-whisper',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unbekannter Fehler';
      return {
        success: false,
        provider: 'openai-whisper',
        error: message,
      };
    }
  },
};

/**
 * Transkriptions-Service mit austauschbarem Provider.
 */
export const transcriptionService = {
  provider: openAIProvider,

  /**
   * Wechselt den Transkriptions-Provider.
   */
  setProvider(provider: TranscriptionProvider): void {
    this.provider = provider;
  },

  /**
   * Transkribiert eine Audiodatei.
   */
  async transcribe(audioFilePath: string): Promise<TranscriptionResult> {
    try {
      return await this.provider.transcribe(audioFilePath);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unbekannter Fehler';
      return {
        success: false,
        provider: this.provider.name,
        error: message,
      };
    }
  },
};
