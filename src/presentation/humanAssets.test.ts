import { describe, expect, it } from 'vitest';
import {
  HUMAN_ASSETS,
  HUMAN_ASSET_LIST,
  HUMAN_POSES,
  selectHumanAsset,
} from './humanAssets';

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
