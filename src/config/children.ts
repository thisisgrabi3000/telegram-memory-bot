/**
 * Konfiguration der Kindernamen.
 * Wird verwendet, um Namen in Transkripten korrekt zuzuordnen.
 */
export const CHILDREN = [
  {
    name: 'Junis',
    aliases: ['juno', 'junis', 'jonas', 'younes'],
    emoji: '🧒',
  },
  {
    name: 'Noah',
    aliases: ['fieti', 'noah'],
    emoji: '👦',
  },
];

/**
 * Alle Familienmitglieder für die People-Erkennung.
 */
export const FAMILY_MEMBERS = [
  // Kinder
  { name: 'Junis', aliases: ['juno', 'junis', 'jonas', 'younes'] },
  { name: 'Noah', aliases: ['fieti', 'noah'] },
  // Eltern
  { name: 'Mama', aliases: ['mama', 'leni', 'lensi'] },
  { name: 'Papa', aliases: ['papa', 'grabi', 'michel'] },
  // Großeltern
  { name: 'Opa Frank', aliases: ['frank', 'opa frank', 'opa'] },
  { name: 'Oma Eva', aliases: ['eva', 'oma eva', 'oma'] },
  { name: 'Moma', aliases: ['moma'] },
  { name: 'Opa Peter', aliases: ['opa peter', 'peter'] },
  // Haustiere
  { name: 'Bowie', aliases: ['bowie'] },
];

/**
 * Konfiguration der Orte.
 * Wird für manuelle Ortszuweisung verwendet.
 */
export const LOCATIONS = [
  { name: 'Zuhause', emoji: '🏠' },
  { name: 'Oma & Opa', emoji: '👵' },
  { name: 'Kita', emoji: '🏫' },
  { name: 'Spielplatz', emoji: '🛝' },
  { name: 'Urlaub', emoji: '✈️' },
  { name: 'Unterwegs', emoji: '🚗' },
];

/**
 * Findet den korrekten Namen basierend auf einem erkannten Namen/Spitznamen.
 * Durchsucht zuerst Kinder, dann alle Familienmitglieder.
 */
export function resolveChildName(detected: string | null): string | null {
  if (!detected) return null;

  const lower = detected.toLowerCase().trim();

  // Zuerst in Kindern suchen
  for (const child of CHILDREN) {
    if (child.aliases.some(alias => lower.includes(alias))) {
      return child.name;
    }
  }

  // Dann in allen Familienmitgliedern suchen
  for (const member of FAMILY_MEMBERS) {
    if (member.aliases.some(alias => lower.includes(alias))) {
      return member.name;
    }
  }

  // Name nicht erkannt - Original zurückgeben
  return detected;
}

/**
 * Gibt alle bekannten Namen und Spitznamen als String zurück (für Prompts).
 */
export function getChildrenInfo(): string {
  return CHILDREN.map(c => `${c.name} (auch: ${c.aliases.join(', ')})`).join('\n');
}
