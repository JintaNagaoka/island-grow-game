import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPng } from '../testSupport/png';
import {
  TURN3_ACTION_ASSET_LIST,
  TURN3_ASSET_LIST,
  TURN3_WORLD_ASSET_LIST,
  type Turn3Asset,
} from './turn3Assets';
import { HUMAN_SPRITE_SCALE } from './humanAssets';

const ROOT = new URL('../../', import.meta.url);
const bytesFor = (asset: Turn3Asset): Uint8Array =>
  readFileSync(new URL(`public${asset.dir}${asset.filename}`, ROOT));

const alphaCoverage = (pixels: Uint8Array): number => {
  let visible = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) visible += 1;
  }
  return visible / (pixels.length / 4);
};

const countColor = (
  pixels: Uint8Array,
  predicate: (red: number, green: number, blue: number, alpha: number) => boolean,
): number => {
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (predicate(pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3])) count += 1;
  }
  return count;
};

const visibleBounds = (pixels: Uint8Array, width: number, height: number) => {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] < 3) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, right, top, bottom };
};

describe('Turn 3 generated PNG quality gates', () => {
  it('contains exactly the required runtime filenames', () => {
    expect(TURN3_WORLD_ASSET_LIST.map((asset) => asset.filename).sort()).toEqual([
      'cave-practical.png',
      'dry-riverbed.png',
      'feed-trough.png',
      'fence.png',
      'hut-second.png',
      'livestock-child.png',
      'livestock-parent.png',
      'mature-farm.png',
      'stone-workshop.png',
      'water-trough.png',
    ]);
    expect(TURN3_ACTION_ASSET_LIST.map((asset) => asset.filename).sort()).toEqual([
      'build-1.png', 'build-2.png', 'build-3.png',
      'carry-1.png', 'carry-2.png', 'carry-3.png',
      'gather-1.png', 'gather-2.png', 'gather-3.png',
    ]);
  });

  it.each(TURN3_ASSET_LIST)('$filename is 512x512 8-bit RGBA with real transparency and no opaque backdrop', (asset) => {
    const png = readPng(bytesFor(asset));
    expect(png).toMatchObject({ width: 512, height: 512, bitDepth: 8, colorType: 6, minAlpha: 0 });
    // Image-generation exports top out at 253/254 in a few anti-aliased
    // cut-outs; they are visually opaque and need not be destructively clamped.
    expect(png.maxAlpha).toBeGreaterThanOrEqual(240);
    const coverage = alphaCoverage(png.pixels);
    expect(coverage).toBeGreaterThan(0.005);
    expect(coverage).toBeLessThan(0.85);
    const cornerAlpha = [
      png.pixels[3],
      png.pixels[(png.width - 1) * 4 + 3],
      png.pixels[((png.height - 1) * png.width) * 4 + 3],
      png.pixels[(png.width * png.height - 1) * 4 + 3],
    ];
    expect(cornerAlpha).toEqual([0, 0, 0, 0]);
  });

  it.each(TURN3_ACTION_ASSET_LIST)('$filename retains cream-yellow humans and dark readable outlines', (asset) => {
    const { pixels } = readPng(bytesFor(asset));
    const cream = countColor(pixels, (r, g, b, a) => a >= 180 && r >= 200 && g >= 175 && b <= 170);
    const outline = countColor(pixels, (r, g, b, a) => a >= 180 && r <= 70 && g <= 70 && b <= 70);
    expect(cream).toBeGreaterThan(100);
    expect(outline).toBeGreaterThan(100);
  });

  it.each(TURN3_ACTION_ASSET_LIST)(
    '$filename uses the approved resident scale and stays near the 40px visual-reference height',
    (asset) => {
      const png = readPng(bytesFor(asset));
      const bounds = visibleBounds(png.pixels, png.width, png.height);
      const displayHeight = (bounds.bottom - bounds.top + 1) * asset.baseScale;
      expect(asset.baseScale).toBe(HUMAN_SPRITE_SCALE);
      expect(displayHeight).toBeGreaterThanOrEqual(38);
      expect(displayHeight).toBeLessThanOrEqual(46);
    },
  );

  it.each(TURN3_ASSET_LIST)('$filename is centered on the shared ground anchor', (asset) => {
    const png = readPng(bytesFor(asset));
    const bounds = visibleBounds(png.pixels, png.width, png.height);
    expect(Math.abs((bounds.left + bounds.right) / 2 - (asset.groundAnchor.x - 0.5))).toBeLessThanOrEqual(1);
    expect(bounds.bottom).toBeGreaterThanOrEqual(asset.groundAnchor.y - 2);
    expect(bounds.bottom).toBeLessThan(asset.groundAnchor.y);
  });

  it.each(TURN3_WORLD_ASSET_LIST.filter((asset) => asset.filename.startsWith('livestock-')))(
    '$filename retains a white animal body and dark outline',
    (asset) => {
      const { pixels } = readPng(bytesFor(asset));
      const white = countColor(pixels, (r, g, b, a) => a >= 180 && r >= 205 && g >= 205 && b >= 195);
      const outline = countColor(pixels, (r, g, b, a) => a >= 180 && r <= 75 && g <= 75 && b <= 75);
      expect(white).toBeGreaterThan(100);
      expect(outline).toBeGreaterThan(100);
    },
  );
});
