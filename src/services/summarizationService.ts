import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ALLOWED_CATEGORIES, type SummarizationResult, type Category } from '../types';
import { getChildrenInfo, resolveChildName } from '../config/children';

/**
 * Lädt einen Prompt aus einer Markdown-Datei.
 */
function loadPrompt(filename: string): string {
  const promptPath = path.join(__dirname, '..', 'prompts', filename);
  return fs.readFileSync(promptPath, 'utf-8');
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
      apiKey: process.env.OPENAI_API_KEY,
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

    const parsed = JSON.parse(jsonMatch[0]);
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
      apiKey: process.env.OPENAI_API_KEY,
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

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      weekly_summary: typeof parsed.weekly_summary === 'string' ? parsed.weekly_summary : '',
    };
  },
};
