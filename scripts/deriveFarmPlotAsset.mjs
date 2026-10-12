// Derives the Turn 2 standalone farm-plot runtime PNG from the approved four-plant
// plot source. Deterministic and mechanical, the same approach as the hut: the
// exterior-connected near-white backdrop is made transparent, the result is
// trimmed to its visible bounds and area-average resized to FARM_PLOT_MAX_WIDTH.
// No redrawing, regeneration, recolouring or any other edit of the artwork. See
// README.md ("Turn 2 asset derivation").
//
//   node scripts/deriveFarmPlotAsset.mjs <decoded-source.png> [output.png]
//
// The input is the lossless PNG decode of
// art-source/turn2/farm-plot-four-plants-source.jpg (macOS:
// `sips -s format png <jpg> --out <png>`); both hashes are recorded in the README
// and checked by tests.
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
export const FARM_PLOT_MAX_WIDTH = 448;

export function deriveFarmPlotImage(source) {
  const cutOut = removeExteriorBackground(source, WHITE_BACKGROUND_RULE);
  const image = crop(cutOut, opaqueBounds(cutOut, 0));
  if (image.width <= FARM_PLOT_MAX_WIDTH) return image;
  return resizeArea(image, FARM_PLOT_MAX_WIDTH, Math.round((image.height * FARM_PLOT_MAX_WIDTH) / image.width));
}

export function deriveFarmPlotPng(sourceBytes) {
  return encodePng(deriveFarmPlotImage(decodePng(sourceBytes)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [sourceArg, outputArg] = process.argv.slice(2);
  if (!sourceArg) {
    console.error('usage: node scripts/deriveFarmPlotAsset.mjs <decoded-source.png> [output.png]');
    process.exit(1);
  }
  const output = resolve(outputArg ?? 'public/assets/world/turn2/farm-plot-four-plants.png');
  const bytes = deriveFarmPlotPng(readFileSync(resolve(sourceArg)));
  writeFileSync(output, bytes);
  console.log(`${output}: ${bytes.length} bytes`);
}
