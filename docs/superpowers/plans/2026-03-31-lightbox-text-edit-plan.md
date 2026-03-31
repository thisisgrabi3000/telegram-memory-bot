# Lightbox Text Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an edit button to the lightbox info panel so users can add or change text on photo-only (or any) memory entries directly from fullscreen view.

**Architecture:** Pure frontend change — the existing `PUT /api/memories/:id` endpoint and `onUpdate` prop already handle text updates. We add 3 state variables + 1 useEffect to HomeScreen.tsx, replace the static text `<p>` with an edit-aware UI block, and rebuild the frontend.

**Tech Stack:** React 19, TypeScript, Tailwind/inline styles (same pattern as existing lightbox), Lucide icons (Pencil already imported)

---

## File Map

| File | Change |
|---|---|
| `web/src/components/HomeScreen.tsx` | Add state, useEffect, handler, replace text display in lightbox |
| `web/dist/` | Rebuild after frontend changes |

No backend changes. No API changes. The existing `PUT /api/memories/:id` → `updateMemory()` → `onUpdate` prop chain handles saves.

---

### Task 1: Add lightbox edit state, sync effect, and save handler

**Files:**
- Modify: `web/src/components/HomeScreen.tsx:91-93` (state block after photoDeleteConfirm)
- Modify: `web/src/components/HomeScreen.tsx:139-164` (lightbox helpers / useEffect area)

**Context:**
- `HomeScreen.tsx` is ~1580 lines. The lightbox state lives around line 89-92.
- `onUpdate?: (id: number, text: string) => Promise<void>` prop already exists (line 20). When called it updates `memories` in App.tsx via `setMemories`.
- `lightboxImage` holds `{ memory: Memory; photoIndex: number }` — it holds a **copy** of the memory object. When `onUpdate` is called and `memories` state updates in App.tsx, `lightboxImage.memory` goes stale. We fix this with a useEffect.
- All close-lightbox calls reset `photoDeleteConfirm` alongside `lightboxImage`. We reset `lightboxEditMode` the same way — via a useEffect on `lightboxImage`.

- [ ] **Step 1: Add the 3 new state variables**

In `web/src/components/HomeScreen.tsx`, find line 91-92:
```tsx
  const [photoDeleteConfirm, setPhotoDeleteConfirm] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
```

Add 3 lines **after** them:
```tsx
  // Lightbox text edit state
  const [lightboxEditMode, setLightboxEditMode] = useState(false);
  const [lightboxEditText, setLightboxEditText] = useState('');
  const [lightboxIsSaving, setLightboxIsSaving] = useState(false);
```

- [ ] **Step 2: Add two useEffects — one to reset edit state on close, one to sync stale lightboxImage.memory**

Find the existing keyboard-handler useEffect (around line 155):
```tsx
  // Keyboard handler for lightbox
  useEffect(() => {
    if (!lightboxImage) return;
    function handleKey(e: KeyboardEvent) {
```

Add these two new effects **before** that block:

```tsx
  // Reset edit state when lightbox closes
  useEffect(() => {
    if (!lightboxImage) {
      setLightboxEditMode(false);
      setLightboxEditText('');
    }
  }, [lightboxImage]);

  // Sync lightboxImage.memory when memories state updates (e.g. after save)
  useEffect(() => {
    if (!lightboxImage) return;
    const updated = memories.find(m => m.id === lightboxImage.memory.id);
    if (updated && updated !== lightboxImage.memory) {
      setLightboxImage(prev => prev ? { ...prev, memory: updated } : null);
    }
  }, [memories]);
```

- [ ] **Step 3: Add the handleLightboxSave handler function**

Find the existing `handleCancelEdit` function (around line 205):
```tsx
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };
```

Add the new handler **after** it:
```tsx
  const handleLightboxSave = async () => {
    if (!onUpdate || !lightboxImage || lightboxEditText.trim() === '') return;
    setLightboxIsSaving(true);
    try {
      await onUpdate(lightboxImage.memory.id, lightboxEditText.trim());
      setLightboxEditMode(false);
    } catch (err) {
      console.error('Fehler beim Speichern des Lightbox-Textes:', err);
    } finally {
      setLightboxIsSaving(false);
    }
  };
```

- [ ] **Step 4: Verify the file builds without errors**

```bash
cd /Users/cmg/Documents/Claude\ Test\ Ordner/Telegram\ Memory\ App/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/cmg/Documents/Claude\ Test\ Ordner/Telegram\ Memory\ App
git add web/src/components/HomeScreen.tsx
git commit -m "feat: add lightbox text edit state, sync effect, and save handler"
```

---

### Task 2: Replace static text display in lightbox with edit-aware UI

**Files:**
- Modify: `web/src/components/HomeScreen.tsx:1447-1451` (the static `cleaned_summary` `<p>` block)

**Context:**
The current static display in the info panel (around line 1447):
```tsx
            {lightboxImage.memory.cleaned_summary && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.75)' }}>
                {lightboxImage.memory.cleaned_summary}
              </p>
            )}
```

This needs to be replaced with a block that shows:
- **View mode:** the text (or "Kein Text vorhanden" placeholder in italic if empty) + a small Pencil button on the right (only if `onUpdate` is set)
- **Edit mode:** a `<textarea>` filled with the current text + "Speichern" / "Abbrechen" buttons

The `Pencil` icon is already imported at line 7.

Design rules (match existing lightbox patterns):
- Buttons: `rgba(255,255,255,0.9)` with dark text for primary, `rgba(255,255,255,0.15)` with white text for secondary
- Text: `rgba(255,255,255,0.75)` for content, `rgba(255,255,255,0.35)` for placeholder
- Textarea: matches the date input style — `rgba(255,255,255,0.1)` bg, `rgba(255,255,255,0.3)` border, white text
- All click handlers: `e.stopPropagation()` to prevent closing the lightbox

- [ ] **Step 1: Replace the static text block**

In `web/src/components/HomeScreen.tsx`, find the exact block (around line 1447):
```tsx
            {lightboxImage.memory.cleaned_summary && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.75)' }}>
                {lightboxImage.memory.cleaned_summary}
              </p>
            )}
```

Replace it entirely with:
```tsx
            {/* Text display / edit */}
            <div style={{ marginTop: '0.75rem' }} onClick={e => e.stopPropagation()}>
              {lightboxEditMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <textarea
                    value={lightboxEditText}
                    onChange={e => setLightboxEditText(e.target.value)}
                    autoFocus
                    disabled={lightboxIsSaving}
                    rows={4}
                    placeholder="Text eingeben..."
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '0.6rem',
                      border: '1px solid rgba(255,255,255,0.3)',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setLightboxEditMode(false); setLightboxEditText(''); }}
                      disabled={lightboxIsSaving}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '0.5rem',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        color: 'white',
                      }}
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={handleLightboxSave}
                      disabled={lightboxIsSaving || lightboxEditText.trim() === ''}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '0.5rem',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        color: '#1a1a1a',
                        opacity: (lightboxIsSaving || lightboxEditText.trim() === '') ? 0.5 : 1,
                      }}
                    >
                      {lightboxIsSaving ? 'Speichern...' : 'Speichern'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  {lightboxImage.memory.cleaned_summary ? (
                    <p style={{ flex: 1, margin: 0, fontSize: '0.8rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.75)' }}>
                      {lightboxImage.memory.cleaned_summary}
                    </p>
                  ) : (
                    <p style={{ flex: 1, margin: 0, fontSize: '0.8rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
                      Kein Text vorhanden
                    </p>
                  )}
                  {onUpdate && (
                    <button
                      onClick={() => {
                        setLightboxEditText(lightboxImage.memory.cleaned_summary || '');
                        setLightboxEditMode(true);
                      }}
                      title="Text bearbeiten"
                      style={{
                        flexShrink: 0,
                        padding: '0.25rem',
                        borderRadius: '0.4rem',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: 'rgba(255,255,255,0.12)',
                        color: 'rgba(255,255,255,0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Pencil style={{ width: '0.9rem', height: '0.9rem' }} />
                    </button>
                  )}
                </div>
              )}
            </div>
```

- [ ] **Step 2: Verify TypeScript has no errors**

```bash
cd /Users/cmg/Documents/Claude\ Test\ Ordner/Telegram\ Memory\ App/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Build frontend**

```bash
cd /Users/cmg/Documents/Claude\ Test\ Ordner/Telegram\ Memory\ App/web && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Manual verification checklist**

Open the app in a browser (or check locally):
1. Open a memory with photos → click a photo to open lightbox
2. In the info panel, verify a small pencil icon appears to the right of the text (or "Kein Text vorhanden" in italic if no text)
3. Click the pencil → textarea opens pre-filled with existing text (or empty)
4. "Speichern" button is disabled when textarea is empty
5. Type text → "Speichern" becomes enabled → click it
6. Textarea disappears, new text shows in info panel
7. Close and reopen lightbox → new text persists (shows in card feed)
8. Open lightbox → click pencil → click "Abbrechen" → textarea closes, original text unchanged
9. Press Escape to close lightbox → lightbox closes, edit mode resets (reopening shows view mode)

- [ ] **Step 5: Commit**

```bash
cd /Users/cmg/Documents/Claude\ Test\ Ordner/Telegram\ Memory\ App
git add web/src/components/HomeScreen.tsx web/dist/
git commit -m "feat: add text edit button to photo lightbox info panel"
```

---

## Done

After both tasks are committed, the feature is complete:
- Photo-only entries show "Kein Text vorhanden" with an edit button in the lightbox
- Entries with existing text show the text + edit button
- Editing works inline in the lightbox, saves via existing PUT endpoint, updates feed immediately
