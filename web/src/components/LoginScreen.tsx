import { useState } from 'react';
import { Lock, Loader2, AlertCircle, Heart, Sparkles } from 'lucide-react';

interface LoginScreenProps {
  onLogin: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        onLogin();
      } else {
        setError(data.error || 'Login fehlgeschlagen');
      }
    } catch (err) {
      setError('Verbindungsfehler. Bitte erneut versuchen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      {/* Decorative background elements */}
      <div
        className="absolute top-1/4 -left-32 w-64 h-64 rounded-full opacity-40 blur-3xl animate-float"
        style={{ background: 'radial-gradient(circle, var(--color-terracotta-200) 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full opacity-30 blur-3xl animate-float"
        style={{
          background: 'radial-gradient(circle, var(--color-sage-200) 0%, transparent 70%)',
          animationDelay: '-2s'
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--color-amber-200) 0%, transparent 70%)' }}
      />

      {/* Card */}
      <div
        className="w-full max-w-sm relative z-10 animate-fade-in-up"
      >
        {/* Main Card */}
        <div
          className="glass-card p-8 relative overflow-visible"
          style={{
            background: 'var(--glass-bg-strong)',
          }}
        >
          {/* Sparkle decoration */}
          <Sparkles
            className="absolute -top-3 -right-3 w-6 h-6 animate-float"
            style={{ color: 'var(--color-amber-400)', animationDelay: '-1s' }}
          />

          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center relative animate-fade-in-scale"
              style={{
                background: 'linear-gradient(145deg, rgba(232,107,63,0.12) 0%, rgba(251,191,36,0.12) 100%)',
                boxShadow: 'var(--shadow-lg), inset 0 0 0 1px rgba(255,255,255,0.5)',
              }}
            >
              <span className="text-5xl" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))' }}>
                👨‍👩‍👧‍👦
              </span>
              {/* Decorative heart */}
              <Heart
                className="absolute -bottom-1 -right-1 w-5 h-5"
                style={{ color: 'var(--color-terracotta-500)', fill: 'var(--color-terracotta-500)' }}
              />
            </div>
          </div>

          {/* Title */}
          <h1
            className="text-3xl font-bold text-center mb-2 gradient-text"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Famories
          </h1>
          <p
            className="text-center mb-8 text-sm"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Eure Familienerinnerungen, für immer bewahrt
          </p>

          {/* Divider with icon */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--color-sand-300), transparent)' }} />
            <Lock className="w-4 h-4" style={{ color: 'var(--color-text-light)' }} />
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--color-sand-300), transparent)' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <div
                className="absolute left-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all duration-300"
                style={{
                  backgroundColor: isFocused ? 'rgba(232,107,63,0.1)' : 'transparent',
                }}
              >
                <Lock
                  className="w-4 h-4 transition-colors duration-300"
                  style={{ color: isFocused ? 'var(--color-terracotta-500)' : 'var(--color-text-muted)' }}
                />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Familien-Passwort"
                autoFocus
                className="w-full pl-14 pr-4 py-4 rounded-2xl text-base font-medium outline-none transition-all duration-300"
                style={{
                  backgroundColor: 'white',
                  color: 'var(--color-text-primary)',
                  border: isFocused ? '2px solid var(--color-terracotta-400)' : '2px solid var(--color-sand-200)',
                  boxShadow: isFocused ? '0 0 0 4px rgba(232,107,63,0.1)' : 'none',
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-3 p-4 rounded-xl animate-slide-in-down"
                style={{
                  backgroundColor: 'rgba(220, 38, 38, 0.08)',
                  border: '1px solid rgba(220, 38, 38, 0.15)',
                }}
              >
                <div
                  className="p-1.5 rounded-lg"
                  style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)' }}
                >
                  <AlertCircle className="w-4 h-4" style={{ color: '#dc2626' }} />
                </div>
                <span className="text-sm font-medium" style={{ color: '#dc2626' }}>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-4 rounded-2xl font-bold text-white transition-all duration-300 flex items-center justify-center gap-3 relative overflow-hidden group"
              style={{
                background: loading || !password
                  ? 'linear-gradient(135deg, rgba(232,107,63,0.4) 0%, rgba(251,191,36,0.4) 100%)'
                  : 'linear-gradient(135deg, var(--color-terracotta-500) 0%, var(--color-terracotta-600) 50%, var(--color-rust-600) 100%)',
                cursor: loading || !password ? 'not-allowed' : 'pointer',
                boxShadow: loading || !password ? 'none' : 'var(--shadow-glow-terracotta)',
                transform: loading || !password ? 'none' : undefined,
              }}
            >
              {/* Shine effect */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
                  transform: 'translateX(-100%)',
                  animation: loading || !password ? 'none' : undefined,
                }}
              />

              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Anmelden...</span>
                </>
              ) : (
                <>
                  <span>Eintreten</span>
                  <Heart className="w-4 h-4 opacity-80" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer decoration */}
        <div className="flex items-center justify-center gap-2 mt-8 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <div className="w-8 h-0.5 rounded-full" style={{ background: 'var(--color-sand-300)' }} />
          <span className="text-xs font-medium tracking-wider" style={{ color: 'var(--color-text-light)' }}>
            FAMORIES.INFO
          </span>
          <div className="w-8 h-0.5 rounded-full" style={{ background: 'var(--color-sand-300)' }} />
        </div>
      </div>
    </div>
  );
}
