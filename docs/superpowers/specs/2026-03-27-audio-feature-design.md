# Audio Feature Design

## Goal

Extend the Famories app so users can upload audio files or save browser voice recordings alongside transcriptions, and play them back from memory cards on the website.

## Architecture

Three coordinated changes: (1) backend endpoints for transcribe-and-save and audio attachment, (2) frontend modal additions for audio upload and save-audio toggle, (3) a new AudioPlayer component displayed on memory cards.

The existing `fileCleanupService` handles orphaned audio files (e.g. if a user transcribes but never saves the memory).

## Tech Stack

- Backend: Express, Multer, OpenAI Whisper (`whisper-1`), better-sqlite3
- Frontend: React, TypeScript, Tailwind CSS, Lucide icons, HTML5 `<audio>` API
- Existing patterns: mirrors the photo upload flow (`/api/memories/:id/photos`)

---

## Backend

### Modified: `POST /api/transcribe`

Add optional body field `saveFile: boolean` (default `false`).

- `saveFile: false`: current behaviour — transcribe, delete temp file, return `{ text }`
- `saveFile: true`: transcribe, keep file on disk, return `{ text, savedFilename }`

`savedFilename` is the bare filename (e.g. `voice_1234567890_abc.m4a`) stored in `uploads/`. The full URL is constructed by the client as `/uploads/<savedFilename>`.

Multer config stays unchanged (25 MB limit, `audio/*` filter). The existing `fileFilter` already accepts the target formats (`.m4a` → `audio/mp4`, `.mp3` → `audio/mpeg`, `.ogg`/`.opus` → `audio/ogg`, `.wav` → `audio/wav`, `.aac` → `audio/aac`).

**Response shape (saveFile: true):**
```json
{ "success": true, "data": { "text": "Heute hat Junis...", "savedFilename": "voice_1234_abc.m4a" } }
```

### New: `POST /api/memories/:id/audio`

Attaches a previously saved audio file to a memory entry.

**Request body:**
```json
{ "filename": "voice_1234567890_abc.m4a" }
```

**Validation:**
- `filename` must match `/^voice_\d+_[a-z0-9]+\.[a-z0-9]+$/i` (prevents path traversal)
- File must exist at `path.resolve('./uploads', filename)`
- Memory `:id` must exist

**Behaviour:** creates a `media_attachments` row with `media_type: 'audio'`, `local_path: filename`, `telegram_file_id: 'web_<filename>'`. Returns the updated memory via the existing `transformMemory()` helper.

**Rate limit:** uses existing `writeLimiter` (50/15 min).

---

## Frontend

### `web/src/api/memoriesApi.ts`

**Modify `transcribeAudio`:**
```ts
export async function transcribeAudio(
  audioBlob: Blob,
  saveFile?: boolean
): Promise<{ text: string; savedFilename?: string }>
```
Returns an object instead of a plain string. Callers that only need text use `.text`.

**New `attachAudio`:**
```ts
export async function attachAudio(memoryId: number, filename: string): Promise<Memory>
```
`POST /api/memories/:id/audio` with `{ filename }`.

### `web/src/components/VoiceRecorder.tsx`

Add to props:
```ts
showSaveToggle?: boolean          // enables the "Mit Audio speichern" UI
onSaveAudioChange?: (save: boolean) => void
```

In the `recorded` state, when `showSaveToggle` is true, show a pill toggle below the playback controls:
- Label: `🎵 Mit Audio speichern`
- Default: **off**
- On toggle: calls `onSaveAudioChange(newValue)`

No other changes to VoiceRecorder internals.

### `web/src/components/CreateMemoryModal.tsx`

**New state:**
```ts
const [pendingAudioFilename, setPendingAudioFilename] = useState<string | null>(null);
const [isTranscribing, setIsTranscribing] = useState(false);
const [saveVoiceAudio, setSaveVoiceAudio] = useState(false);
const audioFileInputRef = useRef<HTMLInputElement>(null);
```

**Audio upload section** (new UI block, placed between Fotos and Sprachnotiz):

Label: `🎵 Audio`

Hidden `<input type="file" ref={audioFileInputRef} accept=".m4a,.mp3,.ogg,.opus,.wav,.aac">`.

Button: `🎵 Audio hochladen` (dashed border, same style as photo button).

On file selection:
1. Set `isTranscribing = true`, show spinner on button
2. Call `transcribeAudio(file, true)`
3. On success: set `text` (prepend or replace if empty), set `pendingAudioFilename`
4. On error: show error message
5. Set `isTranscribing = false`

When a file is selected and transcribed, show a small pill: `🎵 <filename> ×` with a remove button that clears `pendingAudioFilename` (file stays on server, cleanup service handles it).

**VoiceRecorder wiring:**
Pass `showSaveToggle={true}` and `onSaveAudioChange={setSaveVoiceAudio}` to `<VoiceRecorder>`.

**Submit handler changes:**

```ts
// 1. Transcribe voice recording (existing logic, modified)
if (audioBlob) {
  const result = await transcribeAudio(audioBlob, saveVoiceAudio);
  finalText = finalText ? `${finalText}\n\n${result.text}` : result.text;
  if (saveVoiceAudio && result.savedFilename) {
    pendingAudioToAttach = result.savedFilename;
  }
}

// 2. Create memory (existing)
const memory = await onCreate({ text: finalText, ... });

// 3. Attach audio if any
const filenameToAttach = pendingAudioFilename || pendingAudioToAttach;
if (filenameToAttach && memory?.id) {
  await attachAudio(memory.id, filenameToAttach);
}
```

Note: `onCreate` in `App.tsx` currently returns `void`. It needs to return `Memory` so the new audio-attach step has the memory ID. This requires a small signature change in `HomeScreenProps` and `App.tsx`.

### New: `web/src/components/AudioPlayer.tsx`

```ts
interface AudioPlayerProps {
  url: string;
  className?: string;
}
```

Uses a hidden `<audio ref={audioRef}>` element. State: `isPlaying`, `currentTime`, `duration`.

UI layout (horizontal, compact):
- Terracotta circle play/pause button (40×40px, min touch target 44px)
- `AudioLines` icon (Lucide) in terracotta as waveform indicator
- Time display: `0:12 / 0:45` in muted text
- Styled to match existing card aesthetics (sand background, rounded-xl)

Handles `onTimeUpdate`, `onLoadedMetadata`, `onEnded` audio events. Pauses on unmount.

### `web/src/components/index.ts`

Export `AudioPlayer`.

### `web/src/components/HomeScreen.tsx`

In the memory card render:

**Audio indicator badge** (alongside existing photo badge):
```tsx
{memory.audios.length > 0 && (
  <span className="flex items-center gap-1 text-xs ...">
    <AudioLines className="w-3 h-3" /> {memory.audios.length}
  </span>
)}
```

**Audio players** (below the memory text, above photos):
```tsx
{memory.audios.length > 0 && (
  <div className="space-y-2 mt-3">
    {memory.audios.map(audio => (
      <AudioPlayer key={audio.id} url={audio.url} />
    ))}
  </div>
)}
```

---

## Data Flow Summary

```
Audio File Upload:
  User selects file → POST /api/transcribe (saveFile:true)
    → { text, savedFilename }
  Text fills modal → user edits
  User clicks Speichern → POST /api/memories → memory.id
    → POST /api/memories/:id/audio { filename: savedFilename }
    → Memory now has audio attachment

Voice Recording + Save:
  User records → stops → toggles "Mit Audio speichern"
  User clicks Speichern → POST /api/transcribe (saveFile:true)
    → { text, savedFilename }
  → POST /api/memories → memory.id
  → POST /api/memories/:id/audio { filename: savedFilename }
```

---

## Error Handling

- Transcription fails: show inline error, clear pending filename, allow retry
- `attachAudio` fails after memory is created: memory is saved (text + photos intact), log error, show non-blocking warning toast. The audio file remains in uploads/ until cleanup.
- Invalid filename in `/api/memories/:id/audio`: 400 response
- File not found: 400 response (could happen if server restarts and cleanup ran)

---

## Out of Scope

- Audio deletion UI (users cannot delete individual audio files in this version)
- Multiple audio files per memory (the UI only allows one at a time, but the DB supports multiple)
- Real waveform visualisation
- Audio editing or trimming
