import { LayoutGrid, List, X, Users } from 'lucide-react';
import { CATEGORIES, FAMILY_MEMBERS, type Category, type ViewMode } from '../types';

interface FilterBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedChild: string | null;
  onChildChange: (child: string | null) => void;
  selectedCategories: Category[];
  onCategoryToggle: (category: Category) => void;
  onClearFilters: () => void;
}

const categoryColors: Record<Category, { bg: string; text: string; activeBg: string }> = {
  Gesundheit: { bg: '#e6ebde', text: '#425532', activeBg: '#6b8a4f' },
  Schule: { bg: '#dbeafe', text: '#1e40af', activeBg: '#3b82f6' },
  Familie: { bg: '#fce4d8', text: '#902517', activeBg: '#e85325' },
  Freunde: { bg: '#ede9fe', text: '#5b21b6', activeBg: '#8b5cf6' },
  Freizeit: { bg: '#f9ecd0', text: '#a34a17', activeBg: '#dc8620' },
  Sport: { bg: '#cffafe', text: '#155e75', activeBg: '#0891b2' },
  Emotion: { bg: '#f3e8e1', text: '#8b4437', activeBg: '#b5694e' },
  Entwicklung: { bg: '#ced9c0', text: '#37452b', activeBg: '#536d3c' },
  Besonderes: { bg: '#f9c7af', text: '#752316', activeBg: '#d93a14' },
};

export function FilterBar({
  viewMode,
  onViewModeChange,
  selectedChild,
  onChildChange,
  selectedCategories,
  onCategoryToggle,
  onClearFilters,
}: FilterBarProps) {
  const hasActiveFilters = selectedChild !== null || selectedCategories.length > 0;

  return (
    <div className="space-y-6">
      {/* View Toggle & Clear */}
      <div className="flex items-center justify-between">
        <div className="view-toggle">
          <button
            onClick={() => onViewModeChange('cards')}
            className={`view-toggle-btn ${
              viewMode === 'cards' ? 'view-toggle-btn-active' : 'view-toggle-btn-inactive'
            }`}
          >
            <LayoutGrid className="w-4 h-4 inline-block mr-2" />
            Grid
          </button>
          <button
            onClick={() => onViewModeChange('timeline')}
            className={`view-toggle-btn ${
              viewMode === 'timeline' ? 'view-toggle-btn-active' : 'view-toggle-btn-inactive'
            }`}
          >
            <List className="w-4 h-4 inline-block mr-2" />
            Timeline
          </button>
        </div>

        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-2 text-sm transition-all px-3 py-1.5 rounded-lg hover:bg-white/50"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X className="w-4 h-4" />
            Filter zurücksetzen
          </button>
        )}
      </div>

      {/* Family Members Filter */}
      <div>
        <p
          className="text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <Users className="w-3 h-3" />
          Familie
        </p>
        <div className="flex gap-2 flex-wrap">
          {FAMILY_MEMBERS.map((member) => {
            const isActive = selectedChild === member.name;
            return (
              <button
                key={member.name}
                onClick={() => onChildChange(selectedChild === member.name ? null : member.name)}
                className="member-chip"
                style={{
                  background: isActive
                    ? member.color.activeBg
                    : member.color.bg,
                  color: isActive ? 'white' : member.color.text,
                  boxShadow: isActive
                    ? `0 4px 14px ${member.color.activeBg}40`
                    : 'none',
                }}
              >
                {member.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Categories Filter */}
      <div>
        <p
          className="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Kategorien
        </p>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((category) => {
            const isActive = selectedCategories.includes(category);
            const colors = categoryColors[category];
            return (
              <button
                key={category}
                onClick={() => onCategoryToggle(category)}
                className="filter-chip"
                style={{
                  background: isActive ? colors.activeBg : colors.bg,
                  color: isActive ? 'white' : colors.text,
                  borderColor: 'transparent',
                  boxShadow: isActive ? `0 4px 14px ${colors.activeBg}30` : 'none',
                }}
              >
                {category}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
