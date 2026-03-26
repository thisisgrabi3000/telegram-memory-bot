import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

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

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
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
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=8&accept-language=de&addressdetails=1&extratags=1`;
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
        <span
          style={{
            position: 'absolute',
            left: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '1rem',
            pointerEvents: 'none',
            lineHeight: 1,
          }}
        >
          📍
        </span>
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
            const icon = getPlaceIcon(s.extratags);
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
                <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px', lineHeight: 1 }}>{icon}</span>
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
