/**
 * Environment variable validation and access.
 * Fails fast on startup if required variables are missing.
 */

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvOptional(key: string): string | undefined {
  return process.env[key];
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
  }
  return parsed;
}

/**
 * Validated environment configuration.
 * Access these instead of process.env directly.
 */
export const env = {
  // Telegram
  TELEGRAM_BOT_TOKEN: getEnv('TELEGRAM_BOT_TOKEN'),

  // OpenAI
  OPENAI_API_KEY: getEnv('OPENAI_API_KEY'),

  // Server
  PORT: getEnvNumber('PORT', 3000),
  NODE_ENV: getEnv('NODE_ENV', 'development'),

  // Database
  DATABASE_PATH: getEnv('DATABASE_PATH', './data/memory.db'),

  // Web Password Protection (optional - if not set, no password required)
  WEB_PASSWORD: getEnvOptional('WEB_PASSWORD'),

  // Session secret for express-session
  SESSION_SECRET: getEnv('SESSION_SECRET', 'famories-session-secret-change-in-prod'),

  // Webhook URL for Telegram
  WEBHOOK_URL: getEnvOptional('WEBHOOK_URL'),

  // Optional
  GEMINI_API_KEY: getEnvOptional('GEMINI_API_KEY'),
};

/**
 * Validate all required environment variables.
 * Call this on startup before initializing services.
 */
export function validateEnv(): void {
  const required = [
    'TELEGRAM_BOT_TOKEN',
    'OPENAI_API_KEY',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nCreate a .env file with these variables or set them in your environment.');
    process.exit(1);
  }

  console.log('✅ Environment variables validated');
}
