export const CATEGORIES = [
  'Gesundheit',
  'Schule',
  'Familie',
  'Freunde',
  'Freizeit',
  'Sport',
  'Emotion',
  'Entwicklung',
  'Besonderes',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface FamilyMember {
  name: string;
  aliases: string[];
  color: { bg: string; text: string; activeBg: string };
}

export const FAMILY_MEMBERS: FamilyMember[] = [
  {
    name: 'Junis',
    aliases: ['Juno', 'Junis', 'Jonas', 'Younes'],
    color: { bg: '#dbeafe', text: '#1e40af', activeBg: '#2563eb' }, // Tiefes Blau
  },
  {
    name: 'Noah',
    aliases: ['Noah'],
    color: { bg: '#e6ebde', text: '#425532', activeBg: '#6b8a4f' }, // Salbeigrün
  },
  {
    name: 'Mama',
    aliases: ['Mama', 'Leni', 'Lensi'],
    color: { bg: '#fce4d8', text: '#902517', activeBg: '#e85325' }, // Terrakotta
  },
  {
    name: 'Papa',
    aliases: ['Papa', 'Grabi', 'Michel'],
    color: { bg: '#e0e7ff', text: '#3730a3', activeBg: '#4f46e5' }, // Indigo
  },
  {
    name: 'Frank',
    aliases: ['Frank', 'Opa Frank'],
    color: { bg: '#f9ecd0', text: '#a34a17', activeBg: '#dc8620' }, // Ocker
  },
  {
    name: 'Eva',
    aliases: ['Eva', 'Oma Eva', 'Oma'],
    color: { bg: '#ede9fe', text: '#5b21b6', activeBg: '#7c3aed' }, // Violett
  },
  {
    name: 'Moma',
    aliases: ['Moma'],
    color: { bg: '#f3e8e1', text: '#8b4437', activeBg: '#b5694e' }, // Rostbraun
  },
  {
    name: 'Opa Peter',
    aliases: ['Opa Peter', 'Peter'],
    color: { bg: '#ced9c0', text: '#37452b', activeBg: '#536d3c' }, // Tiefes Grün
  },
  {
    name: 'Bowie',
    aliases: ['Bowie'],
    color: { bg: '#e9ddcc', text: '#614536', activeBg: '#926548' }, // Warmes Braun
  },
];

export type ChildName = string;

export interface Photo {
  id: number;
  url: string;
  filename: string;
}

export interface Audio {
  id: number;
  url: string;
  filename: string;
}

export interface Video {
  id: number;
  url: string;
  filename: string;
}

export interface Memory {
  id: number;
  created_at: string;
  source_date: string;
  child_name: string | null;
  cleaned_summary: string;
  categories: Category[];
  tags: string[];
  people: string[]; // Alle erwähnten Familienmitglieder
  importance_score: number;
  photos: Photo[];
  audios: Audio[];
  videos: Video[];
  recorded_by: string | null;
  location: string | null;
  is_favorite: boolean;
  latitude: number | null;
  longitude: number | null;
}

export type ViewMode = 'cards' | 'timeline';

export const LOCATIONS = [
  { name: 'Zuhause', emoji: '🏠' },
  { name: 'Oma & Opa', emoji: '👵' },
  { name: 'Kita', emoji: '🏫' },
  { name: 'Spielplatz', emoji: '🛝' },
  { name: 'Urlaub', emoji: '✈️' },
  { name: 'Unterwegs', emoji: '🚗' },
];
