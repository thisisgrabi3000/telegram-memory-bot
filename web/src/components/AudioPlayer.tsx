import { useState, useRef, useEffect } from 'react';
import { Play, Pause, AudioLines, Trash2, Pencil } from 'lucide-react';
import { FAMILY_MEMBERS } from '../types';

// Discriminated union: callbacks require id; no callbacks = id omitted
type AudioPlayerProps =
  | {
      url: string;
      voiceSpeaker?: string | null;
      className?: string;
      id: number;
      onDelete?: (id: number) => Promise<void>;
      onUpdateSpeaker?: (id: number, speaker: string | null) => Promise<void>;
    }
  | {
      url: string;
      voiceSpeaker?: string | null;
      className?: string;
      id?: never;
      onDelete?: never;
      onUpdateSpeaker?: never;
    };

// Destructure id as a number — TS guarantees it's present when callbacks are passed
export function AudioPlayer({ url, voiceSpeaker, className, id, onDelete, onUpdateSpeaker }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [speakerEditMode, setSpeakerEditMode] = useState(false);
  const [isSavingSpeaker, setIsSavingSpeaker] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('loadedmetadata', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('loadedmetadata', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  function formatTime(seconds: number): string {
    if (!isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        // Playback blocked or failed — don't update state
      });
    }
  }

  return (
    <div className={className}>
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Speaker row — shown if speaker is set or if edit is possible */}
      {(voiceSpeaker || onUpdateSpeaker) && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span>🎙️</span>
          {speakerEditMode ? (
            <select
              className="text-xs rounded px-1 py-0.5 border"
              style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-sand-200)', backgroundColor: 'white' }}
              defaultValue={voiceSpeaker ?? ''}
              disabled={isSavingSpeaker}
              autoFocus
              onBlur={() => { if (!isSavingSpeaker) setSpeakerEditMode(false); }}
              onChange={async (e) => {
                if (!onUpdateSpeaker || id === undefined) return;
                setIsSavingSpeaker(true);
                try {
                  await onUpdateSpeaker(id, e.target.value || null);
                } finally {
                  setIsSavingSpeaker(false);
                  setSpeakerEditMode(false);
                }
              }}
            >
              <option value="">— kein Sprecher —</option>
              {FAMILY_MEMBERS.map(m => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          ) : (
            <>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {voiceSpeaker ?? '—'}
              </span>
              {onUpdateSpeaker && id !== undefined && (
                <button
                  type="button"
                  onClick={() => setSpeakerEditMode(true)}
                  className="p-0.5 rounded hover:bg-black/5 transition-colors"
                  title="Sprecher bearbeiten"
                >
                  <Pencil className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Player row */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
        style={{ backgroundColor: 'var(--color-sand-50)', border: '1px solid var(--color-sand-200)' }}
      >
        <button
          type="button"
          onClick={togglePlayback}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition-all hover:scale-105 flex-shrink-0"
          style={{ backgroundColor: 'var(--color-terracotta-500)' }}
        >
          {isPlaying
            ? <Pause className="w-4 h-4 text-white" />
            : <Play className="w-4 h-4 text-white" style={{ marginLeft: '2px' }} />
          }
        </button>

        <AudioLines className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-terracotta-400)' }} />

        <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Delete trigger button */}
        {onDelete && id !== undefined && (
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            className="ml-auto p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: 'var(--color-text-muted)' }}
            title="Aufnahme löschen"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Delete confirm row */}
      {deleteConfirm && onDelete && id !== undefined && (
        <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Aufnahme löschen?</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={isDeleting}
              className="text-xs px-2 py-1 rounded-lg"
              style={{ backgroundColor: 'var(--color-sand-100)', color: 'var(--color-text-secondary)' }}
              onClick={() => setDeleteConfirm(false)}
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={isDeleting}
              className="text-xs px-2 py-1 rounded-lg font-semibold"
              style={{ backgroundColor: '#dc2626', color: 'white', opacity: isDeleting ? 0.6 : 1 }}
              onClick={async () => {
                setIsDeleting(true);
                try {
                  await onDelete(id);
                } finally {
                  setIsDeleting(false);
                  setDeleteConfirm(false);
                }
              }}
            >
              {isDeleting ? 'Löschen...' : 'Löschen'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
