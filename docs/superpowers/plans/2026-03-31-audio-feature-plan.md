# Audio Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to upload existing audio files or save browser voice recordings alongside transcriptions, tag who is speaking, and play recordings back from memory cards with speaker-based filtering.

**Architecture:** Backend gains a DB migration (`voice_speaker` column), an updated transcribe endpoint (`saveFile` flag), and a new `POST /api/memories/:id/audio` endpoint. Frontend gains an `AudioPlayer` component, audio upload + speaker picker in `CreateMemoryModal`, a save-audio toggle in `VoiceRecorder`, and speaker filter chips in `HomeScreen`.

**Tech Stack:** Express, Multer, OpenAI Whisper, better-sqlite3, Zod, React 19, TypeScript, Tailwind CSS, Lucide icons, HTML5 `<audio>` API.

---

## File Map

**Created:**
- `src/db/migrations/007_add_voice_speaker.ts` — ALTER TABLE migration
- `web/src/components/AudioPlayer.tsx` — new playback component

**Modified:**
- `src/types/index.ts` — add `voice_speaker` to `MediaAttachment`
- `src/db/repositories/mediaRepository.ts` — `create()` + `findByVoiceSpeaker()`
- `src/api/transcribeApi.ts` — `saveFile` flag
- `src/api/validation.ts` — `audioAttachSchema`
- `src/api/memoriesApi.ts` — `POST /api/memories/:id/audio`, `transformMemory()`
- `src/services/fileCleanupService.ts` — `filePattern` param + `uploads/` cleanup
- `web/src/types/index.ts` — `Audio.voice_speaker`
- `web/src/api/memoriesApi.ts` — `transcribeAudio()` return type + `attachAudio()`
- `web/src/App.tsx` — `handleCreate` returns `Memory`
- `web/src/components/VoiceRecorder.tsx` — save-audio toggle
- `web/src/components/CreateMemoryModal.tsx` — audio upload, speaker picker, submit handler, `onCreate` type
- `web/src/components/HomeScreen.tsx` — `AudioPlayer`, speaker filter, `onCreate` type
- `web/src/components/index.ts` — export `AudioPlayer`

---

## Task 1: DB Migration — add voice_speaker column

**Files:**
- Create: `src/db/migrations/007_add_voice_speaker.ts`

- [ ] **Step 1: Create migration file**

```ts
// src/db/migrations/007_add_voice_speaker.ts
import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE media_attachments ADD COLUMN voice_speaker TEXT NULL;`);
}

export function down(db: Database.Database): void {
  // SQLite does not support DROP COLUMN — migration is irreversible
  void db;
}
```

- [ ] **Step 2: Register migration in migrate.ts**

In `src/db/migrate.ts`, add the import after line 8 (after the `addCoordinates` import):

```ts
import * as addVoiceSpeaker from './migrations/007_add_voice_speaker';
```

Then in the `migrations` array (around line 31), add after the `'006_add_coordinates'` entry:

```ts
{ name: '007_add_voice_speaker', migration: addVoiceSpeaker },
```

- [ ] **Step 3: Verify server starts and migration runs**

```bash
npm run dev
```

Expected: server starts without errors, console shows migration 007 applied (check that the migration runner logs it).

- [ ] **Step 4: Verify column exists**

```bash
npx tsx -e "import {getDatabase} from './src/db/client'; const db = getDatabase(); console.log(db.pragma('table_info(media_attachments)'));"
```

Expected: output includes a row with `name: 'voice_speaker'`.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/007_add_voice_speaker.ts src/db/migrate.ts
git commit -m "feat: migration 007 — add voice_speaker to media_attachments"
```

---

## Task 2: Backend types + mediaRepository

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/db/repositories/mediaRepository.ts`

- [ ] **Step 1: Add voice_speaker to MediaAttachment interface**

In `src/types/index.ts`, find the `MediaAttachment` interface and add the field:

```ts
export interface MediaAttachment {
  id: number;
  memory_entry_id: number;
  media_type: 'photo' | 'audio' | 'video';
  telegram_file_id: string;
  local_path: string | null;
  created_at: string;
  voice_speaker: string | null;  // ← add this line
}
```

- [ ] **Step 2: Update mediaRepository.create() to accept voice_speaker**

In `src/db/repositories/mediaRepository.ts`, replace the existing `create()` method:

```ts
create(attachment: {
  memory_entry_id: number;
  media_type: 'photo' | 'audio' | 'video';
  telegram_file_id: string;
  local_path: string;
  voice_speaker?: string | null;
}): MediaAttachment {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO media_attachments (memory_entry_id, media_type, telegram_file_id, local_path, voice_speaker)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    attachment.memory_entry_id,
    attachment.media_type,
    attachment.telegram_file_id,
    attachment.local_path,
    attachment.voice_speaker ?? null
  );

  return this.findById(result.lastInsertRowid as number)!;
},
```

- [ ] **Step 3: Add findByVoiceSpeaker() method**

Add after `deleteByMemoryId`:

```ts
findByVoiceSpeaker(speaker: string): number[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT DISTINCT memory_entry_id
    FROM media_attachments
    WHERE media_type = 'audio' AND voice_speaker = ?
  `);
  const rows = stmt.all(speaker) as Array<{ memory_entry_id: number }>;
  return rows.map(r => r.memory_entry_id);
},
```

- [ ] **Step 4: Build backend to verify no TypeScript errors**

```bash
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/db/repositories/mediaRepository.ts
git commit -m "feat: add voice_speaker to MediaAttachment type and mediaRepository"
```

---

## Task 3: transcribeApi — saveFile flag

**Files:**
- Modify: `src/api/transcribeApi.ts`

The endpoint currently always deletes the file after transcription. We add an optional `saveFile` form field. When `saveFile=true`, keep the file and return its filename.

- [ ] **Step 1: Update the POST /transcribe handler**

Replace the handler body in `src/api/transcribeApi.ts` (lines 42–74):

```ts
router.post('/transcribe', aiLimiter, audioUpload.single('audio'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ success: false, error: 'Keine Audiodatei hochgeladen' });
  }

  const saveFile = req.body.saveFile === 'true';

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(file.path),
      model: 'whisper-1',
      language: 'de',
    });

    if (!saveFile) {
      fs.unlinkSync(file.path);
    }

    const responseData: { text: string; savedFilename?: string } = {
      text: transcription.text,
    };

    if (saveFile) {
      responseData.savedFilename = file.filename;
    }

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    // Clean up file on error regardless of saveFile flag
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    console.error('Transcription error:', error);
    res.status(500).json({
      success: false,
      error: 'Transkription fehlgeschlagen',
    });
  }
});
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/transcribeApi.ts
git commit -m "feat: add saveFile flag to POST /api/transcribe"
```

---

## Task 4: validation.ts — audioAttachSchema

**Files:**
- Modify: `src/api/validation.ts`

- [ ] **Step 1: Add audioAttachSchema**

Add at the end of `src/api/validation.ts`, before the middleware factories:

```ts
/**
 * Schema für POST /memories/:id/audio
 */
export const audioAttachSchema = z.object({
  filename: z.string().regex(
    /^voice_\d+_[a-z0-9]+\.[a-z0-9]+$/i,
    'Ungültiger Dateiname'
  ),
  voice_speaker: z.string().max(MAX_NAME_LENGTH).optional().nullable(),
});
```

- [ ] **Step 2: Build to verify**

```bash
npm run build 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/validation.ts
git commit -m "feat: add audioAttachSchema to validation"
```

---

## Task 5: memoriesApi — POST /audio endpoint + transformMemory

**Files:**
- Modify: `src/api/memoriesApi.ts`

- [ ] **Step 1: Import audioAttachSchema**

In `src/api/memoriesApi.ts`, find the import from `./validation` and add `audioAttachSchema`:

```ts
import {
  createMemorySchema,
  updateMemorySchema,
  updateDateSchema,
  updatePersonSchema,
  memoriesQuerySchema,
  idParamSchema,
  photoParamSchema,
  audioAttachSchema,          // ← add
  validateBody,
  validateQuery,
  validateParams,
} from './validation';
```

- [ ] **Step 2: Add the POST /memories/:id/audio route**

Add this route immediately after the closing brace of the `router.post('/memories/:id/photos', ...)` handler. Search for `router.delete('/memories/:id/photos/:photoId'` to locate the exact insertion point — insert the new route **before** that DELETE route:

```ts
/**
 * POST /api/memories/:id/audio
 * Attaches a previously saved audio file to a memory entry
 */
router.post('/memories/:id/audio', writeLimiter, validateParams(idParamSchema), validateBody(audioAttachSchema), (req, res) => {
  try {
    const { id } = req.params as unknown as { id: number };
    const { filename, voice_speaker } = req.body as { filename: string; voice_speaker?: string | null };

    const memory = memoryRepository.findById(id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Erinnerung nicht gefunden' });
    }

    // Verify file exists (prevents path traversal; regex already blocks '..')
    const filePath = path.resolve('./uploads', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ success: false, error: 'Audiodatei nicht gefunden' });
    }

    mediaRepository.create({
      memory_entry_id: id,
      media_type: 'audio',
      telegram_file_id: `web_${filename}`,
      local_path: filename,
      voice_speaker: voice_speaker ?? null,
    });

    const attachments = mediaRepository.findByMemoryId(id);
    const updatedMemory = memoryRepository.findById(id);

    res.json({
      success: true,
      data: transformMemory(updatedMemory!, attachments),
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ success: false, error: 'Fehler beim Anhängen der Audiodatei' });
  }
});
```

- [ ] **Step 3: Update transformMemory() to include voice_speaker**

In `transformMemory()`, find the `audios` mapping and update it:

```ts
audios: attachments
  .filter(a => a.media_type === 'audio')
  .map(a => ({
    id: a.id,
    url: `/uploads/${a.local_path}`,
    filename: a.local_path,
    voice_speaker: a.voice_speaker ?? null,
  })),
```

- [ ] **Step 4: Build to verify**

```bash
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
# In another terminal:
curl -s -b 'your-session-cookie' -X POST http://localhost:3000/api/transcribe \
  -F "audio=@some.webm" -F "saveFile=true" | jq .
```

Expected: `{ "success": true, "data": { "text": "...", "savedFilename": "voice_..." } }`

- [ ] **Step 6: Commit**

```bash
git add src/api/memoriesApi.ts
git commit -m "feat: add POST /api/memories/:id/audio + voice_speaker in transformMemory"
```

---

## Task 6: fileCleanupService — orphaned voice file cleanup

**Files:**
- Modify: `src/services/fileCleanupService.ts`

- [ ] **Step 1: Add optional filePattern parameter to cleanupOldFiles**

Replace the `cleanupOldFiles` signature and add the pattern filter:

```ts
async cleanupOldFiles(directory: string, maxAgeMs: number, filePattern?: RegExp): Promise<number> {
  const absolutePath = path.resolve(directory);

  if (!fs.existsSync(absolutePath)) {
    return 0;
  }

  const now = Date.now();
  let deletedCount = 0;

  try {
    const files = fs.readdirSync(absolutePath);

    for (const file of files) {
      // Skip files that don't match the pattern (if one is provided)
      if (filePattern && !filePattern.test(file)) continue;

      const filePath = path.join(absolutePath, file);

      try {
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) continue;

        const age = now - stats.mtimeMs;
        if (age > maxAgeMs) {
          const deleted = await this.deleteFile(filePath);
          if (deleted) {
            deletedCount++;
            console.log(`🗑️ Alte Datei gelöscht: ${file} (${Math.round(age / 1000 / 60)} Min alt)`);
          }
        }
      } catch (fileError) {
        console.error(`Fehler bei Datei ${file}:`, fileError);
      }
    }
  } catch (error) {
    console.error(`Cleanup-Fehler in ${directory}:`, error);
  }

  return deletedCount;
},
```

- [ ] **Step 2: Add uploads/ cleanup inside startPeriodicCleanup**

In `startPeriodicCleanup`, update only the `cleanup` arrow function body. `TWO_HOURS` is already declared in the outer scope of `startPeriodicCleanup` and is reachable via closure — do NOT re-declare it inside `cleanup`. Only add the `uploads/` cleanup call:

```ts
const cleanup = async () => {
  console.log('🧹 Starte periodisches Cleanup...');

  // Temp-Verzeichnis: Dateien älter als 2 Stunden (TWO_HOURS from outer scope)
  const tempDeleted = await this.cleanupOldFiles('./temp', TWO_HOURS);

  // Orphaned voice files in uploads/ older than 24 hours
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  await this.cleanupOldFiles('./uploads', TWENTY_FOUR_HOURS, /^voice_/);

  if (tempDeleted > 0) {
    console.log(`🧹 Cleanup abgeschlossen: ${tempDeleted} Temp-Dateien gelöscht`);
  }
};
```

- [ ] **Step 3: Build to verify**

```bash
npm run build 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/fileCleanupService.ts
git commit -m "feat: cleanup orphaned voice_* files in uploads/ after 24h"
```

---

## Task 7: Frontend types — Audio.voice_speaker

**Files:**
- Modify: `web/src/types/index.ts`

- [ ] **Step 1: Add voice_speaker to Audio interface**

```ts
export interface Audio {
  id: number;
  url: string;
  filename: string;
  voice_speaker: string | null;  // ← add
}
```

- [ ] **Step 2: Build frontend to verify**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

Expected: possibly type errors at call sites that map `audios` — those are fixed in Task 8.

---

## Task 8: Frontend API — transcribeAudio + attachAudio + RawMemory

**Files:**
- Modify: `web/src/api/memoriesApi.ts`

- [ ] **Step 1: Update RawMemory inline type to include voice_speaker**

Find the `interface RawMemory` (lines 12–16) and update:

```ts
interface RawMemory extends Omit<Memory, 'photos' | 'audios' | 'videos'> {
  photos: Array<{ id: number; url: string; filename: string }>;
  audios: Array<{ id: number; url: string; filename: string; voice_speaker: string | null }>;
  videos: Array<{ id: number; url: string; filename: string }>;
}
```

- [ ] **Step 2: Update transformMemoryUrls to pass voice_speaker**

In `transformMemoryUrls`, the `audios` mapping needs to pass the field through:

```ts
audios: (memory.audios || []).map(a => ({ ...a, url: toAbsolute(a.url) })),
```

The spread `...a` already includes `voice_speaker` — no code change needed here, but verify the spread works.

- [ ] **Step 3: Change transcribeAudio return type to object**

Replace the existing `transcribeAudio` function:

```ts
export async function transcribeAudio(
  audioBlob: Blob,
  saveFile?: boolean
): Promise<{ text: string; savedFilename?: string }> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  if (saveFile) {
    formData.append('saveFile', 'true');
  }

  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Transkription fehlgeschlagen');
  }

  return json.data as { text: string; savedFilename?: string };
}
```

- [ ] **Step 4: Add attachAudio function**

Add after `transcribeAudio`:

```ts
export async function attachAudio(
  memoryId: number,
  filename: string,
  voiceSpeaker?: string | null
): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${memoryId}/audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ filename, voice_speaker: voiceSpeaker ?? null }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Anhängen der Audiodatei');
  }

  return transformMemoryUrls(json.data);
}
```

- [ ] **Step 5: Build frontend to verify**

```bash
cd web && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors now show in `CreateMemoryModal.tsx` (calls `transcribeAudio` and expects a string) — those are fixed in Task 11.

- [ ] **Step 6: Commit**

```bash
git add web/src/types/index.ts web/src/api/memoriesApi.ts
git commit -m "feat: update Audio type and memoriesApi with transcribeAudio+attachAudio"
```

---

## Task 9: App.tsx — handleCreate returns Memory

**Files:**
- Modify: `web/src/App.tsx`

The `handleCreate` function currently returns `Promise<void>`. It must return `Promise<Memory>` so `CreateMemoryModal` can get the created memory to call `attachAudio`.

- [ ] **Step 1: Update handleCreate signature and return value**

In `web/src/App.tsx`, update `handleCreate`:

```ts
async function handleCreate(data: {
  text: string;
  child_name?: string;
  location?: string;
  source_date?: string;
  people?: string[];
  photos?: File[];
  latitude?: number;
  longitude?: number;
}): Promise<Memory> {
  const { photos, ...memoryData } = data;
  let created = await createMemory({ ...memoryData, recorded_by: identity || undefined });

  if (photos && photos.length > 0) {
    created = await uploadPhotos(created.id, photos);
  }

  setMemories(prev => [created, ...prev]);
  return created;
}
```

- [ ] **Step 2: Build to verify**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

Expected: TypeScript will now complain about `HomeScreen` and `CreateMemoryModal` `onCreate` prop types mismatching — those are fixed in Tasks 10 and 11.

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat: handleCreate returns Memory for audio attachment chaining"
```

---

## Task 10: VoiceRecorder — save-audio toggle

**Files:**
- Modify: `web/src/components/VoiceRecorder.tsx`

- [ ] **Step 1: Add new props**

Add to the props interface:

```ts
interface VoiceRecorderProps {
  onRecordingChange: (blob: Blob | null) => void;
  disabled?: boolean;
  showSaveToggle?: boolean;
  onSaveAudioChange?: (save: boolean) => void;
}
```

Update the function signature:

```ts
export function VoiceRecorder({ onRecordingChange, disabled, showSaveToggle, onSaveAudioChange }: VoiceRecorderProps) {
```

- [ ] **Step 2: Add saveAudio state**

Add in the state declarations:

```ts
const [saveAudio, setSaveAudio] = useState(false);
```

- [ ] **Step 3: Add toggle to RECORDED state**

In the `RECORDED` state JSX, add the toggle after the play/pause row (inside the outer wrapper div, before the closing `</div>`):

```tsx
{showSaveToggle && (
  <div className="mt-2 flex items-center gap-2">
    <button
      type="button"
      onClick={() => {
        const next = !saveAudio;
        setSaveAudio(next);
        onSaveAudioChange?.(next);
      }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200"
      style={{
        backgroundColor: saveAudio ? 'var(--color-terracotta-500)' : 'var(--color-sand-100)',
        color: saveAudio ? 'white' : 'var(--color-text-muted)',
        border: saveAudio ? 'none' : '1px solid var(--color-sand-200)',
      }}
    >
      <span>🎵</span>
      Mit Audio speichern
    </button>
  </div>
)}
```

- [ ] **Step 4: Reset saveAudio when recording is deleted**

In `deleteRecording()`, add:

```ts
setSaveAudio(false);
onSaveAudioChange?.(false);
```

- [ ] **Step 5: Build to verify**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add web/src/components/VoiceRecorder.tsx
git commit -m "feat: add save-audio toggle to VoiceRecorder"
```

---

## Task 11: AudioPlayer component

**Files:**
- Create: `web/src/components/AudioPlayer.tsx`
- Modify: `web/src/components/index.ts`

- [ ] **Step 1: Create AudioPlayer.tsx**

```tsx
// web/src/components/AudioPlayer.tsx
import { useState, useRef, useEffect } from 'react';
import { Play, Pause, AudioLines } from 'lucide-react';

interface AudioPlayerProps {
  url: string;
  voiceSpeaker?: string | null;
  className?: string;
}

export function AudioPlayer({ url, voiceSpeaker, className }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

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
      audio.play();
      setIsPlaying(true);
    }
  }

  return (
    <div className={className}>
      <audio ref={audioRef} src={url} preload="metadata" />

      {voiceSpeaker && (
        <p className="text-xs mb-1.5 flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
          <span>🎙️</span>
          {voiceSpeaker}
        </p>
      )}

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
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Export from index.ts**

In `web/src/components/index.ts`, add:

```ts
export { AudioPlayer } from './AudioPlayer';
```

- [ ] **Step 3: Build to verify**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/AudioPlayer.tsx web/src/components/index.ts
git commit -m "feat: add AudioPlayer component"
```

---

## Task 12: CreateMemoryModal — audio upload + speaker picker + updated submit

**Files:**
- Modify: `web/src/components/CreateMemoryModal.tsx`

This is the largest frontend change. Make each sub-step before building.

- [ ] **Step 1: Update imports**

Add to the import line at top:
- Import `Music` from lucide-react (alongside existing icons)
- Import `attachAudio` from `../api/memoriesApi`
- Import `Memory` type from `../types`

Update the lucide import line:
```ts
import { X, User, MapPin, Calendar, Loader2, Sparkles, PenLine, Check, Camera, ImagePlus, Mic, Music } from 'lucide-react';
```

Update the api import:
```ts
import { transcribeAudio, attachAudio } from '../api/memoriesApi';
```

Add type import:
```ts
import type { Memory } from '../types';
```

- [ ] **Step 2: Update onCreate prop type to return Memory**

```ts
interface CreateMemoryModalProps {
  onClose: () => void;
  onCreate: (data: {
    text: string;
    child_name?: string;
    location?: string;
    source_date?: string;
    people?: string[];
    photos?: File[];
    latitude?: number;
    longitude?: number;
  }) => Promise<Memory>;
}
```

- [ ] **Step 3: Add new state variables**

After the existing `const [audioBlob, setAudioBlob] = useState<Blob | null>(null);` line, add:

```ts
const [pendingAudioFilename, setPendingAudioFilename] = useState<string | null>(null);
const [isTranscribing, setIsTranscribing] = useState(false);
const [saveVoiceAudio, setSaveVoiceAudio] = useState(false);
const [voiceSpeaker, setVoiceSpeaker] = useState<string | null>(null);
const audioFileInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 4: Add SPEAKER_OPTIONS constant**

Add after `const CHILDREN = ['Junis', 'Noah'];`:

```ts
const SPEAKER_OPTIONS = [...FAMILY_MEMBERS.map(m => m.name), 'Mehrere'];
```

- [ ] **Step 5: Add handleAudioFileChange function**

Add after `handlePhotoChange`:

```ts
async function handleAudioFileChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;

  // Reset input
  e.target.value = '';

  setIsTranscribing(true);
  setError(null);
  setPendingAudioFilename(null);
  setVoiceSpeaker(null);

  try {
    const result = await transcribeAudio(file, true);
    setText(prev => prev ? `${prev}\n\n${result.text}` : result.text);
    if (result.savedFilename) {
      setPendingAudioFilename(result.savedFilename);
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Audio-Transkription fehlgeschlagen');
  } finally {
    setIsTranscribing(false);
  }
}
```

- [ ] **Step 6: Update handleSubmit**

Replace the existing `handleSubmit` function:

```ts
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsSubmitting(true);
  setError(null);

  const child_name = selectedPeople.find(p => CHILDREN.includes(p)) || undefined;

  try {
    // 1. Transcribe voice recording (with optional save)
    let finalText = text.trim();
    let voiceSavedFilename: string | undefined;

    if (audioBlob) {
      try {
        const shouldSave = saveVoiceAudio && !pendingAudioFilename;
        const result = await transcribeAudio(audioBlob, shouldSave);
        finalText = finalText ? `${finalText}\n\n${result.text}` : result.text;
        if (shouldSave) voiceSavedFilename = result.savedFilename;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Transkription fehlgeschlagen');
        setIsSubmitting(false);
        return;
      }
    }

    // 2. Create memory
    const created = await onCreate({
      text: finalText,
      child_name,
      location: location || undefined,
      source_date: date || undefined,
      people: selectedPeople.length > 0 ? selectedPeople : undefined,
      photos: photos.length > 0 ? photos : undefined,
      latitude: locationCoords?.latitude,
      longitude: locationCoords?.longitude,
    });

    // 3. Attach audio file if any (file upload takes precedence over voice recording)
    const filenameToAttach = pendingAudioFilename ?? voiceSavedFilename;
    if (filenameToAttach) {
      try {
        await attachAudio(created.id, filenameToAttach, voiceSpeaker);
      } catch (err) {
        // Memory was saved — non-blocking warning only
        console.warn('Audio konnte nicht angehängt werden:', err);
      }
    }

    photoPreviews.forEach(url => URL.revokeObjectURL(url));
    onClose();
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
  } finally {
    setIsSubmitting(false);
  }
};
```

- [ ] **Step 7: Add audio upload section and speaker picker to JSX**

In the form's scrollable section, add the following **between the Photo Upload block and the Voice Recording block** (after the closing `</div>` of the Photo Upload section, before `{/* Voice Recording */}`):

```tsx
{/* Audio Upload */}
<div>
  <label
    className="flex items-center gap-2 text-sm font-bold mb-3"
    style={{ color: 'var(--color-text-primary)' }}
  >
    <Music className="w-4 h-4" style={{ color: 'var(--color-terracotta-500)' }} />
    Audio hochladen
  </label>
  <input
    type="file"
    ref={audioFileInputRef}
    accept=".m4a,.mp3,.ogg,.opus,.wav,.aac,.webm"
    onChange={handleAudioFileChange}
    className="hidden"
    disabled={isSubmitting}
  />
  <button
    type="button"
    onClick={() => audioFileInputRef.current?.click()}
    disabled={isSubmitting || isTranscribing || !!pendingAudioFilename}
    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-all duration-200 min-h-[44px]"
    style={{
      borderColor: 'var(--color-sand-300)',
      color: 'var(--color-text-muted)',
      backgroundColor: 'white',
    }}
  >
    {isTranscribing ? (
      <><Loader2 className="w-4 h-4 animate-spin" /> Transkribiere...</>
    ) : pendingAudioFilename ? (
      <><Check className="w-4 h-4" style={{ color: 'var(--color-sage-500)' }} /> Audio bereit</>
    ) : (
      <><Music className="w-4 h-4" /> 🎵 Audio hochladen</>
    )}
  </button>
  {pendingAudioFilename && (
    <button
      type="button"
      onClick={() => { setPendingAudioFilename(null); setVoiceSpeaker(null); }}
      className="mt-1.5 text-xs"
      style={{ color: 'var(--color-text-muted)' }}
    >
      Audio entfernen
    </button>
  )}
</div>
```

- [ ] **Step 8: Wire showSaveToggle and onSaveAudioChange to VoiceRecorder**

Find the `<VoiceRecorder>` usage and update it:

```tsx
<VoiceRecorder
  onRecordingChange={(blob) => {
    setAudioBlob(blob);
    if (!blob) { setSaveVoiceAudio(false); setVoiceSpeaker(null); }
  }}
  showSaveToggle={true}
  onSaveAudioChange={(save) => {
    setSaveVoiceAudio(save);
    if (!save) setVoiceSpeaker(null);
  }}
  disabled={isSubmitting}
/>
```

- [ ] **Step 9: Add speaker picker (shown when audio is pending)**

Add after the VoiceRecorder block, before the Text Input block:

```tsx
{/* Speaker Picker — shown when an audio file is queued or voice save is on */}
{(pendingAudioFilename || (audioBlob && saveVoiceAudio)) && (
  <div>
    <label
      className="flex items-center gap-2 text-sm font-bold mb-3"
      style={{ color: 'var(--color-text-primary)' }}
    >
      🎙️ Wessen Stimme ist das?
    </label>
    <div className="flex flex-wrap gap-2">
      {SPEAKER_OPTIONS.map((name) => {
        const member = FAMILY_MEMBERS.find(m => m.name === name);
        const active = voiceSpeaker === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => setVoiceSpeaker(active ? null : name)}
            className="px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105"
            style={{
              backgroundColor: active ? (member?.color.activeBg ?? 'var(--color-sand-600)') : 'white',
              color: active ? 'white' : (member?.color.text ?? 'var(--color-text-muted)'),
              border: active ? 'none' : '2px solid var(--color-sand-200)',
            }}
          >
            {name}
          </button>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 10: Build to verify**

```bash
cd web && npx tsc --noEmit 2>&1 | head -40
```

Expected: type error in `HomeScreen.tsx` about `onCreate` prop type mismatch — fixed in Task 13.

- [ ] **Step 11: Commit**

```bash
git add web/src/components/CreateMemoryModal.tsx
git commit -m "feat: audio upload + speaker picker in CreateMemoryModal"
```

---

## Task 13: HomeScreen — AudioPlayer + speaker filter + onCreate type

**Files:**
- Modify: `web/src/components/HomeScreen.tsx`

HomeScreen is large (~1300 lines). Make targeted edits only.

- [ ] **Step 1: Update onCreate prop type**

Find the `HomeScreenProps` interface (search for `onCreate`). Change its type:

```ts
onCreate: (data: {
  text: string;
  child_name?: string;
  location?: string;
  source_date?: string;
  people?: string[];
  photos?: File[];
  latitude?: number;
  longitude?: number;
}) => Promise<Memory>;
```

- [ ] **Step 2: Import AudioLines and AudioPlayer**

Find the lucide import line and add `AudioLines`:
```ts
import { ..., AudioLines } from 'lucide-react';
```

Add AudioPlayer as a direct import (add this near the other component imports):
```ts
import { AudioPlayer } from './AudioPlayer';
```

`Memory` is **already imported** in `HomeScreen.tsx` — no import change needed for it. Simply update the `HomeScreenProps.onCreate` field type to return `Promise<Memory>` instead of `Promise<void>`.

- [ ] **Step 3: Add speaker filter state**

Find where filter states are declared (e.g., `const [selectedChild, ...]`) and add:

```ts
const [speakerFilter, setSpeakerFilter] = useState<string>('Alle');
```

- [ ] **Step 4: Apply speaker filter to filteredMemories**

Find where `filteredMemories` is computed (after all the other filter conditions). Add at the end:

```ts
if (speakerFilter !== 'Alle') {
  filteredMemories = filteredMemories.filter(m =>
    m.audios.some(a => a.voice_speaker === speakerFilter)
  );
}
```

- [ ] **Step 5: Compute available speakers**

Add near the filter state declarations:

```ts
const availableSpeakers = useMemo(() => {
  const speakers = new Set<string>();
  memories.forEach(m => m.audios.forEach(a => {
    if (a.voice_speaker) speakers.add(a.voice_speaker);
  }));
  return Array.from(speakers);
}, [memories]);
```

Make sure `useMemo` is imported (it's likely already imported given the component size).

- [ ] **Step 6: Add speaker filter chips to the filter bar**

Find where the existing filter chips are rendered (person filter, location filter, etc.). Add the speaker filter chips — only visible when `availableSpeakers.length > 0`:

```tsx
{availableSpeakers.length > 0 && (
  <div className="flex flex-wrap gap-2">
    {['Alle', ...availableSpeakers].map(speaker => (
      <button
        key={speaker}
        onClick={() => setSpeakerFilter(speaker)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200"
        style={{
          backgroundColor: speakerFilter === speaker ? 'var(--color-terracotta-500)' : 'white',
          color: speakerFilter === speaker ? 'white' : 'var(--color-text-muted)',
          border: speakerFilter === speaker ? 'none' : '1px solid var(--color-sand-200)',
        }}
      >
        <AudioLines className="w-3 h-3" />
        {speaker}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 7: Add audio badge to memory cards**

Find where the memory card header/metadata is rendered (categories, persons, etc.) and add an audio badge when `memory.audios.length > 0`:

```tsx
{memory.audios.length > 0 && (
  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-terracotta-400)' }}>
    <AudioLines className="w-3 h-3" />
    {memory.audios.length > 1 ? `${memory.audios.length} Aufnahmen` : '1 Aufnahme'}
  </span>
)}
```

- [ ] **Step 8: Render AudioPlayer for each audio in memory cards**

Find where the memory card body renders the summary text and photos. After the summary text, before the photos, add:

```tsx
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
```

- [ ] **Step 9: Build frontend to verify no TypeScript errors**

```bash
cd web && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add web/src/components/HomeScreen.tsx
git commit -m "feat: AudioPlayer + speaker filter in HomeScreen"
```

---

## Task 14: Full build and deploy

- [ ] **Step 1: Build backend**

```bash
npm run build 2>&1 | head -20
```

Expected: exits 0, no errors.

- [ ] **Step 2: Build frontend**

```bash
cd web && npm run build 2>&1 | tail -10
```

Expected: build succeeds, files written to `web/dist/`.

- [ ] **Step 3: Start dev server and smoke test**

```bash
npm run dev
```

Manual verification checklist:
1. Open the app → click "Neue Erinnerung"
2. Click "Audio hochladen" → select an `.m4a` file → text fills in automatically
3. Speaker picker appears → select a speaker
4. Save → memory card shows `AudioPlayer` with the speaker label
5. Click play → audio plays
6. Record a voice note → click "Mit Audio speichern" → speaker picker appears
7. Save → memory has audio player
8. In HomeScreen, if there are memories with speaker-tagged audio, speaker filter chips appear

- [ ] **Step 4: Commit built frontend**

```bash
git add web/dist/
git commit -m "build: rebuild frontend for audio feature"
```

- [ ] **Step 5: Final commit summary**

```bash
git log --oneline -10
```

Expected: 10 commits showing all the audio feature tasks.
