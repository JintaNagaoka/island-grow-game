import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SliceGame, type SliceSnapshot } from '../game/sliceGame';
import { SPLIT_WAVE_MS, WAVE_DURATIONS_MS } from '../game/timing';
import { PLANT_LIFE_WAVES } from '../game/waves';
import { computeHumanPose } from './animation';
import { HUMAN_SPRITE_SCALE } from './humanAssets';
import { LAYOUT } from './layout';
import { walkRoute } from './humanWalk';
import { computeResidentVisuals, computeSplitEffect } from './residents';

const TURN1_MS = Object.values(WAVE_DURATIONS_MS).reduce((sum, ms) => sum + ms, 0);
const TURN2_MS = PLANT_LIFE_WAVES.reduce((sum, wave) => sum + wave.durationMs, 0);
const WALK_MS = PLANT_LIFE_WAVES.find((wave) => wave.id === 'human-walks-to-plot')?.durationMs ?? NaN;

function turn2At(intoTurn2Ms: number, speed = 1): SliceGame {
  const game = new SliceGame();
  game.selectElement('fire');
  game.advance(TURN1_MS);
  game.selectElement('plant');
  game.setPlaybackSpeed(speed);
  game.advance(intoTurn2Ms / speed);
  return game;
}

const visualOf = (snapshot: SliceSnapshot, id: string) => {
  const visual = computeResidentVisuals(snapshot).find((v) => v.id === id);
  if (!visual) throw new Error(`no visual for ${id}`);
  return visual;
};

describe('resident visuals', () => {
  it('draws one resident through Turn 1, with the existing pose logic', () => {
    const game = new SliceGame();
    expect(computeResidentVisuals(game.snapshot())).toHaveLength(1);
    game.selectElement('fire');
    for (let t = 0; t < TURN1_MS; t += 100) {
      game.advance(100);
      const snapshot = game.snapshot();
      const visuals = computeResidentVisuals(snapshot);
      expect(visuals).toHaveLength(1);
      expect(visuals[0]).toEqual({ id: 'resident-1', pose: computeHumanPose(snapshot), alpha: 1, scale: 1, shakeX: 0 });
    }
  });

  it('draws exactly two residents from Turn 2 start, however often it is evaluated', () => {
    const game = turn2At(0);
    const snapshot = game.snapshot();
    for (let i = 0; i < 10; i += 1) expect(computeResidentVisuals(snapshot)).toHaveLength(2);
    game.advance(TURN2_MS + 5000);
    expect(computeResidentVisuals(game.snapshot())).toHaveLength(2);
  });

  it('keeps resident 1 idle at the Turn 1 completed position in front of the fire for all of Turn 2', () => {
    const game = turn2At(0);
    for (let t = 0; t <= TURN2_MS + 500; t += 50) {
      const visual = visualOf(game.snapshot(), 'resident-1');
      expect(visual.pose).toMatchObject({ asset: 'idle', x: LAYOUT.humanWarm.x, walk: null });
      expect(visual.pose.y).toBe(LAYOUT.humanWarm.y);
      expect(visual.alpha).toBe(1);
      game.advance(50);
    }
  });

  it('starts resident 2 on the Issue #11 route from elapsedMs 0 of the walk Wave, after the split', () => {
    const atStart = turn2At(SPLIT_WAVE_MS).snapshot();
    expect(atStart.activeWave).toMatchObject({ id: 'human-walks-to-plot', elapsedMs: 0 });
    expect(visualOf(atStart, 'resident-2').pose).toMatchObject({ x: LAYOUT.humanWarm.x, y: LAYOUT.humanWarm.y });
    for (const walkMs of [100, 300, 500]) {
      const snapshot = turn2At(SPLIT_WAVE_MS + walkMs).snapshot();
      const step = walkRoute(LAYOUT.humanPlotRoute, snapshot.activeWave?.elapsedMs ?? -1);
      expect(snapshot.activeWave?.elapsedMs).toBeCloseTo(walkMs);
      const pose = visualOf(snapshot, 'resident-2').pose;
      expect(pose).toMatchObject({ x: step.x, y: step.y });
      expect(pose.walk).not.toBeNull();
      // Approved directional walk frames, shared origin and sprite scale (no new assets).
      expect(pose.asset).toMatch(/^human-walk-(up|left|right|down)-/);
      expect(pose.facing).toBe(1);
    }
    const arrived = turn2At(SPLIT_WAVE_MS + WALK_MS - 1).snapshot();
    expect(visualOf(arrived, 'resident-2').pose).toMatchObject({ x: LAYOUT.plotHuman.x, y: LAYOUT.plotHuman.y, walk: null });
  });

  it('keeps every walking route point on the Issue #11 route (no free roaming)', () => {
    const route = LAYOUT.humanPlotRoute;
    const xs = route.map((p) => p.x);
    const ys = route.map((p) => p.y);
    const game = turn2At(0);
    for (let t = 0; t < SPLIT_WAVE_MS + WALK_MS; t += 20) {
      const { pose } = visualOf(game.snapshot(), 'resident-2');
      expect(pose.x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-6);
      expect(pose.x).toBeLessThanOrEqual(Math.max(...xs) + 1e-6);
      expect(pose.y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6);
      expect(pose.y).toBeLessThanOrEqual(Math.max(...ys) + 1e-6);
      game.advance(20);
    }
  });

  it('hands resident 2 to the composite farm art exactly as the single human was', () => {
    for (const ms of [SPLIT_WAVE_MS + WALK_MS + 10, TURN2_MS + 500]) {
      expect(visualOf(turn2At(ms).snapshot(), 'resident-2').alpha).toBe(0);
    }
  });

  it('is unaffected by one resident stopping: resident 1 is identical before and after resident 2 arrives', () => {
    const at = SPLIT_WAVE_MS + WALK_MS;
    const before = visualOf(turn2At(at - 1).snapshot(), 'resident-1').pose;
    const after = visualOf(turn2At(at + 1).snapshot(), 'resident-1').pose;
    expect({ ...before, lift: 0 }).toEqual({ ...after, lift: 0 });
  });

  it('keeps the shared sprite scale and approved assets (no new bitmaps)', () => {
    expect(HUMAN_SPRITE_SCALE).toBeGreaterThan(0);
    const source = readFileSync(new URL('residents.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\.png|HUMAN_SPRITE_SCALE\s*=/);
  });
});

describe('split level-up', () => {
  it('is shown only during the split Wave, at the Turn 1 completed position, and then ends', () => {
    expect(computeSplitEffect(new SliceGame().snapshot())).toBeNull();
    const done = new SliceGame();
    done.selectElement('fire');
    done.advance(TURN1_MS);
    expect(computeSplitEffect(done.snapshot())).toBeNull();

    expect(computeSplitEffect(turn2At(0).snapshot())).toMatchObject({ ground: LAYOUT.humanWarm });
    expect(computeSplitEffect(turn2At(SPLIT_WAVE_MS - 1).snapshot())).not.toBeNull();
    expect(computeSplitEffect(turn2At(SPLIT_WAVE_MS).snapshot())).toBeNull();
    expect(computeSplitEffect(turn2At(TURN2_MS + 1000).snapshot())).toBeNull();
  });

  it('keeps both residents on exactly the Turn 1 completed ground point throughout the split', () => {
    const game = turn2At(0);
    for (let t = 0; t < SPLIT_WAVE_MS; t += 10) {
      const snapshot = game.snapshot();
      expect(snapshot.activeWave?.id).toBe('human-splits');
      expect(snapshot.world.residents.map((r) => [r.place, r.motion, r.target])).toEqual([
        ['fire', 'idle', null],
        ['fire', 'idle', null],
      ]);
      for (const id of ['resident-1', 'resident-2']) {
        const { pose } = visualOf(snapshot, id);
        expect(pose).toMatchObject({ x: LAYOUT.humanWarm.x, y: LAYOUT.humanWarm.y, asset: 'idle', walk: null });
      }
      expect(computeSplitEffect(snapshot)?.ground).toEqual(LAYOUT.humanWarm);
      game.advance(10);
    }
  });

  it('shakes (ぷるぷる) with resident 2 hidden, then pops (ポンッ) resident 2 into view', () => {
    const shaking = turn2At(SPLIT_WAVE_MS * 0.4).snapshot();
    expect(visualOf(shaking, 'resident-2').alpha).toBe(0);
    const popping = turn2At(SPLIT_WAVE_MS * 0.7).snapshot();
    expect(visualOf(popping, 'resident-2').alpha).toBe(1);
    expect(visualOf(popping, 'resident-2').scale).toBeLessThan(1.2);
    // The shake moves resident 1 sideways at some point of the shake phase.
    const shakes = Array.from({ length: 40 }, (_, i) =>
      visualOf(turn2At((i / 40) * SPLIT_WAVE_MS * 0.5 + 20).snapshot(), 'resident-1').shakeX,
    );
    expect(Math.max(...shakes.map(Math.abs))).toBeGreaterThan(0);
    // After the split both residents are at rest scale.
    const settled = turn2At(SPLIT_WAVE_MS + 50).snapshot();
    expect(visualOf(settled, 'resident-1')).toMatchObject({ scale: 1, shakeX: 0 });
    expect(visualOf(settled, 'resident-2').scale).toBe(1);
  });

  it('never feeds back into state: evaluating visuals does not change the snapshot', () => {
    const game = turn2At(200);
    const before = game.snapshot();
    for (let i = 0; i < 5; i += 1) {
      computeResidentVisuals(before);
      computeSplitEffect(before);
    }
    expect(game.snapshot()).toEqual(before);
  });
});

describe('resident visuals follow the logical clock only', () => {
  const visualsAt = (snapshot: SliceSnapshot) => ({
    residents: computeResidentVisuals(snapshot),
    split: computeSplitEffect(snapshot),
  });

  it('is identical at the same logical time at any playback speed', () => {
    for (const logicalMs of [0, 150, 300, 450, 700, 1500, 2600, 4000, TURN2_MS + 500]) {
      const baseline = visualsAt(turn2At(logicalMs).snapshot());
      for (const speed of [0.25, 0.5, 2, 4]) {
        expect(visualsAt(turn2At(logicalMs, speed).snapshot())).toEqual(baseline);
      }
    }
  });

  it('is identical however the same time is split into frames', () => {
    for (const total of [400, 1000]) {
      const jumped = turn2At(total);
      const stepped = turn2At(0);
      for (let t = 0; t < total; t += 16) stepped.advance(Math.min(16, total - t));
      expect(visualsAt(stepped.snapshot())).toEqual(visualsAt(jumped.snapshot()));
    }
  });
});
