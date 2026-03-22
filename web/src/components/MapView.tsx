import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
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

export function MapView({ memories }: MapViewProps) {
  // Filter memories with valid coordinates
  const memoriesWithCoords = memories.filter(
    (m) => typeof m.latitude === 'number' && typeof m.longitude === 'number'
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
      style={{ height: '70vh', minHeight: '400px', width: '100%', borderRadius: '1rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {memoriesWithCoords.map((memory) => (
        <Marker
          key={memory.id}
          position={[memory.latitude!, memory.longitude!]}
        >
          <Popup>
            <div className="text-sm" style={{ minWidth: '200px', maxWidth: '280px' }}>
              {memory.photos && memory.photos.length > 0 && (
                <img
                  src={memory.photos[0].url}
                  alt=""
                  style={{
                    width: '100%',
                    height: '120px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    marginBottom: '8px',
                  }}
                />
              )}
              <p className="font-semibold mb-1">
                {memory.source_date}
                {memory.child_name && ` - ${memory.child_name}`}
              </p>
              {memory.cleaned_summary && (
                <p className="text-gray-600" style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>
                  {memory.cleaned_summary}
                </p>
              )}
              {memory.location && (
                <p className="text-xs text-gray-400 mt-1">
                  {memory.location}
                </p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
