import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { format, parseISO, subDays, subHours, startOfYear, isWithinInterval } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  ChevronDown, X, Calendar, User, MessageCircle, Image as ImageIcon,
  Pencil, Check, Trash2, Search, MapPin, Star, Plus, Mic, Heart,
  Sparkles, SlidersHorizontal, Clock, Camera, Settings, HelpCircle,
  Type, Contrast, Link2, Map, List
} from 'lucide-react';
import type { Memory } from '../types';
import { FAMILY_MEMBERS, LOCATIONS } from '../types';
import { CreateMemoryModal } from './CreateMemoryModal';
import { MapView } from './MapView';

interface HomeScreenProps {
  memories: Memory[];
  onUpdate?: (id: number, text: string) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  onToggleFavorite?: (id: number) => Promise<void>;
  onCreate?: (data: { text: string; child_name?: string; location?: string; source_date?: string; people?: string[]; photos?: File[] }) => Promise<void>;
  onDeletePhoto?: (memoryId: number, photoId: number) => Promise<void>;
}

type TimeFilter = '24h' | '7d' | '30d' | 'year' | 'custom';

function getTimeFilterRange(filter: TimeFilter, customStart?: string, customEnd?: string) {
  const now = new Date();
  switch (filter) {
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

function formatRelativeTime(dateStr: string): string {
  const date = parseISO(dateStr);
  const now = new Date();
  const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

  if (diffHours < 1) return 'Gerade eben';
  if (diffHours < 24) return `vor ${diffHours} Std.`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `vor ${diffDays} Tagen`;

  return format(date, 'd. MMM', { locale: de });
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

export function HomeScreen({ memories, onUpdate, onDelete, onToggleFavorite, onCreate, onDeletePhoto }: HomeScreenProps) {
  const [personFilter, setPersonFilter] = useState<string>('Alle');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('7d');
  const [locationFilter, setLocationFilter] = useState<string>('Alle');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [lightboxImage, setLightboxImage] = useState<{ url: string; memory: Memory; photoId: number } | null>(null);
  const [photoDeleteConfirm, setPhotoDeleteConfirm] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [visibleImages, setVisibleImages] = useState(9);

  // Accessibility settings
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    return (localStorage.getItem('famories_font_size') as FontSize) || 'normal';
  });
  const [highContrast, setHighContrast] = useState(() => {
    return localStorage.getItem('famories_high_contrast') === 'true';
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'feed' | 'map'>('feed');

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
    return memories.filter(memory => {
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
  }, [memories, personFilter, locationFilter, showFavoritesOnly, searchQuery, timeRange]);

  // Separate text entries (messages) from photo entries
  const textEntries = useMemo(() => {
    return filteredMemories
      .filter(m => m.cleaned_summary && m.cleaned_summary.length > 0)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [filteredMemories]);

  // Get all photos from filtered memories
  const photoEntries = useMemo(() => {
    const photos: { url: string; memory: Memory; date: string; photoId: number }[] = [];
    filteredMemories.forEach(memory => {
      if (memory.photos && memory.photos.length > 0) {
        memory.photos.forEach(photo => {
          photos.push({
            url: photo.url,
            memory,
            date: memory.source_date,
            photoId: photo.id,
          });
        });
      }
    });
    return photos.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredMemories]);

  const allPersons = ['Alle', ...FAMILY_MEMBERS.map(m => m.name)];
  const allLocations = ['Alle', ...LOCATIONS.map(l => `${l.emoji} ${l.name}`)];

  const timeOptions = [
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
          background: highContrast ? '#ffffff' : 'rgba(253, 250, 246, 0.85)',
          borderColor: highContrast ? '#000000' : 'rgba(255, 255, 255, 0.8)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo & Title */}
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: highContrast ? '#000000' : 'linear-gradient(135deg, rgba(232,107,63,0.12) 0%, rgba(251,191,36,0.12) 100%)',
                }}
              >
                <Heart className="w-5 h-5" style={{ color: highContrast ? '#ffffff' : 'var(--color-terracotta-500)', fill: highContrast ? '#ffffff' : 'var(--color-terracotta-500)' }} />
              </div>
              <h1
                className="text-2xl sm:text-3xl font-bold gradient-text"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Famories
              </h1>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('feed')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                  activeTab === 'feed'
                    ? 'bg-gradient-to-r from-terracotta-500 to-terracotta-600 text-white'
                    : 'bg-white/50 hover:bg-white/80'
                }`}
                style={activeTab === 'feed' ? { boxShadow: 'var(--shadow-glow-terracotta)' } : {}}
              >
                <List className="w-4 h-4" />
                Feed
              </button>
              <button
                onClick={() => setActiveTab('map')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                  activeTab === 'map'
                    ? 'bg-gradient-to-r from-terracotta-500 to-terracotta-600 text-white'
                    : 'bg-white/50 hover:bg-white/80'
                }`}
                style={activeTab === 'map' ? { boxShadow: 'var(--shadow-glow-terracotta)' } : {}}
              >
                <Map className="w-4 h-4" />
                Karte
              </button>
            </div>

            {/* Right side buttons */}
            <div className="flex items-center gap-2">
              {/* Help Button */}
              <button
                onClick={() => setShowHelp(true)}
                className="p-2.5 rounded-xl transition-all duration-200 hover:scale-105"
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
                  className="p-2.5 rounded-xl transition-all duration-200 hover:scale-105"
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
                    className="absolute right-0 top-full mt-2 w-64 rounded-2xl p-4 shadow-xl z-50 animate-fade-in"
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

              {/* Add Memory Button */}
              {onCreate && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="group flex items-center gap-2.5 px-5 py-3 rounded-2xl font-semibold text-white transition-all duration-300 hover:scale-105 hover:-translate-y-0.5"
                  style={{
                    background: highContrast ? '#000000' : 'linear-gradient(135deg, var(--color-terracotta-500) 0%, var(--color-terracotta-600) 50%, var(--color-rust-600) 100%)',
                    boxShadow: highContrast ? 'none' : 'var(--shadow-glow-terracotta)',
                  }}
                >
                  <Plus className="w-5 h-5 transition-transform duration-300 group-hover:rotate-90" />
                  <span className="hidden sm:inline">Neue Erinnerung</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'feed' ? (<>
        {/* Filter & Aktuelles Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">

          {/* Aktuelles - Links */}
          <div className="lg:col-span-1 order-2 lg:order-1">
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
              <div className="p-4 space-y-3 max-h-[28rem] overflow-y-auto scrollbar-thin">
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
                  textEntries.slice(0, 10).map((memory, index) => {
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
                          {authorName !== 'Unbekannt' && (
                            <span
                              className="px-2.5 py-1 rounded-full text-xs font-bold"
                              style={{
                                backgroundColor: authorColor.activeBg,
                                color: 'white',
                                boxShadow: `0 2px 8px ${authorColor.activeBg}40`,
                              }}
                            >
                              {authorName}
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
                          <span className="text-xs ml-auto flex items-center gap-1" style={{ color: 'var(--color-text-light)' }}>
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(memory.created_at)}
                          </span>

                          {/* Favorite Button */}
                          {onToggleFavorite && !isEditing && !isDeleteConfirm && (
                            <button
                              onClick={() => onToggleFavorite(memory.id)}
                              className="favorite-btn p-1.5 rounded-lg transition-all hover:bg-amber-50"
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
                                  className="p-1.5 rounded-lg transition-all hover:bg-white/80 hover:scale-110"
                                  title="Bearbeiten"
                                >
                                  <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                                </button>
                              )}
                              {onDelete && (
                                <button
                                  onClick={() => setDeleteConfirmId(memory.id)}
                                  className="p-1.5 rounded-lg transition-all hover:bg-red-50 hover:scale-110"
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
                            {/* Audio Player */}
                            {memory.audios && memory.audios.length > 0 && (
                              <div className="mt-3 flex items-center gap-2 p-2 rounded-xl" style={{ backgroundColor: 'rgba(232,107,63,0.05)' }}>
                                <Mic className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-terracotta-500)' }} />
                                <audio
                                  controls
                                  className="h-8 flex-1"
                                  style={{ maxWidth: '100%' }}
                                >
                                  <source src={memory.audios[0].url} type="audio/ogg" />
                                  Dein Browser unterstützt keine Audio-Wiedergabe.
                                </audio>
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
              </div>
            </div>
          </div>

          {/* Filter - Mitte & Rechts */}
          <div className="lg:col-span-2 order-1 lg:order-2">
            <div className="glass-card overflow-hidden">
              {/* Filter Header */}
              <div
                className="px-5 py-4 flex items-center justify-between"
                style={{
                  background: 'linear-gradient(135deg, rgba(117,143,90,0.06) 0%, rgba(148,171,120,0.06) 100%)',
                  borderBottom: '1px solid rgba(255,255,255,0.5)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 rounded-xl"
                    style={{ backgroundColor: 'rgba(117,143,90,0.1)' }}
                  >
                    <SlidersHorizontal className="w-5 h-5" style={{ color: 'var(--color-sage-500)' }} />
                  </div>
                  <h2
                    className="text-lg font-bold"
                    style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
                  >
                    Filter
                  </h2>
                </div>

                {/* Favorites Toggle */}
                <button
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 hover:scale-105 ${
                    showFavoritesOnly ? 'ring-2 ring-offset-2' : ''
                  }`}
                  style={{
                    backgroundColor: showFavoritesOnly ? 'var(--color-amber-100)' : 'white',
                    color: showFavoritesOnly ? 'var(--color-amber-700)' : 'var(--color-text-muted)',
                    boxShadow: showFavoritesOnly ? 'var(--shadow-glow-amber), 0 0 0 2px var(--color-amber-400), 0 0 0 4px white' : 'var(--shadow-sm)',
                  }}
                >
                  <Star
                    className={`w-4 h-4 transition-all ${showFavoritesOnly ? 'star-filled' : ''}`}
                    style={{
                      color: showFavoritesOnly ? 'var(--color-amber-500)' : undefined,
                      fill: showFavoritesOnly ? 'var(--color-amber-500)' : 'none',
                    }}
                  />
                  <span>Favoriten</span>
                  {favoritesCount > 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: showFavoritesOnly ? 'var(--color-amber-200)' : 'var(--color-sand-200)',
                      }}
                    >
                      {favoritesCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="p-5 space-y-5">
                {/* Search Bar */}
                <div className="relative">
                  <div
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg"
                    style={{ backgroundColor: searchQuery ? 'rgba(232,107,63,0.1)' : 'transparent' }}
                  >
                    <Search
                      className="w-4 h-4 transition-colors"
                      style={{ color: searchQuery ? 'var(--color-terracotta-500)' : 'var(--color-text-muted)' }}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="In Erinnerungen suchen..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-14 pr-12 py-4 rounded-2xl text-sm font-medium transition-all duration-200 focus:outline-none"
                    style={{
                      backgroundColor: 'white',
                      border: searchQuery ? '2px solid var(--color-terracotta-300)' : '2px solid var(--color-sand-200)',
                      color: 'var(--color-text-primary)',
                      boxShadow: searchQuery ? '0 0 0 4px rgba(232,107,63,0.08)' : 'none',
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-gray-100 transition-all hover:scale-110"
                    >
                      <X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Personen Filter */}
                  <div>
                    <label
                      className="text-xs font-bold uppercase tracking-widest mb-2.5 flex items-center gap-2"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <User className="w-3.5 h-3.5" />
                      Person
                    </label>
                    <div className="relative">
                      <select
                        value={personFilter}
                        onChange={(e) => setPersonFilter(e.target.value)}
                        className="w-full appearance-none px-4 py-3.5 rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-terracotta-300"
                        style={{
                          backgroundColor: 'white',
                          border: '2px solid var(--color-sand-200)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {allPersons.map(person => (
                          <option key={person} value={person}>{person}</option>
                        ))}
                      </select>
                      <ChevronDown
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none transition-transform"
                        style={{ color: 'var(--color-text-muted)' }}
                      />
                    </div>
                  </div>

                  {/* Location Filter */}
                  <div>
                    <label
                      className="text-xs font-bold uppercase tracking-widest mb-2.5 flex items-center gap-2"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Ort
                    </label>
                    <div className="relative">
                      <select
                        value={locationFilter}
                        onChange={(e) => setLocationFilter(e.target.value)}
                        className="w-full appearance-none px-4 py-3.5 rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-terracotta-300"
                        style={{
                          backgroundColor: 'white',
                          border: '2px solid var(--color-sand-200)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {allLocations.map(loc => (
                          <option key={loc} value={loc === 'Alle' ? 'Alle' : loc.split(' ').slice(1).join(' ')}>{loc}</option>
                        ))}
                      </select>
                      <ChevronDown
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
                        style={{ color: 'var(--color-text-muted)' }}
                      />
                    </div>
                  </div>

                  {/* Zeitraum Filter */}
                  <div>
                    <label
                      className="text-xs font-bold uppercase tracking-widest mb-2.5 flex items-center gap-2"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Zeitraum
                    </label>
                    <div className="relative">
                      <select
                        value={timeFilter}
                        onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
                        className="w-full appearance-none px-4 py-3.5 rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-terracotta-300"
                        style={{
                          backgroundColor: 'white',
                          border: '2px solid var(--color-sand-200)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {timeOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                        ))}
                      </select>
                      <ChevronDown
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
                        style={{ color: 'var(--color-text-muted)' }}
                      />
                    </div>
                  </div>

                  {/* Custom Date Range */}
                  {timeFilter === 'custom' && (
                    <div className="sm:col-span-3 grid grid-cols-2 gap-4 animate-slide-in-down">
                      <div>
                        <label
                          className="text-xs font-medium mb-1.5 block"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          Von
                        </label>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-terracotta-300"
                          style={{
                            backgroundColor: 'white',
                            border: '2px solid var(--color-sand-200)',
                            color: 'var(--color-text-primary)',
                          }}
                        />
                      </div>
                      <div>
                        <label
                          className="text-xs font-medium mb-1.5 block"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          Bis
                        </label>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-terracotta-300"
                          style={{
                            backgroundColor: 'white',
                            border: '2px solid var(--color-sand-200)',
                            color: 'var(--color-text-primary)',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Active Filter Summary */}
                <div
                  className="flex items-center justify-between pt-4 border-t"
                  style={{ borderColor: 'var(--color-sand-200)' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" style={{ color: 'var(--color-terracotta-500)' }} />
                      <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                        {textEntries.length}
                      </span>
                      <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Meldungen</span>
                    </div>
                    <div className="w-px h-4" style={{ backgroundColor: 'var(--color-sand-300)' }} />
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4" style={{ color: 'var(--color-sage-500)' }} />
                      <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                        {photoEntries.length}
                      </span>
                      <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Fotos</span>
                    </div>
                  </div>
                  {(personFilter !== 'Alle' || locationFilter !== 'Alle' || searchQuery || showFavoritesOnly) && (
                    <button
                      onClick={() => {
                        setPersonFilter('Alle');
                        setLocationFilter('Alle');
                        setSearchQuery('');
                        setShowFavoritesOnly(false);
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:bg-white/80"
                      style={{ color: 'var(--color-terracotta-500)' }}
                    >
                      Filter zurücksetzen
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bilder Section */}
        <section className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
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
                  {photoEntries.length} Erinnerungen festgehalten
                </p>
              </div>
            </div>

            {/* Decorative sparkles */}
            <Sparkles
              className="w-5 h-5 animate-float hidden sm:block"
              style={{ color: 'var(--color-amber-400)' }}
            />
          </div>

          {photoEntries.length === 0 ? (
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 sm:gap-5">
                {photoEntries.slice(0, visibleImages).map((photo, index) => {
                  const authorName = photo.memory.recorded_by || 'Unbekannt';
                  const authorColor = getMemberColor(authorName);
                  const childName = photo.memory.child_name;

                  return (
                    <div
                      key={`${photo.memory.id}-${photo.url}`}
                      className={`relative aspect-square rounded-2xl sm:rounded-3xl overflow-hidden cursor-pointer group animate-fade-in-up stagger-${(index % 10) + 1}`}
                      style={{ boxShadow: 'var(--shadow-md)' }}
                      onClick={() => setLightboxImage(photo)}
                    >
                      {/* Actual Image */}
                      <img
                        src={photo.url}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700"
                        style={{ transitionTimingFunction: 'var(--ease-out-expo)' }}
                        loading="lazy"
                      />

                      {/* Gradient overlay - always visible but subtle */}
                      <div
                        className="absolute inset-0 transition-opacity duration-500"
                        style={{
                          background: 'linear-gradient(to top, rgba(42,33,24,0.6) 0%, rgba(42,33,24,0.1) 40%, transparent 70%)',
                          opacity: 0.6,
                        }}
                      />

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-500" />

                      {/* Bottom info - always visible */}
                      <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 transform translate-y-0 group-hover:-translate-y-1 transition-transform duration-500">
                        <div className="flex items-center gap-2 mb-1.5">
                          {authorName !== 'Unbekannt' && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold backdrop-blur-sm"
                              style={{
                                backgroundColor: `${authorColor.activeBg}ee`,
                                color: 'white',
                              }}
                            >
                              {authorName}
                            </span>
                          )}
                        </div>
                        <span className="text-white/90 text-xs sm:text-sm font-medium">
                          {format(parseISO(photo.date), 'd. MMM yyyy', { locale: de })}
                        </span>
                      </div>

                      {/* Person Badge (if specific person) */}
                      {childName && childName !== 'null' && (
                        <div className="absolute top-3 left-3 transform group-hover:scale-105 transition-transform duration-300">
                          <span
                            className="px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-md"
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.9)',
                              color: 'var(--color-text-primary)',
                              boxShadow: 'var(--shadow-sm)',
                            }}
                          >
                            {childName}
                          </span>
                        </div>
                      )}

                      {/* Favorite indicator */}
                      {photo.memory.is_favorite && (
                        <div className="absolute top-3 right-3">
                          <Star
                            className="w-5 h-5 star-filled"
                            style={{ color: 'var(--color-amber-400)', fill: 'var(--color-amber-400)' }}
                          />
                        </div>
                      )}

                      {/* Scale effect container */}
                      <div className="absolute inset-0 group-hover:scale-110 transition-transform duration-700" style={{ transitionTimingFunction: 'var(--ease-out-expo)' }}>
                        <img
                          src={photo.url}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More Button */}
              {visibleImages < photoEntries.length && (
                <div className="text-center mt-10">
                  <button
                    onClick={() => setVisibleImages(prev => prev + 9)}
                    className="group inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-semibold transition-all duration-300 hover:scale-105"
                    style={{
                      background: 'var(--glass-bg-strong)',
                      border: '2px solid var(--color-sand-300)',
                      color: 'var(--color-text-primary)',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    <ImageIcon className="w-5 h-5 transition-transform group-hover:scale-110" style={{ color: 'var(--color-sage-500)' }} />
                    <span>Mehr laden</span>
                    <span
                      className="px-2 py-0.5 rounded-full text-sm"
                      style={{ backgroundColor: 'var(--color-sand-200)' }}
                    >
                      {photoEntries.length - visibleImages}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </section>
        </>) : (
          <div className="w-full" style={{ minHeight: 'calc(100vh - 200px)' }}>
            <MapView memories={filteredMemories} />
          </div>
        )}
      </main>

      {/* Lightbox – via Portal to avoid stacking context clipping */}
      {lightboxImage && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(42, 33, 24, 0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            gap: '1rem',
          }}
          onClick={() => { setLightboxImage(null); setPhotoDeleteConfirm(false); }}
        >
          {/* Close button */}
          <button
            style={{
              position: 'absolute',
              top: '1.5rem',
              right: '1.5rem',
              padding: '0.75rem',
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

          {/* Delete button (only if onDeletePhoto is available) */}
          {onDeletePhoto && (
            <button
              style={{
                position: 'absolute',
                top: '1.5rem',
                left: '1.5rem',
                padding: '0.75rem',
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

          {/* Image – natural aspect ratio, constrained to viewport */}
          <img
            src={lightboxImage.url}
            alt=""
            style={{
              maxWidth: 'calc(100vw - 2rem)',
              maxHeight: 'calc(100vh - 160px)',
              width: 'auto',
              height: 'auto',
              borderRadius: '1.5rem',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              display: 'block',
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
                {format(parseISO(lightboxImage.memory.source_date), 'd. MMMM yyyy', { locale: de })}
              </div>
            </div>
            {lightboxImage.memory.cleaned_summary && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.75)' }}>
                {lightboxImage.memory.cleaned_summary}
              </p>
            )}
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
                        await onDeletePhoto(lightboxImage.memory.id, lightboxImage.photoId);
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
        </div>,
        document.body
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
