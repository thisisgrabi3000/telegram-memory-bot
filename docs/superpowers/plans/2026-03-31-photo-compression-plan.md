# Photo Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress uploaded photos server-side to max 1920px / JPEG 82% quality, reducing storage and load times without data loss.

**Architecture:** A new `imageCompressionService.ts` handles compression via `sharp`. It is called in two places after the file lands on disk but before the filename is persisted to the DB: in the web photo upload route and in the Telegram bot photo handler (after EXIF extraction so GPS data is captured first). Files already small (< 300 KB) are skipped.

**Tech Stack:** `sharp` (Node.js image processing), TypeScript, existing Express/Multer upload pipeline

---

## File Map

| File | Change |
|---|---|
| `src/services/imageCompressionService.ts` | Create — `compressImage(filePath)` function |
| `src/api/memoriesApi.ts` | Modify — make photo route async, call compressImage per file |
| `src/bot/telegramWebhook.ts` | Modify — call compressImage after EXIF, use compressed filename |
| `package.json` | Modify — add `sharp` dependency |

---

### Task 1: Install sharp and create imageCompressionService

**Files:**
- Create: `src/services/imageCompressionService.ts`
- Modify: `package.json`

**Context:**
- `sharp` is not yet installed (`npm ls sharp` shows nothing)
- The service must be callable from both the API and the Telegram bot
- EXIF orientation auto-rotation via `.rotate()` is important — iPhone photos often have orientation metadata but the pixels aren't rotated, so browsers/sharp display them sideways without this call
- Files < 300 KB are already small enough to skip (e.g. low-res Telegram-compressed photos)
- Output is always JPEG. If the input is `.heic`, `.png`, `.webp` etc., the output file gets a `.jpg` extension and the original is deleted.

- [ ] **Step 1: Install sharp**

```bash
cd /Users/cmg/Documents/Claude\ Test\ Ordner/Telegram\ Memory\ App
npm install sharp
npm install --save-dev @types/sharp
```

Verify: `npm ls sharp` should show `sharp@x.x.x`.

- [ ] **Step 2: Create the compression service**

Create `src/services/imageCompressionService.ts`:

```typescript
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 82;
const SKIP_THRESHOLD_BYTES = 300 * 1024; // 300 KB

/**
 * Compresses an image file in-place.
 * - Skips files already smaller than SKIP_THRESHOLD_BYTES
 * - Resizes so the longest side is at most MAX_DIMENSION px (preserves aspect ratio)
 * - Converts to progressive JPEG at JPEG_QUALITY
 * - Auto-rotates based on EXIF orientation tag (fixes sideways iPhone photos)
 * - Returns the (possibly changed) filename — e.g. "foo.heic" → "foo.jpg"
 *
 * IMPORTANT: Extract EXIF data (GPS, date) BEFORE calling this function,
 * because compression strips all EXIF metadata.
 */
export async function compressImage(filePath: string): Promise<string> {
  const stats = fs.statSync(filePath);
  if (stats.size < SKIP_THRESHOLD_BYTES) {
    return path.basename(filePath);
  }

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, ext);
  const outputFilename = `${base}.jpg`;
  const outputPath = path.join(dir, outputFilename);

  // Write to a temp path first — sharp cannot read and write the same file
  const tempPath = path.join(dir, `${base}.tmp.jpg`);

  await sharp(filePath)
    .rotate()
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, progressive: true })
    .toFile(tempPath);

  // Atomically replace: rename temp → output, then delete original if extension changed
  fs.renameSync(tempPath, outputPath);
  if (outputPath !== filePath) {
    fs.unlinkSync(filePath);
  }

  return outputFilename;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/cmg/Documents/Claude\ Test\ Ordner/Telegram\ Memory\ App
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/imageCompressionService.ts package.json package-lock.json
git commit -m "feat: add imageCompressionService with sharp (max 1920px, JPEG 82%)"
```

---

### Task 2: Apply compression in web photo upload route

**Files:**
- Modify: `src/api/memoriesApi.ts:492`

**Context:**
- The route handler is at line 492. It currently uses a synchronous callback `(req, res) => {`.
- It must become `async (req, res) => {` to use `await`.
- Multer saves files to `uploads/` before the handler body runs. The full path is `path.resolve('./uploads') + '/' + file.filename`.
- `compressImage` may return a different filename (e.g. `.heic` → `.jpg`).
- The compressed filename must be used in BOTH `telegram_file_id` AND `local_path` when calling `mediaRepository.create`.
- Multer file size limit is currently 50 MB — reduce to 20 MB since we're compressing anyway.

- [ ] **Step 1: Import compressImage at top of memoriesApi.ts**

Find the imports block at the top of `src/api/memoriesApi.ts`. Add after the existing imports:

```typescript
import { compressImage } from '../services/imageCompressionService';
```

- [ ] **Step 2: Reduce the multer file size limit**

Find (around line 50):
```typescript
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
```

Replace with:
```typescript
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB (compressed server-side)
```

- [ ] **Step 3: Make the photo upload handler async and add compression**

Find the photo upload handler (around line 492):
```typescript
router.post('/memories/:id/photos', writeLimiter, validateParams(idParamSchema), upload.array('photos', 10), (req, res) => {
  try {
    const { id } = req.params as unknown as { id: number };

    const memory = memoryRepository.findById(id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Erinnerung nicht gefunden' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'Keine Dateien hochgeladen' });
    }

    for (const file of files) {
      mediaRepository.create({
        memory_entry_id: id,
        media_type: 'photo',
        telegram_file_id: `web_${file.filename}`,
        local_path: file.filename,
      });
    }
```

Replace with:
```typescript
router.post('/memories/:id/photos', writeLimiter, validateParams(idParamSchema), upload.array('photos', 10), async (req, res) => {
  try {
    const { id } = req.params as unknown as { id: number };

    const memory = memoryRepository.findById(id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Erinnerung nicht gefunden' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'Keine Dateien hochgeladen' });
    }

    const uploadsDir = path.resolve('./uploads');
    for (const file of files) {
      const filePath = path.join(uploadsDir, file.filename);
      const compressedFilename = await compressImage(filePath);
      mediaRepository.create({
        memory_entry_id: id,
        media_type: 'photo',
        telegram_file_id: `web_${compressedFilename}`,
        local_path: compressedFilename,
      });
    }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/cmg/Documents/Claude\ Test\ Ordner/Telegram\ Memory\ App
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/api/memoriesApi.ts
git commit -m "feat: compress web photo uploads (max 1920px, JPEG 82%, limit 20MB)"
```

---

### Task 3: Apply compression in Telegram bot photo handler

**Files:**
- Modify: `src/bot/telegramWebhook.ts:859-955`

**Context:**
- Photo flow: `downloadPhotoFile(file_id)` → `localPath` (full path) → EXIF extraction (lines 868–887) → DB inserts
- Compression must happen AFTER EXIF extraction (GPS/date must be read first, since compression strips EXIF)
- Compression must happen BEFORE both `mediaRepository.create` calls:
  1. Line 897-902: attaching to last recent entry
  2. Line 950-955: creating a new entry
- `fileName` (= `path.basename(localPath)`) is used as `local_path` in both creates — replace with `compressedFilename`
- `localPath` is only used for EXIF extraction, which happens before compression — no change needed there

- [ ] **Step 1: Import compressImage in telegramWebhook.ts**

Find the imports at the top of `src/bot/telegramWebhook.ts`. Add:

```typescript
import { compressImage } from '../services/imageCompressionService';
```

- [ ] **Step 2: Add compression call after EXIF extraction**

Find the EXIF extraction block (around line 868–887):
```typescript
        if (canHaveExif(localPath)) {
          const exifData = await extractExifData(localPath);
          // ...
          if (exifData.latitude !== null && exifData.longitude !== null) {
            // ...
          }
        }

        // Finde den letzten Eintrag (innerhalb der letzten 5 Minuten)
        const lastEntry = memoryRepository.findLast(photoMessage.chat_id);
```

Insert compression between EXIF block and `findLast` call:

```typescript
        if (canHaveExif(localPath)) {
          const exifData = await extractExifData(localPath);
          // ...
          if (exifData.latitude !== null && exifData.longitude !== null) {
            // ...
          }
        }

        // Komprimiere Foto (nach EXIF-Extraktion, damit GPS-Daten vorher gelesen werden)
        const compressedFilename = await compressImage(localPath);

        // Finde den letzten Eintrag (innerhalb der letzten 5 Minuten)
        const lastEntry = memoryRepository.findLast(photoMessage.chat_id);
```

- [ ] **Step 3: Replace `fileName` with `compressedFilename` in both mediaRepository.create calls**

**First create** (attaching to existing entry, around line 897-902):
```typescript
          mediaRepository.create({
            memory_entry_id: lastEntry.id,
            media_type: 'photo',
            telegram_file_id: photoMessage.file_id,
            local_path: fileName,
          });
```

Replace `local_path: fileName` with `local_path: compressedFilename`:
```typescript
          mediaRepository.create({
            memory_entry_id: lastEntry.id,
            media_type: 'photo',
            telegram_file_id: photoMessage.file_id,
            local_path: compressedFilename,
          });
```

**Second create** (new entry, around line 950-955):
```typescript
          mediaRepository.create({
            memory_entry_id: entry.id,
            media_type: 'photo',
            telegram_file_id: photoMessage.file_id,
            local_path: fileName,
          });
```

Replace `local_path: fileName` with `local_path: compressedFilename`:
```typescript
          mediaRepository.create({
            memory_entry_id: entry.id,
            media_type: 'photo',
            telegram_file_id: photoMessage.file_id,
            local_path: compressedFilename,
          });
```

- [ ] **Step 4: Remove the now-unused `fileName` variable**

Find (around line 860):
```typescript
        const fileName = path.basename(localPath);
```

Delete this line entirely — `fileName` was only used in the two `local_path` assignments now replaced by `compressedFilename`.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/cmg/Documents/Claude\ Test\ Ordner/Telegram\ Memory\ App
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/bot/telegramWebhook.ts
git commit -m "feat: compress Telegram photo downloads (max 1920px, JPEG 82%)"
```

---

### Task 4: Build backend and verify

**Files:**
- No new files — backend runs via `tsx` in dev, compiled via `tsc` for production

- [ ] **Step 1: Full TypeScript build**

```bash
cd /Users/cmg/Documents/Claude\ Test\ Ordner/Telegram\ Memory\ App
npm run build
```

Expected: Exits 0, no errors.

- [ ] **Step 2: Manual smoke test**

Start the server locally:
```bash
npm run dev
```

Upload a photo larger than 300 KB via the web app (+  Neue Erinnerung → Foto hochladen). Then check:

```bash
ls -lh /Users/cmg/Documents/Claude\ Test\ Ordner/Telegram\ Memory\ App/uploads/ | tail -5
```

Expected: The newly uploaded file should be significantly smaller than the original (e.g. a 4 MB iPhone photo → ~200–400 KB).

- [ ] **Step 3: Commit build artifacts if any**

```bash
git add -A
git status
# Only commit if there are actual changes (e.g. compiled dist/ files)
git commit -m "build: compile backend after photo compression feature"
```

---

## Done

After all 4 tasks:
- Web photo uploads are compressed before DB insert
- Telegram photo downloads are compressed after EXIF extraction
- Files < 300 KB are untouched
- HEIC/PNG/WebP files are converted to JPEG, originals deleted
- iPhone photos auto-rotated based on EXIF orientation
