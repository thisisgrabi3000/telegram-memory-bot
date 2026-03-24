import { useState } from 'react';
import { Star, Calendar, User, X, Trash2, Check, Pencil, Share } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Memory, Category } from '../types';
import { FAMILY_MEMBERS } from '../types';
import { ExportCard } from './ExportCard';

interface MemoryCardProps {
  memory: Memory;
  index: number;
  onDelete?: (id: number) => void;
  onUpdate?: (id: number, text: string) => Promise<void>;
}

const categoryColors: Record<Category, { bg: string; text: string }> = {
  Gesundheit: { bg: '#e8ede1', text: '#495a38' },
  Schule: { bg: '#dbeafe', text: '#1e40af' },
  Familie: { bg: '#fdeae3', text: '#92351d' },
  Freunde: { bg: '#ede9fe', text: '#5b21b6' },
  Freizeit: { bg: '#fef3c7', text: '#b45309' },
  Sport: { bg: '#cffafe', text: '#155e75' },
  Emotion: { bg: '#f9ebe3', text: '#a04834' },
  Entwicklung: { bg: '#d2dcc4', text: '#3c4930' },
  Besonderes: { bg: '#fbd5c7', text: '#78301c' },
};

function getMemberColor(name: string) {
  const member = FAMILY_MEMBERS.find(m =>
    m.name === name || m.aliases.some(a => a.toLowerCase() === name.toLowerCase())
  );
  return member?.color || { bg: '#f1ebe0', text: '#635445', activeBg: '#927a5e' };
}

export function MemoryCard({ memory, index, onDelete, onUpdate }: MemoryCardProps) {
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(memory.cleaned_summary || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const handleEditClick = () => {
    setEditText(memory.cleaned_summary || '');
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!onUpdate || editText.trim() === '') return;
    setIsSaving(true);
    try {
      await onUpdate(memory.id, editText.trim());
      setIsEditing(false);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(memory.cleaned_summary || '');
  };

  const date = parseISO(memory.source_date);
  const formattedDate = format(date, 'd. MMM yyyy', { locale: de });
  const memberStyle = memory.child_name ? getMemberColor(memory.child_name) : null;
  const hasPhotos = memory.photos && memory.photos.length > 0;
  const hasVideos = memory.videos && memory.videos.length > 0;
  const hasCoords = memory.latitude != null && memory.longitude != null;

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(memory.id);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <article
        className={`glass-card glow-card animate-fade-in-up stagger-${(index % 10) + 1} relative group`}
      >
        {/* Action Buttons */}
        <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
          {/* Export Button */}
          <button
            onClick={() => setShowExport(true)}
            className="p-2.5 rounded-xl transition-all duration-200 hover:scale-110 backdrop-blur-sm"
            style={{
              backgroundColor: 'rgba(232, 107, 63, 0.1)',
              border: '1px solid rgba(232, 107, 63, 0.2)',
            }}
            title="Als Bild exportieren"
          >
            <Share className="w-4 h-4" style={{ color: 'var(--color-terracotta-500)' }} />
          </button>
          {/* Delete Button */}
          {onDelete && (
            <button
              onClick={handleDeleteClick}
              className="p-2.5 rounded-xl transition-all duration-200 hover:scale-110 backdrop-blur-sm"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.2)',
              }}
              title="Löschen"
            >
              <Trash2 className="w-4 h-4" style={{ color: '#dc2626' }} />
            </button>
          )}
        </div>

        {/* Photos - Hero Style */}
        {hasPhotos && (
          <div className="relative mb-5">
            <div
              className={`photo-grid ${
                memory.photos.length === 1 ? 'photo-grid-1' :
                memory.photos.length === 2 ? 'photo-grid-2' :
                memory.photos.length === 3 ? 'photo-grid-3' : 'photo-grid-4'
              }`}
              style={{ aspectRatio: memory.photos.length === 1 ? '16/10' : '16/9' }}
            >
              {memory.photos.slice(0, 4).map((photo, photoIndex) => (
                <div
                  key={photo.id}
                  className="photo-item"
                  onClick={() => setLightboxPhoto(photo.url)}
                  style={{ aspectRatio: memory.photos.length === 1 ? '16/10' : undefined }}
                >
                  <img src={photo.url} alt="" loading="lazy" />
                  {photoIndex === 3 && memory.photos.length > 4 && (
                    <div
                      className="absolute inset-0 flex items-center justify-center backdrop-blur-sm"
                      style={{ backgroundColor: 'rgba(42, 33, 24, 0.6)' }}
                    >
                      <span className="text-white text-3xl font-bold">+{memory.photos.length - 4}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Videos */}
        {hasVideos && (
          <div className="mb-5 space-y-2">
            {memory.videos.map(video => (
              <video
                key={video.id}
                src={video.url}
                controls
                className="w-full rounded-2xl"
                style={{ maxHeight: '300px', backgroundColor: '#000' }}
              />
            ))}
          </div>
        )}

        {/* Karten-Vorschau wenn kein Foto/Video aber Koordinaten vorhanden */}
        {!hasPhotos && !hasVideos && hasCoords && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${memory.latitude}&mlon=${memory.longitude}&zoom=14`}
            target="_blank"
            rel="noopener noreferrer"
            className="block mb-5 overflow-hidden rounded-2xl"
            style={{ height: '7rem' }}
          >
            <img
              src={`https://staticmap.openstreetmap.de/staticmap.php?center=${memory.latitude},${memory.longitude}&zoom=13&size=400x112&markers=${memory.latitude},${memory.longitude},red-pushpin`}
              alt="Kartenvorschau"
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
            />
          </a>
        )}

        {/* Content */}
        <div className="px-5 pb-5">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              <Calendar className="w-4 h-4" />
              <span className="font-semibold">{formattedDate}</span>
            </div>

            {/* Importance Stars */}
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 transition-all duration-200 ${i < memory.importance_score ? 'star-filled' : ''}`}
                  style={{
                    color: i < memory.importance_score ? 'var(--color-amber-400)' : 'var(--color-sand-300)',
                    fill: i < memory.importance_score ? 'var(--color-amber-400)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Family Member Badge */}
          {memory.child_name && memory.child_name !== 'null' && memberStyle && (
            <div className="mb-4 flex items-center gap-3 flex-wrap">
              <span
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold"
                style={{
                  backgroundColor: memberStyle.activeBg,
                  color: 'white',
                  boxShadow: `0 4px 12px ${memberStyle.activeBg}40`,
                }}
              >
                <User className="w-3.5 h-3.5" />
                {memory.child_name}
              </span>
              {memory.recorded_by && (
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  von {memory.recorded_by}
                </span>
              )}
            </div>
          )}

          {/* Summary - Click to Edit */}
          {memory.cleaned_summary && !isEditing && (
            <div className="relative group/edit mb-5">
              <p
                className="leading-relaxed text-sm cursor-pointer hover:bg-white/50 rounded-xl p-3 -m-3 transition-all duration-200"
                style={{ color: 'var(--color-text-secondary)' }}
                onClick={onUpdate ? handleEditClick : undefined}
                title={onUpdate ? 'Klicken zum Bearbeiten' : undefined}
              >
                {memory.cleaned_summary}
              </p>
              {onUpdate && (
                <button
                  onClick={handleEditClick}
                  className="absolute top-2 right-2 p-2 rounded-lg opacity-0 group-hover/edit:opacity-100 transition-all duration-200 hover:scale-110"
                  style={{ backgroundColor: 'white', boxShadow: 'var(--shadow-sm)' }}
                  title="Bearbeiten"
                >
                  <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                </button>
              )}
            </div>
          )}

          {/* Edit Mode */}
          {isEditing && (
            <div className="mb-5 animate-fade-in">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full p-4 rounded-xl text-sm leading-relaxed resize-none border-2 focus:outline-none transition-all duration-200"
                style={{
                  backgroundColor: 'white',
                  borderColor: 'var(--color-terracotta-300)',
                  color: 'var(--color-text-secondary)',
                  boxShadow: '0 0 0 4px rgba(232,107,63,0.08)',
                }}
                rows={4}
                autoFocus
                disabled={isSaving}
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving || editText.trim() === ''}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-50 hover:scale-105"
                  style={{
                    backgroundColor: 'var(--color-sage-500)',
                    boxShadow: '0 4px 12px rgba(117,143,90,0.25)',
                  }}
                >
                  <Check className="w-4 h-4" />
                  {isSaving ? 'Speichern...' : 'Speichern'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 hover:bg-white"
                  style={{
                    backgroundColor: 'var(--color-sand-100)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {/* Categories */}
          {memory.categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {memory.categories.map((category) => (
                <span
                  key={category}
                  className="category-badge"
                  style={{
                    backgroundColor: categoryColors[category].bg,
                    color: categoryColors[category].text,
                  }}
                >
                  {category}
                </span>
              ))}
            </div>
          )}

          {/* Tags */}
          {memory.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {memory.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-medium transition-colors cursor-default hover:text-[var(--color-terracotta-500)]"
                  style={{ color: 'var(--color-text-light)' }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="glass-card p-6 max-w-sm w-full animate-fade-in-scale"
            style={{ background: 'var(--glass-bg-strong)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{
                background: 'linear-gradient(145deg, rgba(220,38,38,0.1) 0%, rgba(220,38,38,0.05) 100%)',
              }}
            >
              <Trash2 className="w-7 h-7" style={{ color: '#dc2626' }} />
            </div>
            <h3
              className="text-xl font-bold mb-2 text-center"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
            >
              Wirklich löschen?
            </h3>
            <p
              className="text-sm mb-6 text-center"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Diese Erinnerung wird unwiderruflich gelöscht.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-200 hover:bg-white"
                style={{
                  backgroundColor: 'var(--color-sand-100)',
                  color: 'var(--color-text-muted)',
                }}
                disabled={isDeleting}
              >
                Abbrechen
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-white transition-all duration-200 disabled:opacity-50 hover:scale-[1.02]"
                style={{
                  backgroundColor: '#dc2626',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                }}
              >
                {isDeleting ? 'Löschen...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            className="absolute top-6 right-6 p-3 rounded-2xl transition-all duration-300 hover:scale-110"
            style={{
              backgroundColor: 'rgba(255,255,255,0.95)',
              color: 'var(--color-text-primary)',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={() => setLightboxPhoto(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxPhoto}
            alt=""
            className="object-contain rounded-3xl animate-fade-in-scale"
            style={{ maxWidth: '90vw', maxHeight: '90vh', boxShadow: 'var(--shadow-2xl)' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Export Modal */}
      {showExport && (
        <ExportCard memory={memory} onClose={() => setShowExport(false)} />
      )}
    </>
  );
}
