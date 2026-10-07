import { describe, expect, it } from 'vitest';
import { SliceGame } from '../game/sliceGame';
import { WALK_BPM, WALK_FRAME_DURATION_MS, WAVE_DURATIONS_MS } from '../game/timing';
import {
  HUMAN_ASSETS,
  computeEnvironmentMotion,
  computeFireVisual,
  computeHumanPose,
  walkFrameAt,
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

  it('alternates walk-02 -> walk-03 at the centralized BPM frame boundaries', () => {
    expect(WALK_BPM).toBe(97);
    expect(WALK_FRAME_DURATION_MS).toBe(60_000 / (97 * 2));
    expect(HUMAN_ASSETS.walkA).toBe('human-walk-02');
    expect(HUMAN_ASSETS.walkB).toBe('human-walk-03');

    const walkStart =
      WAVE_DURATIONS_MS.fireAppears + WAVE_DURATIONS_MS.humanNoticesAndApproaches * 0.52;
    const frame = WALK_FRAME_DURATION_MS;
    const assetAtWalkMs = (ms: number) => {
      const game = startedGame();
      game.advance(walkStart + ms);
      return computeHumanPose(game.snapshot()).asset;
    };
    const epsilon = 1;
    expect(assetAtWalkMs(epsilon)).toBe(HUMAN_ASSETS.walkA);
    expect(assetAtWalkMs(frame - epsilon)).toBe(HUMAN_ASSETS.walkA);
    expect(assetAtWalkMs(frame + epsilon)).toBe(HUMAN_ASSETS.walkB);
    expect(assetAtWalkMs(2 * frame - epsilon)).toBe(HUMAN_ASSETS.walkB);
    expect(assetAtWalkMs(2 * frame + epsilon)).toBe(HUMAN_ASSETS.walkA);
    expect(assetAtWalkMs(3 * frame + epsilon)).toBe(HUMAN_ASSETS.walkB);
    expect(assetAtWalkMs(4 * frame + epsilon)).toBe(HUMAN_ASSETS.walkA);

    expect(walkFrameAt(0)).toBe(HUMAN_ASSETS.walkA);
    expect(walkFrameAt(frame)).toBe(HUMAN_ASSETS.walkB);
    expect(walkFrameAt(2 * frame)).toBe(HUMAN_ASSETS.walkA);
  });

  it('walks with only the two approved frames, no mirroring, and no bounce', () => {
    const game = startedGame();
    game.advance(WAVE_DURATIONS_MS.fireAppears);
    const steps = 160;
    const dt = WAVE_DURATIONS_MS.humanNoticesAndApproaches / steps;
    const sequence: string[] = [];
    let previousX = -Infinity;
    for (let i = 0; i < steps - 1; i += 1) {
      game.advance(dt);
      const pose = computeHumanPose(game.snapshot());
      if ((game.snapshot().activeWave?.progress ?? 0) < 0.52) continue;
      expect(pose.facing).toBe(1);
      expect(pose.lift).toBe(0);
      expect(pose.y).toBe(LAYOUT.humanStart.y);
      expect(pose.x).toBeGreaterThanOrEqual(previousX);
      previousX = pose.x;
      if (sequence[sequence.length - 1] !== pose.asset) sequence.push(pose.asset);
    }
    expect(sequence).toEqual([
      HUMAN_ASSETS.walkA,
      HUMAN_ASSETS.walkB,
      HUMAN_ASSETS.walkA,
      HUMAN_ASSETS.walkB,
      HUMAN_ASSETS.walkA,
    ]);
    game.advance(dt);
    const arrived = computeHumanPose(game.snapshot());
    expect(arrived.asset).toBe(HUMAN_ASSETS.hugKnees);
    expect(arrived.x).toBe(LAYOUT.humanWarm.x);
  });

  it('keeps frame order, state order, and final WorldState across playback speeds', () => {
    const run = (playbackSpeed: number) => {
      const game = new SliceGame({ playbackSpeed });
      game.selectElement('fire');
      const total =
        WAVE_DURATIONS_MS.fireAppears +
        WAVE_DURATIONS_MS.humanNoticesAndApproaches +
        WAVE_DURATIONS_MS.humanWarmsUp +
        500;
      const realStep = 5 / playbackSpeed;
      const sequence: string[] = [];
      for (let logical = 0; logical < total; logical += 5) {
        game.advance(realStep);
        const asset = computeHumanPose(game.snapshot()).asset;
        if (sequence[sequence.length - 1] !== asset) sequence.push(asset);
      }
      return { sequence, world: game.snapshot().world, phase: game.snapshot().phase };
    };
    const normal = run(1);
    expect(normal.sequence).toEqual([
      HUMAN_ASSETS.cold,
      HUMAN_ASSETS.crouch,
      HUMAN_ASSETS.side,
      HUMAN_ASSETS.walkA,
      HUMAN_ASSETS.walkB,
      HUMAN_ASSETS.walkA,
      HUMAN_ASSETS.walkB,
      HUMAN_ASSETS.walkA,
      HUMAN_ASSETS.hugKnees,
      HUMAN_ASSETS.idle,
    ]);
    for (const speed of [0.5, 2, 4]) {
      const other = run(speed);
      expect(other.sequence).toEqual(normal.sequence);
      expect(other.world).toEqual(normal.world);
      expect(other.phase).toBe('completed');
    }
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
