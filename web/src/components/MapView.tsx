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
