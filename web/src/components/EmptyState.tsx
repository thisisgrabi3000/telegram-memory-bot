import { SearchX, Heart } from 'lucide-react';

interface EmptyStateProps {
  onClearFilters: () => void;
}

export function EmptyState({ onClearFilters }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 relative"
        style={{
          background: 'linear-gradient(135deg, rgba(230,107,74,0.1) 0%, rgba(218,169,74,0.1) 100%)',
          border: '1px solid var(--color-sand-200)',
        }}
      >
        <SearchX className="w-10 h-10" style={{ color: 'var(--color-sand-400)' }} />
        <div
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #e66b4a, #daa94a)',
          }}
        >
          <Heart className="w-3 h-3 text-white" fill="white" />
        </div>
      </div>
      <h3
        className="text-2xl font-bold mb-3"
        style={{ color: 'var(--color-text-primary)' }}
      >
        Keine Erinnerungen gefunden
      </h3>
      <p
        className="mb-6 max-w-md"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Mit den aktuellen Filtern wurden keine Erinnerungen gefunden.
        Versuche andere Filter oder setze sie zurück.
      </p>
      <button
        onClick={onClearFilters}
        className="btn-primary"
      >
        Filter zurücksetzen
      </button>
    </div>
  );
}
