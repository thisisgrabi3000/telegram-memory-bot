/**
 * Konfiguration der Kindernamen.
 * Wird verwendet, um Namen in Transkripten korrekt zuzuordnen.
 */
export const CHILDREN = [
  {
    name: 'Junis',
    aliases: ['juno', 'junis', 'jonas', 'younes'],
  },
  {
    name: 'Noah',
    aliases: ['fieti', 'noah'],
  },
];

/**
 * Findet den korrekten Namen basierend auf einem erkannten Namen/Spitznamen.
 */
export function resolveChildName(detected: string | null): string | null {
  if (!detected) return null;

  const lower = detected.toLowerCase().trim();

  for (const child of CHILDREN) {
    if (child.aliases.some(alias => lower.includes(alias))) {
      return child.name;
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
