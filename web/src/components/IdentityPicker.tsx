import { FAMILY_MEMBERS } from '../types';

interface IdentityPickerProps {
  onSelect: (name: string) => void;
}

export function IdentityPicker({ onSelect }: IdentityPickerProps) {
  // Filter out Bowie (cat) — only humans can be identities
  const members = FAMILY_MEMBERS.filter(m => m.name !== 'Bowie');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      <div className="max-w-sm w-full text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
          style={{
            background: 'linear-gradient(145deg, rgba(232,107,63,0.12) 0%, rgba(251,191,36,0.12) 100%)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <span className="text-3xl">👋</span>
        </div>
        <h2
          className="text-2xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}
        >
          Wer bist du?
        </h2>
        <p className="text-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>
          Damit wir wissen, wer die Erinnerung eingetragen hat.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {members.map((member) => (
            <button
              key={member.name}
              onClick={() => onSelect(member.name)}
              className="px-4 py-3.5 rounded-2xl font-semibold text-white transition-all duration-200 hover:scale-105 min-h-[44px]"
              style={{
                backgroundColor: member.color.activeBg,
                boxShadow: `0 4px 12px ${member.color.activeBg}40`,
              }}
            >
              {member.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
