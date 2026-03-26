# Location Search Improvements & Gallery Swipe — Design Spec

## Goal

Replace generic preset location buttons with 4 real family addresses (with auto-coordinates), improve Nominatim search for airports/POIs/buildings, and add swipeable photo galleries within memories.

## Architecture

Pure frontend changes: `types/index.ts` for location data, `CreateMemoryModal.tsx` for preset coordinate auto-fill, `LocationAutocomplete.tsx` for better search, `HomeScreen.tsx` for gallery and lightbox swipe, `MapView.tsx` for map popup swipe.

## Tech Stack

React 18, TypeScript, Nominatim API, custom touch event handlers (no new dependencies)

---

## Feature 1: Predefined Locations with Real Addresses

Replace `LOCATIONS` array in `web/src/types/index.ts` with 4 specific family addresses including hardcoded coordinates (geocoded from Nominatim):

```ts
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
];
```

**Behavior change in CreateMemoryModal:**
- Clicking a preset button now also calls `setLocationCoords({ name: loc.name, latitude: loc.latitude, longitude: loc.longitude })`
- Coordinates are sent with the memory creation → memories appear correctly on the map
- The filter dropdown in HomeScreen still uses `LOCATIONS.map(l => l.name)` — unchanged

---

## Feature 2: Nominatim Search Improvements

Updated URL in `LocationAutocomplete.tsx`:
```
https://nominatim.openstreetmap.org/search
  ?q=...
  &format=json
  &limit=8
  &accept-language=de
  &addressdetails=1
  &extratags=1
```

Changes:
- `limit` 5 → 8: more results
- `addressdetails=1`: structured city/country data for subtitles
- `extratags=1`: exposes `aeroway`, `amenity`, `tourism`, `shop`, `leisure` tags

**Place type icon mapping** shown in dropdown:
```ts
function getPlaceIcon(extratags?: Record<string, string>): string {
  if (!extratags) return '📍';
  if (extratags.aeroway === 'aerodrome') return '✈️';
  if (extratags.amenity === 'restaurant' || extratags.amenity === 'cafe') return '🍽️';
  if (extratags.tourism === 'attraction' || extratags.tourism === 'museum') return '🏛️';
  if (extratags.leisure === 'park') return '🌳';
  if (extratags.amenity === 'hospital') return '🏥';
  if (extratags.amenity === 'school') return '🏫';
  if (extratags.shop) return '🛍️';
  return '📍';
}
```

**Interface extension** (internal to component):
```ts
interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  extratags?: Record<string, string>;
  address?: { city?: string; town?: string; country?: string };
}
```

---

## Feature 3: Gallery — One Thumbnail Per Memory

**Current behavior:** `photoEntries` flattens all photos → N photos per memory = N tiles in gallery

**New behavior:** One tile per memory (first photo as thumbnail, count badge if >1)

New state shape:
```ts
// replaces photoEntries
const memoryPhotoGroups = filteredMemories
  .filter(m => m.photos && m.photos.length > 0)
  .sort((a, b) => new Date(b.source_date).getTime() - new Date(a.source_date).getTime());
```

Thumbnail tile:
- Shows `memory.photos[0].url`
- If `photos.length > 1`: badge bottom-right showing `1/${photos.length} 📷`
- onClick → `setLightboxImage({ memory, photoIndex: 0 })`

---

## Feature 4: Lightbox — Swipe Between Photos of Same Memory

**State change:**
```ts
// Before:
lightboxImage: { url: string; memory: Memory; photoId: number } | null

// After:
lightboxImage: { memory: Memory; photoIndex: number } | null
```

Derived values inside lightbox render:
```ts
const currentPhoto = lightboxImage.memory.photos[lightboxImage.photoIndex];
const totalPhotos = lightboxImage.memory.photos.length;
```

**Navigation:**
- Left/right buttons (shown when `totalPhotos > 1`)
- `← ArrowLeft` / `→ ArrowRight` keyboard (via `useEffect` on keydown)
- Touch swipe: `onTouchStart` records `touchStartX`, `onTouchEnd` measures delta → if `|delta| > 50px`, navigate prev/next

**Photo counter:** `"2 / 3"` shown top-center when >1 photo

**Delete photo:** uses `currentPhoto.id` — unchanged behavior

---

## Feature 5: Map Popup — Touch Swipe

`MapView.tsx` `LocationPopup` component already has prev/next arrow buttons.

Add touch swipe to the popup container:
```tsx
onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
onTouchEnd={(e) => {
  const delta = touchStartX - e.changedTouches[0].clientX;
  if (delta > 50) goNext(e as unknown as React.MouseEvent);
  if (delta < -50) goPrev(e as unknown as React.MouseEvent);
}}
```

Add `touchStartX` state to `LocationPopup`.

---

## File Changes

| File | Change |
|------|--------|
| `web/src/types/index.ts` | `LOCATIONS` with coordinates |
| `web/src/components/CreateMemoryModal.tsx` | Preset sets locationCoords |
| `web/src/components/LocationAutocomplete.tsx` | Better Nominatim params + type icons |
| `web/src/components/HomeScreen.tsx` | Gallery one-per-memory, lightbox state + swipe |
| `web/src/components/MapView.tsx` | Touch swipe on LocationPopup |

## Out of Scope

- Infinite horizontal scroll / full carousel inside the feed cards
- Thumbnail image optimization (serve smaller images)
- Offline caching of geocoded addresses
