import { Heart } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl border-b border-white/50">
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to right, rgba(230,107,74,0.03), rgba(218,169,74,0.03), rgba(122,146,100,0.03))',
        }}
      />
      <div className="relative max-w-6xl mx-auto px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="relative w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #e66b4a 0%, #daa94a 50%, #7a9264 100%)',
                boxShadow: '0 4px 20px rgba(230, 107, 74, 0.25)',
              }}
            >
              <Heart className="w-6 h-6 text-white" fill="white" />
              <div
                className="absolute inset-0 rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)',
                }}
              />
            </div>
            <div>
              <h1
                className="text-2xl font-bold tracking-tight gradient-text"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Family Memories
              </h1>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Unsere Momente, verewigt
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--color-sage-500)' }}
            />
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Live</span>
          </div>
        </div>
      </div>
    </header>
  );
}
