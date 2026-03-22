import { useState } from 'react';
import { X, User, MapPin, Calendar, Loader2, Sparkles, PenLine, Check } from 'lucide-react';
import { FAMILY_MEMBERS, LOCATIONS } from '../types';

interface CreateMemoryModalProps {
  onClose: () => void;
  onCreate: (data: {
    text: string;
    child_name?: string;
    location?: string;
    source_date?: string;
  }) => Promise<void>;
}

export function CreateMemoryModal({ onClose, onCreate }: CreateMemoryModalProps) {
  const [text, setText] = useState('');
  const [childName, setChildName] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textFocused, setTextFocused] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!text.trim()) {
      setError('Bitte gib einen Text ein');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onCreate({
        text: text.trim(),
        child_name: childName || undefined,
        location: location || undefined,
        source_date: date || undefined,
      });
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
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="relative px-6 py-5 flex items-center justify-between overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, var(--color-terracotta-500) 0%, var(--color-terracotta-600) 50%, var(--color-rust-600) 100%)',
          }}
        >
          {/* Decorative elements */}
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Text Input */}
          <div>
            <label
              className="block text-sm font-bold mb-2.5"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Was möchtest du festhalten?
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
                placeholder="Erzähle von einem schönen Moment..."
                rows={4}
                className="w-full px-4 py-4 rounded-2xl border-2 focus:outline-none transition-all duration-300 resize-none"
                style={{
                  backgroundColor: 'white',
                  borderColor: textFocused ? 'var(--color-terracotta-400)' : 'var(--color-sand-200)',
                  color: 'var(--color-text-primary)',
                }}
                autoFocus
                disabled={isSubmitting}
              />
              {/* Character count hint */}
              <div
                className="absolute bottom-3 right-3 text-xs"
                style={{ color: 'var(--color-text-light)' }}
              >
                {text.length > 0 && `${text.length} Zeichen`}
              </div>
            </div>
          </div>

          {/* Child Selection */}
          <div>
            <label
              className="flex items-center gap-2 text-sm font-bold mb-3"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <User className="w-4 h-4" style={{ color: 'var(--color-terracotta-500)' }} />
              Person
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setChildName('')}
                className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-105 ${
                  !childName ? 'ring-2 ring-offset-2' : ''
                }`}
                style={{
                  backgroundColor: !childName ? 'var(--color-terracotta-500)' : 'white',
                  color: !childName ? 'white' : 'var(--color-text-muted)',
                  border: !childName ? 'none' : '2px solid var(--color-sand-200)',
                  boxShadow: !childName ? 'var(--shadow-glow-terracotta), 0 0 0 2px var(--color-terracotta-400), 0 0 0 4px white' : 'none',
                }}
              >
                Keine Auswahl
              </button>
              {FAMILY_MEMBERS.map((member) => (
                <button
                  key={member.name}
                  type="button"
                  onClick={() => setChildName(member.name)}
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-105 relative overflow-hidden ${
                    childName === member.name ? 'ring-2 ring-offset-2' : ''
                  }`}
                  style={{
                    backgroundColor: childName === member.name ? member.color.activeBg : 'white',
                    color: childName === member.name ? 'white' : member.color.text,
                    border: childName === member.name ? 'none' : '2px solid var(--color-sand-200)',
                    boxShadow: childName === member.name ? `0 4px 12px ${member.color.activeBg}40, 0 0 0 2px ${member.color.activeBg}, 0 0 0 4px white` : 'none',
                  }}
                >
                  {childName === member.name && (
                    <span className="absolute inset-0 bg-gradient-to-t from-black/10 to-white/10" />
                  )}
                  <span className="relative">{member.name}</span>
                </button>
              ))}
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLocation('')}
                className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-105 ${
                  !location ? 'ring-2 ring-offset-2' : ''
                }`}
                style={{
                  backgroundColor: !location ? 'var(--color-sage-500)' : 'white',
                  color: !location ? 'white' : 'var(--color-text-muted)',
                  border: !location ? 'none' : '2px solid var(--color-sand-200)',
                  boxShadow: !location ? '0 4px 12px rgba(117,143,90,0.25), 0 0 0 2px var(--color-sage-400), 0 0 0 4px white' : 'none',
                }}
              >
                Kein Ort
              </button>
              {LOCATIONS.map((loc) => (
                <button
                  key={loc.name}
                  type="button"
                  onClick={() => setLocation(loc.name)}
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-105 ${
                    location === loc.name ? 'ring-2 ring-offset-2' : ''
                  }`}
                  style={{
                    backgroundColor: location === loc.name ? 'var(--color-sand-600)' : 'white',
                    color: location === loc.name ? 'white' : 'var(--color-text-muted)',
                    border: location === loc.name ? 'none' : '2px solid var(--color-sand-200)',
                    boxShadow: location === loc.name ? '0 4px 12px rgba(146,122,94,0.25), 0 0 0 2px var(--color-sand-500), 0 0 0 4px white' : 'none',
                  }}
                >
                  {loc.emoji} {loc.name}
                </button>
              ))}
            </div>
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
              disabled={isSubmitting || !text.trim()}
              className="flex-1 flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl font-bold text-white transition-all duration-300 disabled:opacity-50 hover:scale-[1.02] hover:-translate-y-0.5"
              style={{
                background: isSubmitting || !text.trim()
                  ? 'linear-gradient(135deg, rgba(232,107,63,0.5) 0%, rgba(213,79,37,0.5) 100%)'
                  : 'linear-gradient(135deg, var(--color-terracotta-500) 0%, var(--color-terracotta-600) 50%, var(--color-rust-600) 100%)',
                boxShadow: isSubmitting || !text.trim() ? 'none' : 'var(--shadow-glow-terracotta)',
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
