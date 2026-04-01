import { Router } from 'express';
import { requireAuth } from './authApi';
import { validateParams, idParamSchema } from './validation';
import { shareRepository } from '../db/repositories/shareRepository';
import { memoryRepository } from '../db/repositories/memoryRepository';
import { mediaRepository } from '../db/repositories/mediaRepository';
import { transformMemory } from './memoriesApi';

const router = Router();

/**
 * GET /api/share/:token
 * Public — returns memory data for a valid share token (no auth required)
 */
router.get('/share/:token', (req, res) => {
  try {
    const { token } = req.params;
    if (!/^[a-f0-9]{24}$/.test(token)) {
      return res.status(404).json({ success: false, error: 'Link nicht gefunden' });
    }
    const share = shareRepository.findByToken(token);
    if (!share) {
      return res.status(404).json({ success: false, error: 'Link nicht gefunden' });
    }
    const memory = memoryRepository.findById(share.memory_entry_id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Erinnerung nicht gefunden' });
    }
    const attachments = mediaRepository.findByMemoryId(share.memory_entry_id);
    res.json({ success: true, data: transformMemory(memory, attachments) });
  } catch (error) {
    console.error('Share API Error:', error);
    res.status(500).json({ success: false, error: 'Fehler beim Laden der Erinnerung' });
  }
});

/**
 * POST /api/memories/:id/share
 * Protected — creates or returns a share token for the given memory
 */
router.post('/memories/:id/share', requireAuth, validateParams(idParamSchema), (req, res) => {
  try {
    const { id } = req.params as unknown as { id: number };
    const memory = memoryRepository.findById(id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Erinnerung nicht gefunden' });
    }
    const share = shareRepository.getOrCreate(id);
    const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ success: true, data: { url: `${baseUrl}/?share=${share.token}` } });
  } catch (error) {
    console.error('Share API Error:', error);
    res.status(500).json({ success: false, error: 'Fehler beim Erstellen des Links' });
  }
});

export { router as shareApi };
