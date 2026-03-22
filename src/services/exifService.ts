import fs from 'fs';
import ExifReader from 'exifreader';

export interface ExifData {
  latitude: number | null;
  longitude: number | null;
  dateTaken: string | null; // YYYY-MM-DD format
  dateTimeTaken: Date | null;
}

/**
 * Extrahiert EXIF-Daten aus einem Bild.
 */
export async function extractExifData(filePath: string): Promise<ExifData> {
  try {
    const buffer = fs.readFileSync(filePath);
    const tags = ExifReader.load(buffer, { expanded: true });

    let latitude: number | null = null;
    let longitude: number | null = null;
    let dateTaken: string | null = null;
    let dateTimeTaken: Date | null = null;

    // GPS-Koordinaten extrahieren
    if (tags.gps) {
      if (tags.gps.Latitude !== undefined && tags.gps.Longitude !== undefined) {
        latitude = tags.gps.Latitude;
        longitude = tags.gps.Longitude;
      }
    }

    // Aufnahmedatum extrahieren (verschiedene mögliche Felder)
    const dateFields = [
      tags.exif?.DateTimeOriginal,
      tags.exif?.DateTimeDigitized,
      tags.exif?.DateTime,
    ];

    for (const field of dateFields) {
      if (field?.description) {
        // EXIF-Datum Format: "YYYY:MM:DD HH:MM:SS"
        const dateStr = field.description;
        const parsed = parseExifDate(dateStr);
        if (parsed) {
          dateTimeTaken = parsed;
          dateTaken = parsed.toISOString().split('T')[0];
          break;
        }
      }
    }

    return { latitude, longitude, dateTaken, dateTimeTaken };
  } catch (error) {
    console.error('EXIF-Extraktion fehlgeschlagen:', error);
    return { latitude: null, longitude: null, dateTaken: null, dateTimeTaken: null };
  }
}

/**
 * Parst ein EXIF-Datumsformat zu einem Date-Objekt.
 * EXIF Format: "YYYY:MM:DD HH:MM:SS"
 */
function parseExifDate(dateStr: string): Date | null {
  try {
    // "2024:03:21 14:30:00" -> "2024-03-21T14:30:00"
    const normalized = dateStr
      .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
      .replace(' ', 'T');

    const date = new Date(normalized);

    // Prüfe ob gültiges Datum
    if (isNaN(date.getTime())) {
      return null;
    }

    return date;
  } catch {
    return null;
  }
}

/**
 * Prüft ob eine Datei EXIF-Daten haben könnte (basierend auf Extension).
 */
export function canHaveExif(filePath: string): boolean {
  const ext = filePath.toLowerCase();
  return ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.tiff') || ext.endsWith('.heic');
}
