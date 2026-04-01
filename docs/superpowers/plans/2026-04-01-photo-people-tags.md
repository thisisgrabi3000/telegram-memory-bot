# Photo People Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users tag family members on individual photos by adding a `people` field per photo, editable from the lightbox.

**Architecture:** A new `photo_people` TEXT column (JSON array) is added to `media_attachments`, mirroring the pattern of `voice_speaker`. A `PATCH /api/memories/:id/photos/:photoId/people` endpoint saves the array. The frontend extends the `Photo` type with `people: string[]` and adds an edit UI in the lightbox: tapping the pencil icon shows toggleable chips for each `FAMILY_MEMBER`; tapping a chip immediately saves the updated array.

**Tech Stack:** TypeScript, Express, better-sqlite3, React 18, Zod, Lucide icons (`Users`, `Pencil`, `Check` — all already imported in HomeScreen)

---

## File Map

| File | Change |
|---|---|
| `src/db/migrations/009_add_photo_people.ts` | New: `ALTER TABLE media_attachments ADD COLUMN photo_people TEXT NULL` |
| `src/db/migrate.ts` | Register migration 009 |
| `src/db/repositories/mediaRepository.ts` | Add `updatePhotoPeople(id, people)` method |
| `src/api/validation.ts` | Add `updatePhotoPeopleSchema` |
| `src/api/memoriesApi.ts` | Include `people` in photo objects in `transformMemory`; add `PATCH /memories/:id/photos/:photoId/people` |
| `src/types/index.ts` | Add `photo_people: string \| null` to `MediaAttachment` |
| `web/src/types/index.ts` | Add `people: string[]` to `Photo` interface |
| `web/src/api/memoriesApi.ts` | Update `RawMemory` photos type; add `updatePhotoPeople()` |
| `web/src/App.tsx` | Add `handleUpdatePhotoPeople` handler; pass `onUpdatePhotoPeople` to HomeScreen |
| `web/src/components/HomeScreen.tsx` | Add `onUpdatePhotoPeople` prop; lightbox people-tag UI |

---

### Task 1: DB migration + repository

**Files:**
- Create: `src/db/migrations/009_add_photo_people.ts`
- Modify: `src/db/migrate.ts`
- Modify: `src/db/repositories/mediaRepository.ts`
- Modify: `src/types/index.ts`

**Context:**
- Migration pattern: see `src/db/migrations/007_add_voice_speaker.ts` — single `ALTER TABLE` in `up()`, no-op `down()`
- `migrate.ts` imports migrations and registers them in an array — see the 007 and 008 entries for the pattern
- `mediaRepository` follows synchronous better-sqlite3 patterns — see `updateSpeaker` for the exact pattern to copy
- `src/types/index.ts` `MediaAttachment` interface (lines 88-96) — add `photo_people: string | null`

- [ ] **Step 1: Create migration**

Create `src/db/migrations/009_add_photo_people.ts`:

```typescript
import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE media_attachments ADD COLUMN photo_people TEXT NULL;`);
}

export function down(db: Database.Database): void {
  // SQLite does not support DROP COLUMN — migration is irreversible
  void db;
}
```

- [ ] **Step 2: Register migration in `src/db/migrate.ts`**

Find:
```typescript
import * as addShareTokens from './migrations/008_add_share_tokens';
```
Replace with:
```typescript
import * as addShareTokens from './migrations/008_add_share_tokens';
import * as addPhotoPeople from './migrations/009_add_photo_people';
```

Find:
```typescript
    { name: '008_add_share_tokens', migration: addShareTokens },
  ];
```
Replace with:
```typescript
    { name: '008_add_share_tokens', migration: addShareTokens },
    { name: '009_add_photo_people', migration: addPhotoPeople },
  ];
```

- [ ] **Step 3: Add `photo_people` to `MediaAttachment` in `src/types/index.ts`**

Find:
```typescript
  voice_speaker: string | null;
}
```
(This is the last field in the `MediaAttachment` interface, around line 95)

Replace with:
```typescript
  voice_speaker: string | null;
  photo_people: string | null;
}
```

- [ ] **Step 4: Add `updatePhotoPeople` to `src/db/repositories/mediaRepository.ts`**

Find:
```typescript
  updateSpeaker(id: number, speaker: string | null): boolean {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE media_attachments SET voice_speaker = ? WHERE id = ?');
    const result = stmt.run(speaker, id);
    return result.changes > 0;
  },
};
```
Replace with:
```typescript
  updateSpeaker(id: number, speaker: string | null): boolean {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE media_attachments SET voice_speaker = ? WHERE id = ?');
    const result = stmt.run(speaker, id);
    return result.changes > 0;
  },

  updatePhotoPeople(id: number, people: string[]): boolean {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE media_attachments SET photo_people = ? WHERE id = ?');
    const result = stmt.run(JSON.stringify(people), id);
    return result.changes > 0;
  },
};
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
git add src/db/migrations/009_add_photo_people.ts src/db/migrate.ts src/db/repositories/mediaRepository.ts src/types/index.ts
git commit -m "feat: add photo_people column + migration + repository method"
```

---

### Task 2: Backend API endpoint

**Files:**
- Modify: `src/api/validation.ts`
- Modify: `src/api/memoriesApi.ts`

**Context:**
- `validation.ts` has `updateSpeakerSchema` (line ~157) — add a parallel `updatePhotoPeopleSchema`
- `transformMemory` function (line 754) builds the `photos` array — each photo object needs a `people` field parsed from `a.photo_people`
- `safeJsonParse` helper is already used in `transformMemory` (line 745-747) — use it for `photo_people` too
- `photoParamSchema` and `validateParams` are already imported in `memoriesApi.ts`
- The new PATCH route follows the exact same structure as `PATCH /memories/:id/audios/:audioId/speaker` (around line 640)

- [ ] **Step 1: Add `updatePhotoPeopleSchema` to `src/api/validation.ts`**

Find:
```typescript
export const updateSpeakerSchema = z.object({
  voice_speaker: z.string().max(MAX_NAME_LENGTH).nullable(),
});
```
Replace with:
```typescript
export const updateSpeakerSchema = z.object({
  voice_speaker: z.string().max(MAX_NAME_LENGTH).nullable(),
});

/**
 * Schema für PATCH /memories/:id/photos/:photoId/people
 */
export const updatePhotoPeopleSchema = z.object({
  people: z.array(z.string().max(MAX_NAME_LENGTH)).max(20),
});
```

- [ ] **Step 2: Include `people` in photo objects in `transformMemory` (`src/api/memoriesApi.ts`)**

Find:
```typescript
    photos: attachments
      .filter(a => a.media_type === 'photo')
      .map(a => ({
        id: a.id,
        url: `/uploads/${a.local_path}`,
        filename: a.local_path,
      })),
```
Replace with:
```typescript
    photos: attachments
      .filter(a => a.media_type === 'photo')
      .map(a => ({
        id: a.id,
        url: `/uploads/${a.local_path}`,
        filename: a.local_path,
        people: safeJsonParse<string[]>(a.photo_people, []),
      })),
```

- [ ] **Step 3: Add import of `updatePhotoPeopleSchema` in `src/api/memoriesApi.ts`**

Find the line that imports validation schemas (contains `updateSpeakerSchema`):
```typescript
import { validateParams, validateBody, idParamSchema, photoParamSchema, audioParamSchema, updateMemorySchema, updateSpeakerSchema, createMemorySchema, searchSchema, updatePersonSchema, updateDateSchema } from './validation';
```
Replace with:
```typescript
import { validateParams, validateBody, idParamSchema, photoParamSchema, audioParamSchema, updateMemorySchema, updateSpeakerSchema, updatePhotoPeopleSchema, createMemorySchema, searchSchema, updatePersonSchema, updateDateSchema } from './validation';
```

Note: if the exact import line looks different, just add `updatePhotoPeopleSchema` to the existing destructured import from `'./validation'`.

- [ ] **Step 4: Add `PATCH /memories/:id/photos/:photoId/people` endpoint**

Find (the DELETE photos endpoint ends around line 614, then DELETE audio starts):
```typescript
/**
 * DELETE /api/memories/:id/audios/:audioId
```
Insert the new PATCH route BEFORE that comment:

```typescript
/**
 * PATCH /api/memories/:id/photos/:photoId/people
 * Aktualisiert die Personen-Tags eines Fotos
 */
router.patch('/memories/:id/photos/:photoId/people', writeLimiter, validateParams(photoParamSchema), validateBody(updatePhotoPeopleSchema), (req, res) => {
  try {
    const { id, photoId } = req.params as unknown as { id: number; photoId: number };
    const { people } = req.body as { people: string[] };

    const memory = memoryRepository.findById(id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Erinnerung nicht gefunden' });
    }

    const attachment = mediaRepository.findById(photoId);
    if (!attachment || attachment.media_type !== 'photo' || attachment.memory_entry_id !== id) {
      return res.status(404).json({ success: false, error: 'Foto nicht gefunden' });
    }

    mediaRepository.updatePhotoPeople(photoId, people);

    const attachments = mediaRepository.findByMemoryId(id);
    res.json({ success: true, data: transformMemory(memory, attachments) });
  } catch (error) {
    console.error('PATCH photo people error:', error);
    res.status(500).json({ success: false, error: 'Fehler beim Aktualisieren' });
  }
});

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
git add src/api/validation.ts src/api/memoriesApi.ts
git commit -m "feat: PATCH /photos/:photoId/people endpoint + photo people in transformMemory"
```

---

### Task 3: Frontend

**Files:**
- Modify: `web/src/types/index.ts`
- Modify: `web/src/api/memoriesApi.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/HomeScreen.tsx`

**Context:**

**`web/src/types/index.ts`:** `Photo` interface (line 71-75) — add `people: string[]`

**`web/src/api/memoriesApi.ts`:**
- `RawMemory` interface (line 12-16) — photos array items need `people: string[]`
- `transformMemoryUrls` (line 19-28) — photos already mapped; add `people: p.people` to the map
- Add `updatePhotoPeople(memoryId, photoId, people)` function at the end of the file

**`web/src/App.tsx`:**
- Add `updatePhotoPeople` to the import from `'./api/memoriesApi'`
- Add `handleUpdatePhotoPeople` handler (same pattern as `handleDeletePhoto`)
- Pass `onUpdatePhotoPeople={handleUpdatePhotoPeople}` to `<HomeScreen>`

**`web/src/components/HomeScreen.tsx`:**
- `Pencil` and `Check` are already imported. `Users` (plural) is NOT in the lucide import — the lightbox JSX below does not use `Users`, so no import change needed.
- Add `onUpdatePhotoPeople?: (memoryId: number, photoId: number, people: string[]) => Promise<void>` to `HomeScreenProps` interface and function signature
- Add two state variables for the lightbox people edit mode:
  - `lightboxPhotoPeopleEditMode: boolean` (default false)
  - `lightboxIsSavingPeople: boolean` (default false)
- Reset `lightboxPhotoPeopleEditMode` when lightbox closes: add to the existing `useEffect` that resets `lightboxEditMode` (line 167-171)
- In the lightbox overlay panel (after the date row, before the `{/* Text display / edit */}` comment at line 1545), add the people tag section

**Important line number note:** All HomeScreen line numbers are approximate. Always find edits by their code content, not line number alone.

- [ ] **Step 1: Add `people` to `Photo` in `web/src/types/index.ts`**

Find:
```typescript
export interface Photo {
  id: number;
  url: string;
  filename: string;
}
```
Replace with:
```typescript
export interface Photo {
  id: number;
  url: string;
  filename: string;
  people: string[];
}
```

- [ ] **Step 2: Update `web/src/api/memoriesApi.ts`**

**2a.** Update `RawMemory` photos type — find:
```typescript
  photos: Array<{ id: number; url: string; filename: string }>;
```
Replace with:
```typescript
  photos: Array<{ id: number; url: string; filename: string; people: string[] }>;
```

**2b.** Update `transformMemoryUrls` photos map — find:
```typescript
    photos: (memory.photos || []).map(p => ({ ...p, url: toAbsolute(p.url) })),
```
Replace with:
```typescript
    photos: (memory.photos || []).map(p => ({ ...p, url: toAbsolute(p.url), people: p.people || [] })),
```

**2c.** Append `updatePhotoPeople` at the end of the file (after the last closing `}`):

```typescript
export async function updatePhotoPeople(memoryId: number, photoId: number, people: string[]): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${memoryId}/photos/${photoId}/people`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ people }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Aktualisieren');
  }

  return transformMemoryUrls(json.data);
}
```

- [ ] **Step 3: Update `web/src/App.tsx`**

**3a.** Add `updatePhotoPeople` to the import from `'./api/memoriesApi'` — find the existing import line that has `deletePhoto, deleteAudio, updateAudioSpeaker, createShareLink` and add `, updatePhotoPeople` to it.

**3b.** Add handler — find:
```typescript
  async function handleShare(memoryId: number) {
```
Insert BEFORE that:
```typescript
  async function handleUpdatePhotoPeople(memoryId: number, photoId: number, people: string[]) {
    const updated = await updatePhotoPeople(memoryId, photoId, people);
    setMemories(prev => prev.map(m => m.id === memoryId ? updated : m));
  }

```

**3c.** Pass prop to HomeScreen — find:
```typescript
      onShare={handleShare}
      identity={identity}
```
Replace with:
```typescript
      onUpdatePhotoPeople={handleUpdatePhotoPeople}
      onShare={handleShare}
      identity={identity}
```

- [ ] **Step 4: Update `web/src/components/HomeScreen.tsx`**

**4a.** Add `onUpdatePhotoPeople` to `HomeScreenProps` — find:
```typescript
  onDeletePhoto?: (memoryId: number, photoId: number) => Promise<void>;
```
Replace with:
```typescript
  onDeletePhoto?: (memoryId: number, photoId: number) => Promise<void>;
  onUpdatePhotoPeople?: (memoryId: number, photoId: number, people: string[]) => Promise<void>;
```

**4b.** Add `onUpdatePhotoPeople` to function signature — find the `export function HomeScreen({` destructuring that includes `onDeletePhoto` and add `onUpdatePhotoPeople` next to it.

**4c.** Add state variables — find:
```typescript
  const [lightboxEditMode, setLightboxEditMode] = useState(false);
  const [lightboxEditText, setLightboxEditText] = useState('');
  const [lightboxIsSaving, setLightboxIsSaving] = useState(false);
```
Replace with:
```typescript
  const [lightboxEditMode, setLightboxEditMode] = useState(false);
  const [lightboxEditText, setLightboxEditText] = useState('');
  const [lightboxIsSaving, setLightboxIsSaving] = useState(false);
  const [lightboxPhotoPeopleEditMode, setLightboxPhotoPeopleEditMode] = useState(false);
  const [lightboxIsSavingPeople, setLightboxIsSavingPeople] = useState(false);
```

**4d.** Reset people edit mode when lightbox closes — find:
```typescript
    if (!lightboxImage) {
      setLightboxEditMode(false);
      setLightboxEditText('');
    }
```
Replace with:
```typescript
    if (!lightboxImage) {
      setLightboxEditMode(false);
      setLightboxEditText('');
      setLightboxPhotoPeopleEditMode(false);
    }
```

**4e.** Add people tag section to lightbox — find the comment that marks the text section:
```tsx
            {/* Text display / edit */}
            <div style={{ marginTop: '0.75rem' }} onClick={e => e.stopPropagation()}>
```
Insert BEFORE it:

```tsx
            {/* People tags for this photo */}
            {(currentPhoto.people.length > 0 || (onUpdatePhotoPeople && lightboxPhotoPeopleEditMode)) && (
              <div style={{ marginTop: '0.5rem' }} onClick={e => e.stopPropagation()}>
                {lightboxPhotoPeopleEditMode ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                    {FAMILY_MEMBERS.map(member => {
                      const isTagged = currentPhoto.people.includes(member.name);
                      return (
                        <button
                          key={member.name}
                          disabled={lightboxIsSavingPeople}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!onUpdatePhotoPeople) return;
                            const newPeople = isTagged
                              ? currentPhoto.people.filter(p => p !== member.name)
                              : [...currentPhoto.people, member.name];
                            setLightboxIsSavingPeople(true);
                            try {
                              await onUpdatePhotoPeople(lightboxImage.memory.id, currentPhoto.id, newPeople);
                            } finally {
                              setLightboxIsSavingPeople(false);
                            }
                          }}
                          style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            border: `1.5px solid ${isTagged ? member.color.activeBg : 'rgba(255,255,255,0.3)'}`,
                            backgroundColor: isTagged ? member.color.activeBg : 'rgba(255,255,255,0.1)',
                            color: isTagged ? 'white' : 'rgba(255,255,255,0.7)',
                            cursor: lightboxIsSavingPeople ? 'not-allowed' : 'pointer',
                            opacity: lightboxIsSavingPeople ? 0.6 : 1,
                            transition: 'all 0.15s',
                          }}
                        >
                          {isTagged && <Check className="w-2.5 h-2.5 inline mr-1" />}
                          {member.name}
                        </button>
                      );
                    })}
                    <button
                      onClick={(e) => { e.stopPropagation(); setLightboxPhotoPeopleEditMode(false); }}
                      style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem', border: 'none', backgroundColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                    {currentPhoto.people.map(person => {
                      const member = FAMILY_MEMBERS.find(m => m.name === person);
                      return (
                        <span
                          key={person}
                          style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: member ? member.color.activeBg : 'rgba(255,255,255,0.2)',
                            color: 'white',
                          }}
                        >
                          {person}
                        </span>
                      );
                    })}
                    {onUpdatePhotoPeople && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setLightboxPhotoPeopleEditMode(true); }}
                        style={{ padding: '0.2rem 0.4rem', borderRadius: '999px', border: 'none', backgroundColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}
                        title="Personen bearbeiten"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                        {currentPhoto.people.length === 0 && <span>Personen</span>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
```

Note: `currentPhoto` is already declared at the top of the lightbox render block (before the `return` JSX). `FAMILY_MEMBERS` is already imported in HomeScreen from `'../types'`. `Check` and `Pencil` are already imported from lucide-react.

- [ ] **Step 5: Build frontend**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App/web"
npm run build
```

Expected: Exits 0, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
git add web/src/types/index.ts web/src/api/memoriesApi.ts web/src/App.tsx web/src/components/HomeScreen.tsx web/dist/
git commit -m "feat: photo people tags — edit in lightbox"
```

---

### Task 4: Smoke test checklist

Start the server (`npm run dev` in project root) and verify:

1. **View existing photo** → open lightbox → no people chips visible (existing photos have no tags yet)
2. **Add a person** → click the pencil/Personen button → member chips appear → click "Junis" → chip turns colored with checkmark → lightbox updates with "Junis" chip in read-only row
3. **Toggle off** → re-enter edit mode → click "Junis" again → chip unselected → read-only row empties
4. **Multiple people** → add "Mama" and "Noah" → both chips appear
5. **Persistence** → reload page → open same photo → "Mama" and "Noah" tags still there
6. **SharedMemoryView** → share a memory with tagged photos → open share link → photos show people chips (read-only — no edit button)

---

## Done

After all tasks:
- Family members can be tagged on individual photos
- Tags are stored per-photo in the DB (`photo_people` column as JSON)
- Tags appear as colored chips in the lightbox; edit mode toggles with a pencil button
- Tags are read-only in the public `SharedMemoryView`
