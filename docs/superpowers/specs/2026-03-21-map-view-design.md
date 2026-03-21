# Map View Design for Famories

## Overview

Add a map view to the Famories web app that displays memories with GPS coordinates as pins on an interactive map.

## Requirements

- Tab navigation: "Feed" and "Karte" tabs
- Click on pin shows popup with photo thumbnail, date, and summary
- Multiple memories at same location show as clusters with count
- Uses Leaflet with OpenStreetMap (free, no API key)

## Architecture

### Database Changes

New migration `006_add_coordinates.ts`:

```sql
ALTER TABLE memory_entries ADD COLUMN latitude REAL;
ALTER TABLE memory_entries ADD COLUMN longitude REAL;
CREATE INDEX idx_memory_entries_coordinates ON memory_entries(latitude, longitude);
```

### Backend Changes

1. **Store coordinates** in `telegramWebhook.ts`:
   - When extracting EXIF data, save `latitude` and `longitude` to DB
   - When receiving Telegram location, save coordinates to DB
   - Keep reverse geocoding for `location` (name) field

2. **Update repository** `memoryRepository.ts`:
   - Add `updateCoordinates(id, lat, lng)` method
   - Include `latitude`, `longitude` in all queries

3. **Update API** `memoriesApi.ts`:
   - Return `latitude`, `longitude` in memory response

### Frontend Changes

1. **New packages**:
   - `leaflet` - Map library
   - `react-leaflet` - React bindings
   - `react-leaflet-cluster` - Marker clustering

2. **Tab Navigation** in `HomeScreen.tsx`:
   - Add state: `activeTab: 'feed' | 'map'`
   - Render tabs at top
   - Conditionally render feed or map based on active tab

3. **New component** `MapView.tsx`:
   - Leaflet map centered on Europe (or auto-fit to markers)
   - Markers for each memory with coordinates
   - Clustering for nearby markers
   - Popup on click with: photo, date, summary, link to detail

4. **Types** update `types/index.ts`:
   - Add `latitude: number | null` to Memory interface
   - Add `longitude: number | null` to Memory interface

## Data Flow

```
Photo with EXIF GPS
       |
       v
extractExifData() returns {latitude, longitude}
       |
       v
memoryRepository.updateCoordinates(id, lat, lng)
       |
       v
API returns memories with coordinates
       |
       v
MapView renders pins at coordinates
       |
       v
User clicks pin -> popup with preview
```

## UI Mockup

```
+-------------------------------------+
|  Famories          [Feed] [Karte]  |  <- Tab navigation
+-------------------------------------+
|                                     |
|        OpenStreetMap                |
|                                     |
|        (3)     *     (7)           |  <- Clusters with count
|                                     |
|              +----------+           |
|        * --> | Photo    |           |  <- Click shows popup
|              | 21.03.24 |           |
|              | Noah...  |           |
|              +----------+           |
+-------------------------------------+
```

## Packages

| Package | Version | Purpose |
|---------|---------|---------|
| leaflet | ^1.9.4 | Core map library |
| react-leaflet | ^4.2.1 | React integration |
| react-leaflet-cluster | ^2.1.0 | Marker clustering |
| @types/leaflet | ^1.9.8 | TypeScript types |

## Implementation Order

1. Database migration for coordinates
2. Backend: store coordinates in webhook
3. Backend: update repository and API
4. Frontend: add types
5. Frontend: install Leaflet packages
6. Frontend: create MapView component
7. Frontend: add tab navigation to HomeScreen
8. Test with photo upload containing GPS data
