import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';

const router = Router();

/**
 * Generate a simple token from password
 */
function generateToken(password: string): string {
  return crypto.createHash('sha256').update(password + 'famories-salt').digest('hex');
}

/**
 * POST /api/auth/login
 * Validates password and returns a token
 */
router.post('/login', (req, res) => {
  const { password } = req.body;

  // If no password configured, always allow
  if (!env.WEB_PASSWORD) {
    return res.json({
      success: true,
      token: 'no-auth-required',
      message: 'Keine Passwort-Authentifizierung konfiguriert',
    });
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Passwort erforderlich',
    });
  }

  if (password === env.WEB_PASSWORD) {
    const token = generateToken(password);
    return res.json({
      success: true,
      token,
      message: 'Login erfolgreich',
    });
  }

  return res.status(401).json({
    success: false,
    error: 'Falsches Passwort',
  });
});

/**
 * POST /api/auth/verify
 * Verifies if a token is valid
 */
router.post('/verify', (req, res) => {
  const { token } = req.body;

  // If no password configured, always valid
  if (!env.WEB_PASSWORD) {
    return res.json({
      success: true,
      valid: true,
    });
  }

  if (!token || typeof token !== 'string') {
    return res.json({
      success: true,
      valid: false,
    });
  }

  const expectedToken = generateToken(env.WEB_PASSWORD);
  const isValid = token === expectedToken;

  return res.json({
    success: true,
    valid: isValid,
  });
});

/**
 * GET /api/auth/status
 * Returns if password protection is enabled
 */
router.get('/status', (_req, res) => {
  res.json({
    success: true,
    passwordRequired: !!env.WEB_PASSWORD,
  });
});

export const authApi = router;
