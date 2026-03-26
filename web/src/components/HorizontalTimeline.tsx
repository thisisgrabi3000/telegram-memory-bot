import { useMemo, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Memory } from '../types';

interface HorizontalTimelineProps {
  memories: Memory[];
  onOpenMemory?: (memory: Memory, photoIndex?: number) => void;
}

type TimelineEntry =
  | { type: 'marker'; label: string; key: string }
  | { type: 'item'; memory: Memory; key: string };

export function HorizontalTimeline({ memories, onOpenMemory }: HorizontalTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<TimelineEntry[]>(() => {
    const sorted = [...memories].sort(
      (a, b) => new Date(a.source_date).getTime() - new Date(b.source_date).getTime()
    );

    const result: TimelineEntry[] = [];
    let lastMonthKey = '';

    for (const memory of sorted) {
      const date = parseISO(memory.source_date);
      const monthKey = format(date, 'yyyy-MM');
      if (monthKey !== lastMonthKey) {
        lastMonthKey = monthKey;
        result.push({
          type: 'marker',
          label: format(date, 'MMMM yyyy', { locale: de }),
          key: `marker-${monthKey}`,
        });
      }
      result.push({ type: 'item', memory, key: `item-${memory.id}` });
    }

    return result;
  }, [memories]);

  if (memories.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--color-text-muted)',
          fontSize: '0.95rem',
        }}
      >
        Noch keine Erinnerungen vorhanden.
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {/* Timeline line */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          padding: '0.75rem 1.5rem 0',
          background: 'var(--color-bg-primary)',
        }}
      >
        <div
          style={{
            height: '2px',
            background: 'linear-gradient(to right, var(--color-terracotta-300), var(--color-sage-300), var(--color-sand-300))',
            borderRadius: '1px',
          }}
        />
      </div>

      {/* Scrollable strip */}
      <div
        ref={scrollRef}
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0',
          padding: '1rem 1.5rem 1.5rem',
          flex: 1,
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x proximity',
          cursor: 'grab',
        }}
        onMouseDown={(e) => {
          const el = scrollRef.current;
          if (!el) return;
          // Don't start drag if clicking on a child interactive element
          if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;
          el.style.cursor = 'grabbing';
          const startX = e.pageX - el.offsetLeft;
          const startLeft = el.scrollLeft;
          const onMove = (me: MouseEvent) => {
            el.scrollLeft = startLeft - (me.pageX - el.offsetLeft - startX);
          };
          const onUp = () => {
            if (el) el.style.cursor = 'grab';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }}
      >
        {entries.map((entry) => {
          if (entry.type === 'marker') {
            return (
              <div
                key={entry.key}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  paddingRight: '1rem',
                  paddingTop: '0.25rem',
                  marginRight: '0.25rem',
                }}
              >
                {/* Vertical tick mark */}
                <div
                  style={{
                    width: '2px',
                    height: '10px',
                    background: 'var(--color-terracotta-400)',
                    marginBottom: '6px',
                    marginLeft: '2px',
                    borderRadius: '1px',
                  }}
                />
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--color-terracotta-500)',
                    whiteSpace: 'nowrap',
                    background: 'var(--color-terracotta-50)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-terracotta-100)',
                  }}
                >
                  {entry.label}
                </span>
              </div>
            );
          }

          // type === 'item'
          const { memory } = entry;
          const firstPhoto = memory.photos?.[0];
          const photoCount = memory.photos?.length ?? 0;
          const excerpt = (memory.cleaned_summary || '')
            .replace(/\n/g, ' ')
            .slice(0, 45)
            .trim();

          return (
            <div
              key={entry.key}
              onClick={() => onOpenMemory?.(memory, 0)}
              style={{
                flexShrink: 0,
                width: '88px',
                marginRight: '8px',
                cursor: 'pointer',
                scrollSnapAlign: 'start',
                userSelect: 'none',
              }}
            >
              {/* Thumbnail */}
              <div
                style={{
                  width: '88px',
                  height: '88px',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  background: firstPhoto
                    ? 'var(--color-sand-100)'
                    : 'linear-gradient(135deg, var(--color-terracotta-100) 0%, var(--color-sand-100) 100%)',
                  border: '2px solid var(--color-sand-200)',
                  position: 'relative',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.05)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                }}
              >
                {firstPhoto ? (
                  <img
                    src={firstPhoto.url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.75rem',
                    }}
                  >
                    💬
                  </div>
                )}
                {/* Multi-photo badge */}
                {photoCount > 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '3px',
                      right: '3px',
                      background: 'rgba(0,0,0,0.55)',
                      color: 'white',
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '1px 4px',
                      borderRadius: '5px',
                      lineHeight: 1.4,
                    }}
                  >
                    📷{photoCount}
                  </div>
                )}
                {/* Favorite star */}
                {memory.is_favorite && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: '3px',
                      fontSize: '10px',
                      lineHeight: 1,
                    }}
                  >
                    ⭐
                  </div>
                )}
              </div>

              {/* Date */}
              <div
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--color-text-muted)',
                  marginTop: '5px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {format(parseISO(memory.source_date), 'd. MMM', { locale: de })}
              </div>

              {/* Excerpt */}
              {excerpt && (
                <div
                  style={{
                    fontSize: '0.62rem',
                    color: 'var(--color-text-secondary)',
                    marginTop: '2px',
                    lineHeight: 1.35,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    maxHeight: '2.7em',
                  }}
                >
                  {excerpt}
                </div>
              )}
            </div>
          );
        })}

        {/* Right padding sentinel */}
        <div style={{ flexShrink: 0, width: '1.5rem' }} />
      </div>
    </div>
  );
}
