import { describe, expect, it } from 'vitest';
import { SliceGame } from '../game/sliceGame';
import { WAVE_DURATIONS_MS } from '../game/timing';
import {
  HUMAN_ASSETS,
  computeEnvironmentMotion,
  computeFireVisual,
  computeHumanPose,
} from './animation';
import { LAYOUT } from './layout';

function startedGame(): SliceGame {
  const game = new SliceGame();
  game.selectElement('fire');
  return game;
}

describe('human pose', () => {
  it('uses the approved cold asset without moving or shaking the body', () => {
    const game = new SliceGame();
    const before = computeHumanPose(game.snapshot());
    game.advance(2000);
    const after = computeHumanPose(game.snapshot());
    expect(before).toEqual({
      asset: HUMAN_ASSETS.cold,
      x: LAYOUT.humanStart.x,
      y: LAYOUT.humanStart.y,
      lift: 0,
      facing: 1,
    });
    expect(after).toEqual(before);
  });

  it('keeps the cold pose while the fire appears and during the notice beat', () => {
    const game = startedGame();
    game.advance(WAVE_DURATIONS_MS.fireAppears * 0.5);
    expect(computeHumanPose(game.snapshot()).asset).toBe(HUMAN_ASSETS.cold);
    game.advance(WAVE_DURATIONS_MS.fireAppears * 0.5);
    game.advance(WAVE_DURATIONS_MS.humanNoticesAndApproaches * 0.1);
    const noticing = computeHumanPose(game.snapshot());
    expect(noticing.asset).toBe(HUMAN_ASSETS.cold);
    expect(noticing.x).toBe(LAYOUT.humanStart.x);
    expect(noticing.lift).toBe(0);
  });

  it('uses approved crouch and side assets to stand before walking', () => {
    const game = startedGame();
    game.advance(
      WAVE_DURATIONS_MS.fireAppears + WAVE_DURATIONS_MS.humanNoticesAndApproaches * 0.3,
    );
    const rising = computeHumanPose(game.snapshot());
    expect(rising.asset).toBe(HUMAN_ASSETS.crouch);
    expect(rising.x).toBe(LAYOUT.humanStart.x);
    game.advance(WAVE_DURATIONS_MS.humanNoticesAndApproaches * 0.15);
    const standing = computeHumanPose(game.snapshot());
    expect(standing.asset).toBe(HUMAN_ASSETS.side);
    expect(standing.x).toBe(LAYOUT.humanStart.x);
  });

  it('uses only the single approved walk frame without mirroring or fake A/B poses', () => {
    const game = startedGame();
    game.advance(WAVE_DURATIONS_MS.fireAppears);
    const steps = 100;
    const dt = WAVE_DURATIONS_MS.humanNoticesAndApproaches / steps;
    const walkingAssets = new Set<string>();
    const facings = new Set<number>();
    const lifts = new Set<number>();
    let previousSmoothX = -Infinity;
    for (let i = 0; i < steps - 1; i += 1) {
      game.advance(dt);
      const pose = computeHumanPose(game.snapshot());
      if ((game.snapshot().activeWave?.progress ?? 0) >= 0.52) {
        walkingAssets.add(pose.asset);
        facings.add(pose.facing);
        expect(pose.x).toBeGreaterThanOrEqual(previousSmoothX);
        previousSmoothX = pose.x;
        lifts.add(pose.lift);
        expect(pose.lift).toBeLessThanOrEqual(2);
      }
    }
    expect(walkingAssets).toEqual(new Set([HUMAN_ASSETS.walk]));
    expect(facings).toEqual(new Set([1]));
    expect(lifts.size).toBeGreaterThan(10);
    game.advance(dt);
    const arrived = computeHumanPose(game.snapshot());
    expect(arrived.asset).toBe(HUMAN_ASSETS.hugKnees);
    expect(arrived.x).toBe(LAYOUT.humanWarm.x);
    expect(arrived.lift).toBeCloseTo(0);
  });

  it('limits the cold asset to the initial, fire-appearing, and notice states', () => {
    const assetAt = (logicalMs: number) => {
      const game = startedGame();
      game.advance(logicalMs);
      return computeHumanPose(game.snapshot()).asset;
    };
    const approach = WAVE_DURATIONS_MS.humanNoticesAndApproaches;
    const afterFire = WAVE_DURATIONS_MS.fireAppears;
    const afterApproach = afterFire + approach;

    expect(assetAt(afterFire * 0.5)).toBe(HUMAN_ASSETS.cold);
    expect(assetAt(afterFire + approach * 0.1)).toBe(HUMAN_ASSETS.cold);

    for (const progress of [0.18, 0.3, 0.45, 0.75]) {
      expect(assetAt(afterFire + approach * progress)).not.toBe(HUMAN_ASSETS.cold);
    }
    expect(assetAt(afterApproach + WAVE_DURATIONS_MS.humanWarmsUp * 0.5)).toBe(
      HUMAN_ASSETS.hugKnees,
    );
    expect(assetAt(afterApproach + WAVE_DURATIONS_MS.humanWarmsUp)).toBe(HUMAN_ASSETS.idle);
  });

  it('warms with the approved knees-hugged pose then changes to normal idle', () => {
    const game = startedGame();
    game.advance(WAVE_DURATIONS_MS.fireAppears + WAVE_DURATIONS_MS.humanNoticesAndApproaches);
    game.advance(WAVE_DURATIONS_MS.humanWarmsUp * 0.45);
    const warming = computeHumanPose(game.snapshot());
    expect(warming.asset).toBe(HUMAN_ASSETS.hugKnees);
    expect(warming.x).toBe(LAYOUT.humanWarm.x);
    expect(game.snapshot().world.isCold).toBe(true);
    game.advance(WAVE_DURATIONS_MS.humanWarmsUp);
    const ready = computeHumanPose(game.snapshot());
    expect(game.snapshot().phase).toBe('completed');
    expect(game.snapshot().world.isCold).toBe(false);
    expect(ready.asset).toBe(HUMAN_ASSETS.idle);
    expect(ready.x).toBe(LAYOUT.humanWarm.x);
  });

  it('keeps only a subtle whole-image bob after completion', () => {
    const game = startedGame();
    game.advance(10_000);
    const lifts = new Set<number>();
    for (let i = 0; i < 300; i += 1) {
      game.advance(20);
      const pose = computeHumanPose(game.snapshot());
      expect(pose.asset).toBe(HUMAN_ASSETS.idle);
      lifts.add(pose.lift);
    }
    expect(lifts.size).toBeGreaterThan(1);
    expect(Math.max(...lifts)).toBeLessThanOrEqual(1.2);
  });

  it('is a function of the logical clock, so playback speed scales it uniformly', () => {
    const slow = new SliceGame({ playbackSpeed: 0.5 });
    const fast = new SliceGame({ playbackSpeed: 2 });
    for (const game of [slow, fast]) game.selectElement('fire');
    slow.advance(4000);
    fast.advance(1000);
    expect(computeHumanPose(slow.snapshot())).toEqual(computeHumanPose(fast.snapshot()));
  });
});

describe('living miniature motion', () => {
  it('keeps trees and animals moving from the same logical clock', () => {
    const game = new SliceGame();
    const before = computeEnvironmentMotion(game.snapshot());
    game.advance(1000);
    const after = computeEnvironmentMotion(game.snapshot());
    expect(after.treeSways).not.toEqual(before.treeSways);
    expect(after.animalOffsets).not.toEqual(before.animalOffsets);
    expect(after.treeSways).toHaveLength(LAYOUT.trees.length + LAYOUT.foreground.length);
    expect(after.animalOffsets).toHaveLength(LAYOUT.animals.length);
  });

  it('scales ambient motion uniformly with playback speed', () => {
    const slow = new SliceGame({ playbackSpeed: 0.5 });
    const fast = new SliceGame({ playbackSpeed: 2 });
    slow.advance(4000);
    fast.advance(1000);
    expect(computeEnvironmentMotion(slow.snapshot())).toEqual(
      computeEnvironmentMotion(fast.snapshot()),
    );
  });
});

describe('fire visual', () => {
  it('is hidden before fire is chosen', () => {
    expect(computeFireVisual(new SliceGame().snapshot()).visible).toBe(false);
  });

  it('appears with a burst in Wave 1 and then idles at full size', () => {
    const game = startedGame();
    game.advance(WAVE_DURATIONS_MS.fireAppears * 0.3);
    const appearing = computeFireVisual(game.snapshot());
    expect(appearing.visible).toBe(true);
    expect(appearing.burst).not.toBeNull();
    expect(appearing.scale).toBeGreaterThan(0);

    game.advance(WAVE_DURATIONS_MS.fireAppears);
    const established = computeFireVisual(game.snapshot());
    expect(established.visible).toBe(true);
    expect(established.burst).toBeNull();
    expect(established.scale).toBeGreaterThan(0.85);

    game.advance(10_000);
    expect(computeFireVisual(game.snapshot()).visible).toBe(true);
  });

  it('keeps flickering from the logical clock after it is established', () => {
    const game = startedGame();
    game.advance(WAVE_DURATIONS_MS.fireAppears + 10);
    const scales = new Set<number>();
    for (let i = 0; i < 20; i += 1) {
      game.advance(17);
      scales.add(computeFireVisual(game.snapshot()).scale);
    }
    expect(scales.size).toBeGreaterThan(10);
  });
});
