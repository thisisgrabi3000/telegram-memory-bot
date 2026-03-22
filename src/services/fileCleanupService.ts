import fs from 'fs';
import path from 'path';

/**
 * Service für das Aufräumen von temporären Dateien.
 */
export const fileCleanupService = {
  /**
   * Löscht eine Datei mit Retry-Logik.
   */
  async deleteFile(filePath: string, retries: number = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        fs.unlinkSync(filePath);
        return true;
      } catch (error) {
        if (attempt === retries) {
          console.error(`Datei löschen fehlgeschlagen nach ${retries} Versuchen:`, filePath, error);
          return false;
        }
        // Warte kurz vor Retry
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
    }
    return false;
  },

  /**
   * Räumt alte Dateien in einem Verzeichnis auf.
   * @param directory - Verzeichnis zum Aufräumen
   * @param maxAgeMs - Maximales Alter in Millisekunden
   * @returns Anzahl gelöschter Dateien
   */
  async cleanupOldFiles(directory: string, maxAgeMs: number): Promise<number> {
    const absolutePath = path.resolve(directory);

    if (!fs.existsSync(absolutePath)) {
      return 0;
    }

    const now = Date.now();
    let deletedCount = 0;

    try {
      const files = fs.readdirSync(absolutePath);

      for (const file of files) {
        const filePath = path.join(absolutePath, file);

        try {
          const stats = fs.statSync(filePath);

          // Überspringe Verzeichnisse
          if (stats.isDirectory()) continue;

          // Prüfe Alter
          const age = now - stats.mtimeMs;
          if (age > maxAgeMs) {
            const deleted = await this.deleteFile(filePath);
            if (deleted) {
              deletedCount++;
              console.log(`🗑️ Alte Datei gelöscht: ${file} (${Math.round(age / 1000 / 60)} Min alt)`);
            }
          }
        } catch (fileError) {
          console.error(`Fehler bei Datei ${file}:`, fileError);
        }
      }
    } catch (error) {
      console.error(`Cleanup-Fehler in ${directory}:`, error);
    }

    return deletedCount;
  },

  /**
   * Startet periodisches Cleanup.
   * @param intervalMs - Intervall in Millisekunden
   */
  startPeriodicCleanup(intervalMs: number = 60 * 60 * 1000): NodeJS.Timeout {
    const TWO_HOURS = 2 * 60 * 60 * 1000;

    const cleanup = async () => {
      console.log('🧹 Starte periodisches Cleanup...');

      // Temp-Verzeichnis: Dateien älter als 2 Stunden
      const tempDeleted = await this.cleanupOldFiles('./temp', TWO_HOURS);

      if (tempDeleted > 0) {
        console.log(`🧹 Cleanup abgeschlossen: ${tempDeleted} Temp-Dateien gelöscht`);
      }
    };

    // Einmal beim Start ausführen
    cleanup();

    // Dann periodisch
    return setInterval(cleanup, intervalMs);
  },

  /**
   * Stoppt das periodische Cleanup.
   */
  stopPeriodicCleanup(intervalId: NodeJS.Timeout): void {
    clearInterval(intervalId);
    console.log('🧹 Periodisches Cleanup gestoppt');
  },
};
