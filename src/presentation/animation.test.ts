import { describe, expect, it } from 'vitest';
import { SliceGame } from '../game/sliceGame';
import { WAVE_DURATIONS_MS } from '../game/timing';
import { computeEnvironmentMotion, computeFireVisual, computeHumanPose } from './animation';
import { LAYOUT } from './layout';

function startedGame(): SliceGame {
  const game = new SliceGame();
  game.selectElement('fire');
  return game;
}

describe('human pose', () => {
  it('sits curled up while animated shiver marks leave the body position stable', () => {
    const game = new SliceGame();
    const xs = new Set<number>();
    const phases = new Set<number>();
    for (let t = 0; t < 200; t += 7) {
      game.advance(7);
      const pose = computeHumanPose(game.snapshot());
      xs.add(pose.x);
      phases.add(pose.effectPhase);
      expect(pose.sit).toBe(1);
      expect(pose.coldAmount).toBe(1);
      expect(pose.shiverAmount).toBe(1);
    }
    expect(xs).toEqual(new Set([LAYOUT.humanStart.x]));
    expect(phases.size).toBeGreaterThan(5);
  });

  it('notices the fire without moving or releasing the knees immediately', () => {
    const game = startedGame();
    game.advance(WAVE_DURATIONS_MS.fireAppears + 40);
    const a = computeHumanPose(game.snapshot());
    game.advance(WAVE_DURATIONS_MS.humanNoticesAndApproaches * 0.1);
    const b = computeHumanPose(game.snapshot());
    expect(a.x).toBe(LAYOUT.humanStart.x);
    expect(b.x).toBe(LAYOUT.humanStart.x);
    expect(b.lean).toBeGreaterThan(a.lean);
    expect(b.sit).toBe(1);
  });

  it('releases the knees and stands before turning or walking', () => {
    const game = startedGame();
    game.advance(
      WAVE_DURATIONS_MS.fireAppears + WAVE_DURATIONS_MS.humanNoticesAndApproaches * 0.3,
    );
    const rising = computeHumanPose(game.snapshot());
    expect(rising.sit).toBeGreaterThan(0);
    expect(rising.sit).toBeLessThan(1);
    expect(rising.x).toBe(LAYOUT.humanStart.x);
    game.advance(WAVE_DURATIONS_MS.humanNoticesAndApproaches * 0.15);
    const standing = computeHumanPose(game.snapshot());
    expect(standing.sit).toBe(0);
    expect(standing.x).toBe(LAYOUT.humanStart.x);
  });

  it('turns from the cold resting direction toward the fire before walking', () => {
    const game = startedGame();
    expect(computeHumanPose(game.snapshot()).facing).toBe(-1);
    game.advance(WAVE_DURATIONS_MS.fireAppears + WAVE_DURATIONS_MS.humanNoticesAndApproaches * 0.48);
    const noticed = computeHumanPose(game.snapshot());
    expect(noticed.x).toBe(LAYOUT.humanStart.x);
    expect(noticed.facing).toBe(1);
  });

  it('walks to the warming spot with alternating legs and opposite arm swings', () => {
    const game = startedGame();
    game.advance(WAVE_DURATIONS_MS.fireAppears);
    const steps = 100;
    const dt = WAVE_DURATIONS_MS.humanNoticesAndApproaches / steps;
    let sawLeftLegForward = false;
    let sawRightLegForward = false;
    let previousSmoothX = -Infinity;
    for (let i = 0; i < steps - 1; i += 1) {
      game.advance(dt);
      const pose = computeHumanPose(game.snapshot());
      if ((game.snapshot().activeWave?.progress ?? 0) >= 0.52) {
        sawLeftLegForward ||= pose.leftLegAngle > 0.3;
        sawRightLegForward ||= pose.rightLegAngle > 0.3;
        expect(pose.leftArmAngle).toBeCloseTo(-pose.rightArmAngle);
        expect(Math.min(pose.leftFootLift, pose.rightFootLift)).toBe(0);
        expect(Math.max(pose.leftFootLift, pose.rightFootLift)).toBeGreaterThanOrEqual(0);
      }
      if (i % 10 === 0) {
        expect(pose.x).toBeGreaterThanOrEqual(previousSmoothX);
        previousSmoothX = pose.x;
      }
    }
    expect(sawLeftLegForward).toBe(true);
    expect(sawRightLegForward).toBe(true);
    game.advance(dt);
    const arrived = computeHumanPose(game.snapshot());
    expect(Math.abs(arrived.x - LAYOUT.humanWarm.x)).toBeLessThanOrEqual(1);
    expect(arrived.lift).toBeCloseTo(0);
    expect(arrived.leftFootLift).toBe(0);
    expect(arrived.rightFootLift).toBe(0);
  });

  it('plants both feet and reaches both arms toward the fire before relaxing', () => {
    const game = startedGame();
    game.advance(WAVE_DURATIONS_MS.fireAppears + WAVE_DURATIONS_MS.humanNoticesAndApproaches);
    game.advance(WAVE_DURATIONS_MS.humanWarmsUp * 0.45);
    const warming = computeHumanPose(game.snapshot());
    expect(warming.leftArmAngle).toBeLessThan(-0.9);
    expect(warming.rightArmAngle).toBeLessThan(-0.9);
    expect(Math.abs(warming.leftLegAngle)).toBeLessThan(0.1);
    expect(Math.abs(warming.rightLegAngle)).toBeLessThan(0.1);
    expect(warming.leftFootLift).toBe(0);
    expect(warming.rightFootLift).toBe(0);
    expect(warming.coldAmount).toBeGreaterThan(0);
    expect(warming.coldAmount).toBeLessThan(1);
    game.advance(WAVE_DURATIONS_MS.humanWarmsUp);
    const ready = computeHumanPose(game.snapshot());
    expect(game.snapshot().phase).toBe('completed');
    expect(game.snapshot().world.isCold).toBe(false);
    expect(ready.coldAmount).toBe(0);
    expect(ready.shiverAmount).toBe(0);
    expect(ready.leftArmAngle).toBeGreaterThan(0);
    expect(ready.rightArmAngle).toBeLessThan(0);
    expect(ready.x).toBe(LAYOUT.humanWarm.x);
  });

  it('keeps animating (idle) after completion', () => {
    const game = startedGame();
    game.advance(10_000);
    const lifts = new Set<number>();
    const tilts = new Set<number>();
    for (let i = 0; i < 300; i += 1) {
      game.advance(20);
      const pose = computeHumanPose(game.snapshot());
      lifts.add(pose.lift);
      tilts.add(pose.headTilt);
    }
    expect(lifts.size).toBeGreaterThan(1);
    expect(tilts.size).toBeGreaterThan(10);
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
