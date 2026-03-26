# Horizontal Timeline & PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a horizontally scrollable timeline tab showing all memories chronologically, and make Famories installable as a PWA on iPhone home screens.

**Architecture:** `HorizontalTimeline` is a new focused component (one file). HomeScreen gets a third "Chronik" tab. PWA uses `vite-plugin-pwa` (Vite-native, generates SW via Workbox); PNG icons are generated from an SVG source via a one-time `sharp` script.

**Tech Stack:** React 18, TypeScript, Vite, vite-plugin-pwa, Workbox, sharp (icon generation), date-fns, lucide-react

---

## File Structure

| File | Role |
|------|------|
| `web/src/components/HorizontalTimeline.tsx` | New: self-contained horizontal timeline component |
| `web/src/components/HomeScreen.tsx` | Add "Chronik" tab + render HorizontalTimeline |
| `web/public/icon.svg` | New: full-bleed PWA icon (source for PNG generation) |
| `web/public/icon-192.png` | Generated: 192×192 PNG for manifest |
| `web/public/icon-512.png` | Generated: 512×512 PNG for manifest |
| `web/public/apple-touch-icon.png` | Generated: 180×180 PNG for iOS |
| `web/scripts/generate-icons.mjs` | One-time script: converts SVG → PNG via sharp |
| `web/vite.config.ts` | Add vite-plugin-pwa with manifest + Workbox config |
| `web/index.html` | Add apple-touch-icon + manifest link (vite-plugin-pwa injects SW) |

---

### Task 1: HorizontalTimeline Component

**Files:**
- Create: `web/src/components/HorizontalTimeline.tsx`

The component receives all memories, sorts them chronologically (oldest first), builds a flat list of `marker` and `item` entries, and renders a horizontal scroll container.

- [ ] **Step 1: Create `HorizontalTimeline.tsx`**

```tsx
// web/src/components/HorizontalTimeline.tsx
import { useMemo, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Memory } from '../types';

interface HorizontalTimelineProps {
  memories: Memory[];
  onOpenMemory?: (memory: Memory, photoIndex?: number) => void;
}

type TimelineEntry =
  | { type: 'marker'; label: string; key: string }
  | { type: 'item'; memory: Memory; key: string };

export function HorizontalTimeline({ memories, onOpenMemory }: HorizontalTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<TimelineEntry[]>(() => {
    const sorted = [...memories].sort(
      (a, b) => new Date(a.source_date).getTime() - new Date(b.source_date).getTime()
    );

    const result: TimelineEntry[] = [];
    let lastMonthKey = '';

    for (const memory of sorted) {
      const date = parseISO(memory.source_date);
      const monthKey = format(date, 'yyyy-MM');
      if (monthKey !== lastMonthKey) {
        lastMonthKey = monthKey;
        result.push({
          type: 'marker',
          label: format(date, 'MMMM yyyy', { locale: de }),
          key: `marker-${monthKey}`,
        });
      }
      result.push({ type: 'item', memory, key: `item-${memory.id}` });
    }

    return result;
  }, [memories]);

  if (memories.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--color-text-muted)',
          fontSize: '0.95rem',
        }}
      >
        Noch keine Erinnerungen vorhanden.
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0',
        padding: '1.5rem 1.5rem 1rem',
        height: '100%',
        WebkitOverflowScrolling: 'touch',
        scrollSnapType: 'x mandatory',
        cursor: 'grab',
      }}
      onMouseDown={(e) => {
        const el = scrollRef.current;
        if (!el) return;
        el.style.cursor = 'grabbing';
        const startX = e.pageX - el.offsetLeft;
        const startLeft = el.scrollLeft;
        const onMove = (me: MouseEvent) => {
          el.scrollLeft = startLeft - (me.pageX - el.offsetLeft - startX);
        };
        const onUp = () => {
          el.style.cursor = 'grab';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      }}
    >
      {entries.map((entry) => {
        if (entry.type === 'marker') {
          return (
            <div
              key={entry.key}
              style={{
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingRight: '0.75rem',
                paddingTop: '0.25rem',
              }}
            >
              {/* Timeline line segment */}
              <div
                style={{
                  width: '100%',
                  height: '2px',
                  background: 'var(--color-sand-300)',
                  marginBottom: '0.5rem',
                }}
              />
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--color-terracotta-500)',
                  whiteSpace: 'nowrap',
                  paddingLeft: '0.25rem',
                }}
              >
                {entry.label}
              </span>
            </div>
          );
        }

        // type === 'item'
        const { memory } = entry;
        const firstPhoto = memory.photos?.[0];
        const excerpt = (memory.cleaned_summary || '')
          .replace(/\n/g, ' ')
          .slice(0, 40)
          .trim();

        return (
          <div
            key={entry.key}
            onClick={() => onOpenMemory?.(memory, 0)}
            style={{
              flexShrink: 0,
              width: '88px',
              marginRight: '0.5rem',
              cursor: 'pointer',
              scrollSnapAlign: 'start',
            }}
          >
            {/* Thumbnail */}
            <div
              style={{
                width: '88px',
                height: '88px',
                borderRadius: '12px',
                overflow: 'hidden',
                background: firstPhoto
                  ? 'var(--color-sand-100)'
                  : 'linear-gradient(135deg, var(--color-terracotta-100) 0%, var(--color-sand-100) 100%)',
                border: '2px solid var(--color-sand-200)',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              {firstPhoto ? (
                <img
                  src={firstPhoto.url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.75rem',
                  }}
                >
                  💬
                </div>
              )}
              {/* Multi-photo badge */}
              {(memory.photos?.length ?? 0) > 1 && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '3px',
                    right: '3px',
                    background: 'rgba(0,0,0,0.55)',
                    color: 'white',
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '1px 4px',
                    borderRadius: '5px',
                  }}
                >
                  📷{memory.photos.length}
                </div>
              )}
            </div>

            {/* Date */}
            <div
              style={{
                fontSize: '0.65rem',
                color: 'var(--color-text-muted)',
                marginTop: '5px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {format(parseISO(memory.source_date), 'd. MMM', { locale: de })}
            </div>

            {/* Excerpt */}
            {excerpt && (
              <div
                style={{
                  fontSize: '0.62rem',
                  color: 'var(--color-text-secondary)',
                  marginTop: '2px',
                  lineHeight: 1.35,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  maxHeight: '2.7em',
                }}
              >
                {excerpt}
              </div>
            )}
          </div>
        );
      })}

      {/* Right padding sentinel */}
      <div style={{ flexShrink: 0, width: '1.5rem' }} />
    </div>
  );
}
```

- [ ] **Step 2: Export from components index**

In `web/src/components/index.ts`, add:
```ts
export { HorizontalTimeline } from './HorizontalTimeline';
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/HorizontalTimeline.tsx web/src/components/index.ts
git commit -m "feat: add HorizontalTimeline component"
```

---

### Task 2: Add "Chronik" Tab to HomeScreen

**Files:**
- Modify: `web/src/components/HomeScreen.tsx`

The timeline tab appears alongside "Feed" and "Karte". When active, the main content area renders `<HorizontalTimeline>`.

- [ ] **Step 1: Update activeTab type and add timeline render**

In `web/src/components/HomeScreen.tsx`:

**a) Change tab type:**
```ts
// Line 134 — old:
const [activeTab, setActiveTab] = useState<'feed' | 'map'>('feed');

// New:
const [activeTab, setActiveTab] = useState<'feed' | 'map' | 'timeline'>('feed');
```

**b) Add import:**
```ts
// Top of file — add to lucide-react imports:
Clock,
// Add component import:
import { HorizontalTimeline } from './HorizontalTimeline';
```

**c) Add third tab button** (inside the tab `<div>`, after the closing `</button>` of the Karte button, before the closing `</div>` of the tab group):
```tsx
<button
  onClick={() => setActiveTab('timeline')}
  className={`flex items-center justify-center gap-1.5 sm:gap-2 min-w-[44px] min-h-[44px] px-3 sm:px-4 py-2 rounded-xl font-medium transition-all ${
    activeTab === 'timeline'
      ? 'bg-gradient-to-r from-terracotta-500 to-terracotta-600 text-white'
      : 'bg-white/50 hover:bg-white/80'
  }`}
  style={activeTab === 'timeline' ? { boxShadow: 'var(--shadow-glow-terracotta)' } : {}}
>
  <Clock className="w-4 h-4" />
  <span className="hidden sm:inline">Chronik</span>
</button>
```

**d) Update main content conditional** (around the `activeTab === 'map'` ternary):

The current structure is:
```tsx
{activeTab === 'feed' ? (
  <>
    {/* feed sections */}
  </>
) : (
  <div className="w-full" ...>
    <MapView ... />
  </div>
)}
```

Change to:
```tsx
{activeTab === 'feed' ? (
  <>
    {/* feed sections — unchanged */}
  </>
) : activeTab === 'map' ? (
  <div className="w-full" style={{ minHeight: 'calc(100vh - 200px)' }}>
    <MapView memories={filteredMemories} />
  </div>
) : (
  // Timeline tab
  <div
    style={{
      width: '100%',
      height: 'calc(100vh - 200px)',
      minHeight: '300px',
    }}
  >
    <HorizontalTimeline
      memories={memories}
      onOpenMemory={(memory, photoIndex) => {
        if (memory.photos && memory.photos.length > 0) {
          setLightboxImage({ memory, photoIndex: photoIndex ?? 0 });
        }
      }}
    />
  </div>
)}
```

Note: `memories` (all memories, unfiltered) is passed to HorizontalTimeline so the full history is visible regardless of active filters.

- [ ] **Step 2: Commit**

```bash
git add web/src/components/HomeScreen.tsx
git commit -m "feat: add Chronik timeline tab to HomeScreen"
```

---

### Task 3: PWA Icon SVG + Generate PNG Icons

**Files:**
- Create: `web/public/icon.svg`
- Create: `web/scripts/generate-icons.mjs`
- Create (generated): `web/public/icon-192.png`, `web/public/icon-512.png`, `web/public/apple-touch-icon.png`

- [ ] **Step 1: Create `web/public/icon.svg`**

Full-bleed icon (the OS clips it to the appropriate shape). The safe zone is center 80%.

```svg
<!-- web/public/icon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e86b3f"/>
      <stop offset="100%" stop-color="#b84e2c"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="white" stop-opacity="0.18"/>
      <stop offset="55%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <filter id="heartShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="rgba(0,0,0,0.18)"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="512" height="512" fill="url(#bg)"/>
  <!-- Shine -->
  <rect width="512" height="300" fill="url(#shine)"/>

  <!-- Heart (centered, ~300px tall, safe zone 80% = within 52..460) -->
  <path
    d="M256 390
       C160 318 96 268 96 198
       C96 148 132 110 176 110
       C210 110 238 128 256 156
       C274 128 302 110 336 110
       C380 110 416 148 416 198
       C416 268 352 318 256 390Z"
    fill="white"
    opacity="0.96"
    filter="url(#heartShadow)"
  />

  <!-- Small family dots (3 dots in heart = family members) -->
  <circle cx="212" cy="210" r="14" fill="#c05a3d" opacity="0.65"/>
  <circle cx="256" cy="225" r="14" fill="#c05a3d" opacity="0.65"/>
  <circle cx="300" cy="210" r="14" fill="#c05a3d" opacity="0.65"/>

  <!-- Sparkle -->
  <circle cx="388" cy="148" r="10" fill="white" opacity="0.35"/>
  <circle cx="412" cy="124" r="5" fill="white" opacity="0.25"/>
  <circle cx="364" cy="124" r="4" fill="white" opacity="0.2"/>
</svg>
```

- [ ] **Step 2: Create `web/scripts/generate-icons.mjs`**

```js
// web/scripts/generate-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/icon.svg');
const svgBuffer = readFileSync(svgPath);

const sizes = [
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

for (const { size, name } of sizes) {
  const outPath = resolve(__dirname, '../public', name);
  await sharp(svgBuffer).resize(size, size).png().toFile(outPath);
  console.log(`✓ Generated ${name} (${size}×${size})`);
}
```

- [ ] **Step 3: Install sharp and generate icons**

Run from the repo root:
```bash
cd web && npm install --save-dev sharp --legacy-peer-deps
node scripts/generate-icons.mjs
cd ..
```

Expected output:
```
✓ Generated icon-512.png (512×512)
✓ Generated icon-192.png (192×192)
✓ Generated apple-touch-icon.png (180×180)
```

Verify with `ls -la web/public/*.png`

- [ ] **Step 4: Commit**

```bash
git add web/public/icon.svg web/public/icon-192.png web/public/icon-512.png web/public/apple-touch-icon.png web/scripts/generate-icons.mjs web/package.json web/package-lock.json
git commit -m "feat: add PWA icons (SVG source + generated PNGs)"
```

---

### Task 4: Configure vite-plugin-pwa

**Files:**
- Modify: `web/vite.config.ts`
- Modify: `web/package.json` (devDependency)

- [ ] **Step 1: Install vite-plugin-pwa**

```bash
cd web && npm install --save-dev vite-plugin-pwa --legacy-peer-deps
```

- [ ] **Step 2: Update `web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Famories',
        short_name: 'Famories',
        description: 'Eure Familienerinnerungen, für immer bewahrt',
        theme_color: '#c05a3d',
        background_color: '#fdfaf6',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'de',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^\/uploads\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'uploads-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add web/vite.config.ts web/package.json web/package-lock.json
git commit -m "feat: configure vite-plugin-pwa with manifest and Workbox"
```

---

### Task 5: Update index.html with PWA Meta Tags

**Files:**
- Modify: `web/index.html`

`vite-plugin-pwa` auto-injects the `<link rel="manifest">` tag. We only need to add the apple-touch-icon link (iOS) and verify existing meta tags.

- [ ] **Step 1: Add apple-touch-icon and update index.html**

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover" />
    <meta name="theme-color" content="#c05a3d" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Famories" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="description" content="Famories - Eure Familienerinnerungen, für immer bewahrt" />
    <title>Famories - Familienerinnerungen</title>
    <!-- fonts + existing styles unchanged -->
  </head>
  ...
```

Changes from current:
1. Add `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`
2. Add `<meta name="apple-mobile-web-app-title" content="Famories" />`
3. Add `<meta name="mobile-web-app-capable" content="yes" />`
4. Update theme-color from `#fdfaf6` → `#c05a3d` (matches the icon background; shows in Safari address bar)

- [ ] **Step 2: Commit**

```bash
git add web/index.html
git commit -m "feat: add PWA meta tags and apple-touch-icon link"
```

---

### Task 6: Build and Verify

- [ ] **Step 1: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 2: Build**

```bash
cd web && npm run build
```

Expected: Build succeeds. The output should include a `sw.js` or `workbox-*.js` file in `web/dist/`.

Verify:
```bash
ls web/dist/sw.js web/dist/manifest.webmanifest 2>/dev/null || ls web/dist/
```

- [ ] **Step 3: Manual verification checklist**

**Timeline tab:**
- Open app → click "Chronik" tab (clock icon)
- Verify memories appear left-to-right, oldest first
- Verify month/year markers appear when month changes
- Verify photo thumbnails show for memories with photos
- Verify 💬 placeholder shows for text-only memories
- Verify clicking a photo memory opens the lightbox
- Verify horizontal drag-to-scroll works on desktop (grab cursor)
- Verify touch swipe works on mobile

**PWA:**
- Open Chrome DevTools → Application tab → Manifest → verify all icons and metadata
- Open in Safari on iPhone → Share sheet → "Zum Home-Bildschirm" → verify it installs
- Verify the installed app shows the Famories icon
- Verify app opens in standalone mode (no Safari chrome)
- Verify offline: install app, turn off WiFi → app should load from cache

- [ ] **Step 4: Commit built dist**

```bash
git add web/dist
git commit -m "chore: rebuild with timeline and PWA"
```
