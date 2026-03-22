import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Download, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Memory } from '../types';
import { FAMILY_MEMBERS, LOCATIONS } from '../types';

interface ExportCardProps {
  memory: Memory;
  onClose: () => void;
}

function getMemberColor(name: string | null) {
  if (!name || name === 'null') return { activeBg: '#926548' };
  const member = FAMILY_MEMBERS.find(m =>
    m.name === name || m.aliases.some(a => a.toLowerCase() === name.toLowerCase())
  );
  return member?.color || { activeBg: '#926548' };
}

function getLocationEmoji(location: string | null) {
  if (!location) return null;
  const loc = LOCATIONS.find(l => l.name === location);
  return loc?.emoji || '📍';
}

export function ExportCard({ memory, onClose }: ExportCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const date = parseISO(memory.source_date);
  const formattedDate = format(date, 'd. MMMM yyyy', { locale: de });
  const hasPhoto = memory.photos && memory.photos.length > 0;
  const memberColor = memory.child_name ? getMemberColor(memory.child_name) : null;
  const locationEmoji = getLocationEmoji(memory.location);

  const handleExport = async () => {
    if (!cardRef.current) return;

    setIsExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
        allowTaint: true,
      });

      const link = document.createElement('a');
      link.download = `memory-${memory.id}-${memory.source_date}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Export Card Preview */}
        <div
          ref={cardRef}
          className="rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, #faf7f2 0%, #f5f1eb 100%)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
          }}
        >
          {/* Photo Section */}
          {hasPhoto && (
            <div className="relative aspect-[4/3] overflow-hidden">
              <img
                src={memory.photos[0].url}
                alt=""
                crossOrigin="anonymous"
                className="w-full h-full object-cover"
              />
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.3) 100%)',
                }}
              />
            </div>
          )}

          {/* Content */}
          <div className="p-6">
            {/* Header with date and person */}
            <div className="flex items-center justify-between mb-4">
              <span
                className="text-sm font-medium"
                style={{ color: '#8b7355' }}
              >
                {formattedDate}
              </span>
              {memory.child_name && memory.child_name !== 'null' && memberColor && (
                <span
                  className="px-3 py-1 rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: memberColor.activeBg }}
                >
                  {memory.child_name}
                </span>
              )}
            </div>

            {/* Memory Text */}
            {memory.cleaned_summary && (
              <p
                className="text-lg leading-relaxed mb-4"
                style={{
                  color: '#3d3429',
                  fontFamily: 'Georgia, serif',
                }}
              >
                "{memory.cleaned_summary}"
              </p>
            )}

            {/* Location */}
            {memory.location && (
              <div className="flex items-center gap-2 mb-4">
                <span style={{ color: '#8b7355' }}>
                  {locationEmoji} {memory.location}
                </span>
              </div>
            )}

            {/* Footer / Branding */}
            <div
              className="pt-4 border-t flex items-center justify-between"
              style={{ borderColor: '#e5ddd0' }}
            >
              <span
                className="text-xs font-medium tracking-wider"
                style={{ color: '#b5a48a' }}
              >
                FAMILY MEMORIES
              </span>
              {memory.recorded_by && (
                <span
                  className="text-xs"
                  style={{ color: '#b5a48a' }}
                >
                  von {memory.recorded_by}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-all disabled:opacity-50"
            style={{
              backgroundColor: '#e85325',
              boxShadow: '0 4px 14px rgba(232, 83, 37, 0.3)',
            }}
          >
            <Download className="w-5 h-5" />
            {isExporting ? 'Exportiere...' : 'Als Bild speichern'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-xl font-medium transition-all"
            style={{
              backgroundColor: 'white',
              color: '#6b5d4d',
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
