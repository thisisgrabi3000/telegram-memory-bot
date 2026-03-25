import { useState, useRef } from 'react';
import { X, User, MapPin, Calendar, Loader2, Sparkles, PenLine, Check, Camera, ImagePlus } from 'lucide-react';
import { FAMILY_MEMBERS, LOCATIONS } from '../types';
import { LocationAutocomplete } from './LocationAutocomplete';
import type { LocationResult } from './LocationAutocomplete';

const CHILDREN = ['Junis', 'Noah'];

interface CreateMemoryModalProps {
  onClose: () => void;
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
}

export function CreateMemoryModal({ onClose, onCreate }: CreateMemoryModalProps) {
  const [text, setText] = useState('');
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [presetLocation, setPresetLocation] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [locationCoords, setLocationCoords] = useState<LocationResult | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textFocused, setTextFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const location = customLocation.trim() || presetLocation;

  function togglePerson(name: string) {
    setSelectedPeople(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    );
  }

  function selectPresetLocation(name: string) {
    setPresetLocation(name === presetLocation ? '' : name);
    setCustomLocation('');
    setLocationCoords(null);
  }

  function handleCustomLocationChange(val: string) {
    setCustomLocation(val);
    setPresetLocation('');
    // locationCoords will be set/cleared via handleLocationSelect
  }

  function handleLocationSelect(result: LocationResult | null) {
    setLocationCoords(result);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos = [...photos, ...files].slice(0, 10);
    setPhotos(newPhotos);

    // Generate previews
    const newPreviews = [...photoPreviews];
    files.slice(0, 10 - photoPreviews.length).forEach(file => {
      const url = URL.createObjectURL(file);
      newPreviews.push(url);
    });
    setPhotoPreviews(newPreviews.slice(0, 10));

    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photoPreviews[index]);
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    setError(null);

    // Derive child_name from selected children
    const child_name = selectedPeople.find(p => CHILDREN.includes(p)) || undefined;

    try {
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
      // Cleanup previews
      photoPreviews.forEach(url => URL.revokeObjectURL(url));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl overflow-hidden animate-fade-in-scale"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          boxShadow: 'var(--shadow-2xl)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="relative px-6 py-5 flex items-center justify-between overflow-hidden flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, var(--color-terracotta-500) 0%, var(--color-terracotta-600) 50%, var(--color-rust-600) 100%)',
          }}
        >
          <div
            className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-20"
            style={{
              background: 'radial-gradient(circle, white 0%, transparent 70%)',
              transform: 'translate(30%, -50%)',
            }}
          />
          <Sparkles
            className="absolute bottom-3 right-20 w-4 h-4 text-white/40 animate-float"
            style={{ animationDelay: '-1s' }}
          />

          <div className="flex items-center gap-3 relative z-10">
            <div
              className="p-2 rounded-xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              <PenLine className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
                Neue Erinnerung
              </h2>
              <p className="text-white/70 text-xs">Halte einen besonderen Moment fest</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-xl transition-all duration-200 hover:bg-white/20 hover:scale-110 relative z-10"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-6 overflow-y-auto"
          style={{ flex: 1 }}
        >
          {/* Photo Upload */}
          <div>
            <label
              className="flex items-center gap-2 text-sm font-bold mb-3"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <Camera className="w-4 h-4" style={{ color: 'var(--color-terracotta-500)' }} />
              Fotos
            </label>

            {/* Photo previews */}
            {photoPreviews.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {photoPreviews.map((url, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden group">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              type="file"
              accept="image/*"
              multiple
              ref={fileInputRef}
              onChange={handlePhotoChange}
              className="hidden"
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting || photos.length >= 10}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-all duration-200 hover:border-terracotta-400"
              style={{
                borderColor: 'var(--color-sand-300)',
                color: 'var(--color-text-muted)',
                backgroundColor: 'white',
              }}
            >
              <ImagePlus className="w-4 h-4" />
              {photos.length === 0 ? 'Fotos hinzufügen' : `${photos.length} Foto${photos.length > 1 ? 's' : ''} gewählt`}
            </button>
          </div>

          {/* Text Input */}
          <div>
            <label
              className="block text-sm font-bold mb-2.5"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Was ist passiert? <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <div
              className="relative rounded-2xl transition-all duration-300"
              style={{
                boxShadow: textFocused ? '0 0 0 4px rgba(232,107,63,0.1)' : 'none',
              }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onFocus={() => setTextFocused(true)}
                onBlur={() => setTextFocused(false)}
                placeholder="z.B. Junis erstes Tor heute..."
                rows={3}
                className="w-full px-4 py-4 rounded-2xl border-2 focus:outline-none transition-all duration-300 resize-none"
                style={{
                  backgroundColor: 'white',
                  borderColor: textFocused ? 'var(--color-terracotta-400)' : 'var(--color-sand-200)',
                  color: 'var(--color-text-primary)',
                }}
                disabled={isSubmitting}
              />
              <div
                className="absolute bottom-3 right-3 text-xs"
                style={{ color: 'var(--color-text-light)' }}
              >
                {text.length > 0 && `${text.length} Zeichen`}
              </div>
            </div>
          </div>

          {/* Person Selection — multi-select */}
          <div>
            <label
              className="flex items-center gap-2 text-sm font-bold mb-3"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <User className="w-4 h-4" style={{ color: 'var(--color-terracotta-500)' }} />
              Personen
            </label>
            <div className="flex flex-wrap gap-2">
              {FAMILY_MEMBERS.map((member) => {
                const active = selectedPeople.includes(member.name);
                return (
                  <button
                    key={member.name}
                    type="button"
                    onClick={() => togglePerson(member.name)}
                    className="px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105 relative overflow-hidden"
                    style={{
                      backgroundColor: active ? member.color.activeBg : 'white',
                      color: active ? 'white' : member.color.text,
                      border: active ? 'none' : '2px solid var(--color-sand-200)',
                      boxShadow: active ? `0 4px 12px ${member.color.activeBg}40, 0 0 0 2px ${member.color.activeBg}, 0 0 0 4px white` : 'none',
                    }}
                  >
                    {active && <span className="absolute inset-0 bg-gradient-to-t from-black/10 to-white/10" />}
                    <span className="relative">{member.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location Selection */}
          <div>
            <label
              className="flex items-center gap-2 text-sm font-bold mb-3"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <MapPin className="w-4 h-4" style={{ color: 'var(--color-sage-500)' }} />
              Ort
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                onClick={() => selectPresetLocation('')}
                className="px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  backgroundColor: !presetLocation && !customLocation ? 'var(--color-sage-500)' : 'white',
                  color: !presetLocation && !customLocation ? 'white' : 'var(--color-text-muted)',
                  border: !presetLocation && !customLocation ? 'none' : '2px solid var(--color-sand-200)',
                  boxShadow: !presetLocation && !customLocation ? '0 4px 12px rgba(117,143,90,0.25), 0 0 0 2px var(--color-sage-400), 0 0 0 4px white' : 'none',
                }}
              >
                Kein Ort
              </button>
              {LOCATIONS.map((loc) => {
                const active = presetLocation === loc.name;
                return (
                  <button
                    key={loc.name}
                    type="button"
                    onClick={() => selectPresetLocation(loc.name)}
                    className="px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105"
                    style={{
                      backgroundColor: active ? 'var(--color-sand-600)' : 'white',
                      color: active ? 'white' : 'var(--color-text-muted)',
                      border: active ? 'none' : '2px solid var(--color-sand-200)',
                      boxShadow: active ? '0 4px 12px rgba(146,122,94,0.25), 0 0 0 2px var(--color-sand-500), 0 0 0 4px white' : 'none',
                    }}
                  >
                    {loc.emoji} {loc.name}
                  </button>
                );
              })}
            </div>
            <LocationAutocomplete
              value={customLocation}
              onChange={handleCustomLocationChange}
              onSelect={handleLocationSelect}
              placeholder="Ort eingeben..."
              disabled={isSubmitting}
            />
          </div>

          {/* Date */}
          <div>
            <label
              className="flex items-center gap-2 text-sm font-bold mb-3"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <Calendar className="w-4 h-4" style={{ color: 'var(--color-amber-500)' }} />
              Datum
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-4 py-3 rounded-xl border-2 focus:outline-none transition-all duration-200 font-medium"
              style={{
                backgroundColor: 'white',
                borderColor: 'var(--color-sand-200)',
                color: 'var(--color-text-primary)',
              }}
              disabled={isSubmitting}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm animate-slide-in-down"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.08)',
                border: '1px solid rgba(220, 38, 38, 0.15)',
                color: '#dc2626',
              }}
            >
              <X className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3.5 rounded-xl font-semibold transition-all duration-200 hover:bg-white/80"
              style={{
                backgroundColor: 'var(--color-sand-100)',
                color: 'var(--color-text-muted)',
              }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl font-bold text-white transition-all duration-300 disabled:opacity-50 hover:scale-[1.02] hover:-translate-y-0.5"
              style={{
                background: isSubmitting
                  ? 'linear-gradient(135deg, rgba(232,107,63,0.5) 0%, rgba(213,79,37,0.5) 100%)'
                  : 'linear-gradient(135deg, var(--color-terracotta-500) 0%, var(--color-terracotta-600) 50%, var(--color-rust-600) 100%)',
                boxShadow: isSubmitting ? 'none' : 'var(--shadow-glow-terracotta)',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Speichern...</span>
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>Speichern</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
