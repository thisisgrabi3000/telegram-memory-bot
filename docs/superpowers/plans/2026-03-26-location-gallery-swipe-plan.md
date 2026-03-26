# Location Search & Gallery Swipe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace preset location buttons with real family addresses (auto-coords), improve Nominatim search with POI type icons, and add swipeable photo galleries within memories.

**Architecture:** Pure frontend changes across 5 files. No new dependencies. Touch swipe via custom onTouchStart/onTouchEnd handlers. Lightbox state refactored from flat `{url, photoId}` to `{memory, photoIndex}` to enable in-memory navigation.

**Tech Stack:** React 18, TypeScript, Vite, Nominatim API, MediaRecorder (existing)

---

## File Structure

| File | Change |
|------|--------|
| `web/src/types/index.ts` | Add `latitude`, `longitude`, `address` to `LOCATIONS`, replace with 4 real family locations |
| `web/src/components/CreateMemoryModal.tsx` | Preset location click sets `locationCoords` from LOCATIONS data |
| `web/src/components/LocationAutocomplete.tsx` | Better Nominatim params + place type icon |
| `web/src/components/HomeScreen.tsx` | Gallery one-per-memory, lightbox state + swipe + keyboard |
| `web/src/components/MapView.tsx` | Touch swipe in LocationPopup |

---

### Task 1: Update LOCATIONS Type and Data

**Files:**
- Modify: `web/src/types/index.ts`

- [ ] **Step 1: Update LOCATIONS interface and data**

Replace the `LOCATIONS` export in `web/src/types/index.ts`. The current type is inferred (no explicit interface). Replace the whole array:

```ts
// Old (lines 109-116):
export const LOCATIONS = [
  { name: 'Zuhause', emoji: '🏠' },
  { name: 'Oma & Opa', emoji: '👵' },
  { name: 'Kita', emoji: '🏫' },
  { name: 'Spielplatz', emoji: '🛝' },
  { name: 'Urlaub', emoji: '✈️' },
  { name: 'Unterwegs', emoji: '🚗' },
];

// New:
export const LOCATIONS = [
  {
    name: 'Zuhause',
    emoji: '🏠',
    address: 'Saturnstr. 14, Lübeck',
    latitude: 53.8290,
    longitude: 10.7125,
  },
  {
    name: 'Oma & Opa Eva',
    emoji: '👵',
    address: 'Gustav-Falke-Str., Lübeck',
    latitude: 53.8448,
    longitude: 10.7142,
  },
  {
    name: 'Opa Peter & Moma',
    emoji: '🏡',
    address: 'Schützenstr. 43, Hattenhofen',
    latitude: 48.6678,
    longitude: 9.5598,
  },
  {
    name: 'Arguineguín',
    emoji: '🌴',
    address: 'Gran Canaria',
    latitude: 27.7591,
    longitude: -15.6813,
  },
] as const;

export type LocationName = (typeof LOCATIONS)[number]['name'];
```

- [ ] **Step 2: Fix allLocations filter in HomeScreen.tsx**

In `web/src/components/HomeScreen.tsx` line 273, change:
```ts
// Old (broken - compares "🏠 Zuhause" to stored "Zuhause"):
const allLocations = ['Alle', ...LOCATIONS.map(l => `${l.emoji} ${l.name}`)];

// New (just the name, display emoji in UI separately):
const allLocations = ['Alle', ...LOCATIONS.map(l => l.name)];
```

Also update wherever the filter chip/button displays the location value to show emoji via lookup:
```ts
function getLocationEmoji(name: string): string {
  return LOCATIONS.find(l => l.name === name)?.emoji ?? '📍';
}
```

Find the location filter button/chip display (search for `locationFilter` in the JSX, around line 550-600 where filter chips are shown) and prepend `getLocationEmoji(locationFilter)` to the display text.

- [ ] **Step 3: Commit**

```bash
git add web/src/types/index.ts web/src/components/HomeScreen.tsx
git commit -m "feat: replace preset locations with real family addresses"
```

---

### Task 2: Preset Location Coordinates in CreateMemoryModal

**Files:**
- Modify: `web/src/components/CreateMemoryModal.tsx`

- [ ] **Step 1: Make preset buttons set locationCoords**

In `web/src/components/CreateMemoryModal.tsx`, update `selectPresetLocation`:

```ts
// Current (line 45-49):
function selectPresetLocation(name: string) {
  setPresetLocation(name === presetLocation ? '' : name);
  setCustomLocation('');
  setLocationCoords(null);
}

// New:
function selectPresetLocation(name: string) {
  const isDeselecting = name === presetLocation;
  setPresetLocation(isDeselecting ? '' : name);
  setCustomLocation('');

  if (isDeselecting) {
    setLocationCoords(null);
  } else {
    const loc = LOCATIONS.find(l => l.name === name);
    if (loc && 'latitude' in loc) {
      setLocationCoords({ name: loc.name, latitude: loc.latitude, longitude: loc.longitude });
    } else {
      setLocationCoords(null);
    }
  }
}
```

Also update the preset button label to show the address as a subtitle on the active state:

Find the preset button in the JSX (around line 327-345) and update the button to show the address tooltip. Add `title={loc.address}` to the button element:
```tsx
<button
  key={loc.name}
  type="button"
  onClick={() => selectPresetLocation(loc.name)}
  title={`address` in loc ? loc.address : undefined}
  ...
>
  {loc.emoji} {loc.name}
</button>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/CreateMemoryModal.tsx
git commit -m "feat: preset locations auto-fill coordinates"
```

---

### Task 3: Nominatim Search Improvements

**Files:**
- Modify: `web/src/components/LocationAutocomplete.tsx`

- [ ] **Step 1: Add extratags to the interface**

In `web/src/components/LocationAutocomplete.tsx`, update the `LocationSuggestion` interface (lines 4-8):

```ts
interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  extratags?: {
    aeroway?: string;
    amenity?: string;
    tourism?: string;
    leisure?: string;
    shop?: string;
    office?: string;
  };
  address?: {
    city?: string;
    town?: string;
    village?: string;
    country?: string;
  };
}
```

- [ ] **Step 2: Update Nominatim URL and add type icon helper**

In the `handleInputChange` function (line 66-82), update the fetch URL and add icon logic:

```ts
// Add before the useEffect / functions:
function getPlaceIcon(extratags?: LocationSuggestion['extratags']): string {
  if (!extratags) return '📍';
  if (extratags.aeroway === 'aerodrome') return '✈️';
  if (extratags.amenity === 'restaurant' || extratags.amenity === 'cafe' || extratags.amenity === 'fast_food') return '🍽️';
  if (extratags.tourism === 'attraction' || extratags.tourism === 'museum' || extratags.tourism === 'gallery') return '🏛️';
  if (extratags.tourism === 'hotel' || extratags.tourism === 'hostel') return '🏨';
  if (extratags.leisure === 'park' || extratags.leisure === 'garden') return '🌳';
  if (extratags.amenity === 'hospital' || extratags.amenity === 'clinic') return '🏥';
  if (extratags.amenity === 'school' || extratags.amenity === 'university') return '🏫';
  if (extratags.shop) return '🛍️';
  if (extratags.amenity === 'place_of_worship') return '⛪';
  return '📍';
}
```

Update the fetch URL (line 69):
```ts
// Old:
const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&accept-language=de`;

// New:
const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=8&accept-language=de&addressdetails=1&extratags=1`;
```

- [ ] **Step 3: Use place icon in dropdown**

In the suggestion dropdown render (lines 166-203), update to use the place icon instead of the static MapPin icon:

```tsx
// Replace the MapPin icon in each suggestion item:
{suggestions.map((s, i) => {
  const parts = s.display_name.split(',');
  const primary = parts[0].trim();
  const secondary = parts.slice(1, 3).join(',').trim();
  const icon = getPlaceIcon(s.extratags);
  return (
    <button key={i} type="button" onClick={() => handleSelect(s)} ...>
      <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>{icon}</span>
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {primary}
        </div>
        {secondary && (
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {secondary}
          </div>
        )}
      </div>
    </button>
  );
})}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/LocationAutocomplete.tsx
git commit -m "feat: improve Nominatim search with POI type icons"
```

---

### Task 4: Gallery — One Thumbnail Per Memory

**Files:**
- Modify: `web/src/components/HomeScreen.tsx`

- [ ] **Step 1: Replace photoEntries with memoryPhotoGroups**

In `web/src/components/HomeScreen.tsx`, replace the `photoEntries` useMemo (lines 254-270):

```ts
// Old:
const photoEntries = useMemo(() => {
  const photos: { url: string; memory: Memory; date: string; photoId: number }[] = [];
  filteredMemories.forEach(memory => {
    if (memory.photos && memory.photos.length > 0) {
      memory.photos.forEach(photo => {
        photos.push({ url: photo.url, memory, date: memory.source_date, photoId: photo.id });
      });
    }
  });
  return photos.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}, [filteredMemories]);

// New:
const memoryPhotoGroups = useMemo(() => {
  return filteredMemories
    .filter(m => m.photos && m.photos.length > 0)
    .sort((a, b) => new Date(b.source_date).getTime() - new Date(a.source_date).getTime());
}, [filteredMemories]);
```

- [ ] **Step 2: Update gallery grid to use memoryPhotoGroups**

Find the gallery grid render (around line 1104-1138). Replace the grid content:

```tsx
// Old: {photoEntries.slice(0, visibleImages).map((photo, index) => { ... })}
// New:
{memoryPhotoGroups.slice(0, visibleImages).map((memory, index) => {
  const firstPhoto = memory.photos[0];
  const photoCount = memory.photos.length;
  return (
    <div
      key={memory.id}
      className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer group animate-fade-in-up stagger-${(index % 10) + 1}`}
      style={{ boxShadow: 'var(--shadow-sm)' }}
      onClick={() => setLightboxImage({ memory, photoIndex: 0 })}
    >
      <img
        src={firstPhoto.url}
        alt=""
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-all duration-300" />

      {/* Photo count badge */}
      {photoCount > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '4px',
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 5px',
            borderRadius: '6px',
            lineHeight: 1.4,
          }}
        >
          1/{photoCount} 📷
        </div>
      )}

      {/* Favorite indicator */}
      {memory.is_favorite && (
        <div className="absolute top-1 right-1">
          <Star className="w-3 h-3" style={{ color: 'var(--color-amber-400)', fill: 'var(--color-amber-400)' }} />
        </div>
      )}
    </div>
  );
})}
```

Also update the "load more" count:
```tsx
// Old: photoEntries.length - visibleImages
// New: memoryPhotoGroups.length - visibleImages
```

And count display in section header:
```tsx
// Old: {photoEntries.length} Bilder (or similar)
// New: {memoryPhotoGroups.length} Erinnerungen mit Fotos (or similar)
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/HomeScreen.tsx
git commit -m "feat: gallery shows one thumbnail per memory with count badge"
```

---

### Task 5: Lightbox — State Refactor + Swipe + Keyboard

**Files:**
- Modify: `web/src/components/HomeScreen.tsx`

- [ ] **Step 1: Update lightboxImage state type**

In `web/src/components/HomeScreen.tsx`, change the state declaration (line 86):

```ts
// Old:
const [lightboxImage, setLightboxImage] = useState<{ url: string; memory: Memory; photoId: number } | null>(null);

// New:
const [lightboxImage, setLightboxImage] = useState<{ memory: Memory; photoIndex: number } | null>(null);
```

Add touch state (right after):
```ts
const [lightboxTouchStartX, setLightboxTouchStartX] = useState(0);
```

- [ ] **Step 2: Add navigation helpers and keyboard handler**

Add these helpers near the top of the component (after state declarations):

```ts
function lightboxGoNext() {
  if (!lightboxImage) return;
  const total = lightboxImage.memory.photos.length;
  if (total <= 1) return;
  setLightboxImage({ memory: lightboxImage.memory, photoIndex: (lightboxImage.photoIndex + 1) % total });
}

function lightboxGoPrev() {
  if (!lightboxImage) return;
  const total = lightboxImage.memory.photos.length;
  if (total <= 1) return;
  setLightboxImage({ memory: lightboxImage.memory, photoIndex: (lightboxImage.photoIndex - 1 + total) % total });
}
```

Add keyboard handler in the existing useEffect or a new one:
```ts
useEffect(() => {
  if (!lightboxImage) return;
  function handleKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') lightboxGoNext();
    if (e.key === 'ArrowLeft') lightboxGoPrev();
    if (e.key === 'Escape') { setLightboxImage(null); setPhotoDeleteConfirm(false); }
  }
  document.addEventListener('keydown', handleKey);
  return () => document.removeEventListener('keydown', handleKey);
}, [lightboxImage]);
```

- [ ] **Step 3: Update lightbox JSX to use new state shape**

In the lightbox portal (lines 1175-1394), all references to `lightboxImage.url` and `lightboxImage.photoId` need updating:

1. Add derived values at the start of the lightbox render:
```tsx
{lightboxImage && createPortal(
  (() => {
    const currentPhoto = lightboxImage.memory.photos[lightboxImage.photoIndex];
    const totalPhotos = lightboxImage.memory.photos.length;
    return (
      <div
        // ... existing outer div props ...
        onTouchStart={(e) => setLightboxTouchStartX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const delta = lightboxTouchStartX - e.changedTouches[0].clientX;
          if (delta > 50) lightboxGoNext();
          else if (delta < -50) lightboxGoPrev();
        }}
      >
```

2. Replace `lightboxImage.url` with `currentPhoto.url`

3. Replace `lightboxImage.photoId` with `currentPhoto.id`

4. Add photo counter above the image (when >1 photo):
```tsx
{totalPhotos > 1 && (
  <div
    style={{
      position: 'absolute',
      top: 'max(1rem, env(safe-area-inset-top, 1rem))',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.5)',
      color: 'white',
      fontSize: '0.8rem',
      fontWeight: 600,
      padding: '0.35rem 0.75rem',
      borderRadius: '999px',
    }}
  >
    {lightboxImage.photoIndex + 1} / {totalPhotos}
  </div>
)}
```

5. Add prev/next buttons (when >1 photo), positioned on the sides of the image:
```tsx
{totalPhotos > 1 && (
  <>
    <button
      onClick={(e) => { e.stopPropagation(); lightboxGoPrev(); }}
      style={{
        position: 'absolute',
        left: '1rem',
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'rgba(255,255,255,0.9)',
        border: 'none',
        borderRadius: '50%',
        width: '48px',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <ChevronLeft className="w-6 h-6" style={{ color: '#1a1a1a' }} />
    </button>
    <button
      onClick={(e) => { e.stopPropagation(); lightboxGoNext(); }}
      style={{
        position: 'absolute',
        right: '1rem',
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'rgba(255,255,255,0.9)',
        border: 'none',
        borderRadius: '50%',
        width: '48px',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <ChevronRight className="w-6 h-6" style={{ color: '#1a1a1a' }} />
    </button>
  </>
)}
```

Note: `ChevronLeft` and `ChevronRight` are already imported in HomeScreen.tsx (from lucide-react, used in MapView — actually check: they're used in MapView but imported in HomeScreen? Let me verify. If not imported, add them to the import line.)

- [ ] **Step 4: Commit**

```bash
git add web/src/components/HomeScreen.tsx
git commit -m "feat: lightbox swipe navigation between photos of same memory"
```

---

### Task 6: Map Popup Touch Swipe

**Files:**
- Modify: `web/src/components/MapView.tsx`

- [ ] **Step 1: Add touchStartX state and swipe handlers to LocationPopup**

In `web/src/components/MapView.tsx`, update `LocationPopup` component (starting line 44):

```tsx
function LocationPopup({ memories }: { memories: Memory[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);  // ADD THIS

  // ... existing allItems, current, hasMultiple ...

  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % allItems.length);
  };

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + allItems.length) % allItems.length);
  };

  return (
    <div
      style={{ minWidth: '240px', maxWidth: '300px' }}
      onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const delta = touchStartX - e.changedTouches[0].clientX;
        if (delta > 50 && currentIndex < allItems.length - 1) setCurrentIndex(i => i + 1);
        else if (delta < -50 && currentIndex > 0) setCurrentIndex(i => i - 1);
      }}
    >
      {/* ... rest unchanged ... */}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/MapView.tsx
git commit -m "feat: map popup supports touch swipe between memories"
```

---

### Task 7: Build and Verify

- [ ] **Step 1: Type-check frontend**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 2: Build frontend**

```bash
cd web && npm run build
```

Expected: Build succeeds, assets in `web/dist/`

- [ ] **Step 3: Manual verification checklist**

- Open CreateMemoryModal → click "Zuhause" → verify coordinates are auto-set (visible on map after save)
- Search "Flughafen Hamburg" → verify ✈️ icon in results
- Search "Restaurant Berlin" → verify 🍽️ icon
- Gallery: verify each memory with photos shows only ONE tile
- Gallery: verify 2-photo memory shows "1/2 📷" badge
- Lightbox: click tile → opens first photo
- Lightbox: tap/click left/right arrows → navigates photos
- Lightbox: swipe left/right → navigates photos (mobile)
- Lightbox: press ← → keyboard arrows navigate
- Map: open a pin with multiple memories → swipe horizontally on popup
- Commit build: `git add web/dist && git commit -m "chore: rebuild with location and gallery improvements"`
