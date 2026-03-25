# Location Geocoding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Nominatim-based location autocomplete to the web photo upload modal and automatic location prompting in the Telegram bot after a photo is received without coordinates.

**Architecture:** The web frontend calls the public Nominatim API directly (client-side) for location autocomplete; selected coordinates are sent to the existing `POST /api/memories` endpoint. The Telegram bot adds a `pendingLocationRequests` Map (pattern already used for `pendingTranscriptions`) — after saving a photo without GPS data, it asks the user for a location, forward-geocodes the text reply, and saves coordinates to the memory.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, Vite, Nominatim OpenStreetMap API (no API key required)

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/api/validation.ts` | Modify | Add optional `latitude` + `longitude` to `createMemorySchema` |
| `src/api/memoriesApi.ts` | Modify | In `POST /api/memories`, save coordinates if provided |
| `src/bot/telegramWebhook.ts` | Modify | Add `pendingLocationRequests` Map, `forwardGeocode` helper, handle location reply after photo |
| `web/src/components/LocationAutocomplete.tsx` | Create | Reusable Nominatim autocomplete input component |
| `web/src/components/CreateMemoryModal.tsx` | Modify | Replace custom location text input with `LocationAutocomplete`; store + pass coordinates |
| `web/src/api/memoriesApi.ts` | Modify | Add `latitude?`, `longitude?` to `CreateMemoryInput` |
| `web/src/App.tsx` | Modify | Update `handleCreate` type to pass coordinates through |

---

## Task 1: Backend — Accept coordinates in POST /api/memories

**Files:**
- Modify: `src/api/validation.ts`
- Modify: `src/api/memoriesApi.ts`

### Context

`createMemorySchema` currently validates: `text`, `child_name`, `location`, `source_date`, `people`.
`POST /api/memories` already calls `memoryRepository.updateLocation()` but never saves coordinates.
`memoryRepository.updateCoordinates(id, lat, lng)` already exists and updates `latitude`/`longitude` columns.

- [ ] **Step 1: Add latitude/longitude to createMemorySchema in `src/api/validation.ts`**

Find the `createMemorySchema` object (lines 19–39) and add two optional number fields after `people`:

```typescript
  latitude: z
    .number()
    .min(-90).max(90)
    .optional()
    .nullable(),
  longitude: z
    .number()
    .min(-180).max(180)
    .optional()
    .nullable(),
```

- [ ] **Step 2: Use coordinates in POST /api/memories in `src/api/memoriesApi.ts`**

Find the handler for `POST /api/memories` (around line 256). In the destructuring of `req.body`, add `latitude` and `longitude`:

```typescript
const { text, child_name, location, source_date, people: explicitPeople, latitude, longitude } = req.body as {
  text: string;
  child_name?: string | null;
  location?: string | null;
  source_date?: string;
  people?: string[];
  latitude?: number | null;
  longitude?: number | null;
};
```

Then after the existing `if (location) { memoryRepository.updateLocation(...) }` block, add:

```typescript
if (latitude != null && longitude != null) {
  memoryRepository.updateCoordinates(entry.id, latitude, longitude);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Dev/Telegram Memory App"
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/api/validation.ts src/api/memoriesApi.ts
git commit -m "feat: accept latitude/longitude in POST /api/memories"
```

---

## Task 2: Telegram — Ask location after photo without GPS

**Files:**
- Modify: `src/bot/telegramWebhook.ts`

### Context

- `pendingTranscriptions: Map<number, PendingTranscription>` already exists (chatId → data)
- The photo handling block starts at line ~632. After saving a new entry, it currently just sends a "💡 Tipp" message if `isCompressedPhoto && !exifCoords`
- We need to ask for location when: new photo entry created AND `!exifCoords` AND `!storedLocation`
- Text message handler at line ~470 checks `pendingTranscriptions` first — we check `pendingLocationRequests` right after

- [ ] **Step 1: Add `forwardGeocode` helper and `pendingLocationRequests` Map**

After the `reverseGeocode` function (line ~140), add:

```typescript
/**
 * Forward geocode a text query to coordinates using Nominatim.
 * Returns the first result, or null if not found.
 */
async function forwardGeocode(query: string): Promise<{ name: string; latitude: number; longitude: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=de`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TelegramMemoryBot/1.0' },
    });
    if (!response.ok) return null;

    const results = await response.json() as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;

    if (!results || results.length === 0) return null;

    const first = results[0];
    // Use short city name if available via reverse geocode, else use display_name parts
    const shortName = first.display_name.split(',')[0].trim();
    return {
      name: shortName,
      latitude: parseFloat(first.lat),
      longitude: parseFloat(first.lon),
    };
  } catch (error) {
    console.error('Forward geocoding failed:', error);
    return null;
  }
}
```

After the `pendingTranscriptions` Map declaration (line ~28), add:

```typescript
/**
 * Pending location requests after photo save.
 * Key: chat_id, Value: memory entry ID awaiting location
 */
const pendingLocationRequests = new Map<number, number>();
```

- [ ] **Step 2: After saving new photo without coords, ask for location**

In the photo handler, the `else` block for new entries (starts at line ~701, closes at line ~789) contains `storedLocation` in scope. The location prompt must go **inside** this `else` block, right before its closing `}`.

The else block ends with one of two `sendMessage` calls (with or without caption), then closes at line ~789:
```typescript
            await telegramService.sendMessage(
              photoMessage.chat_id,
              `📷 Foto gespeichert!${exifText}`
            );
          }
        }   // <-- this is the closing } of the else block (line ~789)
        // Hinweis: Komprimierte Fotos...  <-- this is OUTSIDE the else block
```

Find the unique string at the very end of the `else` block's inner `if/else` (caption vs. no-caption):
```typescript
            await telegramService.sendMessage(
              photoMessage.chat_id,
              `📷 Foto gespeichert!${exifText}`
            );
          }
        }
        // Hinweis: Komprimierte Fotos verlieren EXIF-Daten
```

Replace it with (the location prompt is inserted before the closing `}` of the else block):
```typescript
            await telegramService.sendMessage(
              photoMessage.chat_id,
              `📷 Foto gespeichert!${exifText}`
            );
          }

          // Ask for location if no coordinates available
          if (!exifCoords && !storedLocation) {
            pendingLocationRequests.set(photoMessage.chat_id, entry.id);
            await telegramService.sendMessage(
              photoMessage.chat_id,
              '📍 Wo wurde das aufgenommen? (Ort eingeben oder überspringen mit /skip)'
            );
          }
        }
        // Hinweis: Komprimierte Fotos verlieren EXIF-Daten
```

Note: `storedLocation` is declared at line ~718 inside the `else` block and is therefore in scope here. The "Tipp" message stays outside the else block, unchanged.

- [ ] **Step 3: Handle location text reply and /skip command**

In the text message handler section (around line 470, right after the `pendingTranscriptions` check block), add handling for `pendingLocationRequests`.

After:
```typescript
      pendingTranscriptions.delete(textMessage.chat_id);
      return;
    }
```

Add:

```typescript
    // Check if awaiting a location for a photo
    const pendingMemoryId = pendingLocationRequests.get(textMessage.chat_id);
    if (pendingMemoryId !== undefined) {
      pendingLocationRequests.delete(textMessage.chat_id);

      const lText = textMessage.text.trim();

      // Allow skipping
      if (lText === '/skip' || lText.toLowerCase() === 'skip' || lText.toLowerCase() === 'überspringen') {
        await telegramService.sendMessage(textMessage.chat_id, '👍 Kein Ort gespeichert.');
        return;
      }

      // Geocode the text
      const geoResult = await forwardGeocode(lText);
      if (geoResult) {
        memoryRepository.updateLocation(pendingMemoryId, geoResult.name);
        memoryRepository.updateCoordinates(pendingMemoryId, geoResult.latitude, geoResult.longitude);
        await telegramService.sendMessage(
          textMessage.chat_id,
          `📍 Ort gespeichert: ${geoResult.name}`
        );
      } else {
        // Save as text-only location (no coordinates)
        memoryRepository.updateLocation(pendingMemoryId, lText);
        await telegramService.sendMessage(
          textMessage.chat_id,
          `📍 Ort gespeichert: ${lText} (keine Koordinaten gefunden)`
        );
      }
      return;
    }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Dev/Telegram Memory App"
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/bot/telegramWebhook.ts
git commit -m "feat: ask for location after Telegram photo without GPS coords"
```

---

## Task 3: Frontend — LocationAutocomplete component

**Files:**
- Create: `web/src/components/LocationAutocomplete.tsx`

### Context

- Nominatim search endpoint: `https://nominatim.openstreetmap.org/search?q=...&format=json&limit=5&accept-language=de`
- Returns array of `{ display_name, lat, lon, ...}`
- Public API, no key needed; requires `User-Agent` header (not settable from browser, but browsers include their own)
- Debounce: 400ms to avoid hammering the API
- The component replaces the custom location text input in `CreateMemoryModal`
- Design: match existing modal style (glass-card, sand-200 borders, terracotta accents)

- [ ] **Step 1: Create `web/src/components/LocationAutocomplete.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export interface LocationResult {
  name: string;
  latitude: number;
  longitude: number;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: LocationResult | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Ort suchen...',
  disabled,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleInputChange(val: string) {
    onChange(val);
    onSelect(null); // clear any previously selected coordinates

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (val.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&accept-language=de`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json() as LocationSuggestion[];
          setSuggestions(data);
          setShowDropdown(data.length > 0);
        }
      } catch {
        // ignore network errors silently
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  function handleSelect(suggestion: LocationSuggestion) {
    // Use the first part of display_name as the short name
    const shortName = suggestion.display_name.split(',')[0].trim();
    onChange(shortName);
    onSelect({
      name: shortName,
      latitude: parseFloat(suggestion.lat),
      longitude: parseFloat(suggestion.lon),
    });
    setSuggestions([]);
    setShowDropdown(false);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <MapPin
          className="w-4 h-4"
          style={{
            position: 'absolute',
            left: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-sage-500)',
            pointerEvents: 'none',
          }}
        />
        {loading && (
          <Loader2
            className="w-4 h-4 spinner"
            style={{
              position: 'absolute',
              right: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
              pointerEvents: 'none',
            }}
          />
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-xl text-sm transition-colors duration-200"
          style={{
            paddingLeft: '2.25rem',
            paddingRight: loading ? '2.25rem' : '0.75rem',
            paddingTop: '0.625rem',
            paddingBottom: '0.625rem',
            border: '2px solid var(--color-sand-200)',
            backgroundColor: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
          onFocusCapture={(e) => {
            (e.target as HTMLInputElement).style.borderColor = 'var(--color-sage-400)';
          }}
          onBlurCapture={(e) => {
            (e.target as HTMLInputElement).style.borderColor = 'var(--color-sand-200)';
          }}
        />
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 100,
            borderRadius: '0.75rem',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-xl)',
            border: '1px solid var(--color-sand-200)',
            backgroundColor: 'var(--color-bg-primary)',
          }}
        >
          {suggestions.map((s, i) => {
            const parts = s.display_name.split(',');
            const primary = parts[0].trim();
            const secondary = parts.slice(1, 3).join(',').trim();
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors duration-150"
                style={{
                  backgroundColor: 'transparent',
                  borderBottom: i < suggestions.length - 1 ? '1px solid var(--color-sand-100)' : 'none',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-sand-50)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                }}
              >
                <MapPin
                  className="w-4 h-4 flex-shrink-0 mt-0.5"
                  style={{ color: 'var(--color-sage-500)' }}
                />
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
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/LocationAutocomplete.tsx
git commit -m "feat: add LocationAutocomplete component with Nominatim integration"
```

---

## Task 4: Frontend — Wire coordinates through API layer

**Files:**
- Modify: `web/src/api/memoriesApi.ts`
- Modify: `web/src/App.tsx`

### Context

`CreateMemoryInput` is the type for `createMemory(input)`. Currently: `text, child_name?, location?, source_date?, people?`.
`App.tsx` `handleCreate` destructures `{ photos, ...memoryData }` and passes `memoryData` to `createMemory`.
`HomeScreenProps.onCreate` type needs to include the new coordinate fields.

- [ ] **Step 1: Add coordinates to CreateMemoryInput in `web/src/api/memoriesApi.ts`**

Find the `CreateMemoryInput` interface (line 125):

```typescript
export interface CreateMemoryInput {
  text: string;
  child_name?: string;
  location?: string;
  source_date?: string;
  people?: string[];
  latitude?: number;
  longitude?: number;
}
```

The `createMemory` function already does `JSON.stringify(input)` so these will be included automatically.

- [ ] **Step 2: Update handleCreate and onCreate type in `web/src/App.tsx`**

In `App.tsx`, the `handleCreate` function signature currently is:
```typescript
async function handleCreate(data: { text: string; child_name?: string; location?: string; source_date?: string; people?: string[]; photos?: File[] })
```

Update it to:
```typescript
async function handleCreate(data: {
  text: string;
  child_name?: string;
  location?: string;
  source_date?: string;
  people?: string[];
  photos?: File[];
  latitude?: number;
  longitude?: number;
}) {
  const { photos, ...memoryData } = data;
  let created = await createMemory(memoryData);
  // ... rest unchanged
```

- [ ] **Step 3: Update HomeScreenProps.onCreate type in `web/src/components/HomeScreen.tsx`**

Find `HomeScreenProps` (line 16). Update the `onCreate` signature:

```typescript
  onCreate?: (data: {
    text: string;
    child_name?: string;
    location?: string;
    source_date?: string;
    people?: string[];
    photos?: File[];
    latitude?: number;
    longitude?: number;
  }) => Promise<void>;
```

- [ ] **Step 4: Commit**

```bash
git add web/src/api/memoriesApi.ts web/src/App.tsx web/src/components/HomeScreen.tsx
git commit -m "feat: thread latitude/longitude through web API and component props"
```

---

## Task 5: Frontend — Update CreateMemoryModal to use LocationAutocomplete

**Files:**
- Modify: `web/src/components/CreateMemoryModal.tsx`

### Context

The current modal has:
- `presetLocation` state + preset buttons (LOCATIONS array from types)
- `customLocation` state + a plain `<input>` for free-form text
- `location = customLocation.trim() || presetLocation`

The goal: keep the preset buttons (for quick selection without coordinates), but replace the free-form text input with `LocationAutocomplete`. When the user picks from the autocomplete, store coordinates. When they pick a preset, clear coordinates.

The `onCreate` callback needs `latitude?` and `longitude?` added to its type.

- [ ] **Step 1: Update imports and state in `web/src/components/CreateMemoryModal.tsx`**

Add import at the top:
```typescript
import { LocationAutocomplete } from './LocationAutocomplete';
import type { LocationResult } from './LocationAutocomplete';
```

Add state variables (after `const [customLocation, setCustomLocation] = useState('');`):
```typescript
const [locationCoords, setLocationCoords] = useState<LocationResult | null>(null);
```

Update the `CreateMemoryModalProps` `onCreate` type to include coordinates:
```typescript
  onCreate: (data: {
    text: string;
    child_name?: string;
    location?: string;
    source_date?: string;
    people?: string[];
    photos?: File[];
    latitude?: number;
    longitude?: number;
  }) => Promise<void>;
```

- [ ] **Step 2: Update location change handlers**

Update `selectPresetLocation`:
```typescript
function selectPresetLocation(name: string) {
  setPresetLocation(name === presetLocation ? '' : name);
  setCustomLocation('');
  setLocationCoords(null); // presets don't have coordinates
}
```

Replace `handleCustomLocationChange` with:
```typescript
function handleCustomLocationChange(val: string) {
  setCustomLocation(val);
  setPresetLocation('');
  // coords will be set via onSelect callback
}

function handleLocationSelect(result: LocationResult | null) {
  setLocationCoords(result);
}
```

- [ ] **Step 3: Update handleSubmit to pass coordinates**

In `handleSubmit`, the `onCreate` call currently is:
```typescript
await onCreate({
  text: text.trim(),
  child_name,
  location: location || undefined,
  source_date: date || undefined,
  people: selectedPeople.length > 0 ? selectedPeople : undefined,
  photos: photos.length > 0 ? photos : undefined,
});
```

Update to:
```typescript
await onCreate({
  text: text.trim(),
  child_name,
  location: location || undefined,
  source_date: date || undefined,
  people: selectedPeople.length > 0 ? selectedPeople : undefined,
  photos: photos.length > 0 ? photos : undefined,
  latitude: locationCoords?.latitude,
  longitude: locationCoords?.longitude,
});
```

- [ ] **Step 4: Replace the custom location input with LocationAutocomplete**

Find the custom location `<input>` element in the JSX (around line 342). It looks like:
```tsx
              value={customLocation}
              onChange={(e) => handleCustomLocationChange(e.target.value)}
```

Replace the entire `<input ...>` element with:
```tsx
              <LocationAutocomplete
                value={customLocation}
                onChange={handleCustomLocationChange}
                onSelect={handleLocationSelect}
                placeholder="Ort eingeben..."
                disabled={isSubmitting}
              />
```

Note: The `LocationAutocomplete` renders its own input, so remove any wrapping `<input>` and its associated `style` attributes. Keep the surrounding label/container div intact.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Dev/Telegram Memory App"
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add web/src/components/CreateMemoryModal.tsx web/src/components/LocationAutocomplete.tsx
git commit -m "feat: add Nominatim location autocomplete to CreateMemoryModal"
```

---

## Task 6: Build frontend and export

**Files:**
- Modify: `web/dist/` (rebuild)

- [ ] **Step 1: Rebuild the frontend**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Dev/Telegram Memory App/web"
npm run build
```

Expected: exits with code 0, `dist/` updated

- [ ] **Step 2: Verify key strings in bundle**

```bash
python3 -c "
import glob
files = glob.glob('dist/assets/*.js')
for f in files:
    content = open(f).read()
    checks = ['nominatim.openstreetmap.org', 'latitude', 'longitude']
    for c in checks:
        print(f'{c}: {c in content}')
    break
"
```

Expected: all three print `True`

Note: `LocationAutocomplete` is an identifier and will be mangled by Vite's minifier — do not check for it literally.

- [ ] **Step 3: Commit the built frontend**

```bash
cd "/Users/cmg/Documents/Claude Test Ordner/Dev/Telegram Memory App"
git add web/dist/
git commit -m "build: rebuild frontend with location geocoding features"
```

---

## Summary

After all tasks complete:

- **Web**: Creating a memory via the modal now shows a Nominatim autocomplete dropdown when typing a location. Selecting a suggestion saves the display name + lat/lng coordinates. The memory then appears as a map pin.
- **Telegram**: After sending a photo without GPS coordinates, the bot asks "Wo wurde das aufgenommen?". The text reply is forward-geocoded via Nominatim and coordinates are saved. Sending `/skip` skips the prompt.
