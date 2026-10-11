import { describe, expect, it } from 'vitest';
import { SliceGame } from '../game/sliceGame';
import { WAVE_DURATIONS_MS } from '../game/timing';
import { FIRE_WARMING_WAVES, type Wave } from '../game/waves';
import {
  computeEnvironmentMotion,
  computeFireVisual,
  computeHumanPose,
  computeWalkPreviewPose,
  FIRE_FRAME_INTERVAL_MS,
} from './animation';
import { humanAssetOrigin, selectHumanAsset, type HumanAnimationState } from './humanAssets';
import { HUMAN_WALK_SEQUENCE, HUMAN_WALK_SPEED_PX_PER_MS } from './humanWalk';
import { LAYOUT } from './layout';

const WALK_START = 0.52;
const [WAVE1, WAVE2, WAVE3] = [
  WAVE_DURATIONS_MS.fireAppears,
  WAVE_DURATIONS_MS.humanNoticesAndApproaches,
  WAVE_DURATIONS_MS.humanWarmsUp,
];

// Logical time the human needs to walk from the start to the fire at the fixed
// walk speed. Mid-walk samples below are taken as fractions of this, so they
// stay mid-walk whatever the layout distance is.
const WALK_MS = (LAYOUT.humanWarm.x - LAYOUT.humanStart.x) / HUMAN_WALK_SPEED_PX_PER_MS;

function startedGame(waves?: readonly Wave[]): SliceGame {
  const game = new SliceGame(waves ? { waves } : {});
  game.selectElement('fire');
  return game;
}

const textureOf = (state: HumanAnimationState, isCold: boolean): string =>
  selectHumanAsset(state, isCold).textureKey;

function poseAt(logicalMs: number) {
  const game = startedGame();
  game.advance(logicalMs);
  return { pose: computeHumanPose(game.snapshot()), snapshot: game.snapshot() };
}

describe('human pose', () => {
  it('uses the approved cold_isCold asset without moving or shaking the body', () => {
    const game = new SliceGame();
    const before = computeHumanPose(game.snapshot());
    game.advance(2000);
    const after = computeHumanPose(game.snapshot());
    const origin = humanAssetOrigin(selectHumanAsset('cold', true));
    expect(before).toEqual({
      asset: 'cold_isCold',
      originX: origin.x,
      originY: origin.y,
      x: LAYOUT.humanStart.x,
      y: LAYOUT.humanStart.y,
      lift: 0,
      facing: 1,
      walk: null,
      coldOverlay: false,
    });
    expect(after).toEqual(before);
  });

  it('anchors each still pose at its approved ground anchor', () => {
    const idle = humanAssetOrigin(selectHumanAsset('idle', false));
    expect([idle.x * 512, idle.y * 512]).toEqual([255, 479]);
    const { pose } = poseAt(WAVE1 + WAVE2 * 0.1);
    const notice = humanAssetOrigin(selectHumanAsset('notice', true));
    expect([pose.originX, pose.originY]).toEqual([notice.x, notice.y]);
  });

  it('keeps the cold pose while the fire appears', () => {
    expect(poseAt(WAVE1 * 0.5).pose.asset).toBe(textureOf('cold', true));
  });

  it('holds notice at the start position until the walk starts, with no rise pose', () => {
    for (const progress of [0.1, 0.3, WALK_START - 0.01]) {
      const noticing = poseAt(WAVE1 + WAVE2 * progress).pose;
      expect(noticing.asset).toBe(textureOf('notice', true));
      expect(noticing.x).toBe(LAYOUT.humanStart.x);
      expect(noticing.lift).toBe(0);
      expect(noticing.walk).toBeNull();
    }
    const walking = poseAt(WAVE1 + WAVE2 * WALK_START + 100).pose;
    expect(walking.walk).not.toBeNull();
    expect(walking.asset).toMatch(/^human-walk-right-/);
    expect(walking.x).toBeGreaterThan(LAYOUT.humanStart.x);
  });

  it('walks right to the fire with the approved frames, never flipped, then hands off to warm', () => {
    const game = startedGame();
    game.advance(WAVE1);
    const steps = 160;
    const dt = WAVE2 / steps;
    const frames = new Set<string>();
    let previousX = -Infinity;
    let sawArrival = false;
    for (let i = 0; i < steps - 1; i += 1) {
      game.advance(dt);
      const snapshot = game.snapshot();
      const pose = computeHumanPose(snapshot);
      if ((snapshot.activeWave?.progress ?? 0) < WALK_START) continue;
      expect(pose.x).toBeGreaterThanOrEqual(previousX);
      previousX = pose.x;
      expect(pose.facing).toBe(1);
      expect(pose.lift).toBe(0);
      expect(pose.y).toBe(LAYOUT.humanStart.y);
      if (pose.walk) {
        expect(sawArrival).toBe(false);
        expect(pose.walk.direction).toBe('right');
        expect(pose.walk.animationKey).toBe('human-walk-right');
        expect(pose.asset).toMatch(/^human-walk-right-(step-a|stand|step-b)$/);
        expect(pose.asset).toBe(`human-walk-right-${HUMAN_WALK_SEQUENCE[pose.walk.frameIndex]}`);
        expect([pose.originX, pose.originY]).toEqual([0.5, 0.91015625]);
        expect(pose.coldOverlay).toBe(true);
        frames.add(pose.asset);
      } else {
        // Arrived: the walk stops and the approved warm pose takes over, still
        // warm_isCold because game logic has not yet set isCold=false.
        sawArrival = true;
        expect(pose.asset).toBe(textureOf('warm', true));
        expect(pose.x).toBe(LAYOUT.humanWarm.x);
        expect(pose.coldOverlay).toBe(false);
        expect(snapshot.world.isCold).toBe(true);
      }
    }
    // The approved scene walk is very short (composition takes priority), so it
    // may show only the first frames of the cycle; whatever shows must be an
    // approved right-facing frame, starting at step-a. The full cycle is covered
    // by the walk-preview tests in humanWalk.test.ts.
    expect(frames.size).toBeGreaterThanOrEqual(1);
    expect(frames.has('human-walk-right-step-a')).toBe(true);
    for (const frame of frames) {
      expect(['human-walk-right-step-a', 'human-walk-right-stand', 'human-walk-right-step-b']).toContain(frame);
    }
    expect(sawArrival).toBe(true);
  });

  it('reaches the fire before the approach Wave ends, so Wave 3 never starts mid-walk', () => {
    const walkWindowMs = WAVE2 * (1 - WALK_START);
    const distance = LAYOUT.humanWarm.x - LAYOUT.humanStart.x;
    expect(distance / HUMAN_WALK_SPEED_PX_PER_MS).toBeLessThan(walkWindowMs);
  });

  it('uses warm_isCold for the whole warm-up Wave, then normal idle once logic clears isCold', () => {
    const warming = poseAt(WAVE1 + WAVE2 + WAVE3 * 0.45);
    expect(warming.snapshot.activeWave?.id).toBe('human-warms-up');
    expect(warming.pose.asset).toBe('warm_isCold');
    expect(warming.pose.x).toBe(LAYOUT.humanWarm.x);
    expect(warming.pose.walk).toBeNull();
    expect(warming.snapshot.world.isCold).toBe(true);

    const justBefore = poseAt(WAVE1 + WAVE2 + WAVE3 - 1);
    expect(justBefore.pose.asset).toBe('warm_isCold');

    const ready = poseAt(WAVE1 + WAVE2 + WAVE3);
    expect(ready.snapshot.phase).toBe('completed');
    expect(ready.snapshot.world.isCold).toBe(false);
    expect(ready.pose.asset).toBe('idle');
    expect(ready.pose.x).toBe(LAYOUT.humanWarm.x);
    expect(ready.pose.coldOverlay).toBe(false);
  });

  it('selects normal/isCold art by isCold alone, and never reuses the legacy placeholders', () => {
    const game = startedGame();
    const seen = new Set<string>();
    for (let t = 0; t < WAVE1 + WAVE2 + WAVE3 + 2000; t += 25) {
      game.advance(25);
      const { world } = game.snapshot();
      const pose = computeHumanPose(game.snapshot());
      seen.add(pose.asset);
      expect(pose.asset).not.toMatch(/^human-(?!walk-)/);
      if (pose.walk) {
        expect(pose.coldOverlay).toBe(world.isCold);
      } else {
        expect(pose.coldOverlay).toBe(false);
        expect(pose.asset.endsWith('_isCold')).toBe(world.isCold);
      }
    }
    for (const required of ['cold_isCold', 'notice_isCold', 'warm_isCold', 'idle']) {
      expect(seen).toContain(required);
    }
    // isCold=false never brings back a cold asset or overlay.
    expect([...seen].filter((asset) => asset.endsWith('_isCold')).length).toBe(3);
  });

  it('derives the walk from active-Wave elapsed time, so custom Wave durations cannot desync it', () => {
    const scaled: Wave[] = FIRE_WARMING_WAVES.map((wave) => ({
      ...wave,
      durationMs: wave.durationMs * 2,
    }));
    const walkElapsedMs = WALK_MS * 0.6;
    const at = (waves: readonly Wave[] | undefined, durationScale: number) => {
      const game = startedGame(waves);
      game.advance(WAVE1 * durationScale + WAVE2 * durationScale * WALK_START + walkElapsedMs);
      return computeHumanPose(game.snapshot());
    };
    const normal = at(undefined, 1);
    const stretched = at(scaled, 2);
    expect(normal.walk).not.toBeNull();
    expect(stretched.asset).toBe(normal.asset);
    expect(stretched.walk).toEqual(normal.walk);
    expect(stretched.x).toBeCloseTo(normal.x, 6);
    expect(stretched.x).toBeCloseTo(
      LAYOUT.humanStart.x + HUMAN_WALK_SPEED_PX_PER_MS * walkElapsedMs,
      6,
    );
  });

  it('walks the same path at any render step size and any playback speed', () => {
    // Rounded to 40 ms so every step size below lands exactly on the sample time.
    const walkMs = Math.round((WAVE1 + WAVE2 * WALK_START + WALK_MS * 0.5) / 40) * 40;
    const poseAfter = (stepMs: number, playbackSpeed: number) => {
      const game = new SliceGame({ playbackSpeed });
      game.selectElement('fire');
      for (let logical = 0; logical < walkMs; logical += stepMs * playbackSpeed) {
        game.advance(stepMs);
      }
      return computeHumanPose(game.snapshot());
    };
    const fine = poseAfter(8, 1);
    expect(fine.walk).not.toBeNull();
    for (const other of [poseAfter(40, 1), poseAfter(10, 2), poseAfter(5, 0.5)]) {
      expect(other.asset).toBe(fine.asset);
      expect(other.walk).toEqual(fine.walk);
      expect(other.x).toBeCloseTo(fine.x, 0);
      expect(other.y).toBe(fine.y);
    }
  });

  it('keeps gameplay state out of the presentation: posing never changes the snapshot world', () => {
    const game = startedGame();
    game.advance(WAVE1 + WAVE2 * 0.8);
    const before = game.snapshot().world;
    computeHumanPose(game.snapshot());
    computeWalkPreviewPose(5000, true);
    expect(game.snapshot().world).toEqual(before);
    expect(before.isCold).toBe(true);
  });

  it('keeps only a subtle whole-image bob after completion', () => {
    const game = startedGame();
    game.advance(10_000);
    const lifts = new Set<number>();
    for (let i = 0; i < 300; i += 1) {
      game.advance(20);
      const pose = computeHumanPose(game.snapshot());
      expect(pose.asset).toBe('idle');
      lifts.add(pose.lift);
    }
    expect(lifts.size).toBeGreaterThan(1);
    expect(Math.max(...lifts)).toBeLessThanOrEqual(1.2);
  });

  it('is a function of the logical clock, so playback speed scales it uniformly', () => {
    const slow = new SliceGame({ playbackSpeed: 0.5 });
    const fast = new SliceGame({ playbackSpeed: 2 });
    for (const game of [slow, fast]) game.selectElement('fire');
    const logicalMs = WAVE1 + WAVE2 * WALK_START + WALK_MS * 0.5;
    slow.advance(logicalMs * 2);
    fast.advance(logicalMs / 2);
    expect(computeHumanPose(slow.snapshot())).toEqual(computeHumanPose(fast.snapshot()));
    expect(computeHumanPose(slow.snapshot()).walk).not.toBeNull();
  });
});

describe('living miniature motion', () => {
  it('keeps the single animal moving from the logical clock, within a small range', () => {
    const game = new SliceGame();
    const before = computeEnvironmentMotion(game.snapshot());
    game.advance(1000);
    const after = computeEnvironmentMotion(game.snapshot());
    expect(after.animalOffset).not.toEqual(before.animalOffset);
    for (let t = 0; t < 20_000; t += 250) {
      game.advance(250);
      const { x, y, turn } = computeEnvironmentMotion(game.snapshot()).animalOffset;
      expect(Math.abs(x)).toBeLessThanOrEqual(5);
      expect(Math.abs(y)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(turn)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps moving after Turn 1 is complete', () => {
    const game = startedGame();
    game.advance(WAVE1 + WAVE2 + WAVE3 + 100);
    expect(game.snapshot().phase).toBe('completed');
    const before = computeEnvironmentMotion(game.snapshot());
    game.advance(700);
    expect(computeEnvironmentMotion(game.snapshot())).not.toEqual(before);
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
    game.advance(WAVE1 * 0.3);
    const appearing = computeFireVisual(game.snapshot());
    expect(appearing.visible).toBe(true);
    expect(appearing.burst).not.toBeNull();
    expect(appearing.scale).toBeGreaterThan(0);

    game.advance(WAVE1);
    const established = computeFireVisual(game.snapshot());
    expect(established.visible).toBe(true);
    expect(established.burst).toBeNull();
    expect(established.scale).toBeGreaterThan(0.85);

    game.advance(10_000);
    expect(computeFireVisual(game.snapshot()).visible).toBe(true);
  });

  it('alternates the two campfire frames from the logical clock, with no body wobble', () => {
    const game = startedGame();
    game.advance(WAVE1 + WAVE2 + WAVE3 + 100);
    expect(game.snapshot().phase).toBe('completed');
    expect(FIRE_FRAME_INTERVAL_MS).toBeGreaterThanOrEqual(180);
    expect(FIRE_FRAME_INTERVAL_MS).toBeLessThanOrEqual(260);
    const frames: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      game.advance(17);
      const snapshot = game.snapshot();
      const fire = computeFireVisual(snapshot);
      expect(fire.visible).toBe(true);
      // Established idle: neutral scale; nothing but the texture frame flickers.
      expect(fire.scale).toBe(1);
      expect(Object.keys(fire).sort()).toEqual(['burst', 'frame', 'scale', 'seconds', 'visible']);
      expect(fire.frame).toBe(Math.floor(snapshot.clockMs / FIRE_FRAME_INTERVAL_MS) % 2);
      frames.push(fire.frame);
    }
    expect(new Set(frames)).toEqual(new Set([0, 1]));
    // Alternates: runs of one frame last about one interval (17 ms steps).
    let flips = 0;
    for (let i = 1; i < frames.length; i += 1) if (frames[i] !== frames[i - 1]) flips += 1;
    expect(flips).toBeGreaterThan(20);
    expect(flips).toBeLessThan(40);
  });

  it('is hidden before selection, visible while appearing, and keeps the Wave-1 grow-in only', () => {
    const hidden = computeFireVisual(new SliceGame().snapshot());
    expect(hidden.visible).toBe(false);
    expect(hidden.scale).toBe(0);
    const game = startedGame();
    game.advance(WAVE1 * 0.3);
    const fire = computeFireVisual(game.snapshot());
    expect(fire.visible).toBe(true);
    expect(fire.burst).not.toBeNull();
    expect(fire.scale).toBeGreaterThan(0);
    game.advance(WAVE1);
    expect(computeFireVisual(game.snapshot()).scale).toBe(1);
  });

  it('never mutates game state when computing the fire visual', () => {
    const game = startedGame();
    game.advance(WAVE1 + 50);
    const before = JSON.stringify(game.snapshot());
    computeFireVisual(game.snapshot());
    expect(JSON.stringify(game.snapshot())).toBe(before);
  });

  it('is playback-speed equivalent for the whole fire visual', () => {
    const slow = new SliceGame({ playbackSpeed: 0.5 });
    const fast = new SliceGame({ playbackSpeed: 2 });
    for (const game of [slow, fast]) game.selectElement('fire');
    slow.advance(9000);
    fast.advance(2250);
    expect(computeFireVisual(slow.snapshot())).toEqual(computeFireVisual(fast.snapshot()));
  });
});
