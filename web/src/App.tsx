import { useState, useEffect } from 'react';
import { HomeScreen, LoginScreen, IdentityPicker, SharedMemoryView } from './components';
import { fetchMemories, updateMemory, updateMemoryDate, updateMemoryPerson, deleteMemory, toggleFavorite, createMemory, uploadPhotos, deletePhoto, deleteAudio, updateAudioSpeaker, createShareLink, updatePhotoPeople } from './api/memoriesApi';
import type { Memory } from './types';
import { Loader2, Heart, RefreshCw, AlertTriangle } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

function App() {
  const [shareToken] = useState(() => new URLSearchParams(window.location.search).get('share'));
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [identity, setIdentity] = useState<string | null>(() =>
    localStorage.getItem('famories_identity')
  );

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Load memories after authentication
  useEffect(() => {
    if (isAuthenticated) {
      loadMemories();
    }
  }, [isAuthenticated]);

  async function checkAuth() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/status`, { credentials: 'include' });
      const data = await res.json();
      setIsAuthenticated(!data.passwordRequired || data.authenticated);
      if (data.identity) {
        // Session has identity — use it and sync to localStorage
        localStorage.setItem('famories_identity', data.identity);
        setIdentity(data.identity);
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  }

  function handleLogin() {
    setIsAuthenticated(true);
  }

  function handleIdentitySelect(name: string) {
    localStorage.setItem('famories_identity', name);
    setIdentity(name);
    fetch(`${API_BASE_URL}/api/auth/identity`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identity: name }),
    }).catch(() => {/* non-critical */});
  }

  function handleIdentityReset() {
    localStorage.removeItem('famories_identity');
    setIdentity(null);
    fetch(`${API_BASE_URL}/api/auth/identity`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identity: null }),
    }).catch(() => {/* non-critical */});
  }

  async function loadMemories() {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchMemories();
      setMemories(data);
    } catch (err) {
      console.error('Fehler beim Laden:', err);
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(id: number, text: string) {
    const updated = await updateMemory(id, text);
    setMemories(prev => prev.map(m => m.id === id ? updated : m));
  }

  async function handleUpdateDate(id: number, date: string) {
    const updated = await updateMemoryDate(id, date);
    setMemories(prev => prev.map(m => m.id === id ? updated : m));
  }

  async function handleUpdatePerson(id: number, childName: string | null) {
    const updated = await updateMemoryPerson(id, childName);
    setMemories(prev => prev.map(m => m.id === id ? updated : m));
  }

  async function handleDelete(id: number) {
    await deleteMemory(id);
    setMemories(prev => prev.filter(m => m.id !== id));
  }

  async function handleToggleFavorite(id: number) {
    const updated = await toggleFavorite(id);
    setMemories(prev => prev.map(m => m.id === id ? updated : m));
  }

  async function handleDeletePhoto(memoryId: number, photoId: number) {
    const updated = await deletePhoto(memoryId, photoId);
    setMemories(prev => prev.map(m => m.id === memoryId ? updated : m));
  }

  async function handleDeleteAudio(memoryId: number, audioId: number) {
    const updated = await deleteAudio(memoryId, audioId);
    setMemories(prev => prev.map(m => m.id === memoryId ? updated : m));
  }

  async function handleUpdateAudioSpeaker(memoryId: number, audioId: number, speaker: string | null) {
    const updated = await updateAudioSpeaker(memoryId, audioId, speaker);
    setMemories(prev => prev.map(m => m.id === memoryId ? updated : m));
  }

  async function handleUpdatePhotoPeople(memoryId: number, photoId: number, people: string[]) {
    const updated = await updatePhotoPeople(memoryId, photoId, people);
    setMemories(prev => prev.map(m => m.id === memoryId ? updated : m));
  }

  async function handleShare(memoryId: number) {
    try {
      const { url } = await createShareLink(memoryId);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Clipboard unavailable (e.g. Telegram WebView) — show URL for manual copy
        window.prompt('Link kopieren:', url);
      }
    } catch (err) {
      console.error('Share failed:', err);
      alert('Link konnte nicht erstellt werden.');
    }
  }

  async function handleCreate(data: {
    text: string;
    child_name?: string;
    location?: string;
    source_date?: string;
    people?: string[];
    photos?: File[];
    latitude?: number;
    longitude?: number;
  }): Promise<Memory> {
    const { photos, ...memoryData } = data;
    let created = await createMemory({ ...memoryData, recorded_by: identity || undefined });

    if (photos && photos.length > 0) {
      created = await uploadPhotos(created.id, photos);
    }

    setMemories(prev => [created, ...prev]);
    return created;
  }

  // Public share view — show without auth
  if (shareToken) {
    return <SharedMemoryView token={shareToken} />;
  }

  // Checking authentication - Premium loading state
  if (checkingAuth) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        {/* Decorative background elements */}
        <div
          className="absolute top-1/3 -left-32 w-64 h-64 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--color-terracotta-200) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-1/3 -right-32 w-80 h-80 rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--color-sage-200) 0%, transparent 70%)' }}
        />

        {/* Loading content */}
        <div className="relative z-10 flex flex-col items-center">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 animate-fade-in-scale"
            style={{
              background: 'linear-gradient(145deg, rgba(232,107,63,0.12) 0%, rgba(251,191,36,0.12) 100%)',
              boxShadow: 'var(--shadow-lg), inset 0 0 0 1px rgba(255,255,255,0.5)',
            }}
          >
            <Loader2
              className="w-10 h-10 spinner"
              style={{ color: 'var(--color-terracotta-500)' }}
            />
          </div>
          <h2
            className="text-xl font-bold mb-2 animate-fade-in gradient-text"
            style={{ fontFamily: 'var(--font-display)', animationDelay: '0.1s' }}
          >
            Famories
          </h2>
          <p
            className="text-sm animate-fade-in"
            style={{ color: 'var(--color-text-muted)', animationDelay: '0.2s' }}
          >
            Einen Moment...
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // No identity selected - show identity picker
  if (!identity) {
    return <IdentityPicker onSelect={handleIdentitySelect} />;
  }

  // Loading memories - Premium loading state
  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        {/* Decorative background */}
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--color-amber-200) 0%, transparent 70%)' }}
        />

        {/* Loading content */}
        <div className="relative z-10 flex flex-col items-center">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center mb-8 relative animate-fade-in-scale"
            style={{
              background: 'linear-gradient(145deg, rgba(232,107,63,0.1) 0%, rgba(251,191,36,0.1) 100%)',
              boxShadow: 'var(--shadow-xl), inset 0 0 0 1px rgba(255,255,255,0.5)',
            }}
          >
            <Heart
              className="w-12 h-12"
              style={{
                color: 'var(--color-terracotta-500)',
                fill: 'var(--color-terracotta-500)',
                animation: 'heartbeat 1.5s ease infinite',
              }}
            />
          </div>

          <h2
            className="text-2xl font-bold mb-3 animate-fade-in gradient-text"
            style={{ fontFamily: 'var(--font-display)', animationDelay: '0.1s' }}
          >
            Famories
          </h2>
          <p
            className="text-sm animate-fade-in"
            style={{ color: 'var(--color-text-muted)', animationDelay: '0.2s' }}
          >
            Lade eure Erinnerungen...
          </p>

          {/* Loading dots */}
          <div className="flex gap-2 mt-6 animate-fade-in" style={{ animationDelay: '0.3s' }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: 'var(--color-terracotta-400)',
                  animation: 'pulse-soft 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state - Premium error display
  if (error) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        {/* Decorative background */}
        <div
          className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--color-rust-200) 0%, transparent 70%)' }}
        />

        <div className="relative z-10 max-w-md w-full">
          <div
            className="glass-card p-8 text-center animate-fade-in-scale"
            style={{ background: 'var(--glass-bg-strong)' }}
          >
            {/* Error icon */}
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
              style={{
                background: 'linear-gradient(145deg, rgba(220,38,38,0.08) 0%, rgba(220,38,38,0.04) 100%)',
                border: '1px solid rgba(220,38,38,0.1)',
              }}
            >
              <AlertTriangle
                className="w-10 h-10"
                style={{ color: '#dc2626' }}
              />
            </div>

            <h3
              className="text-2xl font-bold mb-3"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
            >
              Oops!
            </h3>
            <p
              className="mb-6 text-sm leading-relaxed"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {error}
            </p>

            <button
              onClick={loadMemories}
              className="group inline-flex items-center gap-3 px-6 py-3.5 rounded-2xl font-semibold text-white transition-all duration-300 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, var(--color-terracotta-500) 0%, var(--color-terracotta-600) 100%)',
                boxShadow: 'var(--shadow-glow-terracotta)',
              }}
            >
              <RefreshCw className="w-5 h-5 transition-transform group-hover:rotate-180 duration-500" />
              Erneut versuchen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <HomeScreen
      memories={memories}
      onUpdate={handleUpdate}
      onUpdateDate={handleUpdateDate}
      onUpdatePerson={handleUpdatePerson}
      onDelete={handleDelete}
      onToggleFavorite={handleToggleFavorite}
      onCreate={handleCreate}
      onDeletePhoto={handleDeletePhoto}
      onDeleteAudio={handleDeleteAudio}
      onUpdateAudioSpeaker={handleUpdateAudioSpeaker}
      onUpdatePhotoPeople={handleUpdatePhotoPeople}
      onShare={handleShare}
      identity={identity}
      onIdentityReset={handleIdentityReset}
    />
  );
}

export default App;
