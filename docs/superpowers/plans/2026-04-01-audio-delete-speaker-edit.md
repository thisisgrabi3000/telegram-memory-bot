# Audio Delete + Speaker Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to delete individual audio recordings and reassign the speaker tag directly from the memory card.

**Architecture:** Two new backend endpoints (`DELETE /api/memories/:id/audios/:audioId` and `PATCH /api/memories/:id/audios/:audioId/speaker`) following the exact pattern of the existing photo delete endpoint. Frontend: `AudioPlayer` gets optional `id`, `onDelete`, and `onUpdateSpeaker` props — a trash icon triggers an inline confirm row, a pencil icon next to the speaker name shows a `<select>` dropdown. The callback chain flows App.tsx → HomeScreen → AudioPlayer.

**Tech Stack:** TypeScript, Express, better-sqlite3, React 18, Lucide icons (Trash2, Pencil already installed)

**Note:** Line numbers in `Find:` blocks are approximate hints — always locate edits using the accompanying code snippet, not the line number alone.

---

## File Map

| File | Change |
|---|---|
| `src/api/validation.ts` | Add `audioParamSchema` + `updateSpeakerSchema` |
| `src/db/repositories/mediaRepository.ts` | Add `updateSpeaker()` method |
| `src/api/memoriesApi.ts` | Import `audioParamSchema`+`updateSpeakerSchema`; add DELETE audio + PATCH speaker endpoints |
| `web/src/api/memoriesApi.ts` | Add `deleteAudio()` + `updateAudioSpeaker()` functions |
| `web/src/App.tsx` | Import new API fns; add handlers; pass new props to `<HomeScreen>` |
| `web/src/components/HomeScreen.tsx` | Add `onDeleteAudio` + `onUpdateAudioSpeaker` to props interface; pass to `<AudioPlayer>` |
| `web/src/components/AudioPlayer.tsx` | Add `id`, `onDelete`, `onUpdateSpeaker` props; add Trash2 + Pencil icons + inline confirm + speaker `<select>` |
| `web/dist/` | Rebuild after all frontend changes |

---

### Task 1: Backend — validation schemas + repository method + API endpoints

**Files:**
- Modify: `src/api/validation.ts` (after line 138, which ends `photoParamSchema`)
- Modify: `src/db/repositories/mediaRepository.ts` (after line 106, which ends `findByVoiceSpeaker`)
- Modify: `src/api/memoriesApi.ts` (imports at lines 10-22; new routes after line 618)

**Context:**
- `photoParamSchema` is at lines 129-138 of `validation.ts` — `audioParamSchema` mirrors it with `audioId` instead of `photoId`
- `MAX_NAME_LENGTH` is already defined in `validation.ts` (used by `audioAttachSchema` at line 95)
- `mediaRepository.deleteById` at line 77 is used by photo delete — same method works for audio
- The DELETE photo route at lines 585-618 is the exact pattern to follow for DELETE audio
- Backend imports `photoParamSchema` from validation at line 17 — add `audioParamSchema` and `updateSpeakerSchema` to the same import block

- [ ] **Step 1: Add `audioParamSchema` and `updateSpeakerSchema` to `src/api/validation.ts`**

Find (line 138-139):
```typescript
});

/**
 * Middleware-Factory für Body-Validierung
 */
export function validateBody
```
Replace with:
```typescript
});

/**
 * Schema für Memory-ID + Audio-ID Parameter
 */
export const audioParamSchema = z.object({
  id: z
    .string()
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0, 'Ungültige ID'),
  audioId: z
    .string()
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0, 'Ungültige Audio-ID'),
});

/**
 * Schema für PATCH /memories/:id/audios/:audioId/speaker
 */
export const updateSpeakerSchema = z.object({
  voice_speaker: z.string().max(MAX_NAME_LENGTH).nullable(),
});

/**
 * Middleware-Factory für Body-Validierung
 */
export function validateBody
```

- [ ] **Step 2: Add `updateSpeaker()` method to `src/db/repositories/mediaRepository.ts`**

Find (line 106-107):
```typescript
    return rows.map(r => r.memory_entry_id);
  },
};
```
Replace with:
```typescript
    return rows.map(r => r.memory_entry_id);
  },

  /**
   * Aktualisiert den Sprecher einer Audio-Aufnahme
   */
  updateSpeaker(id: number, speaker: string | null): boolean {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE media_attachments SET voice_speaker = ? WHERE id = ?');
    const result = stmt.run(speaker, id);
    return result.changes > 0;
  },
};
```

- [ ] **Step 3: Add `audioParamSchema` and `updateSpeakerSchema` to the import block in `src/api/memoriesApi.ts`**

Find (lines 10-22):
```typescript
import {
  createMemorySchema,
  updateMemorySchema,
  updateDateSchema,
  updatePersonSchema,
  memoriesQuerySchema,
  idParamSchema,
  photoParamSchema,
  audioAttachSchema,
  validateBody,
  validateQuery,
  validateParams,
} from './validation';
```
Replace with:
```typescript
import {
  createMemorySchema,
  updateMemorySchema,
  updateDateSchema,
  updatePersonSchema,
  memoriesQuerySchema,
  idParamSchema,
  photoParamSchema,
  audioParamSchema,
  audioAttachSchema,
  updateSpeakerSchema,
  validateBody,
  validateQuery,
  validateParams,
} from './validation';
```

- [ ] **Step 4: Add `DELETE /api/memories/:id/audios/:audioId` endpoint to `src/api/memoriesApi.ts`**

Find (line 618-620):
```typescript
});

/**
 * GET /api/children
```
Replace with:
```typescript
});

/**
 * DELETE /api/memories/:id/audios/:audioId
 * Löscht eine einzelne Audio-Aufnahme aus einer Erinnerung
 */
router.delete('/memories/:id/audios/:audioId', writeLimiter, validateParams(audioParamSchema), (req, res) => {
  try {
    const { id, audioId } = req.params as unknown as { id: number; audioId: number };

    const memory = memoryRepository.findById(id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Erinnerung nicht gefunden' });
    }

    const attachment = mediaRepository.findById(audioId);
    if (!attachment || attachment.memory_entry_id !== id || attachment.media_type !== 'audio') {
      return res.status(404).json({ success: false, error: 'Aufnahme nicht gefunden' });
    }

    // Datei von Disk löschen
    if (attachment.local_path) {
      const filePath = path.resolve('./uploads', attachment.local_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    mediaRepository.deleteById(audioId);

    const attachments = mediaRepository.findByMemoryId(id);
    res.json({
      success: true,
      data: transformMemory(memory, attachments),
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ success: false, error: 'Fehler beim Löschen der Aufnahme' });
  }
});

/**
 * PATCH /api/memories/:id/audios/:audioId/speaker
 * Ändert den Sprecher einer Audio-Aufnahme
 */
router.patch('/memories/:id/audios/:audioId/speaker', writeLimiter, validateParams(audioParamSchema), validateBody(updateSpeakerSchema), (req, res) => {
  try {
    const { id, audioId } = req.params as unknown as { id: number; audioId: number };
    const { voice_speaker } = req.body as { voice_speaker: string | null };

    const memory = memoryRepository.findById(id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Erinnerung nicht gefunden' });
    }

    const attachment = mediaRepository.findById(audioId);
    if (!attachment || attachment.memory_entry_id !== id || attachment.media_type !== 'audio') {
      return res.status(404).json({ success: false, error: 'Aufnahme nicht gefunden' });
    }

    mediaRepository.updateSpeaker(audioId, voice_speaker);

    const attachments = mediaRepository.findByMemoryId(id);
    res.json({
      success: true,
      data: transformMemory(memory, attachments),
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ success: false, error: 'Fehler beim Aktualisieren des Sprechers' });
  }
});

/**
 * GET /api/children
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
git add src/api/validation.ts src/db/repositories/mediaRepository.ts src/api/memoriesApi.ts
git commit -m "feat: add DELETE audio + PATCH speaker endpoints"
```

---

### Task 2: Frontend — web API + App.tsx + HomeScreen + AudioPlayer

**Files:**
- Modify: `web/src/api/memoriesApi.ts` (after `deletePhoto` at line 199)
- Modify: `web/src/App.tsx` (imports at line 3; new handlers after `handleDeletePhoto` at line 100; new props in JSX at lines 308-319)
- Modify: `web/src/components/HomeScreen.tsx` (props interface at lines 18-38; component signature at line 80; AudioPlayer call at lines 1137-1143)
- Modify: `web/src/components/AudioPlayer.tsx` (full rewrite — see complete code in Step 5)

**Context:**
- `deletePhoto` in `web/src/api/memoriesApi.ts` is at lines 182-199 — `deleteAudio` is the exact same pattern
- `handleDeletePhoto` in `web/src/App.tsx` is at lines 97-100 — new handlers follow the same shape
- `<HomeScreen>` JSX at line 316 already has `onDeletePhoto={handleDeletePhoto}` — add two more props after it
- AudioPlayer is rendered at `HomeScreen.tsx` lines 1137-1143 — it currently receives `key`, `url`, `voiceSpeaker`; add `id`, `onDelete`, `onUpdateSpeaker`
- FAMILY_MEMBERS is available in the frontend at `web/src/types/index.ts` — already used in HomeScreen.tsx, CreateMemoryModal.tsx
- `Trash2` and `Pencil` are Lucide icons, already installed in the project (Lucide is used throughout)

- [ ] **Step 1: Add `deleteAudio()` to `web/src/api/memoriesApi.ts`**

Find (line 199-201):
```typescript
  return transformMemoryUrls(json.data);
}

export async function updateMemoryPerson
```
Replace with:
```typescript
  return transformMemoryUrls(json.data);
}

export async function deleteAudio(memoryId: number, audioId: number): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${memoryId}/audios/${audioId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Löschen der Aufnahme');
  }

  return transformMemoryUrls(json.data);
}

export async function updateAudioSpeaker(memoryId: number, audioId: number, speaker: string | null): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${memoryId}/audios/${audioId}/speaker`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ voice_speaker: speaker }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Aktualisieren des Sprechers');
  }

  return transformMemoryUrls(json.data);
}

export async function updateMemoryPerson
```

- [ ] **Step 2: Update `web/src/App.tsx` — imports, handlers, and JSX props**

Find the import line (line 3):
```typescript
import { fetchMemories, updateMemory, updateMemoryDate, updateMemoryPerson, deleteMemory, toggleFavorite, createMemory, uploadPhotos, deletePhoto } from './api/memoriesApi';
```
Replace with:
```typescript
import { fetchMemories, updateMemory, updateMemoryDate, updateMemoryPerson, deleteMemory, toggleFavorite, createMemory, uploadPhotos, deletePhoto, deleteAudio, updateAudioSpeaker } from './api/memoriesApi';
```

Find (lines 97-101):
```typescript
  async function handleDeletePhoto(memoryId: number, photoId: number) {
    const updated = await deletePhoto(memoryId, photoId);
    setMemories(prev => prev.map(m => m.id === memoryId ? updated : m));
  }
```
Replace with:
```typescript
  async function handleDeletePhoto(memoryId: number, photoId: number) {
    const updated = await deletePhoto(memoryId, photoId);
    setMemories(prev => prev.map(m => m.id === memoryId ? updated : m));
  }

  async function handleDeleteAudio(memoryId: number, audioId: number) {
    const updated = await deleteAudio(memoryId, audioId);
    setMemories(prev => prev.map(m => m.id === memoryId ? updated : m));
  }

  async function handleUpdateAudioSpeaker(memoryId: number, audioId: number, speaker: string | null) {
    const updated = await updateAudioSpeaker(memoryId, audioId, speaker);
    setMemories(prev => prev.map(m => m.id === memoryId ? updated : m));
  }
```

Find (the `<HomeScreen>` JSX, lines 316-318):
```tsx
      onDeletePhoto={handleDeletePhoto}
      identity={identity}
      onIdentityReset={handleIdentityReset}
```
Replace with:
```tsx
      onDeletePhoto={handleDeletePhoto}
      onDeleteAudio={handleDeleteAudio}
      onUpdateAudioSpeaker={handleUpdateAudioSpeaker}
      identity={identity}
      onIdentityReset={handleIdentityReset}
```

- [ ] **Step 3: Update `HomeScreenProps` interface in `web/src/components/HomeScreen.tsx`**

Find (line 35-37):
```typescript
  onDeletePhoto?: (memoryId: number, photoId: number) => Promise<void>;
  identity?: string | null;
  onIdentityReset?: () => void;
```
Replace with:
```typescript
  onDeletePhoto?: (memoryId: number, photoId: number) => Promise<void>;
  onDeleteAudio?: (memoryId: number, audioId: number) => Promise<void>;
  onUpdateAudioSpeaker?: (memoryId: number, audioId: number, speaker: string | null) => Promise<void>;
  identity?: string | null;
  onIdentityReset?: () => void;
```

- [ ] **Step 4: Update the `HomeScreen` function signature and AudioPlayer call**

Find (line 80):
```typescript
export function HomeScreen({ memories, onUpdate, onUpdateDate, onUpdatePerson, onDelete, onToggleFavorite, onCreate, onDeletePhoto, identity, onIdentityReset }: HomeScreenProps) {
```
Replace with:
```typescript
export function HomeScreen({ memories, onUpdate, onUpdateDate, onUpdatePerson, onDelete, onToggleFavorite, onCreate, onDeletePhoto, onDeleteAudio, onUpdateAudioSpeaker, identity, onIdentityReset }: HomeScreenProps) {
```

Find the AudioPlayer render block (lines 1137-1143):
```tsx
                {memory.audios.map(audio => (
                  <AudioPlayer
                    key={audio.id}
                    url={audio.url}
                    voiceSpeaker={audio.voice_speaker}
                  />
                ))}
```
Replace with:
```tsx
                {memory.audios.map(audio => (
                  <AudioPlayer
                    key={audio.id}
                    id={audio.id}
                    url={audio.url}
                    voiceSpeaker={audio.voice_speaker}
                    onDelete={onDeleteAudio ? (audioId) => onDeleteAudio(memory.id, audioId) : undefined}
                    onUpdateSpeaker={onUpdateAudioSpeaker ? (audioId, speaker) => onUpdateAudioSpeaker(memory.id, audioId, speaker) : undefined}
                  />
                ))}
```

- [ ] **Step 5: Rewrite `web/src/components/AudioPlayer.tsx`**

Replace the entire file content with:

```tsx
import { useState, useRef, useEffect } from 'react';
import { Play, Pause, AudioLines, Trash2, Pencil } from 'lucide-react';
import { FAMILY_MEMBERS } from '../types';

// Discriminated union: callbacks require id; no callbacks = id omitted
type AudioPlayerProps =
  | {
      url: string;
      voiceSpeaker?: string | null;
      className?: string;
      id: number;
      onDelete?: (id: number) => Promise<void>;
      onUpdateSpeaker?: (id: number, speaker: string | null) => Promise<void>;
    }
  | {
      url: string;
      voiceSpeaker?: string | null;
      className?: string;
      id?: never;
      onDelete?: never;
      onUpdateSpeaker?: never;
    };

// Destructure id as a number — TS guarantees it's present when callbacks are passed
export function AudioPlayer({ url, voiceSpeaker, className, id, onDelete, onUpdateSpeaker }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [speakerEditMode, setSpeakerEditMode] = useState(false);
  const [isSavingSpeaker, setIsSavingSpeaker] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('loadedmetadata', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('loadedmetadata', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  function formatTime(seconds: number): string {
    if (!isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        // Playback blocked or failed — don't update state
      });
    }
  }

  return (
    <div className={className}>
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Speaker row — shown if speaker is set or if edit is possible */}
      {(voiceSpeaker || onUpdateSpeaker) && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span>🎙️</span>
          {speakerEditMode ? (
            <select
              className="text-xs rounded px-1 py-0.5 border"
              style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-sand-200)', backgroundColor: 'white' }}
              defaultValue={voiceSpeaker ?? ''}
              disabled={isSavingSpeaker}
              autoFocus
              onBlur={() => setSpeakerEditMode(false)}
              onChange={async (e) => {
                if (!onUpdateSpeaker || id === undefined) return;
                setIsSavingSpeaker(true);
                try {
                  await onUpdateSpeaker(id, e.target.value || null);
                } finally {
                  setIsSavingSpeaker(false);
                  setSpeakerEditMode(false);
                }
              }}
            >
              <option value="">— kein Sprecher —</option>
              {FAMILY_MEMBERS.map(m => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          ) : (
            <>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {voiceSpeaker ?? '—'}
              </span>
              {onUpdateSpeaker && id !== undefined && (
                <button
                  type="button"
                  onClick={() => setSpeakerEditMode(true)}
                  className="p-0.5 rounded hover:bg-black/5 transition-colors"
                  title="Sprecher bearbeiten"
                >
                  <Pencil className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Player row */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
        style={{ backgroundColor: 'var(--color-sand-50)', border: '1px solid var(--color-sand-200)' }}
      >
        <button
          type="button"
          onClick={togglePlayback}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition-all hover:scale-105 flex-shrink-0"
          style={{ backgroundColor: 'var(--color-terracotta-500)' }}
        >
          {isPlaying
            ? <Pause className="w-4 h-4 text-white" />
            : <Play className="w-4 h-4 text-white" style={{ marginLeft: '2px' }} />
          }
        </button>

        <AudioLines className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-terracotta-400)' }} />

        <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Delete trigger button */}
        {onDelete && id !== undefined && (
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            className="ml-auto p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: 'var(--color-text-muted)' }}
            title="Aufnahme löschen"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Delete confirm row */}
      {deleteConfirm && onDelete && id !== undefined && (
        <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Aufnahme löschen?</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={isDeleting}
              className="text-xs px-2 py-1 rounded-lg"
              style={{ backgroundColor: 'var(--color-sand-100)', color: 'var(--color-text-secondary)' }}
              onClick={() => setDeleteConfirm(false)}
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={isDeleting}
              className="text-xs px-2 py-1 rounded-lg font-semibold"
              style={{ backgroundColor: '#dc2626', color: 'white', opacity: isDeleting ? 0.6 : 1 }}
              onClick={async () => {
                setIsDeleting(true);
                try {
                  await onDelete(id);
                } finally {
                  setIsDeleting(false);
                  setDeleteConfirm(false);
                }
              }}
            >
              {isDeleting ? 'Löschen...' : 'Löschen'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App/web"
npm run build
```

Expected: Exits 0, no errors. (This runs `tsc -b` + vite build.)

- [ ] **Step 7: Commit source + dist**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
git add web/src/api/memoriesApi.ts web/src/App.tsx web/src/components/HomeScreen.tsx web/src/components/AudioPlayer.tsx web/dist/
git commit -m "feat: audio delete + speaker edit in AudioPlayer"
```

---

### Task 3: Smoke test checklist

Start the dev server (`npm run dev` in project root) and open the app:

1. **Audio delete:** Find a memory with an audio recording → click the trash icon on the AudioPlayer → confirm row appears → click "Löschen" → recording disappears, file deleted from disk
2. **Delete cancel:** Repeat → click trash → click "Abbrechen" → confirm row disappears, recording still there
3. **Speaker edit (speaker already set):** Find a memory with a voice recording that has a speaker → click pencil next to the speaker name → `<select>` appears pre-selected with current speaker → change to a different name → speaker updates in UI immediately
4. **Speaker edit (no speaker set):** Find a recording with no speaker → speaker row shows `🎙️ —` with a pencil → click pencil → select a name → speaker appears
5. **Speaker clear:** While editing, select "— kein Sprecher —" → speaker row hides (or shows `—` if `onUpdateSpeaker` is still passed)
6. **Speaker filter:** After reassigning a speaker, switch to the speaker filter bar → the recording now appears under the new speaker

---

## Done

After all tasks:
- Users can delete individual audio recordings without deleting the entire memory
- Users can reassign (or clear) the speaker tag on any recording
- No new npm packages
- No database schema changes (voice_speaker column already exists)
