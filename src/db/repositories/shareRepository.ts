import crypto from 'crypto';
import { getDatabase } from '../client';

export interface ShareToken {
  token: string;
  memory_entry_id: number;
  created_at: string;
}

export const shareRepository = {
  findByToken(token: string): ShareToken | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM share_tokens WHERE token = ?');
    return (stmt.get(token) as ShareToken) || null;
  },

  findByMemoryId(memoryId: number): ShareToken | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM share_tokens WHERE memory_entry_id = ?');
    return (stmt.get(memoryId) as ShareToken) || null;
  },

  /**
   * Returns existing token for this memory or creates a new one (idempotent).
   */
  getOrCreate(memoryId: number): ShareToken {
    const existing = this.findByMemoryId(memoryId);
    if (existing) return existing;

    const token = crypto.randomBytes(12).toString('hex'); // 24 hex chars
    const db = getDatabase();
    db.prepare('INSERT INTO share_tokens (token, memory_entry_id) VALUES (?, ?)').run(token, memoryId);
    return this.findByToken(token)!;
  },
};
