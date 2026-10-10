// Derives the runtime world PNGs in public/assets/world/initial-turn1/ from the
// supplied provisional source images. Deterministic and mechanical: exterior
// checkerboard removal, trimming to the visible bounds, and area-average
// resizing. No generative editing. See README.md ("World asset derivation").
//
//   node scripts/deriveWorldAssets.mjs <source-dir> [output-dir]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { decodePng, encodePng } from './pngCodec.mjs';
import {
  crop,
  opaqueBounds,
  peelGrayRim,
  removeExteriorBackground,
  removeSpeckles,
  resizeArea,
} from './worldAssetPixels.mjs';

// `maxWidth`/`maxHeight` cap the output size (only ever shrinking); the runtime
// scale in worldAssets.ts is relative to these output dimensions.
// Detached groups smaller than this many pixels are checkerboard residue.
const SPECKLE_AREA = 200;

export const DERIVATIONS = [
  {
    source: 'island_base_with_cave_tree.png',
    output: 'island-base.png',
    removeBackground: true,
    padding: 0,
  },
  {
    source: 'shelter_512_transparent.png',
    output: 'shelter-stage1.png',
    removeBackground: false,
    padding: 0,
  },
  {
    source: 'fantasy_creature_provisional.png',
    output: 'animal-stage1.png',
    removeBackground: true,
    padding: 2,
    maxWidth: 512,
  },
  {
    source: 'campfire_provisional.png',
    output: 'fire-stage1.png',
    removeBackground: false,
    padding: 0,
    maxWidth: 256,
  },
];

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg) {
  console.error('usage: node scripts/deriveWorldAssets.mjs <source-dir> [output-dir]');
  process.exit(1);
}
const sourceDir = resolve(sourceArg);
const outputDir = resolve(outputArg ?? 'public/assets/world/initial-turn1');
mkdirSync(outputDir, { recursive: true });

for (const step of DERIVATIONS) {
  const sourceBytes = readFileSync(join(sourceDir, step.source));
  let image = decodePng(sourceBytes);
  if (step.removeBackground) image = removeSpeckles(peelGrayRim(removeExteriorBackground(image)), SPECKLE_AREA);
  image = crop(image, opaqueBounds(image, step.padding));
  const scale = Math.min(
    1,
    step.maxWidth ? step.maxWidth / image.width : 1,
    step.maxHeight ? step.maxHeight / image.height : 1,
  );
  if (scale < 1) {
    image = resizeArea(image, Math.round(image.width * scale), Math.round(image.height * scale));
  }
  const bytes = encodePng(image);
  writeFileSync(join(outputDir, step.output), bytes);
  const sha = createHash('sha256').update(sourceBytes).digest('hex').slice(0, 12);
  console.log(
    `${basename(step.source)} (sha256 ${sha}…) -> ${step.output}: ${image.width}x${image.height}, ${bytes.length} bytes`,
  );
}
