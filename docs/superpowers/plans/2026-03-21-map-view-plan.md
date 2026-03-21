# Map View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive map view showing memories with GPS coordinates as clustered pins.

**Architecture:** Database stores lat/lng coordinates alongside location name. Backend saves coordinates from EXIF/Telegram. Frontend adds Leaflet map as tab alongside existing feed.

**Tech Stack:** SQLite, Express, React, Leaflet, react-leaflet, react-leaflet-cluster

---

## File Structure

**Backend (create):**
- `src/db/migrations/006_add_coordinates.ts` - Add latitude/longitude columns

**Backend (modify):**
- `src/db/repositories/memoryRepository.ts` - Add updateCoordinates method
- `src/bot/telegramWebhook.ts` - Save coordinates from EXIF and Telegram location
- `src/db/migrate.ts` - Register new migration
- `src/types/index.ts` - Add coordinates to MemoryEntry type

**Frontend (create):**
- `web/src/components/MapView.tsx` - Leaflet map component

**Frontend (modify):**
- `web/package.json` - Add leaflet packages
- `web/src/types/index.ts` - Add coordinates to Memory interface
- `web/src/components/HomeScreen.tsx` - Add tab navigation
- `web/src/index.css` - Leaflet CSS import

---

### Task 1: Database Migration

**Files:**
- Create: `src/db/migrations/006_add_coordinates.ts`
- Modify: `src/db/migrate.ts`

- [ ] **Step 1: Create migration file**

```typescript
// src/db/migrations/006_add_coordinates.ts
import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE memory_entries ADD COLUMN latitude REAL;
  `);

  db.exec(`
    ALTER TABLE memory_entries ADD COLUMN longitude REAL;
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_entries_coordinates
    ON memory_entries(latitude, longitude);
  `);
}

export function down(db: Database.Database): void {
  // SQLite doesn't support DROP COLUMN easily
}
```

- [ ] **Step 2: Register migration in migrate.ts**

Add import at top:
```typescript
import { up as migration006 } from './migrations/006_add_coordinates';
```

Add to migrations array:
```typescript
{ version: 6, up: migration006 },
```

- [ ] **Step 3: Run migration**

Run: `npm run dev` (migrations run on startup)
Expected: Console shows "Migration 6 applied"

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/006_add_coordinates.ts src/db/migrate.ts
git commit -m "feat(db): add latitude/longitude columns for map view"
```

---

### Task 2: Backend Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add coordinates to MemoryEntry interface**

Add to MemoryEntry interface:
```typescript
latitude: number | null;
longitude: number | null;
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add coordinates to MemoryEntry"
```

---

### Task 3: Repository Update

**Files:**
- Modify: `src/db/repositories/memoryRepository.ts`

- [ ] **Step 1: Add updateCoordinates method**

```typescript
updateCoordinates(id: number, latitude: number, longitude: number): void {
  const stmt = db.prepare(`
    UPDATE memory_entries
    SET latitude = ?, longitude = ?
    WHERE id = ?
  `);
  stmt.run(latitude, longitude, id);
}
```

- [ ] **Step 2: Verify latitude/longitude in SELECT queries**

Check that `findRecent`, `findAll`, `search` etc. include `latitude, longitude` (they use `SELECT *` so already included).

- [ ] **Step 3: Commit**

```bash
git add src/db/repositories/memoryRepository.ts
git commit -m "feat(repo): add updateCoordinates method"
```

---

### Task 4: Save Coordinates in Webhook

**Files:**
- Modify: `src/bot/telegramWebhook.ts`

- [ ] **Step 1: Save EXIF coordinates when processing photos**

Find the photo processing section (around line 635-660). After extracting EXIF data:

```typescript
// After: const exifData = await extractExifData(localPath);
// Save coordinates if available
if (exifData.latitude !== null && exifData.longitude !== null) {
  memoryRepository.updateCoordinates(entry.id, exifData.latitude, exifData.longitude);
}
```

- [ ] **Step 2: Save Telegram location coordinates**

Find the location message handling (around line 580-620). After reverse geocoding:

```typescript
// After updating location name, also save coordinates
memoryRepository.updateCoordinates(lastEntry.id, locationMessage.latitude, locationMessage.longitude);
```

- [ ] **Step 3: Test with photo upload**

Send a photo with EXIF GPS to the bot. Check database:
```bash
sqlite3 data/memory.db "SELECT id, location, latitude, longitude FROM memory_entries ORDER BY id DESC LIMIT 1;"
```

- [ ] **Step 4: Commit**

```bash
git add src/bot/telegramWebhook.ts
git commit -m "feat(webhook): save GPS coordinates from EXIF and Telegram location"
```

---

### Task 5: Frontend Dependencies

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install Leaflet packages**

```bash
cd web && npm install leaflet react-leaflet react-leaflet-cluster @types/leaflet
```

- [ ] **Step 2: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "feat(web): add leaflet dependencies for map view"
```

---

### Task 6: Frontend Types

**Files:**
- Modify: `web/src/types/index.ts`

- [ ] **Step 1: Add coordinates to Memory interface**

```typescript
latitude: number | null;
longitude: number | null;
```

- [ ] **Step 2: Commit**

```bash
git add web/src/types/index.ts
git commit -m "feat(web/types): add coordinates to Memory interface"
```

---

### Task 7: MapView Component

**Files:**
- Create: `web/src/components/MapView.tsx`
- Modify: `web/src/index.css`

- [ ] **Step 1: Add Leaflet CSS import to index.css**

At top of file:
```css
@import 'leaflet/dist/leaflet.css';
```

- [ ] **Step 2: Create MapView component**

```tsx
// web/src/components/MapView.tsx
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import type { Memory } from '../types';

// Fix default marker icon issue with webpack/vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapViewProps {
  memories: Memory[];
}

export function MapView({ memories }: MapViewProps) {
  // Filter memories with coordinates
  const memoriesWithCoords = memories.filter(
    (m) => m.latitude !== null && m.longitude !== null
  );

  // Default center (Germany)
  const defaultCenter: [number, number] = [51.1657, 10.4515];

  // Calculate center from memories if available
  const center: [number, number] = memoriesWithCoords.length > 0
    ? [
        memoriesWithCoords.reduce((sum, m) => sum + (m.latitude || 0), 0) / memoriesWithCoords.length,
        memoriesWithCoords.reduce((sum, m) => sum + (m.longitude || 0), 0) / memoriesWithCoords.length,
      ]
    : defaultCenter;

  if (memoriesWithCoords.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-center p-8">
        <div>
          <p style={{ color: 'var(--color-text-muted)' }}>
            Noch keine Erinnerungen mit Standort.
          </p>
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Sende Fotos mit GPS-Daten oder teile deinen Standort.
          </p>
        </div>
      </div>
    );
  }

  return (
    <MapContainer
      center={center}
      zoom={6}
      style={{ height: 'calc(100vh - 180px)', width: '100%', borderRadius: '1rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarkerClusterGroup chunkedLoading>
        {memoriesWithCoords.map((memory) => (
          <Marker
            key={memory.id}
            position={[memory.latitude!, memory.longitude!]}
          >
            <Popup>
              <div className="text-sm" style={{ minWidth: '200px' }}>
                <p className="font-semibold mb-1">
                  {memory.source_date}
                  {memory.child_name && ` - ${memory.child_name}`}
                </p>
                <p className="text-gray-600">
                  {memory.cleaned_summary || '(Keine Beschreibung)'}
                </p>
                {memory.location && (
                  <p className="text-xs text-gray-400 mt-1">
                    {memory.location}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
```

- [ ] **Step 3: Export from components/index.ts**

```typescript
export { MapView } from './MapView';
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/MapView.tsx web/src/components/index.ts web/src/index.css
git commit -m "feat(web): add MapView component with Leaflet"
```

---

### Task 8: Tab Navigation in HomeScreen

**Files:**
- Modify: `web/src/components/HomeScreen.tsx`

- [ ] **Step 1: Import MapView and add tab state**

Add import:
```typescript
import { MapView } from './MapView';
import { Map, List } from 'lucide-react';
```

Add state (inside component):
```typescript
const [activeTab, setActiveTab] = useState<'feed' | 'map'>('feed');
```

- [ ] **Step 2: Add tab buttons in header**

Find the header section and add tab buttons:
```tsx
<div className="flex gap-2">
  <button
    onClick={() => setActiveTab('feed')}
    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
      activeTab === 'feed'
        ? 'bg-gradient-to-r from-terracotta-500 to-terracotta-600 text-white'
        : 'bg-white/50 hover:bg-white/80'
    }`}
    style={activeTab === 'feed' ? { boxShadow: 'var(--shadow-glow-terracotta)' } : {}}
  >
    <List className="w-4 h-4" />
    Feed
  </button>
  <button
    onClick={() => setActiveTab('map')}
    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
      activeTab === 'map'
        ? 'bg-gradient-to-r from-terracotta-500 to-terracotta-600 text-white'
        : 'bg-white/50 hover:bg-white/80'
    }`}
    style={activeTab === 'map' ? { boxShadow: 'var(--shadow-glow-terracotta)' } : {}}
  >
    <Map className="w-4 h-4" />
    Karte
  </button>
</div>
```

- [ ] **Step 3: Conditionally render feed or map**

Wrap the existing memory grid in a conditional:
```tsx
{activeTab === 'feed' ? (
  // existing memory grid/cards
) : (
  <MapView memories={filteredMemories} />
)}
```

- [ ] **Step 4: Test in browser**

Run: `cd web && npm run dev`
Expected: Tab buttons visible, clicking "Karte" shows map

- [ ] **Step 5: Commit**

```bash
git add web/src/components/HomeScreen.tsx
git commit -m "feat(web): add tab navigation for feed/map view"
```

---

### Task 9: Final Integration Test

- [ ] **Step 1: Start backend**

```bash
npm run dev
```

- [ ] **Step 2: Start frontend**

```bash
cd web && npm run dev
```

- [ ] **Step 3: Send test photo with GPS to Telegram bot**

Send a photo taken with a phone (has GPS EXIF).

- [ ] **Step 4: Verify in web app**

1. Open web app
2. Click "Karte" tab
3. Verify pin appears at correct location
4. Click pin, verify popup shows memory details

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete map view implementation"
```
