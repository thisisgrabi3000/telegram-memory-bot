// web/scripts/generate-icons.mjs
// Run from the web/ directory: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/icon.svg');
const svgBuffer = readFileSync(svgPath);

const sizes = [
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

for (const { size, name } of sizes) {
  const outPath = resolve(__dirname, '../public', name);
  await sharp(svgBuffer).resize(size, size).png().toFile(outPath);
  console.log(`✓ Generated ${name} (${size}×${size})`);
}
