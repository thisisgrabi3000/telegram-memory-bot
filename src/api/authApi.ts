import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

declare module 'express-session' {
  interface SessionData {
    authenticated: boolean;
  }
}

const router = Router();

/**
 * Middleware: Checks if session is authenticated.
 * If no WEB_PASSWORD is configured, all requests pass through.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!env.WEB_PASSWORD) {
    return next();
  }

  if (req.session.authenticated) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Authentifizierung erforderlich',
  });
}

/**
 * POST /api/auth/login
 * Validates password and creates a session
 */
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!env.WEB_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ success: true, message: 'Kein Passwort erforderlich' });
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Passwort erforderlich' });
  }

  if (password !== env.WEB_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Falsches Passwort' });
  }

  req.session.authenticated = true;
  return res.json({ success: true, message: 'Login erfolgreich' });
});

/**
 * POST /api/auth/logout
 * Destroys the session
 */
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/**
 * GET /api/auth/status
 * Returns if password protection is enabled and if current session is authenticated
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    passwordRequired: !!env.WEB_PASSWORD,
    authenticated: !!req.session.authenticated,
  });
});

export const authApi = router;
