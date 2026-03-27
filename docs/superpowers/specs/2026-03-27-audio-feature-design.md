# Audio Feature Design

## Goal

Extend the Famories app so users can (1) upload audio files or save browser voice recordings alongside transcriptions, (2) tag who is speaking in each recording, and (3) play recordings back from memory cards with speaker attribution. Recordings are filterable by speaker.

## Architecture

Four coordinated areas of change: (1) backend endpoints for transcribe-and-save, audio attachment, and speaker tagging; (2) a DB migration for `voice_speaker`; (3) frontend modal additions for audio upload, save-audio toggle, and speaker picker; (4) an AudioPlayer component with speaker label and a new speaker filter on the feed.

Orphaned audio files (from transcription without saving) are addressed by extending `fileCleanupService` to also clean `voice_*` prefixed files in `uploads/` that are older than 24 hours.

## Tech Stack

- Backend: Express, Multer, OpenAI Whisper (`whisper-1`), better-sqlite3, Zod validation
- Frontend: React, TypeScript, Tailwind CSS, Lucide icons, HTML5 `<audio>` API
- Existing patterns: mirrors the photo upload flow (`/api/memories/:id/photos`)

---

## Changed Files

### Backend
- `src/db/migrations/007_add_voice_speaker.ts` — new migration
- `src/db/repositories/mediaRepository.ts` — add `voice_speaker` to create(), add findByVoiceSpeaker()
- `src/types/index.ts` — add `voice_speaker: string | null` to `MediaAttachment` interface
- `src/api/transcribeApi.ts` — add `saveFile` flag
- `src/api/memoriesApi.ts` — add `POST /api/memories/:id/audio`, extend GET filter, extend transformMemory()
- `src/api/validation.ts` — add `audioAttachSchema`, extend `memoriesQuerySchema`
- `src/services/fileCleanupService.ts` — add filename-pattern filter to `cleanupOldFiles`, add uploads cleanup inside `startPeriodicCleanup`
- `src/index.ts` — no additional cleanup call needed (see fileCleanupService section)

### Frontend
- `web/src/types/index.ts` — `Audio` gets `voice_speaker: string | null`
- `web/src/api/memoriesApi.ts` — modify `transcribeAudio`, add `attachAudio`
- `web/src/App.tsx` — change `handleCreate` to return `Memory`
- `web/src/components/HomeScreen.tsx` — update `onCreate` prop type, add audio badge + player, add speaker filter
- `web/src/components/CreateMemoryModal.tsx` — add audio upload UI, speaker picker, update `onCreate` type, update submit handler
- `web/src/components/VoiceRecorder.tsx` — add save-audio toggle
- `web/src/components/AudioPlayer.tsx` — new file
- `web/src/components/index.ts` — export AudioPlayer (file already exists; add one `export { AudioPlayer } from './AudioPlayer'` line)

---

## Backend

### New: DB Migration `src/db/migrations/007_add_voice_speaker.ts`

```ts
ALTER TABLE media_attachments ADD COLUMN voice_speaker TEXT NULL;
```

Migrated via the existing `migrate.ts` runner on server start.

### Modified: `src/db/repositories/mediaRepository.ts`

**Extend `create()` to accept optional `voice_speaker`:**
```ts
create(attachment: {
  memory_entry_id: number;
  media_type: 'photo' | 'audio' | 'video';
  telegram_file_id: string;
  local_path: string;
  voice_speaker?: string | null;
}): MediaAttachment
```

Use a single prepared statement that always includes the `voice_speaker` column with a nullable bind parameter:
```sql
INSERT INTO media_attachments (memory_entry_id, media_type, telegram_file_id, local_path, voice_speaker)
VALUES (?, ?, ?, ?, ?)
```
Pass `attachment.voice_speaker ?? null` as the fifth bind value. Existing callers (photo uploads) omit `voice_speaker` and will bind `null` automatically via `?? null`.

**New method `findByVoiceSpeaker(speaker: string): number[]`**
Returns distinct `memory_entry_id` values where `media_type = 'audio'` and `voice_speaker = ?`. Used for the speaker filter in the API.

### Modified: `POST /api/transcribe`

Add optional form field `saveFile: string` (Multer multipart requests expose non-file form fields on `req.body`; the frontend sends `formData.append('saveFile', 'true')`). Treat as `saveFile = req.body.saveFile === 'true'`.

The existing filename generation pattern in Multer's `diskStorage.filename` callback already produces `voice_<timestamp>_<random>.<ext>` — no changes needed there.

- `saveFile: false`: current behaviour — transcribe, delete temp file, return `{ text }`
- `saveFile: true`: transcribe, keep file on disk, return `{ text, savedFilename }`

`savedFilename` is the bare filename (e.g. `voice_1234567890_abc.m4a`) stored in `uploads/`. The full URL is constructed by the client as `/uploads/<savedFilename>`.

Multer config stays unchanged (25 MB limit, `audio/*` filter). The existing `fileFilter` accepts all audio MIME types including `audio/mp4` (.m4a), `audio/mpeg` (.mp3), `audio/ogg` (.ogg/.opus), `audio/wav`, `audio/aac`, and `audio/webm` (.webm — used by browser `MediaRecorder`).

**Important:** This endpoint is rate-limited to 20 requests/hour (`aiLimiter`). Every audio file upload consumes one slot. This is intentional.

**Response shape (saveFile: true):**
```json
{ "success": true, "data": { "text": "Heute hat Junis...", "savedFilename": "voice_1234_abc.m4a" } }
```

### New: `POST /api/memories/:id/audio`

Attaches a previously saved audio file to a memory entry, with an optional speaker tag.

**Request body (validated by `audioAttachSchema` in `validation.ts`):**
```json
{ "filename": "voice_1234567890_abc.m4a", "voice_speaker": "Junis" }
```

**Validation (`audioAttachSchema`):**
```ts
z.object({
  filename: z.string().regex(/^voice_\d+_[a-z0-9]+\.[a-z0-9]+$/i),
  voice_speaker: z.string().optional().nullable(),
})
```

**Additional checks in handler:**
- File must exist at `path.resolve('./uploads', filename)` (prevents path traversal; regex already blocks `..`)
- Memory `:id` must exist

**Behaviour:** creates a `media_attachments` row with `media_type: 'audio'`, `local_path: filename`, `telegram_file_id: 'web_<filename>'`, `voice_speaker: voice_speaker ?? null`. Returns the updated memory via the extended `transformMemory()` helper.

**Rate limit:** uses existing `writeLimiter` (50/15 min).

### Modified: `GET /api/memories`

Add optional query param `voice_speaker: string` to `memoriesQuerySchema`:

```ts
voice_speaker: z.string().optional()
```

When provided:
```ts
if (voice_speaker) {
  const speakerMemoryIds = mediaRepository.findByVoiceSpeaker(voice_speaker);
  memories = memories.filter(m => speakerMemoryIds.includes(m.id));
}
```

This filter composes with all existing filters (child, location, time, favorites, search).

**Note on client vs. server-side filtering:** The frontend speaker filter chip (described below) filters client-side from the already-loaded memory list, for instant response without a network round-trip. The server-side `voice_speaker` query param is kept for future use (e.g. Telegram bot queries, external API clients) but is not currently called by the frontend.

### Modified: `transformMemory()` in `memoriesApi.ts`

Extend the `audios` mapping to include `voice_speaker`:
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

This requires `MediaAttachment` type in `src/types/index.ts` to gain `voice_speaker: string | null`.

### Modified: `src/services/fileCleanupService.ts`

Add optional `filePattern?: RegExp` parameter to `cleanupOldFiles`:

```ts
async cleanupOldFiles(directory: string, maxAgeMs: number, filePattern?: RegExp): Promise<number>
```

When `filePattern` is provided, skip files whose names do not match the pattern. This allows targeting only `voice_*` files in `uploads/` without touching user photos.

Add the `uploads/` cleanup call **inside the `cleanup()` arrow function** within `startPeriodicCleanup` (not in `src/index.ts`), so it runs on every scheduled interval tick and on startup:

```ts
const cleanup = async () => {
  // existing: ./temp cleanup
  const tempDeleted = await this.cleanupOldFiles('./temp', TWO_HOURS);

  // new: orphaned voice files in uploads/ older than 24 h
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  await this.cleanupOldFiles('./uploads', TWENTY_FOUR_HOURS, /^voice_/);

  if (tempDeleted > 0) { ... }
};
```

`src/index.ts` requires no changes — `fileCleanupService.startPeriodicCleanup()` is already called there and will pick up the new behaviour automatically.

---

## Frontend

### Modified: `web/src/types/index.ts`

`Audio` interface gains `voice_speaker`:
```ts
export interface Audio {
  id: number;
  url: string;
  filename: string;
  voice_speaker: string | null;
}
```

### Modified: `web/src/api/memoriesApi.ts`

**Modify `transcribeAudio`:**
```ts
export async function transcribeAudio(
  audioBlob: Blob,
  saveFile?: boolean
): Promise<{ text: string; savedFilename?: string }>
```
Returns an object. Existing callers updated to use `.text`.

**New `attachAudio`:**
```ts
export async function attachAudio(
  memoryId: number,
  filename: string,
  voiceSpeaker?: string | null
): Promise<Memory>
// POST /api/memories/:id/audio  { filename, voice_speaker }
```

**Update `RawMemory` inline type** (lines 12–16 of this file):
```ts
interface RawMemory extends Omit<Memory, 'photos' | 'audios' | 'videos'> {
  photos: Array<{ id: number; url: string; filename: string }>;
  audios: Array<{ id: number; url: string; filename: string; voice_speaker: string | null }>;
  videos: Array<{ id: number; url: string; filename: string }>;
}
```
Without this, `transformMemoryUrls` silently drops `voice_speaker` from the API response.

### Modified: `web/src/App.tsx`

`handleCreate` must return `Memory`:
```ts
// Before
async function handleCreate(data: { ... }): Promise<void>
// After
async function handleCreate(data: { ... }): Promise<Memory>
```
The function already has `created` in scope; add `return created` at the end.

### Modified: `web/src/components/VoiceRecorder.tsx`

Add to props:
```ts
showSaveToggle?: boolean
onSaveAudioChange?: (save: boolean) => void
```

In the `recorded` state, when `showSaveToggle` is true, show a pill toggle:
- Label: `🎵 Mit Audio speichern`
- Default: **off**
- On toggle: calls `onSaveAudioChange(newValue)`

### Modified: `web/src/components/CreateMemoryModal.tsx`

**Update `onCreate` prop type:**
```ts
onCreate: (data: { text: string; ... photos?: File[] }) => Promise<Memory>
```

**New state:**
```ts
const [pendingAudioFilename, setPendingAudioFilename] = useState<string | null>(null);
const [isTranscribing, setIsTranscribing] = useState(false);
const [saveVoiceAudio, setSaveVoiceAudio] = useState(false);
const [voiceSpeaker, setVoiceSpeaker] = useState<string | null>(null);
const audioFileInputRef = useRef<HTMLInputElement>(null);
```

**Audio upload section** (placed between Fotos and Sprachnotiz):

Hidden `<input type="file" ref={audioFileInputRef} accept=".m4a,.mp3,.ogg,.opus,.wav,.aac,.webm">`.

Button: `🎵 Audio hochladen` (dashed border, same style as photo button).

On file selection → transcribeAudio(file, true) → fills text, sets `pendingAudioFilename`.

**Speaker picker** — shown when `pendingAudioFilename` is set OR (`audioBlob` is not null AND `saveVoiceAudio` is true):

```
Wessen Stimme ist das?
[Papa] [Mama] [Junis] [Noah] [Oma Eva] [Opa Frank] [Moma] [Opa Peter] [Mehrere]
```

- Renders as pill buttons, same style as person selection in the form
- Uses `FAMILY_MEMBERS` array for the family members + a hardcoded "Mehrere" option
- `voiceSpeaker` state holds the selected value (`null` = not specified, which is valid)
- No "required" validation — speaker attribution is optional

**VoiceRecorder wiring:**
```tsx
<VoiceRecorder
  onRecordingChange={setAudioBlob}
  showSaveToggle={true}
  onSaveAudioChange={(save) => { setSaveVoiceAudio(save); if (!save) setVoiceSpeaker(null); }}
  disabled={isSubmitting}
/>
```

**Submit handler:**
```ts
// 1. Voice transcription
let voiceSavedFilename: string | undefined;
if (audioBlob) {
  const shouldSave = saveVoiceAudio && !pendingAudioFilename;
  const result = await transcribeAudio(audioBlob, shouldSave);
  finalText = finalText ? `${finalText}\n\n${result.text}` : result.text;
  if (shouldSave) voiceSavedFilename = result.savedFilename;
}

// 2. Create memory
const created = await onCreate({ text: finalText, child_name, ... });

// 3. Attach audio with speaker (file upload takes precedence)
const filenameToAttach = pendingAudioFilename ?? voiceSavedFilename;
if (filenameToAttach) {
  await attachAudio(created.id, filenameToAttach, voiceSpeaker);
}
```

### New: `web/src/components/AudioPlayer.tsx`

```ts
interface AudioPlayerProps {
  url: string;
  voiceSpeaker?: string | null;
  className?: string;
}
```

Uses a hidden `<audio ref={audioRef}>`. State: `isPlaying`, `currentTime`, `duration`.

**UI:**
- If `voiceSpeaker` is set: `🎙️ Junis` label above the player row (small, muted text)
- Terracotta circle play/pause button (min touch 44×44px)
- `AudioLines` icon — waveform indicator
- Time display: `0:12 / 0:45`

### Modified: `web/src/components/HomeScreen.tsx`

**Update `onCreate` prop type** to `Promise<Memory>`.

Add `AudioLines` to the existing Lucide import line (`lucide-react` is already a dependency; `AudioLines` is available in the installed version).

**Audio indicator badge** on each memory card:
```tsx
{memory.audios.length > 0 && (
  <span className="flex items-center gap-1 text-xs ...">
    <AudioLines className="w-3 h-3" />
  </span>
)}
```

**Audio players** below summary text, above photos:
```tsx
{memory.audios.map(audio => (
  <AudioPlayer key={audio.id} url={audio.url} voiceSpeaker={audio.voice_speaker} />
))}
```

**New speaker filter** — added to the existing filter bar alongside person/location chips:

State: `speakerFilter: string` (default `'Alle'`).

A new row of chips (or integrated into the existing filter dropdown):
```
🎙️ Alle  |  Papa  |  Mama  |  Junis  |  Noah  |  ...  |  Mehrere
```

Applied after the other filters:
```ts
if (speakerFilter !== 'Alle') {
  // Client-side filter: check memory.audios for matching voice_speaker
  filteredMemories = filteredMemories.filter(m =>
    m.audios.some(a => a.voice_speaker === speakerFilter)
  );
}
```

The speaker filter chips are only shown when there is at least one memory with an audio that has a `voice_speaker` value (computed from the full memories list, not the filtered list).

---

## Data Flow Summary

```
Audio File Upload + Speaker:
  User selects file → transcribeAudio(file, saveFile:true) → { text, savedFilename }
  Text fills modal → user edits
  User selects speaker: "Junis"
  User clicks Speichern → onCreate(...) → Memory
    → attachAudio(memory.id, savedFilename, "Junis")
    → DB: media_attachments.voice_speaker = "Junis"
  Card shows: 🎙️ Junis + AudioPlayer

Voice Recording + Save + Speaker:
  User records → stops → toggles "Mit Audio speichern" ON
  Speaker picker appears → user picks "Opa Frank"
  User clicks Speichern → transcribeAudio(blob, saveFile:true) → { text, savedFilename }
  → onCreate(...) → Memory
  → attachAudio(memory.id, savedFilename, "Opa Frank")

Speaker Filter (Feed):
  User taps "Junis" in speaker filter chips
  → filteredMemories filtered client-side by audios[].voice_speaker === "Junis"
```

---

## Error Handling

- Transcription fails on file select: show inline error, clear `pendingAudioFilename`, allow retry; speaker picker disappears
- `attachAudio` fails after memory is created: memory is saved (text + photos intact), log error, show non-blocking warning
- Invalid filename in `/api/memories/:id/audio`: 400 with Zod validation error
- File not found (server restart): 400; user must re-select the file

---

## Out of Scope

- Audio deletion UI
- Multiple audio files per single modal submit (UI enforces one; DB supports multiple)
- Real waveform visualisation
- Audio editing or trimming
- Editing the speaker tag after the memory is saved (no PATCH endpoint for voice_speaker in this version)
