# Audio Feature Design

## Goal

Extend the Famories app so users can upload audio files or save browser voice recordings alongside transcriptions, and play them back from memory cards on the website.

## Architecture

Three coordinated changes: (1) backend endpoints for transcribe-and-save and audio attachment, (2) frontend modal additions for audio upload and save-audio toggle, (3) a new AudioPlayer component displayed on memory cards.

Orphaned audio files (from transcription without saving) are addressed by extending `fileCleanupService` to also clean `voice_*` prefixed files in `uploads/` that are older than 24 hours.

## Tech Stack

- Backend: Express, Multer, OpenAI Whisper (`whisper-1`), better-sqlite3, Zod validation
- Frontend: React, TypeScript, Tailwind CSS, Lucide icons, HTML5 `<audio>` API
- Existing patterns: mirrors the photo upload flow (`/api/memories/:id/photos`)

---

## Changed Files

### Backend
- `src/api/transcribeApi.ts` — add `saveFile` flag
- `src/api/memoriesApi.ts` — add `POST /api/memories/:id/audio` endpoint
- `src/api/validation.ts` — add `audioAttachSchema`
- `src/services/fileCleanupService.ts` — add filename-pattern filter to `cleanupOldFiles`
- `src/index.ts` — add `uploads/` to periodic cleanup call

### Frontend
- `web/src/api/memoriesApi.ts` — modify `transcribeAudio`, add `attachAudio`
- `web/src/App.tsx` — change `handleCreate` to return `Memory`
- `web/src/components/HomeScreen.tsx` — update `onCreate` prop type, add audio badge + player
- `web/src/components/CreateMemoryModal.tsx` — add audio upload UI, update `onCreate` type, update submit handler
- `web/src/components/VoiceRecorder.tsx` — add save-audio toggle
- `web/src/components/AudioPlayer.tsx` — new file
- `web/src/components/index.ts` — export AudioPlayer

---

## Backend

### Modified: `POST /api/transcribe`

Add optional body field `saveFile: boolean` (default `false`).

- `saveFile: false`: current behaviour — transcribe, delete temp file, return `{ text }`
- `saveFile: true`: transcribe, keep file on disk, return `{ text, savedFilename }`

`savedFilename` is the bare filename (e.g. `voice_1234567890_abc.m4a`) stored in `uploads/`. The full URL is constructed by the client as `/uploads/<savedFilename>`.

Multer config stays unchanged (25 MB limit, `audio/*` filter). The existing `fileFilter` accepts all audio MIME types including `audio/mp4` (.m4a), `audio/mpeg` (.mp3), `audio/ogg` (.ogg/.opus), `audio/wav`, `audio/aac`, and `audio/webm` (.webm — used by browser `MediaRecorder`).

**Important:** This endpoint is rate-limited to 20 requests/hour (`aiLimiter`). Every audio file upload consumes one slot, regardless of file length. This is intentional — the same limit applies to voice recordings.

**Response shape (saveFile: true):**
```json
{ "success": true, "data": { "text": "Heute hat Junis...", "savedFilename": "voice_1234_abc.m4a" } }
```

### New: `POST /api/memories/:id/audio`

Attaches a previously saved audio file to a memory entry.

**Request body (validated by `audioAttachSchema` in `validation.ts`):**
```json
{ "filename": "voice_1234567890_abc.m4a" }
```

**Validation (`audioAttachSchema`):**
```ts
z.object({
  filename: z.string().regex(/^voice_\d+_[a-z0-9]+\.[a-z0-9]+$/i)
})
```

**Additional checks in handler:**
- File must exist at `path.resolve('./uploads', filename)` (prevents path traversal; regex already blocks `..`)
- Memory `:id` must exist

**Behaviour:** creates a `media_attachments` row with `media_type: 'audio'`, `local_path: filename`, `telegram_file_id: 'web_<filename>'`. Returns the updated memory via the existing `transformMemory()` helper.

**Rate limit:** uses existing `writeLimiter` (50/15 min).

### Modified: `src/services/fileCleanupService.ts`

Add optional `filePattern?: RegExp` parameter to `cleanupOldFiles`:

```ts
async cleanupOldFiles(directory: string, maxAgeMs: number, filePattern?: RegExp): Promise<number>
```

When `filePattern` is provided, skip files whose names do not match the pattern. This allows the cleanup to target only `voice_*` files in `uploads/` without touching user photos.

### Modified: `src/index.ts`

In `startPeriodicCleanup` callback, add a second cleanup call after the existing `./temp` cleanup:

```ts
// Orphaned voice transcription files in uploads/ — older than 24 hours
await fileCleanupService.cleanupOldFiles('./uploads', 24 * 60 * 60 * 1000, /^voice_/);
```

---

## Frontend

### Modified: `web/src/api/memoriesApi.ts`

**Modify `transcribeAudio`:**
```ts
export async function transcribeAudio(
  audioBlob: Blob,
  saveFile?: boolean
): Promise<{ text: string; savedFilename?: string }>
```
Returns an object instead of a plain string. Existing callers must be updated to use `.text`.

**New `attachAudio`:**
```ts
export async function attachAudio(memoryId: number, filename: string): Promise<Memory>
// POST /api/memories/:id/audio  { filename }
```

### Modified: `web/src/App.tsx`

`handleCreate` must return `Memory` so `CreateMemoryModal` can attach audio after creation:

```ts
// Before
async function handleCreate(data: { ... }): Promise<void>

// After
async function handleCreate(data: { ... }): Promise<Memory>
```

The function already has `created` in scope and must `return created` at the end.

### Modified: `web/src/components/HomeScreen.tsx`

Update `onCreate` prop type:

```ts
// Before
onCreate?: (data: { text: string; child_name?: string; ... photos?: File[] }) => Promise<void>;

// After
onCreate?: (data: { text: string; child_name?: string; ... photos?: File[] }) => Promise<Memory>;
```

Add `AudioLines` to Lucide imports.

**Audio indicator badge** on each memory card (alongside photo badge):
```tsx
{memory.audios.length > 0 && (
  <span className="flex items-center gap-1 text-xs ...">
    <AudioLines className="w-3 h-3" />
    {memory.audios.length > 1 ? memory.audios.length : ''}
  </span>
)}
```

**Audio players** in the card body (below summary text, above photos):
```tsx
{memory.audios.length > 0 && (
  <div className="space-y-2 mt-3">
    {memory.audios.map(audio => (
      <AudioPlayer key={audio.id} url={audio.url} />
    ))}
  </div>
)}
```

### Modified: `web/src/components/VoiceRecorder.tsx`

Add to props:
```ts
showSaveToggle?: boolean             // enables the "Mit Audio speichern" UI
onSaveAudioChange?: (save: boolean) => void
```

Add internal state `saveAudio: boolean` (default `false`).

In the `recorded` state, when `showSaveToggle` is true, show a pill toggle below the playback controls:
- Label: `🎵 Mit Audio speichern`
- Default: **off** (only transcribe, matches current behaviour)
- On toggle: calls `onSaveAudioChange(newValue)`

No other changes to VoiceRecorder internals.

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
const audioFileInputRef = useRef<HTMLInputElement>(null);
```

**Audio upload section** (new UI block, placed between Fotos and Sprachnotiz):

Label: `🎵 Audio`

Hidden `<input type="file" ref={audioFileInputRef} accept=".m4a,.mp3,.ogg,.opus,.wav,.aac,.webm">`.

Button: `🎵 Audio hochladen` (dashed border, same style as photo button).

**On file selection:**
1. Set `isTranscribing = true`, show spinner on button
2. Call `transcribeAudio(file, true)` — uses `saveFile: true`, so file is kept on server
3. On success: prepend or replace transcript in `text` state, set `pendingAudioFilename`
4. On error: show inline error, `pendingAudioFilename` stays `null`
5. Set `isTranscribing = false`

When a file is selected and transcribed, show pill: `🎵 <filename> ×` with a remove button that clears `pendingAudioFilename` (file stays on server, cleanup runs after 24 h).

**VoiceRecorder wiring:**
```tsx
<VoiceRecorder
  onRecordingChange={setAudioBlob}
  showSaveToggle={true}
  onSaveAudioChange={setSaveVoiceAudio}
  disabled={isSubmitting}
/>
```

**Submit handler — single audio attachment rule:**

If the user has both a pending audio file upload AND a voice recording with save-toggle on, **the file upload takes precedence** and the voice recording audio is not saved as attachment (it is still transcribed). This is intentional and documented in the UI — the "Mit Audio speichern" toggle is only active when no audio file has already been uploaded (disable the toggle when `pendingAudioFilename` is set).

```ts
const handleSubmit = async (e: React.FormEvent) => {
  // ... existing setup ...

  // 1. Voice transcription (modified)
  let voiceSavedFilename: string | undefined;
  if (audioBlob) {
    const shouldSave = saveVoiceAudio && !pendingAudioFilename; // file upload takes precedence
    const result = await transcribeAudio(audioBlob, shouldSave);
    finalText = finalText ? `${finalText}\n\n${result.text}` : result.text;
    if (shouldSave) voiceSavedFilename = result.savedFilename;
  }

  // 2. Create memory (must return Memory)
  const created = await onCreate({ text: finalText, child_name, ... });

  // 3. Attach audio (file upload has precedence over voice)
  const filenameToAttach = pendingAudioFilename ?? voiceSavedFilename;
  if (filenameToAttach) {
    await attachAudio(created.id, filenameToAttach);
  }

  // ... photos upload, onClose ...
};
```

### New: `web/src/components/AudioPlayer.tsx`

```ts
interface AudioPlayerProps {
  url: string;
  className?: string;
}
```

Uses a hidden `<audio ref={audioRef}>` element. State: `isPlaying`, `currentTime`, `duration`.

Handles `onTimeUpdate`, `onLoadedMetadata`, `onEnded` events. Stops and releases audio on unmount.

**UI (horizontal, compact, sand background, rounded-xl):**
- Terracotta circle play/pause button (40×40px, min touch target 44×44px via padding)
- `AudioLines` icon (Lucide) in terracotta muted — waveform indicator
- Time display: `0:12 / 0:45` in muted text, right-aligned

---

## Data Flow Summary

```
Audio File Upload:
  User selects file → transcribeAudio(file, saveFile:true)
    → { text, savedFilename }
  Text fills modal → user edits
  User clicks Speichern → onCreate(...) → Memory
    → attachAudio(memory.id, savedFilename)

Voice Recording + Save:
  User records → stops → toggles "Mit Audio speichern" ON
  User clicks Speichern → transcribeAudio(blob, saveFile:true)
    → { text, savedFilename }
  → onCreate(...) → Memory
  → attachAudio(memory.id, savedFilename)

Voice Recording without Save (default, unchanged):
  User records → stops
  User clicks Speichern → transcribeAudio(blob) → text only
  No audio attachment
```

---

## Error Handling

- Transcription fails on file select: show inline error, clear `pendingAudioFilename`, allow retry
- `attachAudio` fails after memory is created: memory is saved (text + photos intact), log error, show non-blocking warning. Audio file remains in `uploads/` until 24 h cleanup.
- Invalid filename in `/api/memories/:id/audio`: 400 with Zod validation error
- File not found (server restart during session): 400 response; user must re-select the file

---

## Out of Scope

- Audio deletion UI (users cannot delete individual audio files in this version)
- Multiple audio files per single modal submit: the UI enforces one audio per submit (file upload OR voice save, not both). The DB supports multiple audios per memory.
- Real waveform visualisation (the `AudioLines` icon is a static indicator only)
- Audio editing or trimming
