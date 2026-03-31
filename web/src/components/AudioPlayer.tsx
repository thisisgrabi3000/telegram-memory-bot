import { useState, useRef, useEffect } from 'react';
import { Play, Pause, AudioLines } from 'lucide-react';

interface AudioPlayerProps {
  url: string;
  voiceSpeaker?: string | null;
  className?: string;
}

export function AudioPlayer({ url, voiceSpeaker, className }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

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
      audio.play();
      setIsPlaying(true);
    }
  }

  return (
    <div className={className}>
      <audio ref={audioRef} src={url} preload="metadata" />

      {voiceSpeaker && (
        <p className="text-xs mb-1.5 flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
          <span>🎙️</span>
          {voiceSpeaker}
        </p>
      )}

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
      </div>
    </div>
  );
}
