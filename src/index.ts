import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { validateEnv, env } from './config/env';
import { telegramWebhook } from './bot/telegramWebhook';
import { memoriesApi } from './api/memoriesApi';
import { authApi } from './api/authApi';
import { getDatabase, closeDatabase } from './db/client';
import { initializeTelegramBot } from './services/telegramSetupService';
import { startReminderScheduler, stopReminderScheduler } from './services/reminderService';
import { fileCleanupService } from './services/fileCleanupService';

let cleanupIntervalId: NodeJS.Timeout | null = null;

// Validate environment variables before anything else
validateEnv();

const app = express();
const PORT = env.PORT;

// CORS für die Web-App (Development + Production)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'https://famories.info',
  'https://www.famories.info',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

// JSON Body Parser für Telegram Webhooks
app.use(express.json());

// Stelle sicher, dass uploads-Verzeichnis existiert
const uploadsDir = path.resolve('./uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Statische Dateien aus uploads/ servieren
app.use('/uploads', express.static(uploadsDir));

// Health Check Endpunkt
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// API Endpunkte
app.use('/api', memoriesApi);
app.use('/api/auth', authApi);

// Telegram Webhook unter /webhook/telegram
app.use('/webhook', telegramWebhook);

// React Frontend aus web/dist servieren
const webDistPath = path.resolve('./web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  // SPA-Fallback: alle nicht-API-Routen an index.html weiterleiten
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// Server starten
const server = app.listen(PORT, async () => {
  // Datenbankverbindung testen
  try {
    getDatabase();
    console.log('Datenbankverbindung hergestellt.');
  } catch (error) {
    console.error('Datenbankfehler:', error);
  }

  // Telegram-Bot einrichten (Befehle, Menü)
  await initializeTelegramBot();

  // Tägliche Erinnerungen starten
  startReminderScheduler();

  // Periodisches Cleanup starten (stündlich)
  cleanupIntervalId = fileCleanupService.startPeriodicCleanup();

  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log(`API: http://localhost:${PORT}/api/memories`);
  console.log(`Telegram Webhook: http://localhost:${PORT}/webhook/telegram`);
});

/**
 * Graceful Shutdown Handler
 */
function gracefulShutdown(signal: string): void {
  console.log(`\n${signal} empfangen. Fahre Server herunter...`);

  server.close(() => {
    console.log('HTTP-Server geschlossen.');

    // Stoppe Scheduler
    stopReminderScheduler();

    // Stoppe Cleanup
    if (cleanupIntervalId) {
      fileCleanupService.stopPeriodicCleanup(cleanupIntervalId);
    }

    // Schließe Datenbankverbindung
    closeDatabase();
    console.log('Datenbankverbindung geschlossen.');

    console.log('Shutdown abgeschlossen.');
    process.exit(0);
  });

  // Force-Exit nach 10 Sekunden
  setTimeout(() => {
    console.error('Shutdown-Timeout erreicht. Erzwinge Beendigung.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
