import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

/**
 * Zod Schemas für API-Validierung
 */

// Maximale Längen
const MAX_TEXT_LENGTH = 10000;
const MAX_SEARCH_LENGTH = 200;
const MAX_NAME_LENGTH = 100;

// Datum im Format YYYY-MM-DD
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datumsformat (YYYY-MM-DD)');

/**
 * Schema für POST /memories
 */
export const createMemorySchema = z.object({
  text: z
    .string()
    .min(1, 'Text darf nicht leer sein')
    .max(MAX_TEXT_LENGTH, `Text darf maximal ${MAX_TEXT_LENGTH} Zeichen haben`),
  child_name: z
    .string()
    .max(MAX_NAME_LENGTH)
    .optional()
    .nullable(),
  location: z
    .string()
    .max(200)
    .optional()
    .nullable(),
  source_date: dateSchema.optional(),
  people: z
    .array(z.string().max(MAX_NAME_LENGTH))
    .max(20)
    .optional(),
});

/**
 * Schema für PUT /memories/:id
 */
export const updateMemorySchema = z.object({
  cleaned_summary: z
    .string()
    .min(1, 'Text darf nicht leer sein')
    .max(MAX_TEXT_LENGTH, `Text darf maximal ${MAX_TEXT_LENGTH} Zeichen haben`),
});

/**
 * Schema für POST /memories/:id/favorite
 */
export const favoriteSchema = z.object({
  is_favorite: z.boolean(),
});

/**
 * Schema für GET /memories Query-Parameter
 */
export const memoriesQuerySchema = z.object({
  child: z.string().max(MAX_NAME_LENGTH).optional(),
  category: z.string().max(MAX_NAME_LENGTH).optional(),
  location: z.string().max(MAX_NAME_LENGTH).optional(),
  favorites: z.enum(['true', 'false']).optional(),
  search: z.string().max(MAX_SEARCH_LENGTH, `Suche darf maximal ${MAX_SEARCH_LENGTH} Zeichen haben`).optional(),
  limit: z
    .string()
    .optional()
    .transform(val => {
      const num = parseInt(val || '100', 10);
      return Math.min(Math.max(1, num), 1000); // Clamp zwischen 1 und 1000
    }),
});

/**
 * Schema für ID-Parameter
 */
export const idParamSchema = z.object({
  id: z
    .string()
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0, 'Ungültige ID'),
});

/**
 * Middleware-Factory für Body-Validierung
 */
export function validateBody<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.errors.map(e => e.message).join(', ');
      return res.status(400).json({
        success: false,
        error: errors,
      });
    }

    req.body = result.data;
    next();
  };
}

/**
 * Middleware-Factory für Query-Validierung
 */
export function validateQuery<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = result.error.errors.map(e => e.message).join(', ');
      return res.status(400).json({
        success: false,
        error: errors,
      });
    }

    req.query = result.data as typeof req.query;
    next();
  };
}

/**
 * Middleware-Factory für Params-Validierung
 */
export function validateParams<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const errors = result.error.errors.map(e => e.message).join(', ');
      return res.status(400).json({
        success: false,
        error: errors,
      });
    }

    req.params = result.data;
    next();
  };
}
