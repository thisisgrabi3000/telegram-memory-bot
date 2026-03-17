import 'dotenv/config';
import express from 'express';
import { telegramWebhook } from './bot/telegramWebhook';
import { getDatabase } from './db/client';

const app = express();
const PORT = process.env.PORT || 3000;

// JSON Body Parser für Telegram Webhooks
app.use(express.json());

// Health Check Endpunkt
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Telegram Webhook unter /webhook/telegram
app.use('/webhook', telegramWebhook);

// Server starten
app.listen(PORT, () => {
  // Datenbankverbindung testen
  try {
    getDatabase();
    console.log('Datenbankverbindung hergestellt.');
  } catch (error) {
    console.error('Datenbankfehler:', error);
  }

  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log(`Telegram Webhook: http://localhost:${PORT}/webhook/telegram`);
});
