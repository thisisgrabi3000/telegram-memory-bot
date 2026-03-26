import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';
import { requireAuth } from './authApi';
import { env } from '../config/env';

const router = Router();

// Reuse AI rate limiter: 20 requests per hour
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'AI-Limit erreicht. Bitte in einer Stunde erneut versuchen.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Multer for audio uploads — store temporarily, delete after transcription
const audioUpload = multer({
  storage: multer.diskStorage({
    destination: path.resolve('./uploads'),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.webm';
      cb(null, `voice_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB (Whisper limit)
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('audio/'));
  },
});

router.use(requireAuth);

/**
 * POST /api/transcribe
 * Transcribes an audio file using OpenAI Whisper
 */
router.post('/transcribe', aiLimiter, audioUpload.single('audio'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ success: false, error: 'Keine Audiodatei hochgeladen' });
  }

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(file.path),
      model: 'whisper-1',
      language: 'de',
    });

    // Delete temp file after transcription
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      data: { text: transcription.text },
    });
  } catch (error) {
    // Clean up temp file on error
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    console.error('Transcription error:', error);
    res.status(500).json({
      success: false,
      error: 'Transkription fehlgeschlagen',
    });
  }
});

export const transcribeApi = router;
