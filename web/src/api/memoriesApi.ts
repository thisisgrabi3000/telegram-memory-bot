import type { Memory } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const AUTH_TOKEN_KEY = 'famories_auth_token';

/**
 * Returns auth headers with Bearer token if available.
 */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

interface ApiResponse<T> {
  success: boolean;
  count?: number;
  data: T;
  error?: string;
}

interface RawMemory extends Omit<Memory, 'photos' | 'audios'> {
  photos: Array<{ id: number; url: string; filename: string }>;
  audios: Array<{ id: number; url: string; filename: string }>;
}

// Helper to transform URLs to absolute and ensure arrays
function transformMemoryUrls(memory: RawMemory): Memory {
  return {
    ...memory,
    people: memory.people || [], // Ensure people is always an array
    photos: memory.photos.map(photo => ({
      ...photo,
      url: photo.url.startsWith('http') ? photo.url : `${API_BASE_URL}${photo.url}`,
    })),
    audios: (memory.audios || []).map(audio => ({
      ...audio,
      url: audio.url.startsWith('http') ? audio.url : `${API_BASE_URL}${audio.url}`,
    })),
  };
}

export async function fetchMemories(): Promise<Memory[]> {
  const response = await fetch(`${API_BASE_URL}/api/memories`, {
    headers: authHeaders(),
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
    headers: authHeaders(),
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
    headers: authHeaders(),
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
    headers: authHeaders({ 'Content-Type': 'application/json' }),
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
    headers: authHeaders({ 'Content-Type': 'application/json' }),
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
}

export async function createMemory(input: CreateMemoryInput): Promise<Memory> {
  const response = await fetch(`${API_BASE_URL}/api/memories`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
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
    headers: authHeaders(),
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

export async function searchMemories(query: string): Promise<Memory[]> {
  const response = await fetch(`${API_BASE_URL}/api/memories?search=${encodeURIComponent(query)}`, {
    headers: authHeaders(),
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
