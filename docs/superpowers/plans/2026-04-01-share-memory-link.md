# Share Memory via Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users generate a permanent shareable link for any memory that anyone can open without logging in.

**Architecture:** A new `share_tokens` table maps random 24-hex-char tokens to memory IDs. Backend: `POST /api/memories/:id/share` (auth-guarded, idempotent — returns existing token if one exists) creates the token and returns the URL; `GET /api/share/:token` (public, no auth) serves the memory. The share router is mounted BEFORE the `memoriesApi` router so it bypasses `memoriesApi`'s global `requireAuth`. Frontend: `App.tsx` reads `?share=TOKEN` from the URL on first render and short-circuits to `<SharedMemoryView>` before any auth check; a `Share2` icon button on each memory card calls the API and copies the URL to clipboard with a brief checkmark feedback.

**Tech Stack:** TypeScript, Express, better-sqlite3, React 18, Lucide icons (Share2 — new; Check already imported in HomeScreen)

**Note:** Line numbers in `Find:` blocks are approximate hints — always locate edits using the accompanying code snippet.

---

## File Map

| File | Change |
|---|---|
| `src/db/migrations/008_add_share_tokens.ts` | New: create `share_tokens` table |
| `src/db/migrate.ts` | Add migration 008 import + array entry |
| `src/db/repositories/shareRepository.ts` | New: `findByToken`, `findByMemoryId`, `getOrCreate` |
| `src/api/memoriesApi.ts` | Add `export` to `transformMemory` function (line 738) |
| `src/api/shareApi.ts` | New: public GET + auth-guarded POST routes |
| `src/index.ts` | Import shareApi; mount BEFORE memoriesApi |
| `web/src/api/memoriesApi.ts` | Add `fetchSharedMemory()` + `createShareLink()` |
| `web/src/components/SharedMemoryView.tsx` | New: read-only memory view for share recipients |
| `web/src/components/index.ts` | Export SharedMemoryView |
| `web/src/App.tsx` | Check `?share=` before auth; add `handleShare`; pass `onShare` to HomeScreen |
| `web/src/components/HomeScreen.tsx` | Add `onShare` prop; `Share2` import; share button in action bar |
| `web/dist/` | Rebuild |

---

### Task 1: Database migration + share repository

**Files:**
- Create: `src/db/migrations/008_add_share_tokens.ts`
- Modify: `src/db/migrate.ts`
- Create: `src/db/repositories/shareRepository.ts`

**Context:**
- Migration files follow the pattern in `src/db/migrations/007_add_voice_speaker.ts` — export `up(db)` and `down(db)`
- `src/db/migrate.ts` imports each migration and adds it to the `migrations` array (see lines 9 + 33 for the 007 pattern)
- The `shareRepository` follows the same pattern as `src/db/repositories/mediaRepository.ts` — import `getDatabase`, export a const object with methods
- Token: 24 hex chars from `crypto.randomBytes(12).toString('hex')`
- `getOrCreate` must be idempotent — returns existing token if one exists for that memory

- [ ] **Step 1: Create the migration file**

Create `src/db/migrations/008_add_share_tokens.ts`:

```typescript
import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS share_tokens (
      token TEXT PRIMARY KEY,
      memory_entry_id INTEGER NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_share_tokens_memory_entry_id
      ON share_tokens(memory_entry_id);
  `);
}

export function down(db: Database.Database): void {
  db.exec('DROP TABLE IF EXISTS share_tokens;');
}
```

- [ ] **Step 2: Register migration in `src/db/migrate.ts`**

Find (line 9):
```typescript
import * as addVoiceSpeaker from './migrations/007_add_voice_speaker';
```
Replace with:
```typescript
import * as addVoiceSpeaker from './migrations/007_add_voice_speaker';
import * as addShareTokens from './migrations/008_add_share_tokens';
```

Find (line 33):
```typescript
    { name: '007_add_voice_speaker', migration: addVoiceSpeaker },
  ];
```
Replace with:
```typescript
    { name: '007_add_voice_speaker', migration: addVoiceSpeaker },
    { name: '008_add_share_tokens', migration: addShareTokens },
  ];
```

- [ ] **Step 3: Create `src/db/repositories/shareRepository.ts`**

```typescript
import crypto from 'crypto';
import { getDatabase } from '../client';

interface ShareToken {
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
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
git add src/db/migrations/008_add_share_tokens.ts src/db/migrate.ts src/db/repositories/shareRepository.ts
git commit -m "feat: add share_tokens migration and repository"
```

---

### Task 2: Backend share API

**Files:**
- Modify: `src/api/memoriesApi.ts` (line 738 — add `export` to `transformMemory`)
- Create: `src/api/shareApi.ts`
- Modify: `src/index.ts` (lines 9-11 imports; lines 84-86 mounts)

**Context:**
- `transformMemory` is at line 738 of `memoriesApi.ts`: `function transformMemory(...)`. Add `export` keyword.
- `memoriesApi` is exported at line 779: `export const memoriesApi = router;`
- `validateParams` and `idParamSchema` are already imported in `memoriesApi.ts` from `./validation` — use the same import in `shareApi.ts`
- `requireAuth` is imported from `./authApi` in `memoriesApi.ts` — same import in `shareApi.ts`
- In `src/index.ts`, the mount order is critical: `shareApi` MUST be mounted BEFORE `memoriesApi` because `memoriesApi` has `router.use(requireAuth)` which would block the public GET route if shareApi were nested inside it. By mounting as a separate `app.use('/api', shareApi)` BEFORE `app.use('/api', memoriesApi)`, the share routes are handled first.
- The `POST /memories/:id/share` route in shareApi uses its own `requireAuth` middleware — it is NOT protected by memoriesApi's global requireAuth.

- [ ] **Step 1: Export `transformMemory` from `src/api/memoriesApi.ts`**

Find (line 738):
```typescript
function transformMemory(entry: MemoryEntry, attachments: MediaAttachment[]) {
```
Replace with:
```typescript
export function transformMemory(entry: MemoryEntry, attachments: MediaAttachment[]) {
```

- [ ] **Step 2: Create `src/api/shareApi.ts`**

```typescript
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
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({ success: true, data: { url: `${baseUrl}/?share=${share.token}` } });
  } catch (error) {
    console.error('Share API Error:', error);
    res.status(500).json({ success: false, error: 'Fehler beim Erstellen des Links' });
  }
});

export { router as shareApi };
```

- [ ] **Step 3: Mount shareApi in `src/index.ts`**

Find (line 9-11):
```typescript
import { memoriesApi } from './api/memoriesApi';
import { authApi } from './api/authApi';
import { transcribeApi } from './api/transcribeApi';
```
Replace with:
```typescript
import { memoriesApi } from './api/memoriesApi';
import { authApi } from './api/authApi';
import { transcribeApi } from './api/transcribeApi';
import { shareApi } from './api/shareApi';
```

Find (lines 84-86):
```typescript
app.use('/api/auth', authApi);
app.use('/api', memoriesApi);
app.use('/api', transcribeApi);
```
Replace with:
```typescript
app.use('/api/auth', authApi);
app.use('/api', shareApi);
app.use('/api', memoriesApi);
app.use('/api', transcribeApi);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
git add src/api/memoriesApi.ts src/api/shareApi.ts src/index.ts
git commit -m "feat: add share API — public GET /share/:token + POST /memories/:id/share"
```

---

### Task 3: Frontend — API functions + SharedMemoryView + App + HomeScreen + build

**Files:**
- Modify: `web/src/api/memoriesApi.ts` (append after line 349)
- Create: `web/src/components/SharedMemoryView.tsx`
- Modify: `web/src/components/index.ts` (add export)
- Modify: `web/src/App.tsx` (import; shareToken check; handleShare; onShare prop)
- Modify: `web/src/components/HomeScreen.tsx` (onShare prop; Share2 import; share button)

**Context:**
- `web/src/api/memoriesApi.ts` ends at line 349 with `}` (end of `attachAudio` function) — append new functions after it
- `fetchSharedMemory` calls `GET /api/share/:token` with NO `credentials: 'include'` (it's public)
- `createShareLink` calls `POST /api/memories/:id/share` WITH `credentials: 'include'` (auth required)
- `App.tsx` currently renders: `if (checkingAuth) → loading` at line ~134. The `shareToken` check must come BEFORE that — a share URL should show the memory without any auth flow.
- `HomeScreen.tsx` action buttons are at lines 1099-1121. The condition is `(onUpdate || onDelete)` — change to `(onUpdate || onDelete || onShare)` and add the share button inside the `<div>`. `Share2` must be added to the lucide import line (line 6).
- `copiedId` state tracks which memory's share button recently fired — shows `Check` for 2 seconds then reverts to `Share2`.
- `date-fns` and `de` locale are already installed (used in HomeScreen).

- [ ] **Step 1: Add `fetchSharedMemory` and `createShareLink` to `web/src/api/memoriesApi.ts`**

Find (end of file, line 349):
```typescript
  return transformMemoryUrls(json.data);
}
```
Replace with:
```typescript
  return transformMemoryUrls(json.data);
}

export async function fetchSharedMemory(token: string): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/share/${token}`);

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Laden der Erinnerung');
  }

  return transformMemoryUrls(json.data);
}

export async function createShareLink(memoryId: number): Promise<{ url: string }> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${memoryId}/share`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<{ url: string }> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Erstellen des Links');
  }

  return json.data;
}
```

- [ ] **Step 2: Create `web/src/components/SharedMemoryView.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { Calendar, MapPin, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Memory } from '../types';
import { fetchSharedMemory } from '../api/memoriesApi';
import { AudioPlayer } from './AudioPlayer';

interface SharedMemoryViewProps {
  token: string;
}

export function SharedMemoryView({ token }: SharedMemoryViewProps) {
  const [memory, setMemory] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetchSharedMemory(token)
      .then(setMemory)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Laden...</p>
      </div>
    );
  }

  if (notFound || !memory) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 p-6"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        <p className="text-3xl">🔗</p>
        <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Erinnerung nicht gefunden
        </p>
        <p className="text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
          Dieser Link ist ungültig oder die Erinnerung wurde gelöscht.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className="text-2xl font-bold gradient-text"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Famories
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Eine geteilte Erinnerung
          </p>
        </div>

        {/* Memory card */}
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {/* Date + person + location */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{format(parseISO(memory.source_date), 'd. MMMM yyyy', { locale: de })}</span>
            {memory.child_name && (
              <>
                <span>·</span>
                <span>{memory.child_name}</span>
              </>
            )}
            {memory.location && (
              <>
                <span>·</span>
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{memory.location}</span>
              </>
            )}
          </div>

          {/* Summary */}
          {memory.cleaned_summary && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {memory.cleaned_summary}
            </p>
          )}

          {/* Photos */}
          {memory.photos.length > 0 && (
            <div className={`grid gap-2 ${memory.photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {memory.photos.map(photo => (
                <img
                  key={photo.id}
                  src={photo.url}
                  alt=""
                  className="w-full rounded-xl object-cover"
                  style={{ maxHeight: '300px' }}
                />
              ))}
            </div>
          )}

          {/* Audio */}
          {memory.audios.length > 0 && (
            <div className="space-y-2">
              {memory.audios.map(audio => (
                <AudioPlayer
                  key={audio.id}
                  url={audio.url}
                  voiceSpeaker={audio.voice_speaker}
                />
              ))}
            </div>
          )}

          {/* People */}
          {memory.people.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
              {memory.people.map(person => (
                <span
                  key={person}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-sand-100)', color: 'var(--color-text-muted)' }}
                >
                  {person}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-6" style={{ color: 'var(--color-text-light)' }}>
          Geteilt über Famories
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Export SharedMemoryView from `web/src/components/index.ts`**

Find (end of file):
```typescript
export { AudioPlayer } from './AudioPlayer';
```
Replace with:
```typescript
export { AudioPlayer } from './AudioPlayer';
export { SharedMemoryView } from './SharedMemoryView';
```

- [ ] **Step 4: Update `web/src/App.tsx`**

Add imports — find (line 2):
```typescript
import { HomeScreen, LoginScreen, IdentityPicker } from './components';
import { fetchMemories, updateMemory, updateMemoryDate, updateMemoryPerson, deleteMemory, toggleFavorite, createMemory, uploadPhotos, deletePhoto, deleteAudio, updateAudioSpeaker } from './api/memoriesApi';
```
Replace with:
```typescript
import { HomeScreen, LoginScreen, IdentityPicker, SharedMemoryView } from './components';
import { fetchMemories, updateMemory, updateMemoryDate, updateMemoryPerson, deleteMemory, toggleFavorite, createMemory, uploadPhotos, deletePhoto, deleteAudio, updateAudioSpeaker, createShareLink } from './api/memoriesApi';
```

Add `handleShare` handler — find (lines 107-110):
```typescript
  async function handleUpdateAudioSpeaker(memoryId: number, audioId: number, speaker: string | null) {
    const updated = await updateAudioSpeaker(memoryId, audioId, speaker);
    setMemories(prev => prev.map(m => m.id === memoryId ? updated : m));
  }
```
Replace with:
```typescript
  async function handleUpdateAudioSpeaker(memoryId: number, audioId: number, speaker: string | null) {
    const updated = await updateAudioSpeaker(memoryId, audioId, speaker);
    setMemories(prev => prev.map(m => m.id === memoryId ? updated : m));
  }

  async function handleShare(memoryId: number) {
    const { url } = await createShareLink(memoryId);
    await navigator.clipboard.writeText(url);
  }
```

Add shareToken check and `onShare` prop — find (the beginning of the render section, right before `if (checkingAuth)`):
```typescript
  // Checking authentication - Premium loading state
  if (checkingAuth) {
```
Replace with:
```typescript
  // Public share view — show without auth
  const shareToken = new URLSearchParams(window.location.search).get('share');
  if (shareToken) {
    return <SharedMemoryView token={shareToken} />;
  }

  // Checking authentication - Premium loading state
  if (checkingAuth) {
```

Add `onShare` to the `<HomeScreen>` JSX — find:
```tsx
      onDeleteAudio={handleDeleteAudio}
      onUpdateAudioSpeaker={handleUpdateAudioSpeaker}
      identity={identity}
```
Replace with:
```tsx
      onDeleteAudio={handleDeleteAudio}
      onUpdateAudioSpeaker={handleUpdateAudioSpeaker}
      onShare={handleShare}
      identity={identity}
```

- [ ] **Step 5: Update `web/src/components/HomeScreen.tsx`**

Add `Share2` to lucide imports — find (lines 5-10):
```typescript
import {
  ChevronDown, ChevronLeft, ChevronRight, X, Calendar, User, MessageCircle, Image as ImageIcon,
  Pencil, Check, Trash2, Search, MapPin, Star, Plus, Mic, Heart,
  Sparkles, SlidersHorizontal, Camera, Settings, HelpCircle,
  Type, Contrast, Link2, Map, List, Clock, AudioLines
} from 'lucide-react';
```
Replace with:
```typescript
import {
  ChevronDown, ChevronLeft, ChevronRight, X, Calendar, User, MessageCircle, Image as ImageIcon,
  Pencil, Check, Trash2, Search, MapPin, Star, Plus, Mic, Heart,
  Sparkles, SlidersHorizontal, Camera, Settings, HelpCircle,
  Type, Contrast, Link2, Map, List, Clock, AudioLines, Share2
} from 'lucide-react';
```

Add `onShare` to `HomeScreenProps` interface — find (lines 35-38):
```typescript
  onDeleteAudio?: (memoryId: number, audioId: number) => Promise<void>;
  onUpdateAudioSpeaker?: (memoryId: number, audioId: number, speaker: string | null) => Promise<void>;
  identity?: string | null;
  onIdentityReset?: () => void;
```
Replace with:
```typescript
  onDeleteAudio?: (memoryId: number, audioId: number) => Promise<void>;
  onUpdateAudioSpeaker?: (memoryId: number, audioId: number, speaker: string | null) => Promise<void>;
  onShare?: (memoryId: number) => Promise<void>;
  identity?: string | null;
  onIdentityReset?: () => void;
```

Add `onShare` and `copiedId` state to function body — find (line 80):
```typescript
export function HomeScreen({ memories, onUpdate, onUpdateDate, onUpdatePerson, onDelete, onToggleFavorite, onCreate, onDeletePhoto, onDeleteAudio, onUpdateAudioSpeaker, identity, onIdentityReset }: HomeScreenProps) {
```
Replace with:
```typescript
export function HomeScreen({ memories, onUpdate, onUpdateDate, onUpdatePerson, onDelete, onToggleFavorite, onCreate, onDeletePhoto, onDeleteAudio, onUpdateAudioSpeaker, onShare, identity, onIdentityReset }: HomeScreenProps) {
```

Add `copiedId` state — find (line 97):
```typescript
  const [visibleImages, setVisibleImages] = useState(24);
```
Replace with:
```typescript
  const [visibleImages, setVisibleImages] = useState(24);
  const [copiedId, setCopiedId] = useState<number | null>(null);
```

Add share button to the action buttons block — find (lines 1099-1121):
```tsx
                          {/* Action Buttons */}
                          {(onUpdate || onDelete) && !isEditing && !isDeleteConfirm && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              {onUpdate && (
                                <button
                                  onClick={() => handleStartEdit(memory)}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-all hover:bg-white/80 hover:scale-110"
                                  title="Bearbeiten"
                                >
                                  <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                                </button>
                              )}
                              {onDelete && (
                                <button
                                  onClick={() => setDeleteConfirmId(memory.id)}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-all hover:bg-red-50 hover:scale-110"
                                  title="Löschen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" style={{ color: '#dc2626' }} />
                                </button>
                              )}
                            </div>
                          )}
```
Replace with:
```tsx
                          {/* Action Buttons */}
                          {(onUpdate || onDelete || onShare) && !isEditing && !isDeleteConfirm && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              {onShare && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await onShare(memory.id);
                                    setCopiedId(memory.id);
                                    setTimeout(() => setCopiedId(prev => prev === memory.id ? null : prev), 2000);
                                  }}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-all hover:bg-white/80 hover:scale-110"
                                  title="Link teilen"
                                >
                                  {copiedId === memory.id
                                    ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-sage-500)' }} />
                                    : <Share2 className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                                  }
                                </button>
                              )}
                              {onUpdate && (
                                <button
                                  onClick={() => handleStartEdit(memory)}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-all hover:bg-white/80 hover:scale-110"
                                  title="Bearbeiten"
                                >
                                  <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                                </button>
                              )}
                              {onDelete && (
                                <button
                                  onClick={() => setDeleteConfirmId(memory.id)}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-all hover:bg-red-50 hover:scale-110"
                                  title="Löschen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" style={{ color: '#dc2626' }} />
                                </button>
                              )}
                            </div>
                          )}
```

- [ ] **Step 6: Build frontend**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App/web"
npm run build
```

Expected: Exits 0, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
git add web/src/api/memoriesApi.ts web/src/components/SharedMemoryView.tsx web/src/components/index.ts web/src/App.tsx web/src/components/HomeScreen.tsx web/dist/
git commit -m "feat: share memory via link — SharedMemoryView + share button"
```

---

### Task 4: Smoke test checklist

Start the server (`npm run dev` in project root) and open the app:

1. **Generate link:** Hover over a memory card → share icon appears → click it → icon briefly shows a checkmark → link is in clipboard (check with paste)
2. **Link format:** Pasted URL should look like `http://localhost:3000/?share=<24-hex-chars>`
3. **Open link in incognito:** Paste the link in an incognito window (no session) → memory loads without login prompt → shows date, summary, photos, audio
4. **Invalid token:** Open `/?share=abc123` (too short / invalid) → "Erinnerung nicht gefunden" error screen
5. **Idempotent:** Click the share button again on the same memory → clipboard gets the same URL as before
6. **Delete cascade:** Delete a memory → open its share link → shows "nicht gefunden" (ON DELETE CASCADE handles cleanup)

---

## Done

After all tasks:
- Any family member can share a memory with a single tap and paste the URL in WhatsApp/iMessage
- Recipients see the memory (text, photos, audio) without needing to log in
- Tokens are permanent and reusable — sharing the same memory always gives the same link
- ON DELETE CASCADE in the DB ensures deleted memories clean up their tokens automatically
