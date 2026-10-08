import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPng } from '../testSupport/png';
import {
  HUMAN_WALK_ASSET_LIST,
  HUMAN_WALK_DIRECTIONS,
  HUMAN_WALK_FRAME_SIZE,
  HUMAN_WALK_ORIGIN,
  HUMAN_WALK_POSES,
  humanWalkTextureKey,
  selectHumanWalkAsset,
  selectHumanWalkPresentation,
} from './humanAssets';
import {
  HUMAN_WALK_CYCLE_DURATION_MS,
  HUMAN_WALK_FRAME_DURATION_MS,
  HUMAN_WALK_SEQUENCE,
} from './humanWalk';

const WALK_DIR = new URL('../../public/assets/human/walk/', import.meta.url);

// SHA-256 of the 12 canonical PNGs from human-walk-4dir-approved-v1
// (validation.json). The files must stay byte-identical to the approved art.
const APPROVED_SHA256: Readonly<Record<string, string>> = {
  'human-walk-down-stand.png': 'a857b941c71d283c63fdcdb086d0d6047e9f856864153bb38b5943c2907fbc75',
  'human-walk-down-step-a.png': '42e1a75e9a5c0bb63ca5acdd429d21fe0787ce37d3183190089b73d7a67f6f5c',
  'human-walk-down-step-b.png': '3159b52e03b1631cc0ff33b96f049e1007620b79ab5bd49f38c359406c980628',
  'human-walk-left-stand.png': '2846cd15d036741ecb38266c2f9b13ac6459c505cf505dc5ff9dbf6d38be730f',
  'human-walk-left-step-a.png': '5f5d701460896f046c835c8577f028882e1a072fd66f59e985c2ae607157b499',
  'human-walk-left-step-b.png': '32a1af27214fa98c9c0db413c0c3a562c57979cdd123df3d58c6e298ce8b385d',
  'human-walk-right-stand.png': 'baf464a1d72d200bb3dec7fe89f650c738ff625345481553f5e0ee887ddbdf98',
  'human-walk-right-step-a.png': 'f50abb1f04dd14fae310c14efd11e287e9e7f0d60c35229e5f14a6b6478ad467',
  'human-walk-right-step-b.png': 'cf3473c9e458b34db333eadd7d1da0a5e0e39c2971a9738eedaa7d1d9dc35940',
  'human-walk-up-stand.png': '94ca4008f93ff4cbd05e36534fe65c6948985a0301aee6b7c276c501611cd505',
  'human-walk-up-step-a.png': '2e3caf36f401fe0f247842034edb7ace87d1e6325cdf19499aaeeb426e867335',
  'human-walk-up-step-b.png': '20fefc8794186f2367909fae6ca66ed270117a9fdc2bb7d347a16f706057367f',
};

describe('approved four-direction walk assets', () => {
  it('registers exactly the 12 canonical frames, one texture per direction and pose', () => {
    expect(HUMAN_WALK_ASSET_LIST).toHaveLength(12);
    expect(new Set(HUMAN_WALK_ASSET_LIST.map((asset) => asset.textureKey)).size).toBe(12);
    expect(HUMAN_WALK_ASSET_LIST.map((asset) => asset.filename).sort()).toEqual(
      Object.keys(APPROVED_SHA256)
        .map((name) => `walk/${name}`)
        .sort(),
    );
    for (const direction of HUMAN_WALK_DIRECTIONS) {
      for (const pose of HUMAN_WALK_POSES) {
        const asset = selectHumanWalkAsset(direction, pose);
        expect(asset.textureKey).toBe(`human-walk-${direction}-${pose}`);
        expect(asset.textureKey).toBe(humanWalkTextureKey(direction, pose));
        expect(asset.filename).toBe(`walk/human-walk-${direction}-${pose}.png`);
      }
    }
  });

  it('ships every PNG byte-identical to the approved art, as 512x512 transparent RGBA', () => {
    for (const asset of HUMAN_WALK_ASSET_LIST) {
      const bytes = readFileSync(new URL(asset.filename.replace('walk/', ''), WALK_DIR));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        APPROVED_SHA256[asset.filename.replace('walk/', '')],
      );
      const png = readPng(bytes);
      expect([png.width, png.height]).toEqual([HUMAN_WALK_FRAME_SIZE, HUMAN_WALK_FRAME_SIZE]);
      expect([png.bitDepth, png.colorType]).toEqual([8, 6]);
      expect(png.minAlpha).toBe(0);
      expect(png.maxAlpha).toBe(255);
    }
  });

  it('matches the approved animation.json manifest', () => {
    const manifest = JSON.parse(readFileSync(new URL('animation.json', WALK_DIR), 'utf8'));
    expect(manifest.assetSet).toBe('human-walk-4dir-approved-v1');
    expect(manifest.status).toBe('approved');
    expect([manifest.frame.width, manifest.frame.height]).toEqual([HUMAN_WALK_FRAME_SIZE, HUMAN_WALK_FRAME_SIZE]);
    expect(manifest.rootMotion).toBe('external');
    expect(manifest.animation.sequence).toEqual([...HUMAN_WALK_SEQUENCE]);
    expect(manifest.animation.uniquePoses).toEqual([...HUMAN_WALK_POSES]);
    expect(manifest.animation.frameDurationMs).toBe(HUMAN_WALK_FRAME_DURATION_MS);
    expect(manifest.animation.cycleDurationMs).toBe(HUMAN_WALK_CYCLE_DURATION_MS);
    expect(manifest.animation.repeat).toBe(-1);
    expect(manifest.origin.x).toBe(HUMAN_WALK_ORIGIN.x);
    expect(manifest.origin.y).toBe(HUMAN_WALK_ORIGIN.y);
    expect(manifest.origin.pixel).toEqual([
      HUMAN_WALK_ORIGIN.x * HUMAN_WALK_FRAME_SIZE,
      HUMAN_WALK_ORIGIN.y * HUMAN_WALK_FRAME_SIZE,
    ]);
    expect(Object.keys(manifest.directions).sort()).toEqual([...HUMAN_WALK_DIRECTIONS].sort());
    expect(manifest.directions.up.movement).toEqual([0, -1]);
    expect(manifest.directions.down.movement).toEqual([0, 1]);
    expect(manifest.directions.left.movement).toEqual([-1, 0]);
    expect(manifest.directions.right.movement).toEqual([1, 0]);
    expect(manifest.coldPolicy.sourceOfTruth).toBe('WorldState.isCold');
  });
});

describe('walk cold presentation selection', () => {
  it('follows isCold alone, independent of direction and pose', () => {
    for (const direction of HUMAN_WALK_DIRECTIONS) {
      for (const pose of HUMAN_WALK_POSES) {
        const cold = selectHumanWalkPresentation(direction, pose, true);
        const warm = selectHumanWalkPresentation(direction, pose, false);
        expect(cold.coldOverlay).toBe(true);
        expect(warm.coldOverlay).toBe(false);
        expect(cold.asset).toBe(warm.asset);
        expect(cold.asset).toBe(selectHumanWalkAsset(direction, pose));
      }
    }
  });
});
