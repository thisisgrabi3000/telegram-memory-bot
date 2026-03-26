import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { ChevronLeft, ChevronRight, MapPin, Calendar, User } from 'lucide-react';
import type { Memory } from '../types';

// Fix default marker icon issue with Vite
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapViewProps {
  memories: Memory[];
}

/**
 * Groups memories by location name (if set) or rounded coordinates (~100m).
 * Memories sharing a location name are shown under one pin regardless of coords.
 */
function groupByLocation(memories: Memory[]): Map<string, Memory[]> {
  const groups = new Map<string, Memory[]>();

  for (const memory of memories) {
    // Use location name as key when available, otherwise use rounded coords
    const key = memory.location
      ? `loc:${memory.location.toLowerCase().trim()}`
      : `${Math.round(memory.latitude! * 1000) / 1000},${Math.round(memory.longitude! * 1000) / 1000}`;

    const existing = groups.get(key) || [];
    existing.push(memory);
    groups.set(key, existing);
  }

  return groups;
}

/**
 * Carousel popup for a group of memories at the same location.
 */
function LocationPopup({ memories }: { memories: Memory[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);

  // Collect all photos from all memories in this group
  const allItems = useMemo(() => {
    const items: { photo: { url: string } | null; memory: Memory }[] = [];
    for (const memory of memories) {
      if (memory.photos && memory.photos.length > 0) {
        for (const photo of memory.photos) {
          items.push({ photo, memory });
        }
      } else {
        items.push({ photo: null, memory });
      }
    }
    return items;
  }, [memories]);

  const current = allItems[currentIndex];
  if (!current) return null;

  const hasMultiple = allItems.length > 1;

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
      {/* Image area with navigation */}
      <div className="relative" style={{ marginBottom: '8px' }}>
        {current.photo ? (
          <img
            src={current.photo.url}
            alt=""
            style={{
              width: '100%',
              height: '180px',
              objectFit: 'cover',
              borderRadius: '8px',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #f5f0eb 0%, #ede5db 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MapPin style={{ width: '24px', height: '24px', color: '#b8a898' }} />
          </div>
        )}

        {/* Navigation arrows */}
        {hasMultiple && (
          <>
            <button
              onClick={goPrev}
              style={{
                position: 'absolute',
                left: '4px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.9)',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              <ChevronLeft style={{ width: '16px', height: '16px' }} />
            </button>
            <button
              onClick={goNext}
              style={{
                position: 'absolute',
                right: '4px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.9)',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              <ChevronRight style={{ width: '16px', height: '16px' }} />
            </button>

            {/* Counter badge */}
            <div
              style={{
                position: 'absolute',
                bottom: '6px',
                right: '6px',
                background: 'rgba(0,0,0,0.6)',
                color: 'white',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '10px',
              }}
            >
              {currentIndex + 1} / {allItems.length}
            </div>
          </>
        )}
      </div>

      {/* Dot indicators for small groups */}
      {hasMultiple && allItems.length <= 8 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '8px' }}>
          {allItems.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); }}
              style={{
                width: i === currentIndex ? '16px' : '6px',
                height: '6px',
                borderRadius: '3px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: i === currentIndex ? '#e86b3f' : '#d4cdc4',
              }}
            />
          ))}
        </div>
      )}

      {/* Memory info */}
      <div style={{ padding: '0 2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px', fontWeight: 600, color: '#4a4035' }}>
            <Calendar style={{ width: '12px', height: '12px' }} />
            {current.memory.source_date}
          </span>
          {current.memory.child_name && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              fontSize: '11px', fontWeight: 600, color: 'white',
              background: '#e86b3f', padding: '1px 8px', borderRadius: '8px',
            }}>
              <User style={{ width: '10px', height: '10px' }} />
              {current.memory.child_name}
            </span>
          )}
        </div>

        {current.memory.cleaned_summary && (
          <p style={{
            fontSize: '13px',
            color: '#6b6158',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            margin: '0 0 4px 0',
          }}>
            {current.memory.cleaned_summary}
          </p>
        )}

        {current.memory.location && (
          <p style={{ fontSize: '11px', color: '#9b9085', display: 'flex', alignItems: 'center', gap: '3px', margin: 0 }}>
            <MapPin style={{ width: '10px', height: '10px' }} />
            {current.memory.location}
          </p>
        )}
      </div>
    </div>
  );
}

export function MapView({ memories }: MapViewProps) {
  // Filter memories with valid, non-zero coordinates
  const memoriesWithCoords = useMemo(
    () => memories.filter(
      (m) =>
        typeof m.latitude === 'number' &&
        typeof m.longitude === 'number' &&
        (m.latitude !== 0 || m.longitude !== 0)
    ),
    [memories]
  );

  // Group memories by location for popup carousel
  const locationGroups = useMemo(
    () => groupByLocation(memoriesWithCoords),
    [memoriesWithCoords]
  );

  // Always start centered on Lübeck – markers are still shown at their real positions
  const defaultCenter: [number, number] = [53.8655, 10.6866];

  if (memoriesWithCoords.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-center p-8">
        <div>
          <div
            className="w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-sand-100)' }}
          >
            <MapPin className="w-10 h-10" style={{ color: 'var(--color-sand-400)' }} />
          </div>
          <p className="font-medium" style={{ color: 'var(--color-text-muted)' }}>
            Noch keine Erinnerungen mit Standort.
          </p>
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-light)' }}>
            Sende Fotos als Datei (mit GPS) oder teile deinen Standort im Chat.
          </p>
        </div>
      </div>
    );
  }

  return (
    <MapContainer
      center={defaultCenter}
      zoom={10}
      style={{ height: '70vh', minHeight: '300px', width: '100%', borderRadius: '1rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={50}
        spiderfyOnMaxZoom
        showCoverageOnHover={false}
      >
        {Array.from(locationGroups.entries()).map(([key, groupMemories]) => {
          // Use first memory's coords as marker position
          const first = groupMemories[0];
          return (
            <Marker
              key={key}
              position={[first.latitude!, first.longitude!]}
            >
              <Popup maxWidth={320} minWidth={250}>
                <LocationPopup memories={groupMemories} />
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
