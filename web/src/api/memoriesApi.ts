import type { Memory } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface ApiResponse<T> {
  success: boolean;
  count?: number;
  data: T;
  error?: string;
}

interface RawMemory extends Omit<Memory, 'photos' | 'audios' | 'videos'> {
  photos: Array<{ id: number; url: string; filename: string }>;
  audios: Array<{ id: number; url: string; filename: string; voice_speaker: string | null }>;
  videos: Array<{ id: number; url: string; filename: string }>;
}

// Helper to transform URLs to absolute and ensure arrays
function transformMemoryUrls(memory: RawMemory): Memory {
  const toAbsolute = (url: string) => url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
  return {
    ...memory,
    people: memory.people || [],
    photos: (memory.photos || []).map(p => ({ ...p, url: toAbsolute(p.url) })),
    audios: (memory.audios || []).map(a => ({ ...a, url: toAbsolute(a.url) })),
    videos: (memory.videos || []).map(v => ({ ...v, url: toAbsolute(v.url) })),
  };
}

export async function fetchMemories(): Promise<Memory[]> {
  const response = await fetch(`${API_BASE_URL}/api/memories`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory[]> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Unbekannter Fehler');
  }

  return json.data.map(transformMemoryUrls);
}

export async function fetchChildren(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/children`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<string[]> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Unbekannter Fehler');
  }

  return json.data;
}

export async function deleteMemory(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<null> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Löschen');
  }
}

export async function updateMemory(id: number, cleanedSummary: string): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ cleaned_summary: cleanedSummary }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Aktualisieren');
  }

  return transformMemoryUrls(json.data);
}

export async function toggleFavorite(id: number): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${id}/favorite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Aktualisieren');
  }

  return transformMemoryUrls(json.data);
}

export interface CreateMemoryInput {
  text: string;
  child_name?: string;
  location?: string;
  source_date?: string;
  people?: string[];
  latitude?: number;
  longitude?: number;
  recorded_by?: string;
}

export async function createMemory(input: CreateMemoryInput): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Erstellen');
  }

  return transformMemoryUrls(json.data);
}

export async function uploadPhotos(id: number, files: File[]): Promise<Memory> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('photos', file);
  }

  const response = await fetch(`${API_BASE_URL}/api/memories/${id}/photos`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Hochladen');
  }

  return transformMemoryUrls(json.data);
}

export async function deletePhoto(memoryId: number, photoId: number): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${memoryId}/photos/${photoId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Löschen des Fotos');
  }

  return transformMemoryUrls(json.data);
}

export async function deleteAudio(memoryId: number, audioId: number): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${memoryId}/audios/${audioId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Löschen der Aufnahme');
  }

  return transformMemoryUrls(json.data);
}

export async function updateAudioSpeaker(memoryId: number, audioId: number, speaker: string | null): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${memoryId}/audios/${audioId}/speaker`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ voice_speaker: speaker }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Aktualisieren des Sprechers');
  }

  return transformMemoryUrls(json.data);
}

export async function updateMemoryPerson(id: number, childName: string | null): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${id}/person`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ child_name: childName }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();
  if (!json.success) throw new Error(json.error || 'Fehler beim Aktualisieren');
  return transformMemoryUrls(json.data);
}

export async function updateMemoryDate(id: number, date: string): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${id}/date`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ source_date: date }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Aktualisieren');
  }

  return transformMemoryUrls(json.data);
}

export async function searchMemories(query: string): Promise<Memory[]> {
  const response = await fetch(`${API_BASE_URL}/api/memories?search=${encodeURIComponent(query)}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory[]> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Unbekannter Fehler');
  }

  return json.data.map(transformMemoryUrls);
}

export async function transcribeAudio(
  audioBlob: Blob,
  saveFile?: boolean
): Promise<{ text: string; savedFilename?: string }> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  if (saveFile) {
    formData.append('saveFile', 'true');
  }

  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Transkription fehlgeschlagen');
  }

  return json.data as { text: string; savedFilename?: string };
}

export async function attachAudio(
  memoryId: number,
  filename: string,
  voiceSpeaker?: string | null
): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${memoryId}/audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ filename, voice_speaker: voiceSpeaker ?? null }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Anhängen der Audiodatei');
  }

  return transformMemoryUrls(json.data);
}

export async function fetchSharedMemory(token: string): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/share/${token}`);

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<RawMemory> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Laden der Erinnerung');
  }

  return transformMemoryUrls(json.data);
}

export async function createShareLink(memoryId: number): Promise<{ url: string }> {
  const response = await fetch(`${API_BASE_URL}/api/memories/${memoryId}/share`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const json: ApiResponse<{ url: string }> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Fehler beim Erstellen des Links');
  }

  return json.data;
}
