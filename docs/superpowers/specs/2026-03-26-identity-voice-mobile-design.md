# Identity, Voice Recording & Mobile Fixes — Design Spec

## Goal

Add three features to Famories: per-user identity selection after login, in-browser voice recording with Whisper transcription, and mobile UX fixes (safe-area, upload limit, multi-photo, EXIF date extraction).

## Architecture

The identity system adds a lightweight client-side layer between login and the main app. Voice recording integrates into the existing CreateMemoryModal as a new sub-component with a dedicated backend transcription endpoint. Mobile fixes are targeted CSS and config changes.

## Tech Stack

- React 18 + TypeScript + Vite (frontend)
- Express + better-sqlite3 (backend)
- OpenAI Whisper API (transcription)
- MediaRecorder API (browser audio capture)
- exifr (client-side EXIF extraction)

---

## Feature 1: Login & Identity

### Flow

1. User enters password → session-based login (unchanged)
2. After login, if no `famories_identity` in localStorage → show fullscreen identity picker overlay
3. Overlay shows "Wer bist du?" with 8 buttons: Papa, Mama, Oma Eva, Opa Frank, Moma, Opa Peter, Junis, Noah
4. Selection stored in `localStorage.setItem('famories_identity', name)`
5. On every memory creation, `recorded_by` is set to the identity name (replaces hardcoded "Web App")
6. In settings (gear menu): "Identitaet aendern" option reopens the identity picker

### Technical Details

**New file: `web/src/components/IdentityPicker.tsx`**
- Fullscreen overlay component
- 8 family member buttons with names
- Calls `onSelect(name: string)` prop on selection
- No dismiss/close — selection is mandatory on first use

**Modified: `web/src/App.tsx`**
- New state: `identity: string | null`, initialized from `localStorage.getItem('famories_identity')`
- Render order: `LoginScreen` → `IdentityPicker` (if identity is null) → `HomeScreen`
- Pass `identity` to HomeScreen for use in memory creation
- `onCreate` handler sets `recorded_by` to identity value

**Modified: `web/src/components/HomeScreen.tsx`**
- Settings dropdown: new item "Identitaet aendern"
- Clicking it calls a callback that clears identity and shows picker again

### Data Flow

```
localStorage('famories_identity') → App.tsx state → onCreate() → POST /api/memories { recorded_by: identity }
```

### Constraints

- Identity is client-side only (localStorage), not server-validated
- No new API endpoints needed — uses existing `recorded_by` field
- Family member list is hardcoded (matches existing children config)

---

## Feature 2: Voice Recording in Browser

### Flow

1. CreateMemoryModal shows a microphone area at the top of the form
2. User taps mic button → browser requests microphone permission → recording starts
3. During recording: pulsing red indicator + elapsed timer + stop button
4. On stop: audio preview with play button + delete button (trash icon)
5. Delete button removes the recording, returns to initial mic button state
6. On form submit: audio blob is sent to backend for transcription
7. Backend transcribes via Whisper, returns text
8. Text is used as the memory's input text, then summarized via GPT (existing flow)

### Technical Details

**New file: `web/src/components/VoiceRecorder.tsx`**
- Self-contained component managing MediaRecorder lifecycle
- States: `idle` → `recording` → `recorded`
- Uses `audio/webm` format (widest browser support, Safari 14.5+)
- Props: `onRecordingChange(blob: Blob | null)` — passes audio blob to parent
- Recording UI: red pulsing dot (CSS animation), mm:ss timer, stop button (min 44px touch target)
- Recorded UI: audio element for playback, delete button
- Handles permission denial gracefully (shows error message)

**New file: `src/api/transcribeApi.ts`**
- Express router with single endpoint
- `POST /api/transcribe` — accepts audio file via multer
- Sends audio to OpenAI Whisper API (`whisper-1` model, language: `de`)
- Returns `{ success: true, data: { text: string } }`
- Uses existing AI rate limiter (20 req/hour)
- Error handling: returns 500 with error message if transcription fails

**Modified: `web/src/components/CreateMemoryModal.tsx`**
- Imports and renders `VoiceRecorder` at top of form
- New state: `audioBlob: Blob | null`
- On submit: if audioBlob exists, first POST to `/api/transcribe`, then use returned text as memory text
- Submission flow: transcribe audio → create memory (with transcribed text) → upload photos

**Modified: `src/index.ts`**
- Register transcribe router: `app.use('/api', transcribeRouter)`

**Modified: `src/api/memoriesApi.ts`**
- Multer config: add `audio/*` to allowed MIME types (for future audio attachment support)

### API Contract

```
POST /api/transcribe
Content-Type: multipart/form-data
Body: { audio: File (audio/webm) }

Response 200:
{ "success": true, "data": { "text": "Transkribierter Text..." } }

Response 500:
{ "success": false, "error": "Transcription failed" }
```

### Constraints

- Transcription happens at submit time, not after recording stops (avoids wasted API calls if user deletes recording)
- Audio is not persisted as an attachment — only the transcribed text is saved
- MediaRecorder API requires HTTPS in production (already the case for famories.info)
- Maximum recording length: not enforced (Whisper handles up to 25MB / ~90min)

---

## Feature 3: Mobile Fixes

### 3a: Safe-Area for Save Button

**Problem:** On iPhone Safari, the home indicator bar covers the save button in CreateMemoryModal.

**Fix:** Add bottom padding to the modal's button area:
```css
padding-bottom: max(1rem, env(safe-area-inset-bottom));
```

**Modified: `web/src/components/CreateMemoryModal.tsx`**
- Modal footer/button container gets safe-area bottom padding

### 3b: Upload Limit 50MB

**Problem:** API returns 413 error when uploading larger photos (current limit: 20MB).

**Fix:**
- `express.json({ limit: '50mb' })` in `src/index.ts`
- Multer fileSize: `50 * 1024 * 1024` in `src/api/memoriesApi.ts`

### 3c: Multiple Photo Upload

**Problem:** Verify that selecting multiple photos at once works correctly.

**Fix:** Ensure the file input has `multiple` attribute and the onChange handler appends all selected files (not replaces). The existing CreateMemoryModal already supports up to 10 photos — verify the selection UX works for batch selection.

### 3d: EXIF Date & Location Extraction

**Problem:** Users manually enter date and location, even though photos contain this data in EXIF metadata.

**Fix:** Extract EXIF data client-side when photos are selected.

**New dependency: `exifr`** (~15KB gzipped, tree-shakeable)
- Parse EXIF on file select in CreateMemoryModal
- Extract `DateTimeOriginal` → convert to YYYY-MM-DD
- Extract GPS coordinates → latitude/longitude
- If multiple photos: use oldest date as `source_date`
- If GPS found: pre-fill latitude/longitude (first photo with GPS data)
- User can override both values manually

**Modified: `web/src/components/CreateMemoryModal.tsx`**
- On photo selection: `exifr.parse(file, ['DateTimeOriginal', 'GPSLatitude', 'GPSLongitude'])`
- Auto-fill date field if currently set to today (don't override manual selection)
- Auto-fill coordinates if no location is manually selected
- Show subtle hint: "Datum aus Foto uebernommen" when EXIF date is used

**Modified: `web/package.json`**
- Add `exifr` dependency

---

## File Change Summary

| Action | File | Feature |
|--------|------|---------|
| Create | `web/src/components/IdentityPicker.tsx` | Identity |
| Create | `web/src/components/VoiceRecorder.tsx` | Voice |
| Create | `src/api/transcribeApi.ts` | Voice |
| Modify | `web/src/App.tsx` | Identity |
| Modify | `web/src/components/HomeScreen.tsx` | Identity |
| Modify | `web/src/components/CreateMemoryModal.tsx` | Voice, Mobile |
| Modify | `src/api/memoriesApi.ts` | Mobile (upload limit) |
| Modify | `src/index.ts` | Voice (route), Mobile (json limit) |
| Modify | `web/package.json` | Mobile (exifr dep) |

## Testing Strategy

- Identity: verify localStorage persistence, verify recorded_by in created memories, verify settings menu reset
- Voice: verify recording states (idle/recording/recorded), verify delete clears blob, verify transcription on submit
- Mobile: verify save button visible on iPhone Safari, verify 50MB upload succeeds, verify EXIF date extraction from JPG with GPS
- Cross-browser: MediaRecorder support check (Chrome, Safari 14.5+, Firefox)

## Out of Scope

- Server-side identity validation or per-user auth
- Audio file persistence as media attachment
- Thumbnail generation for uploaded photos
- Automated test suite
