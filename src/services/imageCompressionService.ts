import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 82;
const SKIP_THRESHOLD_BYTES = 300 * 1024; // 300 KB

/**
 * Compresses an image file in-place.
 * - Skips files already smaller than SKIP_THRESHOLD_BYTES
 * - Resizes so the longest side is at most MAX_DIMENSION px (preserves aspect ratio)
 * - Converts to progressive JPEG at JPEG_QUALITY
 * - Auto-rotates based on EXIF orientation tag (fixes sideways iPhone photos)
 * - Returns the (possibly changed) filename — e.g. "foo.heic" → "foo.jpg"
 *
 * IMPORTANT: Extract EXIF data (GPS, date) BEFORE calling this function,
 * because compression strips all EXIF metadata.
 */
export async function compressImage(filePath: string): Promise<string> {
  const stats = fs.statSync(filePath);
  if (stats.size < SKIP_THRESHOLD_BYTES) {
    return path.basename(filePath);
  }

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, ext);
  const outputFilename = `${base}.jpg`;
  const outputPath = path.join(dir, outputFilename);

  // Write to a temp path first — sharp cannot read and write the same file
  const tempPath = path.join(dir, `${base}.tmp.jpg`);

  await sharp(filePath)
    .rotate()
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, progressive: true })
    .toFile(tempPath);

  // Atomically replace: rename temp → output, then delete original if extension changed
  fs.renameSync(tempPath, outputPath);
  if (outputPath !== filePath) {
    fs.unlinkSync(filePath);
  }

  return outputFilename;
}
