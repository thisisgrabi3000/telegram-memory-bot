import { useState, useRef, useEffect } from 'react';
import { X, User, MapPin, Calendar, Loader2, Sparkles, PenLine, Check, Camera, ImagePlus, Mic, Music, ClipboardPaste } from 'lucide-react';
import { VoiceRecorder } from './VoiceRecorder';
import { transcribeAudio } from '../api/memoriesApi';
import exifr from 'exifr';
import { FAMILY_MEMBERS, LOCATIONS } from '../types';
import type { Memory, CreateMemoryPayload } from '../types';
import { LocationAutocomplete } from './LocationAutocomplete';
import type { LocationResult } from './LocationAutocomplete';

const CHILDREN = ['Junis', 'Noah'];
const SPEAKER_OPTIONS = [...FAMILY_MEMBERS.map(m => m.name), 'Mehrere'];
const CREATE_DRAFT_STORAGE_KEY = 'famories_create_memory_draft_v1';
const MAX_PHOTOS_PER_MEMORY = 30;

interface CreateMemoryModalProps {
  onClose: () => void;
  onCreate: (data: CreateMemoryPayload) => Promise<Memory>;
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
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [pendingAudioFilename, setPendingAudioFilename] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [saveVoiceAudio, setSaveVoiceAudio] = useState(false);
  const [voiceSpeaker, setVoiceSpeaker] = useState<string | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const [exifHint, setExifHint] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const pasteEditableRef = useRef<HTMLDivElement>(null);
  const photoObjectUrlsRef = useRef<string[]>([]);
  const [isPasteTargetActive, setIsPasteTargetActive] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);

  const location = customLocation.trim() || presetLocation;

  useEffect(() => {
    return () => {
      photoObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      photoObjectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const rawDraft = localStorage.getItem(CREATE_DRAFT_STORAGE_KEY);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as {
        text?: string;
        selectedPeople?: string[];
        presetLocation?: string;
        customLocation?: string;
        date?: string;
        voiceSpeaker?: string | null;
      };

      if (draft.text) setText(draft.text);
      if (Array.isArray(draft.selectedPeople)) setSelectedPeople(draft.selectedPeople);
      if (draft.presetLocation) setPresetLocation(draft.presetLocation);
      if (draft.customLocation) setCustomLocation(draft.customLocation);
      if (draft.date) setDate(draft.date);
      if (draft.voiceSpeaker) setVoiceSpeaker(draft.voiceSpeaker);
      setRestoredDraft(Boolean(
        draft.text ||
        draft.customLocation ||
        draft.presetLocation ||
        (draft.selectedPeople && draft.selectedPeople.length > 0)
      ));
    } catch {
      localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const shouldPersist =
      text.trim().length > 0 ||
      selectedPeople.length > 0 ||
      presetLocation.length > 0 ||
      customLocation.trim().length > 0 ||
      date !== new Date().toISOString().split('T')[0];

    if (!shouldPersist) {
      localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
      return;
    }

    localStorage.setItem(CREATE_DRAFT_STORAGE_KEY, JSON.stringify({
      text,
      selectedPeople,
      presetLocation,
      customLocation,
      date,
      voiceSpeaker,
    }));
  }, [text, selectedPeople, presetLocation, customLocation, date, voiceSpeaker]);

  function togglePerson(name: string) {
    setSelectedPeople(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    );
  }

  function selectPresetLocation(name: string) {
    const isDeselecting = name === presetLocation;
    setPresetLocation(isDeselecting ? '' : name);
    setCustomLocation('');

    if (isDeselecting) {
      setLocationCoords(null);
    } else {
      const loc = LOCATIONS.find(l => l.name === name);
      if (loc) {
        setLocationCoords({ name: loc.name, latitude: loc.latitude, longitude: loc.longitude });
      } else {
        setLocationCoords(null);
      }
    }
  }

  function handleCustomLocationChange(val: string) {
    setCustomLocation(val);
    setPresetLocation('');
    // locationCoords will be set/cleared via handleLocationSelect
  }

  function handleLocationSelect(result: LocationResult | null) {
    setLocationCoords(result);
  }

  async function processIncomingPhotos(files: File[], source: 'picker' | 'paste' | 'drop') {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      if (source !== 'picker') {
        setError('Es wurde kein Bild zum Einfügen gefunden.');
      }
      return;
    }

    const slotsLeft = Math.max(0, MAX_PHOTOS_PER_MEMORY - photos.length);
    if (slotsLeft === 0) {
      setError(`Maximal ${MAX_PHOTOS_PER_MEMORY} Fotos pro Erinnerung.`);
      return;
    }

    const acceptedFiles = imageFiles.slice(0, slotsLeft);
    if (acceptedFiles.length < imageFiles.length) {
      setError(`Nur die ersten ${MAX_PHOTOS_PER_MEMORY} Fotos wurden übernommen.`);
    } else {
      setError(null);
    }

    const newPhotos = [...photos, ...acceptedFiles];
    setPhotos(newPhotos);

    const newObjectUrls = acceptedFiles.map(file => URL.createObjectURL(file));
    photoObjectUrlsRef.current.push(...newObjectUrls);
    setPhotoPreviews(prev => [...prev, ...newObjectUrls]);

    // Extract EXIF data from new files
    const today = new Date().toISOString().split('T')[0];
    let oldestDate: string | null = null;
    let firstGps: { latitude: number; longitude: number } | null = null;

    for (const file of acceptedFiles) {
      try {
        const exif = await exifr.parse(file, ['DateTimeOriginal', 'GPSLatitude', 'GPSLongitude']);
        if (!exif) continue;

        if (exif.DateTimeOriginal) {
          const d = exif.DateTimeOriginal instanceof Date
            ? exif.DateTimeOriginal
            : new Date(exif.DateTimeOriginal);
          if (!isNaN(d.getTime())) {
            const dateStr = d.toISOString().split('T')[0];
            if (!oldestDate || dateStr < oldestDate) oldestDate = dateStr;
          }
        }

        if (!firstGps && exif.latitude != null && exif.longitude != null) {
          firstGps = { latitude: exif.latitude, longitude: exif.longitude };
        }
      } catch {
        // EXIF extraction failed for this file — skip silently
      }
    }

    // Auto-fill date if it's still today (user hasn't manually changed it)
    if (oldestDate && date === today) {
      setDate(oldestDate);
      setExifHint(`Datum aus Foto: ${oldestDate}`);
    }

    // Auto-fill GPS if no location manually selected
    if (firstGps && !locationCoords && !presetLocation && !customLocation) {
      setLocationCoords({
        name: '',
        latitude: firstGps.latitude,
        longitude: firstGps.longitude,
      });
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    await processIncomingPhotos(files, 'picker');
  }

  function extractImageFiles(dataTransfer: DataTransfer | null): File[] {
    if (!dataTransfer) return [];

    const filesFromItems = Array.from(dataTransfer.items || [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file))
      .map((file, index) => {
        if (file.name) return file;
        return new File([file], `clipboard-image-${Date.now()}-${index}.png`, { type: file.type || 'image/png' });
      });

    if (filesFromItems.length > 0) {
      return filesFromItems;
    }

    return Array.from(dataTransfer.files || []).filter(file => file.type.startsWith('image/'));
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLElement>) {
    const files = extractImageFiles(event.clipboardData);
    if (files.length === 0) return;

    event.preventDefault();
    if (pasteEditableRef.current) {
      pasteEditableRef.current.textContent = '';
    }
    await processIncomingPhotos(files, 'paste');
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsPasteTargetActive(false);
    const files = extractImageFiles(event.dataTransfer);
    if (files.length === 0) return;
    await processIncomingPhotos(files, 'drop');
  }

  function removePhoto(index: number) {
    const removedUrl = photoPreviews[index];
    URL.revokeObjectURL(removedUrl);
    photoObjectUrlsRef.current = photoObjectUrlsRef.current.filter(url => url !== removedUrl);
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  }

  async function handleAudioFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input
    e.target.value = '';

    setIsTranscribing(true);
    setError(null);
    setPendingAudioFilename(null);
    setVoiceSpeaker(null);

    try {
      const result = await transcribeAudio(file, true);
      setText(prev => prev ? `${prev}\n\n${result.text}` : result.text);
      if (result.savedFilename) {
        setPendingAudioFilename(result.savedFilename);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audio-Transkription fehlgeschlagen');
    } finally {
      setIsTranscribing(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const child_name = selectedPeople.find(p => CHILDREN.includes(p)) || undefined;

    try {
      // 1. Transcribe voice recording (with optional save)
      let finalText = text.trim();
      let voiceSavedFilename: string | undefined;

      if (audioBlob) {
        try {
          const shouldSave = saveVoiceAudio && !pendingAudioFilename;
          const result = await transcribeAudio(audioBlob, shouldSave);
          finalText = finalText ? `${finalText}\n\n${result.text}` : result.text;
          if (shouldSave) voiceSavedFilename = result.savedFilename;
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Transkription fehlgeschlagen');
          setIsSubmitting(false);
          return;
        }
      }

      if (!finalText.trim() && photos.length === 0 && !pendingAudioFilename && !voiceSavedFilename) {
        setError('Füge mindestens Text, Fotos oder Audio hinzu.');
        setIsSubmitting(false);
        return;
      }

      // 2. Create memory atomically with media
      await onCreate({
        text: finalText,
        child_name,
        location: location || undefined,
        source_date: date || undefined,
        people: selectedPeople.length > 0 ? selectedPeople : undefined,
        photos: photos.length > 0 ? photos : undefined,
        latitude: locationCoords?.latitude,
        longitude: locationCoords?.longitude,
        audioFilename: pendingAudioFilename ?? voiceSavedFilename,
        voiceSpeaker,
      });

      photoObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      photoObjectUrlsRef.current = [];
      localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4 modal-backdrop"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden animate-fade-in-scale"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          boxShadow: 'var(--shadow-2xl)',
          maxHeight: 'min(92dvh, 92vh)',
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

        {/* Form: scrollable fields + sticky submit footer */}
        <form
          onSubmit={handleSubmit}
          onPaste={handlePaste}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
        {/* Scrollable fields */}
        <div className="p-6 space-y-6 overflow-y-auto" style={{ flex: 1 }}>
          {restoredDraft && (
            <div
              className="rounded-2xl border px-4 py-3 flex items-start justify-between gap-3"
              style={{
                backgroundColor: 'rgba(255,255,255,0.75)',
                borderColor: 'var(--color-sand-200)',
              }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Letzten Entwurf wiederhergestellt
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  Text und Metadaten wurden aus dem letzten ungespeicherten Entwurf geladen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
                  setRestoredDraft(false);
                }}
                className="text-xs font-semibold"
                style={{ color: 'var(--color-terracotta-600)' }}
              >
                Verwerfen
              </button>
            </div>
          )}

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
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                    >
                      <X className="w-3 h-3 text-white" />
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
              disabled={isSubmitting || photos.length >= MAX_PHOTOS_PER_MEMORY}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-all duration-200 hover:border-terracotta-400"
              style={{
                borderColor: 'var(--color-sand-300)',
                color: 'var(--color-text-muted)',
                backgroundColor: 'white',
              }}
            >
              <ImagePlus className="w-4 h-4" />
              {photos.length === 0
                ? 'Fotos hinzufügen'
                : photos.length < MAX_PHOTOS_PER_MEMORY
                  ? `${photos.length} Foto${photos.length > 1 ? 's' : ''} · Weitere hinzufügen`
                  : `${MAX_PHOTOS_PER_MEMORY}/${MAX_PHOTOS_PER_MEMORY} Fotos`}
            </button>
            {photos.length === 0 && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                Mehrere Fotos gleichzeitig auswählbar (max. {MAX_PHOTOS_PER_MEMORY})
              </p>
            )}

            <div
              ref={pasteZoneRef}
              tabIndex={0}
              onClick={() => pasteEditableRef.current?.focus()}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsPasteTargetActive(true);
              }}
              onDragEnter={() => setIsPasteTargetActive(true)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setIsPasteTargetActive(false);
                }
              }}
              className="mt-3 rounded-2xl border text-sm transition-all duration-200 outline-none"
              style={{
                borderColor: isPasteTargetActive ? 'var(--color-terracotta-400)' : 'var(--color-sand-200)',
                backgroundColor: isPasteTargetActive ? 'rgba(232,107,63,0.08)' : 'rgba(255,255,255,0.7)',
                boxShadow: isPasteTargetActive ? '0 0 0 4px rgba(232,107,63,0.08)' : 'none',
              }}
            >
              <div className="flex items-start gap-3 px-4 py-3">
                <div
                  className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'rgba(232,107,63,0.12)', color: 'var(--color-terracotta-600)' }}
                >
                  <ClipboardPaste className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Fotos hier einfuegen oder ablegen
                  </p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    iPhone: im Feld unten lange druecken und "Einfuegen" waehlen. Auf Desktop funktioniert auch Drag-and-Drop.
                  </p>
                </div>
              </div>

              <div className="px-4 pb-4">
                <div
                  ref={pasteEditableRef}
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-label="Bild hier einfuegen"
                  onPaste={handlePaste}
                  onInput={(e) => {
                    e.currentTarget.textContent = '';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.textContent = '';
                  }}
                  className="w-full rounded-2xl border px-3 py-3 text-sm"
                  style={{
                    minHeight: '52px',
                    borderColor: 'var(--color-sand-200)',
                    backgroundColor: 'white',
                    color: 'var(--color-text-primary)',
                    WebkitUserSelect: 'text',
                    userSelect: 'text',
                  }}
                  data-placeholder="Hier lange druecken und Bild einfuegen"
                />
              </div>
            </div>
          </div>

          {/* Audio Upload */}
          <div>
            <label
              className="flex items-center gap-2 text-sm font-bold mb-3"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <Music className="w-4 h-4" style={{ color: 'var(--color-terracotta-500)' }} />
              Audio hochladen
            </label>
            <input
              type="file"
              ref={audioFileInputRef}
              accept=".m4a,.mp3,.ogg,.opus,.wav,.aac,.webm"
              onChange={handleAudioFileChange}
              className="hidden"
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => audioFileInputRef.current?.click()}
              disabled={isSubmitting || isTranscribing || !!pendingAudioFilename}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-all duration-200 min-h-[44px]"
              style={{
                borderColor: 'var(--color-sand-300)',
                color: 'var(--color-text-muted)',
                backgroundColor: 'white',
              }}
            >
              {isTranscribing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Transkribiere...</>
              ) : pendingAudioFilename ? (
                <><Check className="w-4 h-4" style={{ color: 'var(--color-sage-500)' }} /> Audio bereit</>
              ) : (
                <><Music className="w-4 h-4" /> 🎵 Audio hochladen</>
              )}
            </button>
            {pendingAudioFilename && (
              <button
                type="button"
                onClick={() => { setPendingAudioFilename(null); setVoiceSpeaker(null); }}
                className="mt-1.5 text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Audio entfernen
              </button>
            )}
          </div>

          {/* Voice Recording */}
          <div>
            <label
              className="flex items-center gap-2 text-sm font-bold mb-3"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <Mic className="w-4 h-4" style={{ color: 'var(--color-terracotta-500)' }} />
              Sprachnotiz
            </label>
            <VoiceRecorder
              onRecordingChange={(blob) => {
                setAudioBlob(blob);
                if (!blob) { setSaveVoiceAudio(false); setVoiceSpeaker(null); }
              }}
              showSaveToggle={!pendingAudioFilename}
              onSaveAudioChange={(save) => {
                setSaveVoiceAudio(save);
                if (!save) setVoiceSpeaker(null);
              }}
              disabled={isSubmitting}
            />
          </div>

          {/* Speaker Picker — shown when an audio file is queued or voice save is on */}
          {(pendingAudioFilename || (audioBlob && saveVoiceAudio)) && (
            <div>
              <label
                className="flex items-center gap-2 text-sm font-bold mb-3"
                style={{ color: 'var(--color-text-primary)' }}
              >
                🎙️ Wessen Stimme ist das?
              </label>
              <div className="flex flex-wrap gap-2">
                {SPEAKER_OPTIONS.map((name) => {
                  const member = FAMILY_MEMBERS.find(m => m.name === name);
                  const active = voiceSpeaker === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setVoiceSpeaker(active ? null : name)}
                      className="px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105"
                      style={{
                        backgroundColor: active ? (member?.color.activeBg ?? 'var(--color-sand-600)') : 'white',
                        color: active ? 'white' : (member?.color.text ?? 'var(--color-text-muted)'),
                        border: active ? 'none' : '2px solid var(--color-sand-200)',
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                    title={loc.address}
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
            {exifHint && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-sage-500)' }}>
                {exifHint}
              </p>
            )}
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

        </div>{/* end scrollable fields */}

          {/* Sticky submit footer — always visible, outside scroll */}
          <div
            style={{
              flexShrink: 0,
              padding: '0.75rem 1.5rem',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
              borderTop: '1px solid var(--color-sand-100)',
              backgroundColor: 'var(--color-bg-primary)',
            }}
          >
            <div className="flex gap-3">
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
          </div>
        </form>
      </div>
    </div>
  );
}
