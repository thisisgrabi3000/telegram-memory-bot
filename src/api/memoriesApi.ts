import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { memoryRepository } from '../db/repositories/memoryRepository';
import { mediaRepository } from '../db/repositories/mediaRepository';
import { summarizationService } from '../services/summarizationService';
import type { MemoryEntry, MediaAttachment } from '../types';
import {
  createMemorySchema,
  updateMemorySchema,
  favoriteSchema,
  memoriesQuerySchema,
  idParamSchema,
  photoParamSchema,
  validateBody,
  validateQuery,
  validateParams,
} from './validation';
import { requireAuth } from './authApi';

/**
 * Sicheres JSON-Parsing mit Fallback.
 */
function safeJsonParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

const router = Router();

/**
 * Multer-Konfiguration für Foto-Uploads
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: path.resolve('./uploads'),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `web_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

/**
 * Rate Limiting Konfiguration
 */

// Standard-Limit: 100 Requests pro 15 Minuten
const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Zu viele Anfragen. Bitte später erneut versuchen.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strengeres Limit für AI-Operationen: 20 Requests pro Stunde
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'AI-Limit erreicht. Bitte in einer Stunde erneut versuchen.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Sehr strenges Limit für Schreiboperationen: 50 pro 15 Minuten
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, error: 'Zu viele Schreibvorgänge. Bitte später erneut versuchen.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth + Standard-Limiter für alle Routen
router.use(requireAuth);
router.use(standardLimiter);

/**
 * GET /api/memories
 * Gibt alle Erinnerungen mit Fotos zurück (nur summarized)
 *
 * Query-Parameter:
 * - child: Filter nach Kindername
 * - category: Filter nach Kategorie
 * - location: Filter nach Ort
 * - favorites: Nur Favoriten (true)
 * - search: Volltextsuche
 * - limit: Anzahl der Einträge (Standard: 100)
 */
router.get('/memories', validateQuery(memoriesQuerySchema), (req, res) => {
  try {
    const { child, category, location, favorites, search, limit } = req.query as unknown as {
      child?: string;
      category?: string;
      location?: string;
      favorites?: string;
      search?: string;
      limit: number;
    };

    let memories: MemoryEntry[];

    // Wenn Suche, nutze Suchfunktion
    if (search && search.trim()) {
      memories = memoryRepository.search(search.trim(), limit);
    } else {
      memories = memoryRepository.findAll(limit);
    }

    // Filter nach Kind
    if (child) {
      memories = memories.filter(m => m.child_name === child);
    }

    // Filter nach Kategorie
    if (category) {
      memories = memories.filter(m => {
        const cats = safeJsonParse<string[]>(m.categories, []);
        return cats.includes(category);
      });
    }

    // Filter nach Ort
    if (location) {
      memories = memories.filter(m => m.location === location);
    }

    // Filter nach Favoriten
    if (favorites === 'true') {
      memories = memories.filter(m => m.is_favorite === 1);
    }

    // Lade alle Medienanhänge für diese Memories
    const memoryIds = memories.map(m => m.id);
    const allAttachments = mediaRepository.findByMemoryIds(memoryIds);

    // Gruppiere Attachments nach memory_entry_id
    const attachmentsByMemory = new Map<number, MediaAttachment[]>();
    for (const attachment of allAttachments) {
      const existing = attachmentsByMemory.get(attachment.memory_entry_id) || [];
      existing.push(attachment);
      attachmentsByMemory.set(attachment.memory_entry_id, existing);
    }

    // Transformiere für die API-Antwort
    const response = memories.map(memory => {
      const attachments = attachmentsByMemory.get(memory.id) || [];
      return transformMemory(memory, attachments);
    });

    res.json({
      success: true,
      count: response.length,
      data: response,
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Erinnerungen',
    });
  }
});

/**
 * GET /api/memories/:id
 * Gibt eine einzelne Erinnerung mit Fotos zurück
 */
router.get('/memories/:id', validateParams(idParamSchema), (req, res) => {
  try {
    const { id } = req.params as unknown as { id: number };
    const memory = memoryRepository.findById(id);

    if (!memory) {
      return res.status(404).json({
        success: false,
        error: 'Erinnerung nicht gefunden',
      });
    }

    const attachments = mediaRepository.findByMemoryId(id);

    res.json({
      success: true,
      data: transformMemory(memory, attachments),
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Erinnerung',
    });
  }
});

/**
 * PUT /api/memories/:id
 * Aktualisiert den Text einer Erinnerung
 */
router.put('/memories/:id', writeLimiter, validateParams(idParamSchema), validateBody(updateMemorySchema), (req, res) => {
  try {
    const { id } = req.params as unknown as { id: number };
    const { cleaned_summary } = req.body as { cleaned_summary: string };

    // Prüfe ob Eintrag existiert
    const memory = memoryRepository.findById(id);
    if (!memory) {
      return res.status(404).json({
        success: false,
        error: 'Erinnerung nicht gefunden',
      });
    }

    // Aktualisiere
    const updated = memoryRepository.updateText(id, cleaned_summary.trim());

    if (updated) {
      const updatedMemory = memoryRepository.findById(id);
      const attachments = mediaRepository.findByMemoryId(id);

      res.json({
        success: true,
        message: 'Erinnerung aktualisiert',
        data: transformMemory(updatedMemory!, attachments),
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Fehler beim Aktualisieren',
      });
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Aktualisieren der Erinnerung',
    });
  }
});

/**
 * POST /api/memories
 * Erstellt eine neue Erinnerung aus der Web-App
 */
router.post('/memories', aiLimiter, validateBody(createMemorySchema), async (req, res) => {
  try {
    const { text, child_name, location, source_date, people: explicitPeople, latitude, longitude } = req.body as {
      text: string;
      child_name?: string | null;
      location?: string | null;
      source_date?: string;
      people?: string[];
      latitude?: number | null;
      longitude?: number | null;
    };

    const date = source_date || new Date().toISOString().split('T')[0];

    const entry = memoryRepository.create({
      source_date: date,
      source_type: 'web',
      source_message_id: 0,
      telegram_chat_id: 0,
      raw_transcript: text.trim(),
      transcript_status: 'completed',
      processing_status: 'pending',
      recorded_by: 'Web App',
    });

    if (text.trim()) {
      try {
        const summary = await summarizationService.summarize(text.trim());

        // Merge AI-erkannte mit explizit gewählten Personen
        const mergedPeople = [...new Set([...(summary.people || []), ...(explicitPeople || [])])];

        memoryRepository.updateSummary(entry.id, {
          ...summary,
          // Explizit gewählter child_name hat Vorrang, sonst AI-Ergebnis
          child_name: child_name !== undefined ? (child_name || null) : summary.child_name,
          people: mergedPeople,
        });
      } catch (summaryError) {
        console.error('Zusammenfassung fehlgeschlagen:', summaryError);
        memoryRepository.updateSummary(entry.id, {
          child_name: child_name || null,
          cleaned_summary: text.trim(),
          categories: [],
          tags: [],
          people: explicitPeople || [],
          importance_score: 3,
        });
      }
    } else {
      // Kein Text: direkt ohne KI-Zusammenfassung speichern
      memoryRepository.updateSummary(entry.id, {
        child_name: child_name || null,
        cleaned_summary: '',
        categories: [],
        tags: [],
        people: explicitPeople || [],
        importance_score: 3,
      });
    }

    if (location) {
      memoryRepository.updateLocation(entry.id, location);
    }

    if (latitude != null && longitude != null) {
      memoryRepository.updateCoordinates(entry.id, latitude, longitude);
    }

    const updatedMemory = memoryRepository.findById(entry.id);
    const attachments = mediaRepository.findByMemoryId(entry.id);

    res.status(201).json({
      success: true,
      message: 'Erinnerung erstellt',
      data: transformMemory(updatedMemory!, attachments),
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Erstellen der Erinnerung',
    });
  }
});

/**
 * DELETE /api/memories/:id
 * Löscht eine Erinnerung
 */
router.delete('/memories/:id', writeLimiter, validateParams(idParamSchema), (req, res) => {
  try {
    const { id } = req.params as unknown as { id: number };

    // Prüfe ob Eintrag existiert
    const memory = memoryRepository.findById(id);
    if (!memory) {
      return res.status(404).json({
        success: false,
        error: 'Erinnerung nicht gefunden',
      });
    }

    // Lösche zugehörige Medien
    mediaRepository.deleteByMemoryId(id);

    // Lösche Eintrag
    const deleted = memoryRepository.deleteById(id);

    if (deleted) {
      res.json({
        success: true,
        message: 'Erinnerung gelöscht',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Fehler beim Löschen',
      });
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Löschen der Erinnerung',
    });
  }
});

/**
 * POST /api/memories/:id/favorite
 * Setzt oder entfernt den Favoriten-Status
 */
router.post('/memories/:id/favorite', writeLimiter, validateParams(idParamSchema), (req, res) => {
  try {
    const { id } = req.params as unknown as { id: number };
    const { is_favorite } = req.body as { is_favorite?: boolean };

    const memory = memoryRepository.findById(id);
    if (!memory) {
      return res.status(404).json({
        success: false,
        error: 'Erinnerung nicht gefunden',
      });
    }

    // Toggle oder setze explizit
    const newValue = typeof is_favorite === 'boolean'
      ? is_favorite
      : memory.is_favorite !== 1;

    memoryRepository.setFavorite(id, newValue);

    const updatedMemory = memoryRepository.findById(id);
    const attachments = mediaRepository.findByMemoryId(id);

    res.json({
      success: true,
      data: transformMemory(updatedMemory!, attachments),
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Aktualisieren des Favoriten-Status',
    });
  }
});

/**
 * POST /api/memories/:id/photos
 * Lädt Fotos zu einer bestehenden Erinnerung hoch
 */
router.post('/memories/:id/photos', writeLimiter, validateParams(idParamSchema), upload.array('photos', 10), (req, res) => {
  try {
    const { id } = req.params as unknown as { id: number };

    const memory = memoryRepository.findById(id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Erinnerung nicht gefunden' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'Keine Dateien hochgeladen' });
    }

    for (const file of files) {
      mediaRepository.create({
        memory_entry_id: id,
        media_type: 'photo',
        telegram_file_id: `web_${file.filename}`,
        local_path: file.filename,
      });
    }

    const attachments = mediaRepository.findByMemoryId(id);
    const updatedMemory = memoryRepository.findById(id);

    res.json({
      success: true,
      data: transformMemory(updatedMemory!, attachments),
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ success: false, error: 'Fehler beim Hochladen der Fotos' });
  }
});

/**
 * DELETE /api/memories/:id/photos/:photoId
 * Löscht ein einzelnes Foto aus einer Erinnerung
 */
router.delete('/memories/:id/photos/:photoId', writeLimiter, validateParams(photoParamSchema), (req, res) => {
  try {
    const { id, photoId } = req.params as unknown as { id: number; photoId: number };

    const memory = memoryRepository.findById(id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Erinnerung nicht gefunden' });
    }

    const attachment = mediaRepository.findById(photoId);
    if (!attachment || attachment.memory_entry_id !== id) {
      return res.status(404).json({ success: false, error: 'Foto nicht gefunden' });
    }

    // Datei von Disk löschen
    if (attachment.local_path) {
      const filePath = path.resolve('./uploads', attachment.local_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    mediaRepository.deleteById(photoId);

    const attachments = mediaRepository.findByMemoryId(id);
    res.json({
      success: true,
      data: transformMemory(memory, attachments),
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ success: false, error: 'Fehler beim Löschen des Fotos' });
  }
});

/**
 * GET /api/children
 * Gibt alle bekannten Kindernamen zurück (optimiert mit DISTINCT)
 */
router.get('/children', (_req, res) => {
  try {
    const children = memoryRepository.findDistinctChildren();

    res.json({
      success: true,
      data: children,
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Kinder',
    });
  }
});

/**
 * GET /api/locations
 * Gibt alle bekannten Orte zurück (optimiert mit DISTINCT)
 */
router.get('/locations', (_req, res) => {
  try {
    const locations = memoryRepository.findDistinctLocations();

    res.json({
      success: true,
      data: locations,
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Orte',
    });
  }
});

/**
 * Transformiert einen Datenbank-Eintrag in ein API-freundliches Format
 */
function transformMemory(entry: MemoryEntry, attachments: MediaAttachment[]) {
  return {
    id: entry.id,
    created_at: entry.created_at,
    source_date: entry.source_date,
    child_name: entry.child_name,
    cleaned_summary: entry.cleaned_summary,
    categories: safeJsonParse<string[]>(entry.categories, []),
    tags: safeJsonParse<string[]>(entry.tags, []),
    people: safeJsonParse<string[]>(entry.people, []),
    importance_score: entry.importance_score ?? 3,
    recorded_by: entry.recorded_by,
    location: entry.location,
    latitude: entry.latitude ?? null,
    longitude: entry.longitude ?? null,
    is_favorite: entry.is_favorite === 1,
    photos: attachments
      .filter(a => a.media_type === 'photo')
      .map(a => ({
        id: a.id,
        url: `/uploads/${a.local_path}`,
        filename: a.local_path,
      })),
    audios: attachments
      .filter(a => a.media_type === 'audio')
      .map(a => ({
        id: a.id,
        url: `/uploads/${a.local_path}`,
        filename: a.local_path,
      })),
    videos: attachments
      .filter(a => a.media_type === 'video')
      .map(a => ({
        id: a.id,
        url: `/uploads/${a.local_path}`,
        filename: a.local_path,
      })),
  };
}

export const memoriesApi = router;
