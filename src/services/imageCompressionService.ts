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
  if (!fs.existsSync(filePath)) {
    throw new Error(`compressImage: file not found: ${filePath}`);
  }
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    throw new Error(`compressImage: file is empty: ${filePath}`);
  }

  if (stats.size < SKIP_THRESHOLD_BYTES) {
    return path.basename(filePath);
  }

  const dir = path.dirname(filePath);
  const extOrig = path.extname(filePath);          // original case, e.g. '.JPG'
  const base = path.basename(filePath, extOrig);   // strips correctly: 'foo'
  const outputFilename = `${base}.jpg`;            // always lowercase .jpg output
  const outputPath = path.join(dir, outputFilename);

  // Write to a temp path first — sharp cannot read and write the same file
  const tempPath = path.join(dir, `${base}.tmp.jpg`);

  try {
    await sharp(filePath)
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, progressive: true })
      .toFile(tempPath);
  } catch (err) {
    try { fs.unlinkSync(tempPath); } catch {}
    throw err;
  }

  // Atomically replace: rename temp → output, then delete original if extension changed
  fs.renameSync(tempPath, outputPath);
  if (outputPath.toLowerCase() !== filePath.toLowerCase()) {
    fs.unlinkSync(filePath);
  }

  return outputFilename;
}
