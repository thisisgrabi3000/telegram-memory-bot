import { useState } from 'react';
import { Star, User, X, Trash2 } from 'lucide-react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Memory, Category } from '../types';
import { FAMILY_MEMBERS } from '../types';

interface TimelineViewProps {
  memories: Memory[];
  onDelete?: (id: number) => void;
}

const categoryColors: Record<Category, { bg: string; text: string }> = {
  Gesundheit: { bg: '#e6ebde', text: '#425532' },
  Schule: { bg: '#dbeafe', text: '#1e40af' },
  Familie: { bg: '#fce4d8', text: '#902517' },
  Freunde: { bg: '#ede9fe', text: '#5b21b6' },
  Freizeit: { bg: '#f9ecd0', text: '#a34a17' },
  Sport: { bg: '#cffafe', text: '#155e75' },
  Emotion: { bg: '#f3e8e1', text: '#8b4437' },
  Entwicklung: { bg: '#ced9c0', text: '#37452b' },
  Besonderes: { bg: '#f9c7af', text: '#752316' },
};

const defaultMemberStyle = { activeBg: '#9a8b78', text: '#6b5d4d' };

function getMemberStyle(name: string | null) {
  if (!name) return defaultMemberStyle;
  const member = FAMILY_MEMBERS.find(m =>
    m.name === name || m.aliases.some(a => a.toLowerCase() === name.toLowerCase())
  );
  return member?.color || defaultMemberStyle;
}

function getDateLabel(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Heute';
  if (isYesterday(date)) return 'Gestern';
  return format(date, 'EEEE, d. MMMM', { locale: de });
}

function groupByDate(memories: Memory[]): Map<string, Memory[]> {
  const groups = new Map<string, Memory[]>();
  memories.forEach((memory) => {
    const dateKey = memory.source_date;
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(memory);
  });
  return groups;
}

export function TimelineView({ memories, onDelete }: TimelineViewProps) {
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const groupedMemories = groupByDate(memories);
  const sortedDates = Array.from(groupedMemories.keys()).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  const handleDeleteConfirm = async (id: number) => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(id);
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  return (
    <>
      <div className="space-y-12">
        {sortedDates.map((dateKey, dateIndex) => (
          <div
            key={dateKey}
            className={`animate-fade-in-up stagger-${(dateIndex % 4) + 1}`}
          >
            {/* Date Header */}
            <div className="flex items-center gap-4 mb-6">
              <div
                className="w-4 h-4 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #e66b4a, #daa94a)',
                  boxShadow: '0 2px 10px rgba(230, 107, 74, 0.3)',
                }}
              />
              <h2
                className="text-xl font-bold"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {getDateLabel(dateKey)}
              </h2>
              <div
                className="flex-1 h-px"
                style={{
                  background: 'linear-gradient(to right, var(--color-sand-300), transparent)',
                }}
              />
            </div>

            {/* Memories for this date */}
            <div className="relative ml-8 pl-8 space-y-6">
              {/* Timeline Line */}
              <div className="timeline-line" />

              {groupedMemories.get(dateKey)!.map((memory, memoryIndex) => {
                const memberStyle = getMemberStyle(memory.child_name);
                const hasPhotos = memory.photos && memory.photos.length > 0;

                return (
                  <article
                    key={memory.id}
                    className={`glass-card relative group animate-slide-in-right stagger-${(memoryIndex % 6) + 1}`}
                  >
                    {/* Timeline Dot */}
                    <div
                      className="timeline-dot"
                      style={{
                        top: '1.5rem',
                        background: memberStyle.activeBg,
                      }}
                    />

                    {/* Delete Button */}
                    {onDelete && (
                      <button
                        onClick={() => setDeleteConfirm(memory.id)}
                        className="absolute top-4 right-4 p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110 z-10"
                        style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                        title="Löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" style={{ color: '#dc2626' }} />
                      </button>
                    )}

                    <div className="p-5">
                      {/* Photos Thumbnails */}
                      {hasPhotos && (
                        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
                          {memory.photos.slice(0, 5).map((photo, photoIndex) => (
                            <div
                              key={photo.id}
                              className="relative flex-shrink-0 cursor-pointer group/photo"
                              onClick={() => setLightboxPhoto(photo.url)}
                            >
                              <img
                                src={photo.url}
                                alt=""
                                className="w-20 h-20 object-cover rounded-xl transition-all group-hover/photo:scale-105"
                                style={{ boxShadow: '0 4px 12px rgba(139, 90, 43, 0.15)' }}
                                loading="lazy"
                              />
                              {photoIndex === 4 && memory.photos.length > 5 && (
                                <div
                                  className="absolute inset-0 rounded-xl flex items-center justify-center"
                                  style={{ backgroundColor: 'rgba(61, 52, 41, 0.6)' }}
                                >
                                  <span className="text-white text-sm font-bold">
                                    +{memory.photos.length - 5}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Header Row */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        {memory.child_name && memory.child_name !== 'null' && (
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: memberStyle.activeBg,
                              color: 'white',
                              boxShadow: `0 2px 8px ${memberStyle.activeBg}40`,
                            }}
                          >
                            <User className="w-3 h-3" />
                            {memory.child_name}
                          </span>
                        )}

                        {/* Importance */}
                        <div className="flex gap-0.5 ml-auto">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${i < memory.importance_score ? 'star-filled' : ''}`}
                              style={{
                                color: i < memory.importance_score ? '#daa94a' : '#e5ddd0',
                                fill: i < memory.importance_score ? '#daa94a' : 'none',
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Summary */}
                      {memory.cleaned_summary && (
                        <p
                          className="leading-relaxed mb-4 text-sm"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {memory.cleaned_summary}
                        </p>
                      )}

                      {/* Categories & Tags */}
                      <div className="flex flex-wrap gap-2">
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
                        {memory.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs"
                            style={{ color: 'var(--color-text-muted)' }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm !== null && (
        <div
          className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="glass-card p-6 max-w-sm w-full"
            style={{ backgroundColor: 'white' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="text-xl font-bold mb-2"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Wirklich löschen?
            </h3>
            <p
              className="text-sm mb-6"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Diese Erinnerung wird unwiderruflich gelöscht.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn-secondary flex-1"
                disabled={isDeleting}
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleDeleteConfirm(deleteConfirm)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-white transition-all"
                style={{
                  backgroundColor: '#dc2626',
                  boxShadow: '0 4px 14px rgba(220, 38, 38, 0.25)',
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
            className="absolute top-6 right-6 p-3 rounded-full transition-colors"
            style={{
              backgroundColor: 'rgba(255,255,255,0.9)',
              color: 'var(--color-text-primary)',
            }}
            onClick={() => setLightboxPhoto(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxPhoto}
            alt=""
            className="max-w-full max-h-full object-contain rounded-2xl"
            style={{ boxShadow: '0 20px 60px rgba(61, 52, 41, 0.4)' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
