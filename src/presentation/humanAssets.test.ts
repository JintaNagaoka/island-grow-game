import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPng } from '../testSupport/png';
import {
  HUMAN_ASSETS,
  HUMAN_ASSET_LIST,
  HUMAN_FRAME_SIZE,
  HUMAN_POSES,
  humanAssetOrigin,
  selectHumanAsset,
} from './humanAssets';

const HUMAN_DIR = new URL('../../public/assets/human/', import.meta.url);

// Pixels whose blue clearly exceeds red: the light-blue cold treatment. The
// cream body, black outline and orange notice marks never qualify.
function countBluePixels(filename: string): number {
  const { pixels } = readPng(readFileSync(new URL(filename, HUMAN_DIR)));
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 200 && pixels[i + 2] - pixels[i] > 60) count += 1;
  }
  return count;
}

describe('human asset metadata', () => {
  it('maps every pose and isCold value to the approved PNG', () => {
    for (const pose of HUMAN_POSES) {
      expect(selectHumanAsset(pose, false)).toBe(HUMAN_ASSETS[pose].normal);
      expect(selectHumanAsset(pose, true)).toBe(HUMAN_ASSETS[pose].isCold);
      expect(HUMAN_ASSETS[pose].normal.filename).toBe(`${pose}.png`);
      expect(HUMAN_ASSETS[pose].isCold.filename).toBe(`${pose}_isCold.png`);
    }
    expect(HUMAN_ASSET_LIST).toHaveLength(14);
  });

  it('ships every registered PNG as a 512x512 transparent RGBA canvas', () => {
    for (const metadata of HUMAN_ASSET_LIST) {
      const png = readPng(readFileSync(new URL(metadata.filename, HUMAN_DIR)));
      expect([png.width, png.height]).toEqual([HUMAN_FRAME_SIZE, HUMAN_FRAME_SIZE]);
      expect([png.bitDepth, png.colorType]).toEqual([8, 6]);
      expect(png.minAlpha).toBe(0);
    }
  });

  it('derives sprite origins from the ground anchors', () => {
    const origin = humanAssetOrigin(HUMAN_ASSETS.warm.isCold);
    expect(origin.x).toBeCloseTo(220 / 512, 10);
    expect(origin.y).toBeCloseTo(449 / 512, 10);
  });

  it('shows the cold treatment as blue added to the art: isCold PNGs have it, normal PNGs never do', () => {
    // Evidence for coldOverlay.ts: the only thing an isCold PNG adds over its
    // normal PNG is light-blue pixels (head tint and shiver marks).
    for (const pose of HUMAN_POSES) {
      expect(countBluePixels(HUMAN_ASSETS[pose].normal.filename)).toBe(0);
      expect(countBluePixels(HUMAN_ASSETS[pose].isCold.filename)).toBeGreaterThan(300);
    }
  });

  it('records the approved per-asset ground anchors', () => {
    expect(
      Object.fromEntries(
        HUMAN_ASSET_LIST.map((metadata) => [
          metadata.textureKey,
          [metadata.groundAnchorX, metadata.groundAnchorY],
        ]),
      ),
    ).toEqual({
      idle: [255, 479],
      idle_isCold: [254, 481],
      notice: [248, 484],
      notice_isCold: [248, 485],
      rise: [206, 429],
      rise_isCold: [206, 430],
      walk1: [204, 479],
      walk1_isCold: [205, 480],
      walk2: [356, 476],
      walk2_isCold: [354, 476],
      warm: [220, 448],
      warm_isCold: [220, 449],
      cold: [251, 462],
      cold_isCold: [250, 462],
    });
  });
});
