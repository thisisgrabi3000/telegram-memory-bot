# Identity, Voice Recording & Mobile Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user identity selection, in-browser voice recording with Whisper transcription, and mobile UX fixes to the Famories web app.

**Architecture:** Identity is a client-side localStorage layer shown between login and the main app. Voice recording is a self-contained React component integrated into CreateMemoryModal, with a new Express endpoint for Whisper transcription. Mobile fixes are targeted CSS/config changes.

**Tech Stack:** React 18, TypeScript, Vite, Express, multer, OpenAI Whisper API, MediaRecorder API, exifr

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `web/src/components/IdentityPicker.tsx` | Fullscreen identity selection overlay |
| Create | `web/src/components/VoiceRecorder.tsx` | Audio recording component with MediaRecorder |
| Create | `src/api/transcribeApi.ts` | Express endpoint for Whisper transcription |
| Modify | `web/src/App.tsx` | Identity state management, render order, recorded_by |
| Modify | `web/src/components/HomeScreen.tsx` | Settings menu: identity change option |
| Modify | `web/src/components/CreateMemoryModal.tsx` | VoiceRecorder integration, EXIF extraction, safe-area fix |
| Modify | `web/src/components/index.ts` | Export IdentityPicker |
| Modify | `web/src/api/memoriesApi.ts` | Add transcribeAudio function |
| Modify | `src/api/memoriesApi.ts` | Increase upload limit to 50MB, accept audio MIME |
| Modify | `src/index.ts` | Register transcribe route, increase JSON limit |
| Modify | `web/package.json` | Add exifr dependency |

---

### Task 1: IdentityPicker Component

**Files:**
- Create: `web/src/components/IdentityPicker.tsx`
- Modify: `web/src/components/index.ts`

- [ ] **Step 1: Create IdentityPicker component**

```tsx
// web/src/components/IdentityPicker.tsx
import { FAMILY_MEMBERS } from '../types';

interface IdentityPickerProps {
  onSelect: (name: string) => void;
}

export function IdentityPicker({ onSelect }: IdentityPickerProps) {
  // Filter out Bowie (cat) — only humans can be identities
  const members = FAMILY_MEMBERS.filter(m => m.name !== 'Bowie');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      <div className="max-w-sm w-full text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
          style={{
            background: 'linear-gradient(145deg, rgba(232,107,63,0.12) 0%, rgba(251,191,36,0.12) 100%)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <span className="text-3xl">👋</span>
        </div>
        <h2
          className="text-2xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}
        >
          Wer bist du?
        </h2>
        <p className="text-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>
          Damit wir wissen, wer die Erinnerung eingetragen hat.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {members.map((member) => (
            <button
              key={member.name}
              onClick={() => onSelect(member.name)}
              className="px-4 py-3.5 rounded-2xl font-semibold text-white transition-all duration-200 hover:scale-105 min-h-[44px]"
              style={{
                backgroundColor: member.color.activeBg,
                boxShadow: `0 4px 12px ${member.color.activeBg}40`,
              }}
            >
              {member.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add export to index.ts**

Add to `web/src/components/index.ts`:
```ts
export { IdentityPicker } from './IdentityPicker';
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/IdentityPicker.tsx web/src/components/index.ts
git commit -m "feat: add IdentityPicker component"
```

---

### Task 2: Identity Flow in App.tsx

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add identity state and IdentityPicker to App.tsx**

Changes to `web/src/App.tsx`:

1. Import IdentityPicker:
```tsx
import { HomeScreen, LoginScreen, IdentityPicker } from './components';
```

2. Add identity state after existing state declarations (after line 14):
```tsx
const [identity, setIdentity] = useState<string | null>(() =>
  localStorage.getItem('famories_identity')
);
```

3. Add identity handler after `handleLogin` function (after line 42):
```tsx
function handleIdentitySelect(name: string) {
  localStorage.setItem('famories_identity', name);
  setIdentity(name);
}

function handleIdentityReset() {
  localStorage.removeItem('famories_identity');
  setIdentity(null);
}
```

4. In `handleCreate`, add `recorded_by` to the memory data. Change line 100 from:
```tsx
let created = await createMemory(memoryData);
```
to:
```tsx
let created = await createMemory({ ...memoryData, recorded_by: identity || undefined });
```

5. Add `recorded_by` to `CreateMemoryInput` — modify `web/src/api/memoriesApi.ts` line 125-133:
```tsx
export interface CreateMemoryInput {
  text: string;
  child_name?: string;
  location?: string;
  source_date?: string;
  people?: string[];
  latitude?: number;
  longitude?: number;
  recorded_by?: string;
}
```

6. After the login check (after line 159 `return <LoginScreen ...>`), add identity picker:
```tsx
if (!identity) {
  return <IdentityPicker onSelect={handleIdentitySelect} />;
}
```

7. Pass identity callbacks to HomeScreen (add to the props):
```tsx
<HomeScreen
  memories={memories}
  onUpdate={handleUpdate}
  onUpdateDate={handleUpdateDate}
  onUpdatePerson={handleUpdatePerson}
  onDelete={handleDelete}
  onToggleFavorite={handleToggleFavorite}
  onCreate={handleCreate}
  onDeletePhoto={handleDeletePhoto}
  identity={identity}
  onIdentityReset={handleIdentityReset}
/>
```

- [ ] **Step 2: Update backend POST /api/memories to accept recorded_by**

In `src/api/memoriesApi.ts` line 319, add `recorded_by` to destructured body:
```tsx
const { text, child_name, location, source_date, people: explicitPeople, latitude, longitude, recorded_by } = req.body;
```

In line 339, change `recorded_by: 'Web App'` to:
```tsx
recorded_by: recorded_by || 'Web App',
```

In `src/api/validation.ts`, add `recorded_by` to `createMemorySchema`:
```tsx
recorded_by: z.string().max(50).optional(),
```

- [ ] **Step 3: Add identity props to HomeScreen and settings menu**

In `web/src/components/HomeScreen.tsx`:

1. Add to interface (around line 19-30):
```tsx
identity?: string | null;
onIdentityReset?: () => void;
```

2. Destructure in function params.

3. In the settings dropdown (after the Share Link button, around line 442), add:
```tsx
{/* Identity */}
{onIdentityReset && identity && (
  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-sand-200)' }}>
    <div className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: highContrast ? '#000000' : 'var(--color-text-muted)' }}>
      Angemeldet als
    </div>
    <div className="flex items-center justify-between">
      <span className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
        {identity}
      </span>
      <button
        onClick={() => { onIdentityReset(); setShowSettings(false); }}
        className="text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all min-h-[36px]"
        style={{
          backgroundColor: 'var(--color-sand-100)',
          color: 'var(--color-text-muted)',
        }}
      >
        Wechseln
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx web/src/components/HomeScreen.tsx web/src/api/memoriesApi.ts src/api/memoriesApi.ts src/api/validation.ts
git commit -m "feat: add identity selection flow with recorded_by"
```

---

### Task 3: VoiceRecorder Component

**Files:**
- Create: `web/src/components/VoiceRecorder.tsx`

- [ ] **Step 1: Create VoiceRecorder component**

```tsx
// web/src/components/VoiceRecorder.tsx
import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Trash2 } from 'lucide-react';

interface VoiceRecorderProps {
  onRecordingChange: (blob: Blob | null) => void;
  disabled?: boolean;
}

export function VoiceRecorder({ onRecordingChange, disabled }: VoiceRecorderProps) {
  const [state, setState] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onRecordingChange(blob);

        // Create audio URL for playback
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = URL.createObjectURL(blob);

        setState('recorded');
      };

      mediaRecorder.start();
      setState('recording');
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000);
    } catch {
      setError('Mikrofon-Zugriff verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen.');
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }

  function deleteRecording() {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    onRecordingChange(null);
    setState('idle');
    setElapsed(0);
  }

  function togglePlayback() {
    if (!audioUrlRef.current) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const audio = new Audio(audioUrlRef.current);
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    }
  }

  if (error) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
        style={{
          backgroundColor: 'rgba(220, 38, 38, 0.08)',
          border: '1px solid rgba(220, 38, 38, 0.15)',
          color: '#dc2626',
        }}
      >
        <Mic className="w-4 h-4 flex-shrink-0" />
        {error}
      </div>
    );
  }

  // IDLE state
  if (state === 'idle') {
    return (
      <button
        type="button"
        onClick={startRecording}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-all duration-200 hover:border-terracotta-400 min-h-[44px]"
        style={{
          borderColor: 'var(--color-sand-300)',
          color: 'var(--color-text-muted)',
          backgroundColor: 'white',
        }}
      >
        <Mic className="w-4 h-4" style={{ color: 'var(--color-terracotta-500)' }} />
        Sprachnotiz aufnehmen
      </button>
    );
  }

  // RECORDING state
  if (state === 'recording') {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{ backgroundColor: 'rgba(220, 38, 38, 0.06)', border: '1px solid rgba(220, 38, 38, 0.15)' }}
      >
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{
            backgroundColor: '#dc2626',
            animation: 'pulse-soft 1s ease-in-out infinite',
          }}
        />
        <span className="font-mono text-sm font-semibold" style={{ color: '#dc2626' }}>
          {formatTime(elapsed)}
        </span>
        <span className="text-sm flex-1" style={{ color: 'var(--color-text-muted)' }}>
          Aufnahme läuft...
        </span>
        <button
          type="button"
          onClick={stopRecording}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all hover:scale-105"
          style={{ backgroundColor: '#dc2626' }}
        >
          <Square className="w-4 h-4 text-white" fill="white" />
        </button>
      </div>
    );
  }

  // RECORDED state
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ backgroundColor: 'var(--color-sand-50)', border: '1px solid var(--color-sand-200)' }}
    >
      <button
        type="button"
        onClick={togglePlayback}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all hover:scale-105"
        style={{ backgroundColor: 'var(--color-terracotta-500)' }}
      >
        {isPlaying
          ? <Pause className="w-4 h-4 text-white" />
          : <Play className="w-4 h-4 text-white" style={{ marginLeft: '2px' }} />
        }
      </button>
      <div className="flex-1">
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Sprachnotiz
        </span>
        <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
          {formatTime(elapsed)}
        </span>
      </div>
      <button
        type="button"
        onClick={deleteRecording}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all hover:scale-105"
        style={{ backgroundColor: 'rgba(220, 38, 38, 0.08)' }}
      >
        <Trash2 className="w-4 h-4" style={{ color: '#dc2626' }} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/VoiceRecorder.tsx
git commit -m "feat: add VoiceRecorder component with MediaRecorder API"
```

---

### Task 4: Backend Transcription Endpoint

**Files:**
- Create: `src/api/transcribeApi.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create transcribe API route**

```tsx
// src/api/transcribeApi.ts
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';
import { requireAuth } from './authApi';
import { env } from '../config/env';

const router = Router();

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Reuse AI rate limiter: 20 requests per hour
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'AI-Limit erreicht. Bitte in einer Stunde erneut versuchen.' },
});

// Multer for audio uploads — store in temp, delete after transcription
const audioUpload = multer({
  storage: multer.diskStorage({
    destination: path.resolve('./uploads'),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.webm';
      cb(null, `voice_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB (Whisper limit)
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('audio/'));
  },
});

router.use(requireAuth);

/**
 * POST /api/transcribe
 * Transcribes an audio file using OpenAI Whisper
 */
router.post('/transcribe', aiLimiter, audioUpload.single('audio'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ success: false, error: 'Keine Audiodatei hochgeladen' });
  }

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(file.path),
      model: 'whisper-1',
      language: 'de',
    });

    // Delete temp file
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      data: { text: transcription.text },
    });
  } catch (error) {
    // Clean up temp file on error
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    console.error('Transcription error:', error);
    res.status(500).json({
      success: false,
      error: 'Transkription fehlgeschlagen',
    });
  }
});

export const transcribeApi = router;
```

- [ ] **Step 2: Register route in src/index.ts**

Add import at top of `src/index.ts` (after line 10):
```tsx
import { transcribeApi } from './api/transcribeApi';
```

Add route registration after line 83 (`app.use('/api', memoriesApi);`):
```tsx
app.use('/api', transcribeApi);
```

- [ ] **Step 3: Commit**

```bash
git add src/api/transcribeApi.ts src/index.ts
git commit -m "feat: add /api/transcribe endpoint with Whisper"
```

---

### Task 5: Integrate VoiceRecorder into CreateMemoryModal

**Files:**
- Modify: `web/src/components/CreateMemoryModal.tsx`
- Modify: `web/src/api/memoriesApi.ts`

- [ ] **Step 1: Add transcribeAudio function to frontend API**

Add to `web/src/api/memoriesApi.ts` (at the end, before the last line):

```tsx
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

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

  return json.data.text;
}
```

- [ ] **Step 2: Integrate VoiceRecorder into CreateMemoryModal**

In `web/src/components/CreateMemoryModal.tsx`:

1. Add imports:
```tsx
import { Mic } from 'lucide-react';
import { VoiceRecorder } from './VoiceRecorder';
import { transcribeAudio } from '../api/memoriesApi';
```

2. Add state (after line 34):
```tsx
const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
```

3. Modify `handleSubmit` — before `await onCreate(...)` (around line 95), add transcription step:
```tsx
let finalText = text.trim();

// Transcribe audio if present
if (audioBlob) {
  try {
    const transcribed = await transcribeAudio(audioBlob);
    finalText = finalText ? `${finalText}\n\n${transcribed}` : transcribed;
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Transkription fehlgeschlagen');
    setIsSubmitting(false);
    return;
  }
}
```

Then change the `onCreate` call to use `finalText` instead of `text.trim()`:
```tsx
await onCreate({
  text: finalText,
  // ... rest unchanged
});
```

4. Add VoiceRecorder in the JSX, after the Photo Upload section and before the Text Input section (between lines 231 and 233):
```tsx
{/* Voice Recording */}
<div>
  <label
    className="flex items-center gap-2 text-sm font-bold mb-3"
    style={{ color: 'var(--color-text-primary)' }}
  >
    <Mic className="w-4 h-4" style={{ color: 'var(--color-terracotta-500)' }} />
    Sprachnotiz
  </label>
  <VoiceRecorder
    onRecordingChange={setAudioBlob}
    disabled={isSubmitting}
  />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/CreateMemoryModal.tsx web/src/api/memoriesApi.ts
git commit -m "feat: integrate voice recording into memory creation"
```

---

### Task 6: Mobile Fixes — Safe Area, Upload Limit, EXIF

**Files:**
- Modify: `web/src/components/CreateMemoryModal.tsx`
- Modify: `src/api/memoriesApi.ts`
- Modify: `src/index.ts`
- Modify: `web/package.json`

- [ ] **Step 1: Fix safe-area for submit buttons**

In `web/src/components/CreateMemoryModal.tsx`, change the submit button container (line 395):
```tsx
<div className="flex gap-3 pt-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
```

- [ ] **Step 2: Increase upload limit to 50MB**

In `src/api/memoriesApi.ts` line 49, change:
```tsx
limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
```

In `src/api/memoriesApi.ts` line 50-52, expand file filter to also accept audio:
```tsx
fileFilter: (_req, file, cb) => {
  cb(null, file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/'));
},
```

In `src/index.ts` line 61, change:
```tsx
app.use(express.json({ limit: '50mb' }));
```

- [ ] **Step 3: Install exifr and add EXIF extraction to CreateMemoryModal**

```bash
cd web && npm install exifr
```

In `web/src/components/CreateMemoryModal.tsx`:

1. Add import at top:
```tsx
import exifr from 'exifr';
```

2. Add state for EXIF hint (after audioBlob state):
```tsx
const [exifHint, setExifHint] = useState<string | null>(null);
```

3. Replace the `handlePhotoChange` function (lines 61-78) with:
```tsx
async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  const newPhotos = [...photos, ...files].slice(0, 10);
  setPhotos(newPhotos);

  // Generate previews
  const newPreviews = [...photoPreviews];
  files.slice(0, 10 - photoPreviews.length).forEach(file => {
    const url = URL.createObjectURL(file);
    newPreviews.push(url);
  });
  setPhotoPreviews(newPreviews.slice(0, 10));

  // Reset input so same file can be re-selected
  e.target.value = '';

  // Extract EXIF data from new files
  const today = new Date().toISOString().split('T')[0];
  let oldestDate: string | null = null;
  let firstGps: { latitude: number; longitude: number } | null = null;

  for (const file of files) {
    try {
      const exif = await exifr.parse(file, ['DateTimeOriginal', 'GPSLatitude', 'GPSLongitude']);
      if (!exif) continue;

      if (exif.DateTimeOriginal) {
        const d = exif.DateTimeOriginal instanceof Date
          ? exif.DateTimeOriginal
          : new Date(exif.DateTimeOriginal);
        if (!isNaN(d.getTime())) {
          const dateStr = d.toISOString().split('T')[0];
          if (!oldestDate || dateStr < oldestDate) oldestDate = dateStr;
        }
      }

      if (!firstGps && exif.GPSLatitude != null && exif.GPSLongitude != null) {
        firstGps = { latitude: exif.latitude, longitude: exif.longitude };
      }
    } catch {
      // EXIF extraction failed for this file — skip silently
    }
  }

  // Auto-fill date if it's still today (user hasn't manually changed it)
  if (oldestDate && date === today) {
    setDate(oldestDate);
    setExifHint(`Datum aus Foto: ${oldestDate}`);
  }

  // Auto-fill GPS if no location manually selected
  if (firstGps && !locationCoords && !presetLocation && !customLocation) {
    setLocationCoords({
      latitude: firstGps.latitude,
      longitude: firstGps.longitude,
      displayName: '',
    });
  }
}
```

4. Show EXIF hint below the date input (after line 376):
```tsx
{exifHint && (
  <p className="text-xs mt-1.5" style={{ color: 'var(--color-sage-500)' }}>
    {exifHint}
  </p>
)}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/CreateMemoryModal.tsx src/api/memoriesApi.ts src/index.ts web/package.json web/package-lock.json
git commit -m "feat: mobile fixes — safe-area, 50MB upload, EXIF date extraction"
```

---

### Task 7: Build and Verify

**Files:** None (verification only)

- [ ] **Step 1: Install dependencies and build frontend**

```bash
cd web && npm install && npm run build
```

- [ ] **Step 2: Build backend**

```bash
cd /project-root && npm run build
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd web && npx tsc --noEmit
```

- [ ] **Step 4: Manual verification checklist**

- Start the app, login with password
- Verify IdentityPicker appears after login
- Select identity, verify localStorage is set
- Create a memory, verify `recorded_by` shows selected identity
- Open settings, verify "Angemeldet als [name]" with "Wechseln" button
- Test voice recording: record, playback, delete, re-record
- Test voice recording + submit: verify transcribed text appears in memory
- Upload a photo with EXIF data, verify date auto-fills
- Upload multiple photos at once
- Test on iPhone Safari: verify save button is not covered by home indicator
