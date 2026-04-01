import { useState, useEffect } from 'react';
import { Calendar, MapPin, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Memory } from '../types';
import { fetchSharedMemory } from '../api/memoriesApi';
import { AudioPlayer } from './AudioPlayer';

interface SharedMemoryViewProps {
  token: string;
}

export function SharedMemoryView({ token }: SharedMemoryViewProps) {
  const [memory, setMemory] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'notFound' | 'network' | null>(null);

  useEffect(() => {
    fetchSharedMemory(token)
      .then(setMemory)
      .catch((err: Error) => {
        const status = err.message.match(/API Error: (\d+)/)?.[1];
        setError(status === '404' ? 'notFound' : 'network');
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Laden...</p>
      </div>
    );
  }

  if (error || !memory) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 p-6"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        <p className="text-3xl">{error === 'network' ? '⚠️' : '🔗'}</p>
        <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {error === 'network' ? 'Verbindungsfehler' : 'Erinnerung nicht gefunden'}
        </p>
        <p className="text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
          {error === 'network'
            ? 'Die Erinnerung konnte nicht geladen werden. Bitte versuche es erneut.'
            : 'Dieser Link ist ungültig oder die Erinnerung wurde gelöscht.'}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className="text-2xl font-bold gradient-text"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Famories
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Eine geteilte Erinnerung
          </p>
        </div>

        {/* Memory card */}
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {/* Date + person + location */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{format(parseISO(memory.source_date), 'd. MMMM yyyy', { locale: de })}</span>
            {memory.child_name && (
              <>
                <span>·</span>
                <span>{memory.child_name}</span>
              </>
            )}
            {memory.location && (
              <>
                <span>·</span>
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{memory.location}</span>
              </>
            )}
          </div>

          {/* Summary */}
          {memory.cleaned_summary && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {memory.cleaned_summary}
            </p>
          )}

          {/* Photos */}
          {memory.photos.length > 0 && (
            <div className={`grid gap-2 ${memory.photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {memory.photos.map(photo => (
                <img
                  key={photo.id}
                  src={photo.url}
                  alt=""
                  className="w-full rounded-xl object-cover"
                  style={{ maxHeight: '300px' }}
                />
              ))}
            </div>
          )}

          {/* Audio */}
          {memory.audios.length > 0 && (
            <div className="space-y-2">
              {memory.audios.map(audio => (
                <AudioPlayer
                  key={audio.id}
                  url={audio.url}
                  voiceSpeaker={audio.voice_speaker}
                />
              ))}
            </div>
          )}

          {/* People */}
          {memory.people.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
              {memory.people.map(person => (
                <span
                  key={person}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-sand-100)', color: 'var(--color-text-muted)' }}
                >
                  {person}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-6" style={{ color: 'var(--color-text-light)' }}>
          Geteilt über Famories
        </p>
      </div>
    </div>
  );
}
