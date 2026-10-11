// Derives the Turn 2 hut runtime PNG from the approved hut source. Deterministic
// and mechanical: the exterior-connected white backdrop is made transparent,
// the result is trimmed to its visible bounds and area-average resized to
// HUT_MAX_WIDTH. No redrawing, regeneration or other editing. See README.md
// ("Turn 2 asset derivation").
//
//   node scripts/deriveHutAsset.mjs <decoded-source.png> [output.png]
//
// The input is the lossless PNG decode of art-source/turn2/hut-approved-source.jpg
// (macOS: `sips -s format png <jpg> --out <png>`); both hashes are recorded in
// the README and checked by tests.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './pngCodec.mjs';
import {
  crop,
  opaqueBounds,
  removeExteriorBackground,
  resizeArea,
  WHITE_BACKGROUND_RULE,
} from './worldAssetPixels.mjs';

// The runtime PNG is shrunk to at most this width (it is never enlarged).
export const HUT_MAX_WIDTH = 512;

export function deriveHutImage(source) {
  const cutOut = removeExteriorBackground(source, WHITE_BACKGROUND_RULE);
  const image = crop(cutOut, opaqueBounds(cutOut, 0));
  if (image.width <= HUT_MAX_WIDTH) return image;
  return resizeArea(image, HUT_MAX_WIDTH, Math.round((image.height * HUT_MAX_WIDTH) / image.width));
}

export function deriveHutPng(sourceBytes) {
  return encodePng(deriveHutImage(decodePng(sourceBytes)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [sourceArg, outputArg] = process.argv.slice(2);
  if (!sourceArg) {
    console.error('usage: node scripts/deriveHutAsset.mjs <decoded-source.png> [output.png]');
    process.exit(1);
  }
  const output = resolve(outputArg ?? 'public/assets/world/turn2/hut-stage2.png');
  const bytes = deriveHutPng(readFileSync(resolve(sourceArg)));
  writeFileSync(output, bytes);
  console.log(`${output}: ${bytes.length} bytes`);
}
