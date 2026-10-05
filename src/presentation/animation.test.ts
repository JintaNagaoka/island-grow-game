import { describe, expect, it } from 'vitest';
import { SliceGame } from '../game/sliceGame';
import { WAVE_DURATIONS_MS } from '../game/timing';
import { computeFireVisual, computeHumanPose } from './animation';
import { LAYOUT } from './layout';

function startedGame(): SliceGame {
  const game = new SliceGame();
  game.selectElement('fire');
  return game;
}

describe('human pose', () => {
  it('shivers on the initial screen', () => {
    const game = new SliceGame();
    const xs = new Set<number>();
    for (let t = 0; t < 200; t += 7) {
      game.advance(7);
      xs.add(computeHumanPose(game.snapshot()).x);
    }
    expect(xs.size).toBeGreaterThan(5);
    for (const x of xs) expect(Math.abs(x - LAYOUT.humanStart.x)).toBeLessThanOrEqual(3);
  });

  it('stops shivering while noticing the fire', () => {
    const game = startedGame();
    game.advance(WAVE_DURATIONS_MS.fireAppears + 40);
    const a = computeHumanPose(game.snapshot());
    game.advance(13);
    const b = computeHumanPose(game.snapshot());
    expect(a.x).toBe(LAYOUT.humanStart.x);
    expect(b.x).toBe(LAYOUT.humanStart.x);
    expect(b.lean).toBeGreaterThan(a.lean);
  });

  it('moves from the start to the warming spot by hopping, never backwards on average', () => {
    const game = startedGame();
    game.advance(WAVE_DURATIONS_MS.fireAppears);
    const steps = 100;
    const dt = WAVE_DURATIONS_MS.humanNoticesAndApproaches / steps;
    let maxLift = 0;
    let minLift = Infinity;
    let previousSmoothX = -Infinity;
    for (let i = 0; i < steps - 1; i += 1) {
      game.advance(dt);
      const pose = computeHumanPose(game.snapshot());
      maxLift = Math.max(maxLift, pose.lift);
      minLift = Math.min(minLift, pose.lift);
      // Shiver is <= 1px while walking, so travel dominates.
      if (i % 10 === 0) {
        expect(pose.x).toBeGreaterThan(previousSmoothX - 1);
        previousSmoothX = pose.x;
      }
    }
    expect(maxLift).toBeGreaterThan(10);
    expect(minLift).toBeLessThan(2);
    game.advance(dt);
    const arrived = computeHumanPose(game.snapshot());
    expect(Math.abs(arrived.x - LAYOUT.humanWarm.x)).toBeLessThanOrEqual(1);
    expect(arrived.lift).toBeCloseTo(0);
  });

  it('settles at the fire, raises arms to warm up, then lowers them when ready', () => {
    const game = startedGame();
    game.advance(WAVE_DURATIONS_MS.fireAppears + WAVE_DURATIONS_MS.humanNoticesAndApproaches);
    game.advance(WAVE_DURATIONS_MS.humanWarmsUp * 0.45);
    expect(computeHumanPose(game.snapshot()).armRaise).toBeCloseTo(1);
    game.advance(WAVE_DURATIONS_MS.humanWarmsUp);
    const ready = computeHumanPose(game.snapshot());
    expect(game.snapshot().phase).toBe('completed');
    expect(ready.armRaise).toBe(0);
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
});
