import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ALLOWED_CATEGORIES, type SummarizationResult, type Category } from '../types';
import { getChildrenInfo, resolveChildName } from '../config/children';
import { env } from '../config/env';

/**
 * Lädt einen Prompt aus einer Markdown-Datei.
 */
function loadPrompt(filename: string): string {
  const promptPath = path.join(__dirname, '..', 'prompts', filename);
  return fs.readFileSync(promptPath, 'utf-8');
}

/**
 * Sicheres JSON-Parsing mit Fehlerbehandlung.
 */
function safeJsonParse<T = unknown>(jsonString: string, context: string): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    const preview = jsonString.slice(0, 200);
    throw new Error(
      `JSON-Parsing fehlgeschlagen (${context}): ${error instanceof Error ? error.message : 'Unbekannter Fehler'}. ` +
      `Input: "${preview}${jsonString.length > 200 ? '...' : ''}"`
    );
  }
}

/**
 * Validiert und bereinigt das LLM-Ergebnis.
 */
function validateResult(raw: unknown): SummarizationResult {
  const data = raw as Record<string, unknown>;

  // Validiere Kategorien
  const categories: Category[] = [];
  if (Array.isArray(data.categories)) {
    for (const cat of data.categories) {
      if (ALLOWED_CATEGORIES.includes(cat as Category)) {
        categories.push(cat as Category);
      }
    }
  }

  // Validiere Tags
  const tags: string[] = [];
  if (Array.isArray(data.tags)) {
    for (const tag of data.tags) {
      if (typeof tag === 'string') {
        tags.push(tag);
      }
    }
  }

  // Validiere People (alle erwähnten Familienmitglieder)
  const people: string[] = [];
  if (Array.isArray(data.people)) {
    for (const person of data.people) {
      if (typeof person === 'string') {
        // Versuche den Namen zu normalisieren
        const resolved = resolveChildName(person);
        if (resolved && !people.includes(resolved)) {
          people.push(resolved);
        } else if (!resolved && !people.includes(person)) {
          // Falls nicht auflösbar, behalte Originalname
          people.push(person);
        }
      }
    }
  }

  // Validiere importance_score (1-5)
  let importance = 3;
  if (typeof data.importance_score === 'number') {
    importance = Math.max(1, Math.min(5, Math.round(data.importance_score)));
  }

  // Korrigiere Kindername mit bekannten Namen
  const rawName = typeof data.child_name === 'string' ? data.child_name : null;
  const resolvedName = resolveChildName(rawName);

  return {
    child_name: resolvedName,
    cleaned_summary: typeof data.cleaned_summary === 'string' ? data.cleaned_summary : '',
    categories: categories.length > 0 ? categories : ['Besonderes'],
    tags: tags.slice(0, 5),
    people,
    importance_score: importance,
  };
}

/**
 * Service für LLM-basierte Zusammenfassungen.
 */
export const summarizationService = {
  /**
   * Erstellt eine strukturierte Zusammenfassung aus einem Rohtranskript.
   */
  async summarize(rawTranscript: string): Promise<SummarizationResult> {
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    const promptTemplate = loadPrompt('summarizeMemory.prompt.md');
    const prompt = promptTemplate
      .replace('{{CHILDREN_INFO}}', getChildrenInfo())
      .replace('{{TRANSCRIPT}}', rawTranscript);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || '';

    // Extrahiere JSON aus der Antwort
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Keine JSON-Antwort vom LLM');
    }

    const parsed = safeJsonParse(jsonMatch[0], 'summarize');
    return validateResult(parsed);
  },

  /**
   * Erstellt eine Wochenzusammenfassung aus mehreren Einträgen.
   */
  async createWeeklySummary(
    entries: Array<{ child_name: string | null; cleaned_summary: string }>
  ): Promise<{
    highlights: string[];
    themes: string[];
    weekly_summary: string;
  }> {
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    const promptTemplate = loadPrompt('weeklySummary.prompt.md');
    const entriesText = entries
      .map((e, i) => `${i + 1}. ${e.child_name || 'Kind'}: ${e.cleaned_summary}`)
      .join('\n');
    const prompt = promptTemplate.replace('{{ENTRIES}}', entriesText);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5,
    });

    const content = response.choices[0]?.message?.content || '';

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Keine JSON-Antwort vom LLM');
    }

    const parsed = safeJsonParse<Record<string, unknown>>(jsonMatch[0], 'weeklySummary');

    return {
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights as string[] : [],
      themes: Array.isArray(parsed.themes) ? parsed.themes as string[] : [],
      weekly_summary: typeof parsed.weekly_summary === 'string' ? parsed.weekly_summary : '',
    };
  },
};
