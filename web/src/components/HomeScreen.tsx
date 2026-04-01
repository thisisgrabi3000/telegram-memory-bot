import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format, parseISO, subDays, subHours, startOfYear, isWithinInterval } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  ChevronDown, ChevronLeft, ChevronRight, X, Calendar, User, MessageCircle, Image as ImageIcon,
  Pencil, Check, Trash2, Search, MapPin, Star, Plus, Mic, Heart,
  Sparkles, SlidersHorizontal, Camera, Settings, HelpCircle,
  Type, Contrast, Link2, Map, List, Clock, AudioLines
} from 'lucide-react';
import type { Memory } from '../types';
import { FAMILY_MEMBERS, LOCATIONS } from '../types';
import { CreateMemoryModal } from './CreateMemoryModal';
import { MapView } from './MapView';
import { HorizontalTimeline } from './HorizontalTimeline';
import { AudioPlayer } from './AudioPlayer';

interface HomeScreenProps {
  memories: Memory[];
  onUpdate?: (id: number, text: string) => Promise<void>;
  onUpdateDate?: (id: number, date: string) => Promise<void>;
  onUpdatePerson?: (id: number, childName: string | null) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  onToggleFavorite?: (id: number) => Promise<void>;
  onCreate?: (data: {
    text: string;
    child_name?: string;
    location?: string;
    source_date?: string;
    people?: string[];
    photos?: File[];
    latitude?: number;
    longitude?: number;
  }) => Promise<Memory>;
  onDeletePhoto?: (memoryId: number, photoId: number) => Promise<void>;
  onDeleteAudio?: (memoryId: number, audioId: number) => Promise<void>;
  onUpdateAudioSpeaker?: (memoryId: number, audioId: number, speaker: string | null) => Promise<void>;
  identity?: string | null;
  onIdentityReset?: () => void;
}

type TimeFilter = '24h' | '7d' | '30d' | 'year' | 'custom' | 'all';

function getTimeFilterRange(filter: TimeFilter, customStart?: string, customEnd?: string) {
  const now = new Date();
  switch (filter) {
    case 'all':
      return { start: new Date('1900-01-01'), end: new Date('2100-12-31') };
    case '24h':
      return { start: subHours(now, 24), end: now };
    case '7d':
      return { start: subDays(now, 7), end: now };
    case '30d':
      return { start: subDays(now, 30), end: now };
    case 'year':
      return { start: startOfYear(now), end: now };
    case 'custom':
      return {
        start: customStart ? parseISO(customStart) : subDays(now, 7),
        end: customEnd ? parseISO(customEnd) : now,
      };
  }
}


function getMemberColor(name: string | null) {
  if (!name || name === 'null') return { activeBg: '#927a5e', text: '#635445' };
  const member = FAMILY_MEMBERS.find(m =>
    m.name === name || m.aliases.some(a => a.toLowerCase() === name.toLowerCase())
  );
  return member?.color || { activeBg: '#927a5e', text: '#635445' };
}

type FontSize = 'normal' | 'large' | 'xlarge';

const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  normal: '',
  large: 'font-large',
  xlarge: 'font-xlarge',
};

export function HomeScreen({ memories, onUpdate, onUpdateDate, onUpdatePerson, onDelete, onToggleFavorite, onCreate, onDeletePhoto, onDeleteAudio, onUpdateAudioSpeaker, identity, onIdentityReset }: HomeScreenProps) {
  const [personFilter, setPersonFilter] = useState<string>('Alle');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('7d');
  const [locationFilter, setLocationFilter] = useState<string>('Alle');
  const [speakerFilter, setSpeakerFilter] = useState<string>('Alle');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [lightboxImage, setLightboxImage] = useState<{ memory: Memory; photoIndex: number } | null>(null);
  const [lightboxTouchStartX, setLightboxTouchStartX] = useState(0);
  const [photoDeleteConfirm, setPhotoDeleteConfirm] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  // Lightbox text edit state
  const [lightboxEditMode, setLightboxEditMode] = useState(false);
  const [lightboxEditText, setLightboxEditText] = useState('');
  const [lightboxIsSaving, setLightboxIsSaving] = useState(false);
  const [visibleImages, setVisibleImages] = useState(24);
  const [visibleEntries, setVisibleEntries] = useState(20);
  const textScrollRef = useRef<HTMLDivElement>(null);
  const textSentinelRef = useRef<HTMLDivElement>(null);
  const photoSentinelRef = useRef<HTMLDivElement>(null);

  // Accessibility settings
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    return (localStorage.getItem('famories_font_size') as FontSize) || 'normal';
  });
  const [highContrast, setHighContrast] = useState(() => {
    return localStorage.getItem('famories_high_contrast') === 'true';
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!showFilterDropdown) return;
    const handler = () => setShowFilterDropdown(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showFilterDropdown]);
  const [showHelp, setShowHelp] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Date edit state
  const [editingDateId, setEditingDateId] = useState<number | null>(null);
  const [editDateValue, setEditDateValue] = useState('');
  const [isSavingDate, setIsSavingDate] = useState(false);

  // Person edit state
  const [editingPersonId, setEditingPersonId] = useState<number | null>(null);
  const [editPersonValue, setEditPersonValue] = useState<string>('');
  const [isSavingPerson, setIsSavingPerson] = useState(false);

  // Delete state
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'feed' | 'map' | 'timeline'>('feed');

  // Lightbox navigation helpers
  function lightboxGoNext() {
    if (!lightboxImage) return;
    const total = lightboxImage.memory.photos.length;
    if (total <= 1) return;
    setLightboxImage({ memory: lightboxImage.memory, photoIndex: (lightboxImage.photoIndex + 1) % total });
  }

  function lightboxGoPrev() {
    if (!lightboxImage) return;
    const total = lightboxImage.memory.photos.length;
    if (total <= 1) return;
    setLightboxImage({ memory: lightboxImage.memory, photoIndex: (lightboxImage.photoIndex - 1 + total) % total });
  }

  // Reset edit state when lightbox closes
  useEffect(() => {
    if (!lightboxImage) {
      setLightboxEditMode(false);
      setLightboxEditText('');
    }
  }, [lightboxImage]);

  // Sync lightboxImage.memory when memories state updates (e.g. after save)
  useEffect(() => {
    setLightboxImage(prev => {
      if (!prev) return null;
      const updated = memories.find(m => m.id === prev.memory.id);
      if (updated && updated !== prev.memory) {
        return { ...prev, memory: updated };
      }
      return prev;
    });
  }, [memories]);

  // Keyboard handler for lightbox
  useEffect(() => {
    if (!lightboxImage) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') lightboxGoNext();
      else if (e.key === 'ArrowLeft') lightboxGoPrev();
      else if (e.key === 'Escape') {
        if (lightboxEditMode) {
          setLightboxEditMode(false);
          setLightboxEditText('');
        } else {
          setLightboxImage(null);
          setPhotoDeleteConfirm(false);
        }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightboxImage, lightboxEditMode]);

  // Accessibility handlers
  const handleFontSizeChange = (size: FontSize) => {
    setFontSize(size);
    localStorage.setItem('famories_font_size', size);
  };

  const handleHighContrastToggle = () => {
    const newValue = !highContrast;
    setHighContrast(newValue);
    localStorage.setItem('famories_high_contrast', String(newValue));
  };

  const copyShareLink = () => {
    const token = localStorage.getItem('famories_auth_token');
    const url = token
      ? `${window.location.origin}?token=${token}`
      : window.location.origin;
    navigator.clipboard.writeText(url);
    alert('Link kopiert! Teile ihn mit Oma & Opa.');
  };

  const handleStartEdit = (memory: Memory) => {
    setEditingId(memory.id);
    setEditText(memory.cleaned_summary || '');
  };

  const handleSaveEdit = async () => {
    if (!onUpdate || editingId === null || editText.trim() === '') return;
    setIsSaving(true);
    try {
      await onUpdate(editingId, editText.trim());
      setEditingId(null);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleLightboxSave = async () => {
    if (!onUpdate || !lightboxImage || lightboxEditText.trim() === '') return;
    setLightboxIsSaving(true);
    try {
      await onUpdate(lightboxImage.memory.id, lightboxEditText.trim());
      setLightboxEditMode(false);
      setLightboxEditText('');
    } catch (err) {
      console.error('Fehler beim Speichern des Lightbox-Textes:', err);
    } finally {
      setLightboxIsSaving(false);
    }
  };

  const handleDeleteConfirm = async (id: number) => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(id);
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const timeRange = useMemo(() =>
    getTimeFilterRange(timeFilter, customStartDate, customEndDate),
    [timeFilter, customStartDate, customEndDate]
  );

  const availableSpeakers = useMemo(() => {
    const speakers = new Set<string>();
    memories.forEach(m => m.audios.forEach(a => {
      if (a.voice_speaker) speakers.add(a.voice_speaker);
    }));
    return Array.from(speakers);
  }, [memories]);

  // Helper to highlight search terms
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark
          key={i}
          className="rounded px-0.5"
          style={{ backgroundColor: 'var(--color-amber-200)', color: 'var(--color-amber-900)' }}
        >
          {part}
        </mark>
      ) : part
    );
  };

  // Filter memories by all criteria
  const filteredMemories = useMemo(() => {
    let filteredMemories = memories.filter(memory => {
      const date = parseISO(memory.source_date);
      const inTimeRange = isWithinInterval(date, { start: timeRange.start, end: timeRange.end });

      // Person filter: match child_name, recorded_by, OR anyone in people array
      const matchesPerson = personFilter === 'Alle' ||
        memory.child_name === personFilter ||
        memory.recorded_by === personFilter ||
        (memory.people && memory.people.includes(personFilter));

      const matchesLocation = locationFilter === 'Alle' ||
        memory.location === locationFilter;

      const matchesFavorites = !showFavoritesOnly || memory.is_favorite;

      // Erweiterte Suche: Text, Personen, Tags, Kategorien
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query ||
        (memory.cleaned_summary && memory.cleaned_summary.toLowerCase().includes(query)) ||
        (memory.people && memory.people.some(p => p.toLowerCase().includes(query))) ||
        (memory.tags && memory.tags.some(t => t.toLowerCase().includes(query))) ||
        (memory.categories && memory.categories.some(c => c.toLowerCase().includes(query))) ||
        (memory.child_name && memory.child_name.toLowerCase().includes(query)) ||
        (memory.recorded_by && memory.recorded_by.toLowerCase().includes(query)) ||
        (memory.location && memory.location.toLowerCase().includes(query));

      return inTimeRange && matchesPerson && matchesLocation && matchesFavorites && matchesSearch;
    });
    if (speakerFilter !== 'Alle') {
      filteredMemories = filteredMemories.filter(m =>
        m.audios.some(a => a.voice_speaker === speakerFilter)
      );
    }
    return filteredMemories;
  }, [memories, personFilter, locationFilter, showFavoritesOnly, searchQuery, timeRange, speakerFilter]);

  // Separate text entries (messages) from photo entries
  const textEntries = useMemo(() => {
    return filteredMemories
      .filter(m => m.cleaned_summary && m.cleaned_summary.length > 0)
      .sort((a, b) => new Date(b.source_date).getTime() - new Date(a.source_date).getTime());
  }, [filteredMemories]);

  // All memories with photos — no time filter, sorted newest first
  const memoryPhotoGroups = useMemo(() => {
    return memories
      .filter(m => m.photos && m.photos.length > 0)
      .sort((a, b) => new Date(b.source_date).getTime() - new Date(a.source_date).getTime());
  }, [memories]);

  // Reset visible count when filtered list changes (e.g. user changes a filter)
  useEffect(() => {
    setVisibleEntries(20);
  }, [textEntries]);

  // Auto-load more text entries as user scrolls to the bottom of the feed
  useEffect(() => {
    const root = textScrollRef.current;
    const sentinel = textSentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleEntries(prev => prev < textEntries.length ? prev + 20 : prev);
        }
      },
      { root, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [textEntries, visibleEntries]);

  // Auto-load more photos as user scrolls to the sentinel below the grid
  useEffect(() => {
    const sentinel = photoSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleImages(prev => prev < memoryPhotoGroups.length ? prev + 24 : prev);
        }
      },
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [memoryPhotoGroups.length]);

  const allPersons = ['Alle', ...FAMILY_MEMBERS.map(m => m.name)];
  const allLocations = ['Alle', ...LOCATIONS.map(l => l.name)];

  function getLocationEmoji(name: string): string {
    return LOCATIONS.find(l => l.name === name)?.emoji ?? '📍';
  }

  const timeOptions = [
    { value: 'all', label: 'Alle', icon: '🌐' },
    { value: '24h', label: 'Letzte 24h', icon: '⚡' },
    { value: '7d', label: '7 Tage', icon: '📅' },
    { value: '30d', label: '30 Tage', icon: '📆' },
    { value: 'year', label: 'Dieses Jahr', icon: '🗓️' },
    { value: 'custom', label: 'Custom', icon: '✨' },
  ];

  // Count favorites
  const favoritesCount = useMemo(() =>
    memories.filter(m => m.is_favorite).length,
    [memories]
  );

  return (
    <div
      className={`min-h-screen ${FONT_SIZE_CLASSES[fontSize]} ${highContrast ? 'high-contrast' : ''}`}
      style={{
        backgroundColor: highContrast ? '#ffffff' : 'var(--color-bg-primary)',
        color: highContrast ? '#000000' : undefined,
      }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-40 backdrop-blur-2xl border-b"
        style={{
          background: highContrast ? '#ffffff' : 'rgba(253, 250, 246, 0.92)',
          borderColor: highContrast ? '#000000' : 'var(--color-sand-200)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">

          {/* Top row: Logo + right buttons (+ desktop tabs in center) */}
          <div className="flex items-center justify-between py-3">
            {/* Logo & Title */}
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: highContrast ? '#000000' : 'linear-gradient(135deg, rgba(232,107,63,0.15) 0%, rgba(251,191,36,0.10) 100%)',
                }}
              >
                <Heart className="w-4 h-4" style={{ color: highContrast ? '#ffffff' : 'var(--color-terracotta-500)', fill: highContrast ? '#ffffff' : 'var(--color-terracotta-500)' }} />
              </div>
              <h1
                className="text-xl sm:text-2xl md:text-3xl font-bold gradient-text"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Famories
              </h1>
            </div>

            {/* Desktop tab navigation — hidden on mobile */}
            <div className="hidden sm:flex gap-2">
              {([['feed', <List key="l" className="w-4 h-4" />, 'Feed'], ['map', <Map key="m" className="w-4 h-4" />, 'Karte'], ['timeline', <Clock key="c" className="w-4 h-4" />, 'Chronik']] as [string, React.ReactNode, string][]).map(([id, icon, label]) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as 'feed' | 'map' | 'timeline')}
                  className={`flex items-center justify-center gap-2 min-w-[44px] min-h-[44px] px-4 py-2 rounded-xl font-medium transition-all ${
                    activeTab === id
                      ? 'bg-gradient-to-r from-terracotta-500 to-terracotta-600 text-white'
                      : 'bg-white/50 hover:bg-white/80'
                  }`}
                  style={activeTab === id ? { boxShadow: 'var(--shadow-glow-terracotta)' } : {}}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Right side buttons */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Help Button */}
              <button
                onClick={() => setShowHelp(true)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all duration-200 hover:scale-105"
                style={{
                  backgroundColor: highContrast ? '#000000' : 'rgba(117,143,90,0.1)',
                }}
                title="Hilfe"
              >
                <HelpCircle className="w-5 h-5" style={{ color: highContrast ? '#ffffff' : 'var(--color-sage-600)' }} />
              </button>

              {/* Settings Button */}
              <div className="relative">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all duration-200 hover:scale-105"
                  style={{
                    backgroundColor: highContrast ? '#000000' : 'rgba(146,122,94,0.1)',
                  }}
                  title="Einstellungen"
                >
                  <Settings className="w-5 h-5" style={{ color: highContrast ? '#ffffff' : 'var(--color-sand-600)' }} />
                </button>

                {/* Settings Dropdown */}
                {showSettings && (
                  <div
                    className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-64 max-w-[260px] rounded-2xl p-4 shadow-xl z-50 animate-fade-in"
                    style={{
                      backgroundColor: highContrast ? '#ffffff' : 'white',
                      border: highContrast ? '2px solid #000000' : '1px solid var(--color-sand-200)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="font-bold mb-3 flex items-center gap-2" style={{ color: highContrast ? '#000000' : 'var(--color-text-primary)' }}>
                      <Settings className="w-4 h-4" />
                      Einstellungen
                    </h3>

                    {/* Font Size */}
                    <div className="mb-4">
                      <label className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: highContrast ? '#000000' : 'var(--color-text-muted)' }}>
                        <Type className="w-3.5 h-3.5" />
                        Schriftgröße
                      </label>
                      <div className="flex gap-2">
                        {(['normal', 'large', 'xlarge'] as FontSize[]).map((size) => (
                          <button
                            key={size}
                            onClick={() => handleFontSizeChange(size)}
                            className={`flex-1 py-2 rounded-lg font-medium transition-all ${fontSize === size ? 'ring-2' : ''}`}
                            style={{
                              backgroundColor: fontSize === size
                                ? (highContrast ? '#000000' : 'var(--color-terracotta-500)')
                                : (highContrast ? '#f0f0f0' : 'var(--color-sand-100)'),
                              color: fontSize === size
                                ? '#ffffff'
                                : (highContrast ? '#000000' : 'var(--color-text-muted)'),
                            }}
                          >
                            {size === 'normal' ? 'A' : size === 'large' ? 'A+' : 'A++'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* High Contrast */}
                    <div className="mb-4">
                      <button
                        onClick={handleHighContrastToggle}
                        className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg transition-all"
                        style={{
                          backgroundColor: highContrast ? '#000000' : 'var(--color-sand-100)',
                          color: highContrast ? '#ffffff' : 'var(--color-text-primary)',
                        }}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <Contrast className="w-4 h-4" />
                          Hoher Kontrast
                        </span>
                        <span className={`w-10 h-6 rounded-full relative transition-all ${highContrast ? 'bg-green-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${highContrast ? 'right-1' : 'left-1'}`} />
                        </span>
                      </button>
                    </div>

                    {/* Share Link */}
                    <button
                      onClick={copyShareLink}
                      className="w-full flex items-center gap-2 py-2.5 px-3 rounded-lg font-medium transition-all hover:scale-[1.02]"
                      style={{
                        backgroundColor: highContrast ? '#f0f0f0' : 'var(--color-sage-100)',
                        color: highContrast ? '#000000' : 'var(--color-sage-700)',
                      }}
                    >
                      <Link2 className="w-4 h-4" />
                      Link für Oma & Opa kopieren
                    </button>

                    {/* Identity */}
                    {onIdentityReset && identity && (
                      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-sand-200)' }}>
                        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: highContrast ? '#000000' : 'var(--color-text-muted)' }}>
                          Angemeldet als
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm" style={{ color: highContrast ? '#000000' : 'var(--color-text-primary)' }}>
                            {identity}
                          </span>
                          <button
                            onClick={() => { onIdentityReset(); setShowSettings(false); }}
                            className="text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all min-h-[36px]"
                            style={{
                              backgroundColor: highContrast ? '#f0f0f0' : 'var(--color-sand-100)',
                              color: highContrast ? '#000000' : 'var(--color-text-muted)',
                            }}
                          >
                            Wechseln
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setShowSettings(false)}
                      className="w-full mt-3 text-xs font-medium py-2 rounded-lg"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Schließen
                    </button>
                  </div>
                )}
              </div>

              {/* Add Memory Button — hidden on mobile, replaced by FAB */}
              {onCreate && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="hidden sm:flex group items-center justify-center gap-2.5 min-w-[44px] min-h-[44px] px-5 py-3 rounded-2xl font-semibold text-white transition-all duration-300 hover:scale-105 hover:-translate-y-0.5"
                  style={{
                    background: highContrast ? '#000000' : 'linear-gradient(135deg, var(--color-terracotta-500) 0%, var(--color-terracotta-600) 50%, var(--color-rust-600) 100%)',
                    boxShadow: highContrast ? 'none' : 'var(--shadow-glow-terracotta)',
                  }}
                >
                  <Plus className="w-5 h-5 transition-transform duration-300 group-hover:rotate-90" />
                  Neue Erinnerung
                </button>
              )}
            </div>
          </div>

          {/* Mobile tab bar row — full width, below logo row */}
          <div className="flex sm:hidden border-t" style={{ borderColor: 'var(--color-sand-100)' }}>
            {([['feed', <List key="l" className="w-4 h-4" />, 'Feed'], ['map', <Map key="m" className="w-4 h-4" />, 'Karte'], ['timeline', <Clock key="c" className="w-4 h-4" />, 'Chronik']] as [string, React.ReactNode, string][]).map(([id, icon, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as 'feed' | 'map' | 'timeline')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-all relative"
                style={{
                  color: activeTab === id
                    ? (highContrast ? '#000000' : 'var(--color-terracotta-500)')
                    : (highContrast ? '#666666' : 'var(--color-text-muted)'),
                }}
              >
                {icon}
                <span>{label}</span>
                {activeTab === id && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-10 rounded-full"
                    style={{ backgroundColor: highContrast ? '#000000' : 'var(--color-terracotta-500)' }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main
        className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8"
        style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {activeTab === 'feed' ? (<>

        {/* Compact Filter Bar */}
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="flex-1 min-w-[120px] sm:min-w-44 relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: searchQuery ? 'var(--color-terracotta-500)' : 'var(--color-text-muted)' }}
              />
              <input
                type="text"
                placeholder="Suchen…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm font-medium focus:outline-none transition-all"
                style={{
                  backgroundColor: 'white',
                  border: searchQuery ? '1.5px solid var(--color-terracotta-300)' : '1.5px solid var(--color-sand-200)',
                  color: 'var(--color-text-primary)',
                  minHeight: '44px',
                }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-gray-100" style={{ minWidth: '28px', minHeight: '28px' }}>
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                </button>
              )}
            </div>

            {/* Filter button */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowFilterDropdown(v => !v); }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105"
                style={{
                  minHeight: '44px',
                  backgroundColor: showFilterDropdown || (personFilter !== 'Alle' || locationFilter !== 'Alle' || timeFilter !== '7d') ? 'rgba(117,143,90,0.12)' : 'white',
                  border: '1.5px solid var(--color-sand-200)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--color-sage-500)' }} />
                <span className="hidden sm:inline">Filter</span>
                {(personFilter !== 'Alle' || locationFilter !== 'Alle' || timeFilter !== '7d' && timeFilter !== 'all') && (
                  <span
                    className="flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: 'var(--color-terracotta-500)', fontSize: '10px' }}
                  >
                    {[personFilter !== 'Alle', locationFilter !== 'Alle', timeFilter !== '7d' && timeFilter !== 'all'].filter(Boolean).length}
                  </span>
                )}
              </button>

              {/* Filter Dropdown */}
              {showFilterDropdown && (
                <div
                  className="absolute top-full mt-2 right-0 sm:left-0 sm:right-auto z-50 w-[calc(100vw-2rem)] sm:w-72 max-w-[288px] rounded-2xl shadow-2xl p-4 animate-fade-in"
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid var(--color-sand-200)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)',
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* Zeitraum */}
                  <div className="mb-4">
                    <label className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      <Calendar className="w-3 h-3" /> Zeitraum
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {timeOptions.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setTimeFilter(opt.value as TimeFilter)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                          style={{
                            backgroundColor: timeFilter === opt.value ? 'var(--color-terracotta-500)' : 'var(--color-sand-100)',
                            color: timeFilter === opt.value ? 'white' : 'var(--color-text-muted)',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {timeFilter === 'custom' && (
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div>
                          <label className="text-xs text-muted mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Von</label>
                          <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-xl text-xs border focus:outline-none"
                            style={{ borderColor: 'var(--color-sand-200)', color: 'var(--color-text-primary)' }} />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Bis</label>
                          <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-xl text-xs border focus:outline-none"
                            style={{ borderColor: 'var(--color-sand-200)', color: 'var(--color-text-primary)' }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Person */}
                  <div className="mb-4">
                    <label className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      <User className="w-3 h-3" /> Person
                    </label>
                    <div className="relative">
                      <select value={personFilter} onChange={e => setPersonFilter(e.target.value)}
                        className="w-full appearance-none px-3 py-2 rounded-xl text-sm font-medium cursor-pointer focus:outline-none"
                        style={{ backgroundColor: 'var(--color-sand-50)', border: '1.5px solid var(--color-sand-200)', color: 'var(--color-text-primary)' }}>
                        {allPersons.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                    </div>
                  </div>

                  {/* Ort */}
                  <div className="mb-4">
                    <label className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      <MapPin className="w-3 h-3" /> Ort
                    </label>
                    <div className="relative">
                      <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
                        className="w-full appearance-none px-3 py-2 rounded-xl text-sm font-medium cursor-pointer focus:outline-none"
                        style={{ backgroundColor: 'var(--color-sand-50)', border: '1.5px solid var(--color-sand-200)', color: 'var(--color-text-primary)' }}>
                        {allLocations.map(loc => (
                          <option key={loc} value={loc}>{loc === 'Alle' ? 'Alle' : `${getLocationEmoji(loc)} ${loc}`}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--color-sand-200)' }}>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {filteredMemories.length} Erinnerungen
                    </span>
                    <button
                      onClick={() => { setPersonFilter('Alle'); setLocationFilter('Alle'); setTimeFilter('7d'); setSearchQuery(''); setShowFavoritesOnly(false); setShowFilterDropdown(false); }}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all hover:bg-sand-100"
                      style={{ color: 'var(--color-terracotta-500)' }}
                    >
                      Zurücksetzen
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Favorites toggle */}
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105"
              style={{
                minHeight: '44px',
                backgroundColor: showFavoritesOnly ? 'var(--color-amber-100)' : 'white',
                border: showFavoritesOnly ? '1.5px solid var(--color-amber-300)' : '1.5px solid var(--color-sand-200)',
                color: showFavoritesOnly ? 'var(--color-amber-700)' : 'var(--color-text-muted)',
              }}
            >
              <Star className="w-4 h-4" style={{ color: showFavoritesOnly ? 'var(--color-amber-500)' : undefined, fill: showFavoritesOnly ? 'var(--color-amber-500)' : 'none' }} />
              <span className="hidden sm:inline">Favoriten</span>
              {favoritesCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor: showFavoritesOnly ? 'var(--color-amber-200)' : 'var(--color-sand-100)' }}>
                  {favoritesCount}
                </span>
              )}
            </button>

            {/* Active filter chips */}
            {personFilter !== 'Alle' && (
              <span className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: 'rgba(117,143,90,0.12)', color: 'var(--color-sage-700)', border: '1px solid rgba(117,143,90,0.25)' }}>
                👤 {personFilter}
                <button onClick={() => setPersonFilter('Alle')} className="p-1.5 -mr-0.5 rounded-full hover:bg-sage-200 transition-all"><X className="w-3 h-3" /></button>
              </span>
            )}
            {locationFilter !== 'Alle' && (
              <span className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: 'rgba(146,122,94,0.1)', color: 'var(--color-sand-700)', border: '1px solid rgba(146,122,94,0.2)' }}>
                {getLocationEmoji(locationFilter)} {locationFilter}
                <button onClick={() => setLocationFilter('Alle')} className="p-1.5 -mr-0.5 rounded-full hover:bg-sand-200 transition-all"><X className="w-3 h-3" /></button>
              </span>
            )}

            {/* Result count */}
            <span className="text-xs ml-auto" style={{ color: 'var(--color-text-muted)' }}>
              {filteredMemories.length} {filteredMemories.length === 1 ? 'Erinnerung' : 'Erinnerungen'}
            </span>
          </div>

          {/* Speaker filter chips */}
          {availableSpeakers.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {['Alle', ...availableSpeakers].map(speaker => (
                <button
                  key={speaker}
                  onClick={() => setSpeakerFilter(speaker)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200"
                  style={{
                    backgroundColor: speakerFilter === speaker ? 'var(--color-terracotta-500)' : 'white',
                    color: speakerFilter === speaker ? 'white' : 'var(--color-text-muted)',
                    border: speakerFilter === speaker ? 'none' : '1px solid var(--color-sand-200)',
                  }}
                >
                  <AudioLines className="w-3 h-3" />
                  {speaker}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col">

        {/* Aktuelles Section */}
        <div className="mb-12" style={{ order: 2 }}>
          <div className="glass-card overflow-hidden">
              {/* Section Header */}
              <div
                className="px-5 py-4 flex items-center gap-3"
                style={{
                  background: 'linear-gradient(135deg, rgba(232,107,63,0.06) 0%, rgba(251,191,36,0.06) 100%)',
                  borderBottom: '1px solid rgba(255,255,255,0.5)',
                }}
              >
                <div
                  className="p-2 rounded-xl"
                  style={{ backgroundColor: 'rgba(232,107,63,0.1)' }}
                >
                  <MessageCircle className="w-5 h-5" style={{ color: 'var(--color-terracotta-500)' }} />
                </div>
                <div>
                  <h2
                    className="text-lg font-bold"
                    style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
                  >
                    Aktuelles
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {textEntries.length} Nachrichten
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div ref={textScrollRef} className="p-4 space-y-3 max-h-[28rem] overflow-y-auto scrollbar-thin">
                {textEntries.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <div
                      className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: 'var(--color-sand-100)' }}
                    >
                      <MessageCircle className="w-8 h-8" style={{ color: 'var(--color-sand-400)' }} />
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                      Keine Meldungen in diesem Zeitraum
                    </p>
                  </div>
                ) : (
                  textEntries.slice(0, visibleEntries).map((memory, index) => {
                    const authorName = memory.recorded_by || memory.child_name || 'Unbekannt';
                    const authorColor = getMemberColor(authorName);
                    const isEditing = editingId === memory.id;
                    const isDeleteConfirm = deleteConfirmId === memory.id;

                    return (
                      <div
                        key={memory.id}
                        className={`p-4 rounded-2xl transition-all duration-300 hover:bg-white/60 group relative animate-fade-in-up stagger-${Math.min(index + 1, 8)}`}
                        style={{ backgroundColor: 'rgba(255,255,255,0.4)' }}
                      >
                        {/* Header Row */}
                        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                          {editingPersonId === memory.id ? (
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <select
                                value={editPersonValue}
                                onChange={e => setEditPersonValue(e.target.value)}
                                className="text-xs px-2 py-1 rounded-lg border focus:outline-none"
                                style={{ borderColor: 'var(--color-sand-300)', color: 'var(--color-text-primary)', backgroundColor: 'white' }}
                                autoFocus
                                disabled={isSavingPerson}
                              >
                                <option value="">Familie</option>
                                {FAMILY_MEMBERS.map(m => (
                                  <option key={m.name} value={m.name}>{m.name}</option>
                                ))}
                              </select>
                              <button
                                disabled={isSavingPerson}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!onUpdatePerson) return;
                                  setIsSavingPerson(true);
                                  try {
                                    await onUpdatePerson(memory.id, editPersonValue || null);
                                    setEditingPersonId(null);
                                  } finally {
                                    setIsSavingPerson(false);
                                  }
                                }}
                                className="text-xs px-2 py-1 rounded-lg font-bold text-white disabled:opacity-50"
                                style={{ backgroundColor: 'var(--color-sage-500)' }}
                              >{isSavingPerson ? '...' : '✓'}</button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingPersonId(null); }}
                                className="text-xs px-2 py-1 rounded-lg"
                                style={{ backgroundColor: 'var(--color-sand-200)', color: 'var(--color-text-muted)' }}
                              >✕</button>
                            </div>
                          ) : (
                            <span
                              className="px-2.5 py-1 rounded-full text-xs font-bold"
                              style={{
                                backgroundColor: authorName !== 'Unbekannt' ? authorColor.activeBg : 'var(--color-sand-200)',
                                color: authorName !== 'Unbekannt' ? 'white' : 'var(--color-text-muted)',
                                boxShadow: authorName !== 'Unbekannt' ? `0 2px 8px ${authorColor.activeBg}40` : 'none',
                                cursor: onUpdatePerson ? 'pointer' : 'default',
                              }}
                              title={onUpdatePerson ? 'Person ändern' : undefined}
                              onClick={(e) => {
                                if (!onUpdatePerson) return;
                                e.stopPropagation();
                                setEditPersonValue(memory.child_name || '');
                                setEditingPersonId(memory.id);
                              }}
                            >
                              {authorName !== 'Unbekannt' ? authorName : '+ Person'}
                            </span>
                          )}
                          {/* Show people mentioned (excluding author) */}
                          {memory.people && memory.people.length > 0 && (
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{
                                backgroundColor: 'var(--color-sage-100)',
                                color: 'var(--color-sage-600)'
                              }}
                            >
                              mit {memory.people.filter(p => p !== authorName).join(', ') || memory.people[0]}
                            </span>
                          )}
                          {memory.location && (
                            <span
                              className="px-2 py-0.5 rounded-full text-xs flex items-center gap-1"
                              style={{
                                backgroundColor: 'var(--color-sand-200)',
                                color: 'var(--color-text-muted)'
                              }}
                            >
                              <MapPin className="w-3 h-3" />
                              {memory.location}
                            </span>
                          )}
                          {memory.audios.length > 0 && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-terracotta-400)' }}>
                              <AudioLines className="w-3 h-3" />
                              {memory.audios.length > 1 ? `${memory.audios.length} Aufnahmen` : '1 Aufnahme'}
                            </span>
                          )}
                          {editingDateId === memory.id ? (
                            <div className="ml-auto flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <input
                                type="date"
                                value={editDateValue}
                                onChange={e => setEditDateValue(e.target.value)}
                                className="text-xs px-2 py-1 rounded-lg border focus:outline-none"
                                style={{ borderColor: 'var(--color-sand-300)', color: 'var(--color-text-primary)', backgroundColor: 'white' }}
                                autoFocus
                                disabled={isSavingDate}
                              />
                              <button
                                disabled={isSavingDate || !editDateValue}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!onUpdateDate || !editDateValue) return;
                                  setIsSavingDate(true);
                                  try {
                                    await onUpdateDate(memory.id, editDateValue);
                                    const newDate = parseISO(editDateValue);
                                    if (timeFilter !== 'all' && !isWithinInterval(newDate, { start: timeRange.start, end: timeRange.end })) {
                                      setTimeFilter('all');
                                    }
                                    setEditingDateId(null);
                                  } finally {
                                    setIsSavingDate(false);
                                  }
                                }}
                                className="text-xs px-2 py-1 rounded-lg font-bold text-white disabled:opacity-50"
                                style={{ backgroundColor: 'var(--color-sage-500)' }}
                              >
                                {isSavingDate ? '...' : '✓'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingDateId(null); }}
                                className="text-xs px-2 py-1 rounded-lg"
                                style={{ backgroundColor: 'var(--color-sand-200)', color: 'var(--color-text-muted)' }}
                              >✕</button>
                            </div>
                          ) : (
                            <span
                              className="text-xs ml-auto flex items-center gap-1"
                              style={{ color: 'var(--color-text-light)', cursor: onUpdateDate ? 'pointer' : 'default', borderBottom: onUpdateDate ? '1px dashed var(--color-sand-300)' : 'none' }}
                              title={onUpdateDate ? 'Datum bearbeiten' : undefined}
                              onClick={(e) => {
                                if (!onUpdateDate) return;
                                e.stopPropagation();
                                setEditDateValue(memory.source_date);
                                setEditingDateId(memory.id);
                              }}
                            >
                              <Calendar className="w-3 h-3" />
                              {format(parseISO(memory.source_date), 'd. MMM yyyy', { locale: de })}
                            </span>
                          )}

                          {/* Favorite Button */}
                          {onToggleFavorite && !isEditing && !isDeleteConfirm && (
                            <button
                              onClick={() => onToggleFavorite(memory.id)}
                              className="favorite-btn min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-all hover:bg-amber-50"
                              title={memory.is_favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
                            >
                              <Star
                                className={`w-4 h-4 transition-all ${memory.is_favorite ? 'star-filled' : ''}`}
                                style={{
                                  color: memory.is_favorite ? 'var(--color-amber-400)' : 'var(--color-text-light)',
                                  fill: memory.is_favorite ? 'var(--color-amber-400)' : 'none',
                                }}
                              />
                            </button>
                          )}

                          {/* Action Buttons */}
                          {(onUpdate || onDelete) && !isEditing && !isDeleteConfirm && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              {onUpdate && (
                                <button
                                  onClick={() => handleStartEdit(memory)}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-all hover:bg-white/80 hover:scale-110"
                                  title="Bearbeiten"
                                >
                                  <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                                </button>
                              )}
                              {onDelete && (
                                <button
                                  onClick={() => setDeleteConfirmId(memory.id)}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-all hover:bg-red-50 hover:scale-110"
                                  title="Löschen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" style={{ color: '#dc2626' }} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Normal View */}
                        {!isEditing && !isDeleteConfirm && (
                          <>
                            {memory.cleaned_summary && (
                              <p
                                className="text-sm leading-relaxed cursor-pointer hover:bg-white/40 rounded-xl p-2 -m-2 transition-all duration-200"
                                style={{ color: 'var(--color-text-secondary)' }}
                                onClick={onUpdate ? () => handleStartEdit(memory) : undefined}
                              >
                                {searchQuery ? highlightText(memory.cleaned_summary, searchQuery) : memory.cleaned_summary}
                              </p>
                            )}
                            {/* Audio Players */}
                            {memory.audios.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {memory.audios.map(audio => (
                                  <AudioPlayer
                                    key={audio.id}
                                    id={audio.id}
                                    url={audio.url}
                                    voiceSpeaker={audio.voice_speaker}
                                    onDelete={onDeleteAudio ? (audioId) => onDeleteAudio(memory.id, audioId) : undefined}
                                    onUpdateSpeaker={onUpdateAudioSpeaker ? (audioId, speaker) => onUpdateAudioSpeaker(memory.id, audioId, speaker) : undefined}
                                  />
                                ))}
                              </div>
                            )}
                          </>
                        )}

                        {/* Edit Mode */}
                        {isEditing && (
                          <div className="animate-fade-in">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="w-full p-3 rounded-xl text-sm leading-relaxed resize-none border-2 focus:outline-none transition-all duration-200"
                              style={{
                                backgroundColor: 'white',
                                borderColor: 'var(--color-terracotta-300)',
                                color: 'var(--color-text-secondary)',
                                boxShadow: '0 0 0 4px rgba(232,107,63,0.08)',
                              }}
                              rows={3}
                              autoFocus
                              disabled={isSaving}
                            />
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={handleSaveEdit}
                                disabled={isSaving || editText.trim() === ''}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 hover:scale-105"
                                style={{ backgroundColor: 'var(--color-sage-500)', boxShadow: '0 4px 12px rgba(117,143,90,0.25)' }}
                              >
                                <Check className="w-3.5 h-3.5" />
                                {isSaving ? '...' : 'Speichern'}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={isSaving}
                                className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all hover:bg-white/80"
                                style={{
                                  backgroundColor: 'white',
                                  color: 'var(--color-text-muted)',
                                }}
                              >
                                Abbrechen
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Delete Confirmation */}
                        {isDeleteConfirm && (
                          <div className="py-2 animate-fade-in">
                            <p className="text-sm mb-3 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                              Wirklich löschen?
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleDeleteConfirm(memory.id)}
                                disabled={isDeleting}
                                className="px-3.5 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 hover:scale-105"
                                style={{ backgroundColor: '#dc2626', boxShadow: '0 4px 12px rgba(220,38,38,0.25)' }}
                              >
                                {isDeleting ? 'Löschen...' : 'Ja, löschen'}
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                disabled={isDeleting}
                                className="px-3.5 py-2 rounded-xl text-xs font-medium transition-all hover:bg-white/80"
                                style={{
                                  backgroundColor: 'white',
                                  color: 'var(--color-text-muted)',
                                }}
                              >
                                Abbrechen
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {visibleEntries < textEntries.length && <div ref={textSentinelRef} />}
              </div>
            </div>
        </div>

        {/* Bilder Section */}
        <section className="animate-fade-in mb-12" style={{ animationDelay: '0.2s', order: 1 }}>
          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div
                className="p-3 rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(117,143,90,0.12) 0%, rgba(148,171,120,0.12) 100%)',
                }}
              >
                <ImageIcon className="w-6 h-6" style={{ color: 'var(--color-sage-500)' }} />
              </div>
              <div>
                <h2
                  className="text-2xl font-bold"
                  style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
                >
                  Fotogalerie
                </h2>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {memoryPhotoGroups.length} Erinnerungen mit Fotos
                </p>
              </div>
            </div>

            {/* Decorative sparkles */}
            <Sparkles
              className="w-5 h-5 animate-float hidden sm:block"
              style={{ color: 'var(--color-amber-400)' }}
            />
          </div>

          {memoryPhotoGroups.length === 0 ? (
            <div className="glass-card p-16 text-center animate-fade-in">
              <div className="empty-illustration mx-auto mb-6">
                <Camera className="w-14 h-14" style={{ color: 'var(--color-sand-400)' }} />
              </div>
              <h3
                className="text-xl font-bold mb-2"
                style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
              >
                Noch keine Fotos
              </h3>
              <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--color-text-muted)' }}>
                In diesem Zeitraum gibt es keine Bilder mit den gewählten Filtern.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-2.5">
                {memoryPhotoGroups.slice(0, visibleImages).map((memory, index) => {
                  const firstPhoto = memory.photos[0];
                  const photoCount = memory.photos.length;
                  return (
                    <div
                      key={memory.id}
                      className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer group animate-fade-in-up stagger-${(index % 10) + 1}`}
                      style={{ boxShadow: 'var(--shadow-sm)' }}
                      onClick={() => setLightboxImage({ memory, photoIndex: 0 })}
                    >
                      {/* Image with zoom on hover */}
                      <img
                        src={firstPhoto.url}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                      />

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-all duration-300" />

                      {/* Photo count badge */}
                      {photoCount > 1 && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '4px',
                            right: '4px',
                            background: 'rgba(0,0,0,0.6)',
                            color: 'white',
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 5px',
                            borderRadius: '6px',
                            lineHeight: 1.4,
                          }}
                        >
                          1/{photoCount} 📷
                        </div>
                      )}

                      {/* Favorite indicator */}
                      {memory.is_favorite && (
                        <div className="absolute top-1 right-1">
                          <Star
                            className="w-3 h-3"
                            style={{ color: 'var(--color-amber-400)', fill: 'var(--color-amber-400)' }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Infinite scroll sentinel — always rendered so the observer always has a target */}
              <div ref={photoSentinelRef} className="mt-6 h-8 flex items-center justify-center">
                {visibleImages < memoryPhotoGroups.length && (
                  <div
                    className="w-5 h-5 rounded-full border-2 animate-spin"
                    style={{ borderColor: 'var(--color-sand-200)', borderTopColor: 'var(--color-terracotta-400)' }}
                  />
                )}
              </div>
            </>
          )}
        </section>
        </div>{/* end flex-col sections wrapper */}
        </>) : activeTab === 'map' ? (
          <div className="w-full" style={{ minHeight: 'calc(100vh - 200px)' }}>
            <MapView memories={filteredMemories} />
          </div>
        ) : (
          <div style={{ width: '100%', height: 'calc(100vh - 200px)', minHeight: '300px' }}>
            <HorizontalTimeline
              memories={memories}
              onOpenMemory={(memory, photoIndex) => {
                if (memory.photos && memory.photos.length > 0) {
                  setLightboxImage({ memory, photoIndex: photoIndex ?? 0 });
                }
              }}
            />
          </div>
        )}
      </main>

      {/* Lightbox – via Portal to avoid stacking context clipping */}
      {lightboxImage && createPortal(
        (() => {
          const currentPhoto = lightboxImage.memory.photos[lightboxImage.photoIndex];
          const totalPhotos = lightboxImage.memory.photos.length;
          return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(42, 33, 24, 0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
          onClick={() => { setLightboxImage(null); setPhotoDeleteConfirm(false); }}
        >
          {/* Scrollable content — image + info panel sit above Safari toolbar */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: 'max(4.5rem, calc(3.5rem + env(safe-area-inset-top)))',
              paddingLeft: '1rem',
              paddingRight: '1rem',
              paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
              gap: '1rem',
            }}
            onTouchStart={(e) => setLightboxTouchStartX(e.touches[0].clientX)}
            onTouchEnd={(e) => {
              const delta = lightboxTouchStartX - e.changedTouches[0].clientX;
              if (delta > 50) lightboxGoNext();
              else if (delta < -50) lightboxGoPrev();
            }}
          >
          {/* Image – max 60% of screen height so text is always visible below */}
          <img
            src={currentPhoto.url}
            alt=""
            style={{
              maxWidth: 'calc(100vw - 2rem)',
              maxHeight: '60dvh',
              width: 'auto',
              height: 'auto',
              borderRadius: '1.5rem',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              display: 'block',
              flexShrink: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          />

          {/* Info panel */}
          <div
            style={{
              width: 'min(100%, 600px)',
              background: 'rgba(255,255,255,0.12)',
              borderRadius: '1rem',
              padding: '1rem 1.25rem',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.2)',
              flexShrink: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {lightboxImage.memory.recorded_by && (
                  <span
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '999px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      backgroundColor: getMemberColor(lightboxImage.memory.recorded_by).activeBg,
                      color: 'white',
                    }}
                  >
                    {lightboxImage.memory.recorded_by}
                  </span>
                )}
                {lightboxImage.memory.child_name && lightboxImage.memory.child_name !== 'null' && (
                  <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>
                    über <strong style={{ color: 'white' }}>{lightboxImage.memory.child_name}</strong>
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
                <Calendar className="w-3.5 h-3.5" />
                {editingDateId === lightboxImage.memory.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
                    <input
                      type="date"
                      value={editDateValue}
                      onChange={e => setEditDateValue(e.target.value)}
                      style={{
                        padding: '0.2rem 0.4rem',
                        borderRadius: '0.4rem',
                        border: '1px solid rgba(255,255,255,0.4)',
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        color: 'white',
                        fontSize: '0.8rem',
                      }}
                      autoFocus
                      disabled={isSavingDate}
                    />
                    <button
                      disabled={isSavingDate || !editDateValue}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!onUpdateDate || !editDateValue) return;
                        setIsSavingDate(true);
                        try {
                          await onUpdateDate(lightboxImage.memory.id, editDateValue);
                          const newDate = parseISO(editDateValue);
                          if (timeFilter !== 'all' && !isWithinInterval(newDate, { start: timeRange.start, end: timeRange.end })) {
                            setTimeFilter('all');
                          }
                          setEditingDateId(null);
                        } finally {
                          setIsSavingDate(false);
                        }
                      }}
                      style={{ padding: '0.2rem 0.5rem', borderRadius: '0.4rem', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, backgroundColor: 'rgba(255,255,255,0.9)', color: '#1a1a1a', opacity: isSavingDate ? 0.6 : 1 }}
                    >
                      {isSavingDate ? '...' : '✓'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingDateId(null); }}
                      style={{ padding: '0.2rem 0.4rem', borderRadius: '0.4rem', border: 'none', cursor: 'pointer', fontSize: '0.75rem', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span
                    style={{ cursor: onUpdateDate ? 'pointer' : 'default', borderBottom: onUpdateDate ? '1px dashed rgba(255,255,255,0.4)' : 'none' }}
                    title={onUpdateDate ? 'Datum bearbeiten' : undefined}
                    onClick={(e) => {
                      if (!onUpdateDate) return;
                      e.stopPropagation();
                      setEditDateValue(lightboxImage.memory.source_date);
                      setEditingDateId(lightboxImage.memory.id);
                    }}
                  >
                    {format(parseISO(lightboxImage.memory.source_date), 'd. MMMM yyyy', { locale: de })}
                  </span>
                )}
              </div>
            </div>
            {/* Text display / edit */}
            <div style={{ marginTop: '0.75rem' }} onClick={e => e.stopPropagation()}>
              {lightboxEditMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <textarea
                    value={lightboxEditText}
                    onChange={e => setLightboxEditText(e.target.value)}
                    autoFocus
                    disabled={lightboxIsSaving}
                    rows={4}
                    placeholder="Text eingeben..."
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '0.6rem',
                      border: '1px solid rgba(255,255,255,0.3)',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setLightboxEditMode(false); setLightboxEditText(''); }}
                      disabled={lightboxIsSaving}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '0.5rem',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        color: 'white',
                      }}
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={handleLightboxSave}
                      disabled={lightboxIsSaving || lightboxEditText.trim() === ''}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '0.5rem',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        color: '#1a1a1a',
                        opacity: (lightboxIsSaving || lightboxEditText.trim() === '') ? 0.5 : 1,
                      }}
                    >
                      {lightboxIsSaving ? 'Speichern...' : 'Speichern'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  {lightboxImage.memory.cleaned_summary ? (
                    <p style={{ flex: 1, margin: 0, fontSize: '0.8rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.75)' }}>
                      {lightboxImage.memory.cleaned_summary}
                    </p>
                  ) : (
                    <p style={{ flex: 1, margin: 0, fontSize: '0.8rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
                      Kein Text vorhanden
                    </p>
                  )}
                  {onUpdate && (
                    <button
                      onClick={() => {
                        setLightboxEditText(lightboxImage.memory.cleaned_summary || '');
                        setLightboxEditMode(true);
                      }}
                      title="Text bearbeiten"
                      aria-label="Text bearbeiten"
                      style={{
                        flexShrink: 0,
                        padding: '0.25rem',
                        borderRadius: '0.4rem',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: 'rgba(255,255,255,0.12)',
                        color: 'rgba(255,255,255,0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Pencil style={{ width: '0.9rem', height: '0.9rem' }} />
                    </button>
                  )}
                </div>
              )}
            </div>
            {photoDeleteConfirm && onDeletePhoto && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
                  Foto wirklich löschen?
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    disabled={deletingPhoto}
                    style={{ padding: '0.4rem 0.9rem', borderRadius: '0.6rem', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }}
                    onClick={(e) => { e.stopPropagation(); setPhotoDeleteConfirm(false); }}
                  >
                    Abbrechen
                  </button>
                  <button
                    disabled={deletingPhoto}
                    style={{ padding: '0.4rem 0.9rem', borderRadius: '0.6rem', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, backgroundColor: '#dc2626', color: 'white', opacity: deletingPhoto ? 0.6 : 1 }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setDeletingPhoto(true);
                      try {
                        await onDeletePhoto(lightboxImage.memory.id, currentPhoto.id);
                        setLightboxImage(null);
                        setPhotoDeleteConfirm(false);
                      } finally {
                        setDeletingPhoto(false);
                      }
                    }}
                  >
                    {deletingPhoto ? 'Löschen...' : 'Löschen'}
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>

        {/* Close button */}
        <button
          style={{
            position: 'absolute',
            top: 'max(1rem, env(safe-area-inset-top, 1rem))',
            right: '1rem',
            zIndex: 1,
            padding: '0.75rem',
            minWidth: '48px',
            minHeight: '48px',
            borderRadius: '1rem',
            backgroundColor: 'rgba(255,255,255,0.95)',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => { setLightboxImage(null); setPhotoDeleteConfirm(false); }}
        >
          <X className="w-6 h-6" style={{ color: '#1a1a1a' }} />
        </button>

        {/* Delete button */}
        {onDeletePhoto && (
          <button
            style={{
              position: 'absolute',
              top: 'max(1rem, env(safe-area-inset-top, 1rem))',
              left: '1rem',
              zIndex: 1,
              padding: '0.75rem',
              minWidth: '48px',
              minHeight: '48px',
              borderRadius: '1rem',
              backgroundColor: photoDeleteConfirm ? 'rgba(220,38,38,0.9)' : 'rgba(255,255,255,0.95)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s',
            }}
            onClick={(e) => { e.stopPropagation(); setPhotoDeleteConfirm(v => !v); }}
          >
            <Trash2 className="w-6 h-6" style={{ color: photoDeleteConfirm ? 'white' : '#dc2626' }} />
          </button>
        )}

        {/* Photo counter */}
        {totalPhotos > 1 && (
          <div
            style={{
              position: 'absolute',
              top: 'max(1rem, env(safe-area-inset-top, 1rem))',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1,
              background: 'rgba(0,0,0,0.5)',
              color: 'white',
              fontSize: '0.8rem',
              fontWeight: 600,
              padding: '0.35rem 0.75rem',
              borderRadius: '999px',
              pointerEvents: 'none',
            }}
          >
            {lightboxImage.photoIndex + 1} / {totalPhotos}
          </div>
        )}

        {/* Prev button */}
        {totalPhotos > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); lightboxGoPrev(); }}
            style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 1,
              background: 'rgba(255,255,255,0.9)',
              border: 'none',
              borderRadius: '50%',
              width: '48px',
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <ChevronLeft className="w-6 h-6" style={{ color: '#1a1a1a' }} />
          </button>
        )}

        {/* Next button */}
        {totalPhotos > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); lightboxGoNext(); }}
            style={{
              position: 'absolute',
              right: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 1,
              background: 'rgba(255,255,255,0.9)',
              border: 'none',
              borderRadius: '50%',
              width: '48px',
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <ChevronRight className="w-6 h-6" style={{ color: '#1a1a1a' }} />
          </button>
        )}

        </div>
          );
        })(),
        document.body
      )}

      {/* FAB — mobile only (hidden on sm+) */}
      {onCreate && (
        <button
          onClick={() => setShowCreateModal(true)}
          className="sm:hidden"
          style={{
            position: 'fixed',
            bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))',
            right: '1.25rem',
            zIndex: 50,
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: highContrast
              ? '#000000'
              : 'linear-gradient(135deg, var(--color-terracotta-500) 0%, var(--color-terracotta-600) 50%, var(--color-rust-600) 100%)',
            boxShadow: highContrast
              ? '0 4px 16px rgba(0,0,0,0.5)'
              : '0 4px 20px rgba(192,90,61,0.5), 0 2px 8px rgba(0,0,0,0.15)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onTouchStart={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.93)';
          }}
          onTouchEnd={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
          aria-label="Neue Erinnerung"
        >
          <Plus className="w-7 h-7" style={{ color: 'white' }} />
        </button>
      )}

      {/* Create Memory Modal */}
      {showCreateModal && onCreate && (
        <CreateMemoryModal
          onClose={() => setShowCreateModal(false)}
          onCreate={onCreate}
        />
      )}

      {/* Help Modal */}
      {showHelp && (
        <div
          className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl overflow-hidden animate-fade-in-scale"
            style={{
              backgroundColor: highContrast ? '#ffffff' : 'var(--color-bg-primary)',
              boxShadow: 'var(--shadow-2xl)',
              border: highContrast ? '3px solid #000000' : 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="px-6 py-5 flex items-center justify-between"
              style={{
                background: highContrast ? '#000000' : 'linear-gradient(135deg, var(--color-sage-500) 0%, var(--color-sage-600) 100%)',
              }}
            >
              <div className="flex items-center gap-3">
                <HelpCircle className="w-6 h-6 text-white" />
                <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
                  Hilfe
                </h2>
              </div>
              <button
                onClick={() => setShowHelp(false)}
                className="p-2 rounded-xl hover:bg-white/20 transition-all"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5" style={{ color: highContrast ? '#000000' : 'var(--color-text-primary)' }}>
              <div className="space-y-4">
                <div className="flex gap-4 items-start">
                  <div className="p-2.5 rounded-xl flex-shrink-0" style={{ backgroundColor: highContrast ? '#f0f0f0' : 'var(--color-terracotta-100)' }}>
                    <Mic className="w-5 h-5" style={{ color: highContrast ? '#000000' : 'var(--color-terracotta-600)' }} />
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">Sprachnotiz senden</h3>
                    <p className="text-sm" style={{ color: highContrast ? '#333333' : 'var(--color-text-muted)' }}>
                      Öffne Telegram und sende eine Sprachnotiz an den Famories-Bot. Die Nachricht wird automatisch gespeichert.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="p-2.5 rounded-xl flex-shrink-0" style={{ backgroundColor: highContrast ? '#f0f0f0' : 'var(--color-sage-100)' }}>
                    <Camera className="w-5 h-5" style={{ color: highContrast ? '#000000' : 'var(--color-sage-600)' }} />
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">Fotos teilen</h3>
                    <p className="text-sm" style={{ color: highContrast ? '#333333' : 'var(--color-text-muted)' }}>
                      Sende Fotos an den Bot in Telegram. Du kannst auch eine Beschreibung dazu schreiben.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="p-2.5 rounded-xl flex-shrink-0" style={{ backgroundColor: highContrast ? '#f0f0f0' : 'var(--color-amber-100)' }}>
                    <Search className="w-5 h-5" style={{ color: highContrast ? '#000000' : 'var(--color-amber-600)' }} />
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">Suchen & Filtern</h3>
                    <p className="text-sm" style={{ color: highContrast ? '#333333' : 'var(--color-text-muted)' }}>
                      Nutze die Suchleiste um Erinnerungen zu finden. Du kannst nach Personen, Orten oder Stichworten suchen.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="p-2.5 rounded-xl flex-shrink-0" style={{ backgroundColor: highContrast ? '#f0f0f0' : 'var(--color-sand-200)' }}>
                    <Star className="w-5 h-5" style={{ color: highContrast ? '#000000' : 'var(--color-amber-500)' }} />
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">Favoriten</h3>
                    <p className="text-sm" style={{ color: highContrast ? '#333333' : 'var(--color-text-muted)' }}>
                      Klicke auf den Stern bei einer Erinnerung um sie als Favorit zu markieren.
                    </p>
                  </div>
                </div>
              </div>

              <div
                className="p-4 rounded-xl text-center"
                style={{
                  backgroundColor: highContrast ? '#f0f0f0' : 'var(--color-sand-100)',
                  border: highContrast ? '1px solid #000000' : 'none',
                }}
              >
                <p className="text-sm font-medium" style={{ color: highContrast ? '#000000' : 'var(--color-text-muted)' }}>
                  Bei Fragen wende dich an die Familie!
                </p>
                <p className="text-2xl mt-2">👨‍👩‍👧‍👦 ❤️</p>
              </div>

              <button
                onClick={() => setShowHelp(false)}
                className="w-full py-3.5 rounded-xl font-bold text-white transition-all hover:scale-[1.02]"
                style={{
                  background: highContrast ? '#000000' : 'linear-gradient(135deg, var(--color-sage-500) 0%, var(--color-sage-600) 100%)',
                }}
              >
                Verstanden!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close settings */}
      {showSettings && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
