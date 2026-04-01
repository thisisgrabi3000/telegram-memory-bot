# Lazy Loading / Infinite Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded slice limits and a manual "Mehr laden" button with IntersectionObserver-based infinite scroll in the text feed and photo grid.

**Architecture:** Two sentinels — a `<div ref={textSentinelRef} />` inside the scrollable text box (observer `root = scrollable div`) and a `<div ref={photoSentinelRef} />` below the photo grid (observer `root = viewport`). On intersection, each increments its visible-count state. The text feed also resets its count when filters change. No backend changes: the current default limit of 100 entries is fine; client-side filtering requires all data in memory.

**Tech Stack:** React 18, TypeScript, browser-native `IntersectionObserver` (no new packages)

---

## File Map

| File | Change |
|---|---|
| `web/src/components/HomeScreen.tsx` | Add `useRef`, new state + refs, 3 new effects, sentinel divs; change `slice(0,10)` to `slice(0,visibleEntries)`; replace "Mehr laden" button |
| `web/dist/` | Rebuild after frontend changes |

---

### Task 1: Add state, refs, and IntersectionObserver effects

**Files:**
- Modify: `web/src/components/HomeScreen.tsx`

**Context:**
- Current imports line 1: `import { useState, useMemo, useEffect } from 'react';`
- `visibleImages` state at line 97: `const [visibleImages, setVisibleImages] = useState(24);`
- Existing effects end at line 196 (keyboard handler: `}, [lightboxImage, lightboxEditMode]);`)
- `textEntries` is a `useMemo` whose reference changes when `filteredMemories` changes — so `[textEntries]` as a dep correctly fires on every filter/search change
- `IntersectionObserver` is browser-native; no import needed
- **Important:** `photoSentinelRef` must be declared before the JSX that uses it. Declare all refs together in this task even though `photoSentinelRef`'s JSX change is in Task 2. This means `tsc --noEmit` will report `'photoSentinelRef' is declared but never read` until Task 2 is done — that's expected. Run the tsc check only after Task 2.

- [ ] **Step 1: Add `useRef` to React imports**

Find (line 1):
```tsx
import { useState, useMemo, useEffect } from 'react';
```
Replace with:
```tsx
import { useState, useMemo, useEffect, useRef } from 'react';
```

- [ ] **Step 2: Add `visibleEntries` state and all refs**

Find (line 97):
```tsx
  const [visibleImages, setVisibleImages] = useState(24);
```
Replace with:
```tsx
  const [visibleImages, setVisibleImages] = useState(24);
  const [visibleEntries, setVisibleEntries] = useState(20);
  const textScrollRef = useRef<HTMLDivElement>(null);
  const textSentinelRef = useRef<HTMLDivElement>(null);
  const photoSentinelRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 3: Add three new useEffect hooks after the keyboard handler**

Find (lines 195-196):
```tsx
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightboxImage, lightboxEditMode]);
```
Replace with:
```tsx
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightboxImage, lightboxEditMode]);

  // Reset visible count when filtered list changes (e.g. user changes a filter)
  useEffect(() => {
    setVisibleEntries(20);
  }, [textEntries]);

  // Auto-load more text entries as user scrolls to the bottom of the feed
  useEffect(() => {
    const root = textScrollRef.current;
    const sentinel = textSentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleEntries(prev => prev < textEntries.length ? prev + 20 : prev);
        }
      },
      { root, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [textEntries]);

  // Auto-load more photos as user scrolls to the sentinel below the grid
  useEffect(() => {
    const sentinel = photoSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleImages(prev => prev < memoryPhotoGroups.length ? prev + 24 : prev);
        }
      },
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [memoryPhotoGroups.length]);
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
git add web/src/components/HomeScreen.tsx
git commit -m "feat: add infinite scroll state, refs, and IntersectionObserver effects"
```

---

### Task 2: Wire sentinels into JSX + replace Load More button

**Files:**
- Modify: `web/src/components/HomeScreen.tsx`

**Context:**
- Scrollable text div is at line 867: `<div className="p-4 space-y-3 max-h-[28rem] overflow-y-auto scrollbar-thin">`
- `textEntries.slice(0, 10).map(...)` at line 881
- Map closes at line 1180 (`})`), ternary closes at 1181 (`)`), scrollable div closes at 1182 (`</div>`)
- Load More button block is at lines 1292-1315
- `ImageIcon` is also used at the Fotogalerie section header (~line 1197) — removing the button won't cause an unused-import error

- [ ] **Step 1: Add `ref` to the scrollable text div and change slice limit**

Find (around line 867):
```tsx
              <div className="p-4 space-y-3 max-h-[28rem] overflow-y-auto scrollbar-thin">
```
Replace with:
```tsx
              <div ref={textScrollRef} className="p-4 space-y-3 max-h-[28rem] overflow-y-auto scrollbar-thin">
```

Find (around line 881):
```tsx
                  textEntries.slice(0, 10).map((memory, index) => {
```
Replace with:
```tsx
                  textEntries.slice(0, visibleEntries).map((memory, index) => {
```

- [ ] **Step 2: Add text sentinel inside the scrollable div**

Find the closing section of the text feed (around lines 1180-1182):
```tsx
                  })
                )}
              </div>
```
Replace with:
```tsx
                  })
                )}
                <div ref={textSentinelRef} />
              </div>
```

- [ ] **Step 3: Replace the Load More button with a photo sentinel**

Find the entire Load More button block (around lines 1292-1315):
```tsx
              {/* Load More Button */}
              {visibleImages < memoryPhotoGroups.length && (
                <div className="text-center mt-10">
                  <button
                    onClick={() => setVisibleImages(prev => prev + 24)}
                    className="group inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-semibold transition-all duration-300 hover:scale-105"
                    style={{
                      background: 'var(--glass-bg-strong)',
                      border: '2px solid var(--color-sand-300)',
                      color: 'var(--color-text-primary)',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    <ImageIcon className="w-5 h-5 transition-transform group-hover:scale-110" style={{ color: 'var(--color-sage-500)' }} />
                    <span>Mehr laden</span>
                    <span
                      className="px-2 py-0.5 rounded-full text-sm"
                      style={{ backgroundColor: 'var(--color-sand-200)' }}
                    >
                      {memoryPhotoGroups.length - visibleImages}
                    </span>
                  </button>
                </div>
              )}
```

Replace with:
```tsx
              {/* Infinite scroll sentinel — always rendered so the observer always has a target */}
              <div ref={photoSentinelRef} className="mt-6 h-8 flex items-center justify-center">
                {visibleImages < memoryPhotoGroups.length && (
                  <div
                    className="w-5 h-5 rounded-full border-2 animate-spin"
                    style={{ borderColor: 'var(--color-sand-200)', borderTopColor: 'var(--color-terracotta-400)' }}
                  />
                )}
              </div>
```

Note: The sentinel outer `<div>` is always in the DOM (not conditional) so `photoSentinelRef.current` is always populated. The spinner inside is conditional — visible only while more photos remain.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App/web"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
git add web/src/components/HomeScreen.tsx
git commit -m "feat: wire infinite scroll sentinels — text feed + photo grid"
```

---

### Task 3: Build frontend and verify

**Files:**
- Modify: `web/dist/`

- [ ] **Step 1: Build frontend**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App/web"
npm run build
```

Expected: Exits 0, no errors.

- [ ] **Step 2: Smoke test checklist**

Start the server (`npm run dev` in project root) and open the app:

1. Text feed (Aktuelles section): scroll to the bottom of the message box — new entries should auto-load as the sentinel enters view
2. Text feed: change a filter (e.g. switch person) — the feed resets to showing 20 entries
3. Photo grid: scroll down on the page — more photos auto-load (spinner appears briefly, then photos appear)
4. Photo grid: when all photos are loaded, the spinner disappears and no further loading occurs

- [ ] **Step 3: Commit dist**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Telegram Memory App"
git add web/dist/
git commit -m "build: rebuild frontend with infinite scroll"
```

---

## Done

After all 3 tasks:
- Text feed shows 20 entries initially; loads +20 on each scroll-to-bottom inside the message box
- Filter/search changes reset the text feed to 20 entries
- Photo grid loads 24 at a time automatically as the user scrolls; no manual button
- No new npm packages
- No backend changes
