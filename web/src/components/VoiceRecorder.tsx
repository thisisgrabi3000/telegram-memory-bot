import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Trash2 } from 'lucide-react';

interface VoiceRecorderProps {
  onRecordingChange: (blob: Blob | null) => void;
  disabled?: boolean;
}

export function VoiceRecorder({ onRecordingChange, disabled }: VoiceRecorderProps) {
  const [state, setState] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onRecordingChange(blob);

        // Create audio URL for playback
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = URL.createObjectURL(blob);

        setState('recorded');
      };

      mediaRecorder.start();
      setState('recording');
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000);
    } catch {
      setError('Mikrofon-Zugriff verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen.');
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }

  function deleteRecording() {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    onRecordingChange(null);
    setState('idle');
    setElapsed(0);
  }

  function togglePlayback() {
    if (!audioUrlRef.current) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const audio = new Audio(audioUrlRef.current);
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    }
  }

  if (error) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
        style={{
          backgroundColor: 'rgba(220, 38, 38, 0.08)',
          border: '1px solid rgba(220, 38, 38, 0.15)',
          color: '#dc2626',
        }}
      >
        <Mic className="w-4 h-4 flex-shrink-0" />
        {error}
      </div>
    );
  }

  // IDLE state
  if (state === 'idle') {
    return (
      <button
        type="button"
        onClick={startRecording}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-all duration-200 min-h-[44px]"
        style={{
          borderColor: 'var(--color-sand-300)',
          color: 'var(--color-text-muted)',
          backgroundColor: 'white',
        }}
      >
        <Mic className="w-4 h-4" style={{ color: 'var(--color-terracotta-500)' }} />
        Sprachnotiz aufnehmen
      </button>
    );
  }

  // RECORDING state
  if (state === 'recording') {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{ backgroundColor: 'rgba(220, 38, 38, 0.06)', border: '1px solid rgba(220, 38, 38, 0.15)' }}
      >
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{
            backgroundColor: '#dc2626',
            animation: 'pulse-soft 1s ease-in-out infinite',
          }}
        />
        <span className="font-mono text-sm font-semibold" style={{ color: '#dc2626' }}>
          {formatTime(elapsed)}
        </span>
        <span className="text-sm flex-1" style={{ color: 'var(--color-text-muted)' }}>
          Aufnahme läuft...
        </span>
        <button
          type="button"
          onClick={stopRecording}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all hover:scale-105"
          style={{ backgroundColor: '#dc2626' }}
        >
          <Square className="w-4 h-4 text-white" fill="white" />
        </button>
      </div>
    );
  }

  // RECORDED state
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ backgroundColor: 'var(--color-sand-50)', border: '1px solid var(--color-sand-200)' }}
    >
      <button
        type="button"
        onClick={togglePlayback}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all hover:scale-105"
        style={{ backgroundColor: 'var(--color-terracotta-500)' }}
      >
        {isPlaying
          ? <Pause className="w-4 h-4 text-white" />
          : <Play className="w-4 h-4 text-white" style={{ marginLeft: '2px' }} />
        }
      </button>
      <div className="flex-1">
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Sprachnotiz
        </span>
        <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
          {formatTime(elapsed)}
        </span>
      </div>
      <button
        type="button"
        onClick={deleteRecording}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all hover:scale-105"
        style={{ backgroundColor: 'rgba(220, 38, 38, 0.08)' }}
      >
        <Trash2 className="w-4 h-4" style={{ color: '#dc2626' }} />
      </button>
    </div>
  );
}
