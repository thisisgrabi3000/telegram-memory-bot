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
  audios: Array<{ id: number; url: string; filename: string }>;
  videos: Array<{ id: number; url: string; filename: string }>;
}

// Helper to transform URLs to absolute and ensure arrays
function transformMemoryUrls(memory: RawMemory): Memory {
  const toAbsolute = (url: string) => url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
  return {
    ...memory,
    people: memory.people || [],
    photos: memory.photos.map(p => ({ ...p, url: toAbsolute(p.url) })),
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
