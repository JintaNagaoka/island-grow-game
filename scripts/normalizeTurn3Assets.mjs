import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng } from './pngCodec.mjs';
import { crop, opaqueBounds, resizeArea } from './worldAssetPixels.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  ...[
    'mature-farm.png',
    'hut-second.png',
    'stone-workshop.png',
    'cave-practical.png',
    'dry-riverbed.png',
    'livestock-parent.png',
    'livestock-child.png',
    'fence.png',
    'feed-trough.png',
    'water-trough.png',
  ].map((filename) => `public/assets/world/turn3/${filename}`),
  ...['gather', 'build', 'carry'].flatMap((action) =>
    [1, 2, 3].map((frame) => `public/assets/human/actions/${action}-${frame}.png`),
  ),
];

const CANVAS = 512;
const GROUND_Y = 480;
const MAX_ART_SIZE = 440;
const MIN_ALPHA = 72;

function removeGenerationHalo(image) {
  const pixels = new Uint8Array(image.pixels);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3];
    if (alpha < MIN_ALPHA) {
      pixels.set([0, 0, 0, 0], offset);
      continue;
    }
    // Generated cut-outs use a long low-alpha tail around otherwise crisp art.
    // Compress that tail while preserving the high-alpha painted edge.
    if (alpha < 224) pixels[offset + 3] = Math.round(((alpha - MIN_ALPHA) / (224 - MIN_ALPHA)) * 224);
  }
  return { ...image, pixels };
}

function placeAtCommonGround(image) {
  const pixels = new Uint8Array(CANVAS * CANVAS * 4);
  const left = Math.floor((CANVAS - image.width) / 2);
  const top = GROUND_Y - image.height;
  if (left < 0 || top < 0 || top + image.height > CANVAS) {
    throw new RangeError(`normalized image does not fit: ${image.width}x${image.height}`);
  }
  for (let y = 0; y < image.height; y += 1) {
    pixels.set(
      image.pixels.subarray(y * image.width * 4, (y + 1) * image.width * 4),
      ((top + y) * CANVAS + left) * 4,
    );
  }
  return { width: CANVAS, height: CANVAS, pixels };
}

function raisePeakAlpha(image) {
  let peak = 0;
  for (let offset = 3; offset < image.pixels.length; offset += 4) {
    peak = Math.max(peak, image.pixels[offset]);
  }
  if (peak === 0 || peak === 255) return image;

  const pixels = new Uint8Array(image.pixels);
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] > 0) {
      pixels[offset] = Math.round((pixels[offset] * 255) / peak);
    }
  }
  return { ...image, pixels };
}

function normalize(path) {
  const url = new URL(path, ROOT);
  const source = removeGenerationHalo(decodePng(readFileSync(url)));
  const clipped = crop(source, opaqueBounds(source, 3));
  const scale = Math.min(MAX_ART_SIZE / clipped.width, MAX_ART_SIZE / clipped.height, 1);
  const width = Math.max(1, Math.round(clipped.width * scale));
  const height = Math.max(1, Math.round(clipped.height * scale));
  const resized = raisePeakAlpha(resizeArea(clipped, width, height));
  const finalCrop = crop(resized, opaqueBounds(resized));
  writeFileSync(url, encodePng(placeAtCommonGround(finalCrop)));
}

for (const path of FILES) normalize(path);

const animation = {
  status: 'provisional',
  frameSize: { width: 512, height: 512 },
  origin: { x: 0.5, y: 0.9375 },
  frameDurationMs: 180,
  cycleDurationMs: 540,
  repeat: true,
  direction: 'right',
  rootMotion: false,
  animations: ['gather', 'build', 'carry'].map((id) => ({
    id,
    sequence: [`${id}-1.png`, `${id}-2.png`, `${id}-3.png`],
  })),
};
writeFileSync(
  new URL('public/assets/human/actions/animation.json', ROOT),
  `${JSON.stringify(animation, null, 2)}\n`,
);
