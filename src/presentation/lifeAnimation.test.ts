import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SliceGame, type SliceSnapshot } from '../game/sliceGame';
import { PLANT_LIFE_WAVES } from '../game/waves';
import { WAVE_DURATIONS_MS } from '../game/timing';
import { computeFireVisual, computeHumanPose } from './animation';
import { LAYOUT } from './layout';
import {
  computeAnimalEatVisual,
  computeFarmVisual,
  computeLifeHuman,
  computePotVisual,
  computeShelterVisual,
  loopFrame,
} from './lifeAnimation';
import { walkRoute } from './humanWalk';
import {
  ANIMAL_EAT_FRAMES,
  COOK_STEAM_FRAMES,
  FARM_HARVEST_FRAMES,
  FARM_WATER_FRAME,
  TURN2_FRAME_DURATION_MS,
} from './turn2Assets';

const TURN1_MS = Object.values(WAVE_DURATIONS_MS).reduce((sum, ms) => sum + ms, 0);
const WAVE_MS = Object.fromEntries(PLANT_LIFE_WAVES.map((wave) => [wave.id, wave.durationMs])) as Record<string, number>;
const TURN2_MS = PLANT_LIFE_WAVES.reduce((sum, wave) => sum + wave.durationMs, 0);
const startOf = (id: string): number => {
  let at = 0;
  for (const wave of PLANT_LIFE_WAVES) {
    if (wave.id === id) return at;
    at += wave.durationMs;
  }
  throw new Error(`unknown wave ${id}`);
};

// A game that finished Turn 1 and chose 🌱, advanced `intoTurn2Ms` logical ms.
function turn2At(intoTurn2Ms: number, speed = 1): SliceGame {
  const game = new SliceGame();
  game.selectElement('fire');
  game.advance(TURN1_MS);
  game.selectElement('plant');
  game.setPlaybackSpeed(speed);
  game.advance(intoTurn2Ms / speed);
  return game;
}
const inWave = (id: string, fraction: number): SliceSnapshot =>
  turn2At(startOf(id) + WAVE_MS[id] * fraction).snapshot();

describe('before Turn 2', () => {
  it('shows none of the Turn 2 art and leaves Turn 1’s human pose alone', () => {
    const afterTurn1 = new SliceGame();
    afterTurn1.selectElement('fire');
    afterTurn1.advance(TURN1_MS);
    for (const game of [new SliceGame(), afterTurn1]) {
      const snapshot = game.snapshot();
      expect(computeLifeHuman(snapshot)).toBeNull();
      expect(computeFarmVisual(snapshot).frame).toBeNull();
      expect(computePotVisual(snapshot).visible).toBe(false);
      expect(computeAnimalEatVisual(snapshot).eating).toBe(false);
      expect(computeShelterVisual(snapshot)).toMatchObject({ shelterAlpha: 1, hutAlpha: 0, glow: 0, sparkle: null });
    }
  });

  it('does not touch Turn 1: the same Turn 1 pose and fire at every Turn 1 moment', () => {
    const game = new SliceGame();
    game.selectElement('fire');
    for (let t = 0; t < TURN1_MS; t += 100) {
      game.advance(100);
      const snapshot = game.snapshot();
      expect(computeLifeHuman(snapshot)).toBeNull();
      const fireShown = snapshot.activeWave?.id === 'fire-appears' || snapshot.world.fireStage >= 1;
      expect(computeFireVisual(snapshot).visible).toBe(fireShown);
    }
  });
});

describe('Turn 2 sequence', () => {
  it('walks the human from the fire to the plot along the route, then stands there', () => {
    const start = inWave('human-walks-to-plot', 0);
    const first = computeLifeHuman(start);
    expect(first?.alpha).toBe(1);
    expect(first?.pose).toMatchObject({ x: LAYOUT.humanWarm.x, y: LAYOUT.humanWarm.y, coldOverlay: false });
    // Walking: approved walk frames, the view following the leg, no cold overlay.
    const walking = computeLifeHuman(inWave('human-walks-to-plot', 0.3));
    expect(walking?.pose.walk).not.toBeNull();
    expect(walking?.pose.asset).toMatch(/^human-walk-(up|right)-/);
    expect(walking?.pose.coldOverlay).toBe(false);
    const late = computeLifeHuman(inWave('human-walks-to-plot', 0.6));
    expect(late?.pose.walk?.direction).toBe('right');
    // Arrival: the approved idle, at the plot, not walking.
    const arrived = computeLifeHuman(inWave('human-walks-to-plot', 0.999));
    expect(arrived?.pose.walk).toBeNull();
    expect(arrived?.pose.asset).toBe('idle');
    expect(arrived?.pose).toMatchObject({ x: LAYOUT.plotHuman.x, y: LAYOUT.plotHuman.y });
    expect(computeFarmVisual(inWave('human-walks-to-plot', 0.5)).frame).toBeNull();
  });

  it('follows walkRoute() from the Wave’s own logical time', () => {
    const snapshot = inWave('human-walks-to-plot', 0.4);
    const step = walkRoute(LAYOUT.humanPlotRoute, snapshot.activeWave?.elapsedMs ?? -1);
    expect(computeLifeHuman(snapshot)?.pose).toMatchObject({ x: step.x, y: step.y });
  });

  it('keeps the fire burning at full size while Turn 2 plays (no replay of the Wave-1 grow-in)', () => {
    for (const wave of PLANT_LIFE_WAVES) {
      for (const fraction of [0, 0.5]) {
        expect(computeFireVisual(inWave(wave.id, fraction))).toMatchObject({ visible: true, scale: 1, burst: null });
      }
    }
  });

  it('pops the plot in (water pose) while the standing human crossfades into the composite art', () => {
    const early = inWave('sprout-plot-appears', 0.1);
    const mid = inWave('sprout-plot-appears', 0.35);
    const done = inWave('sprout-plot-appears', 0.9);
    for (const snapshot of [early, mid, done]) expect(computeFarmVisual(snapshot).frame).toBe(FARM_WATER_FRAME);
    expect(computeFarmVisual(early).alpha).toBeLessThan(computeFarmVisual(mid).alpha);
    expect(computeFarmVisual(done).alpha).toBe(1);
    expect(computeLifeHuman(early)?.alpha).toBeGreaterThan(computeLifeHuman(mid)?.alpha ?? 1);
    expect(computeLifeHuman(done)?.alpha).toBe(0);
    // Scale pops in toward 1 from below.
    expect(computeFarmVisual(early).scale).toBeLessThan(1);
  });

  it('alternates farm_water: the approved idle (300 ms) then water1 (300 ms), from the Wave’s start', () => {
    const base = startOf('human-waters-plot');
    const at = (ms: number) => turn2At(base + ms).snapshot();
    // 0..300: standing idle, no plot art.
    for (const ms of [0, 100, 299]) {
      expect(computeLifeHuman(at(ms))).toMatchObject({ alpha: 1, pose: { asset: 'idle' } });
      expect(computeFarmVisual(at(ms)).frame).toBeNull();
    }
    // 300..600: the water pose composite, the standing sprite hidden.
    for (const ms of [300, 450, 599]) {
      expect(computeLifeHuman(at(ms))?.alpha).toBe(0);
      expect(computeFarmVisual(at(ms)).frame).toBe(FARM_WATER_FRAME);
    }
    // And repeats.
    expect(computeFarmVisual(at(600)).frame).toBeNull();
    expect(computeFarmVisual(at(900)).frame).toBe(FARM_WATER_FRAME);
  });

  it('alternates farm_harvest harvest1 -> harvest2 every 300 ms of the logical clock', () => {
    const base = startOf('human-harvests-plot');
    for (const ms of [0, 100, 299, 300, 450, 599, 600, 900]) {
      const snapshot = turn2At(base + ms).snapshot();
      const expected = FARM_HARVEST_FRAMES[loopFrame(snapshot.clockMs)];
      expect(computeFarmVisual(snapshot)).toMatchObject({ frame: expected, alpha: 1, scale: 1 });
      expect(computeLifeHuman(snapshot)?.alpha).toBe(0);
    }
    expect(loopFrame(0)).toBe(0);
    expect(loopFrame(TURN2_FRAME_DURATION_MS - 1)).toBe(0);
    expect(loopFrame(TURN2_FRAME_DURATION_MS)).toBe(1);
    expect(loopFrame(2 * TURN2_FRAME_DURATION_MS)).toBe(0);
  });

  it('levels the shelter up into a hut: the hut grows out of it, then replaces it', () => {
    const fractions = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.999];
    const visuals = fractions.map((f) => computeShelterVisual(inWave('shelter-levels-up', f)));
    // Starts as the shelter alone, ends as the hut alone.
    expect(visuals[0]).toMatchObject({ shelterAlpha: 1, hutAlpha: 0 });
    expect(visuals[visuals.length - 1].hutAlpha).toBeCloseTo(1, 1);
    expect(visuals[visuals.length - 1].shelterAlpha).toBeCloseTo(0, 1);
    // Monotonic hand-over, and a moment where both are on screen (development, not a hard swap).
    for (let i = 1; i < visuals.length; i += 1) {
      expect(visuals[i].hutAlpha).toBeGreaterThanOrEqual(visuals[i - 1].hutAlpha);
      expect(visuals[i].shelterAlpha).toBeLessThanOrEqual(visuals[i - 1].shelterAlpha);
    }
    expect(visuals.some((v) => v.hutAlpha > 0.2 && v.shelterAlpha > 0.2)).toBe(true);
    // The hut starts a little smaller than its final size and the shelter swells slightly.
    expect(visuals[0].hutScale).toBeLessThan(1);
    expect(Math.max(...visuals.map((v) => v.shelterScale))).toBeGreaterThan(1);
    expect(Math.max(...visuals.map((v) => v.shelterScale))).toBeLessThan(1.1);
    // The glow is short and modest: zero at both ends, strongest in the middle, sparkles only during it.
    expect(visuals[0].glow).toBeCloseTo(0, 6);
    expect(visuals[visuals.length - 1].glow).toBeLessThan(0.05);
    expect(Math.max(...visuals.map((v) => v.glow))).toBeGreaterThan(0.9);
    expect(visuals.every((v) => v.sparkle !== null)).toBe(true);
  });

  it('settles on the hut alone once the level-up has happened, via the semantic state', () => {
    for (const id of ['cooking-starts', 'animal-eats']) {
      expect(computeShelterVisual(inWave(id, 0.5))).toMatchObject({ shelterAlpha: 0, hutAlpha: 1, hutScale: 1, glow: 0, sparkle: null });
    }
    // Before the level-up Wave, the rain shelter is all there is.
    for (const id of ['human-walks-to-plot', 'sprout-plot-appears', 'human-waters-plot', 'human-harvests-plot']) {
      expect(computeShelterVisual(inWave(id, 0.5))).toMatchObject({ shelterAlpha: 1, hutAlpha: 0 });
    }
  });

  it('brings the cooking pot in with a pop, then steams: cook_pot_steam1 <-> steam2 every 300 ms', () => {
    expect(computePotVisual(inWave('shelter-levels-up', 0.99)).visible).toBe(false);
    const early = computePotVisual(inWave('cooking-starts', 0.1));
    const late = computePotVisual(inWave('cooking-starts', 0.9));
    expect(early.visible).toBe(true);
    expect(early.scale).toBeLessThan(late.scale);
    expect(late.scale).toBeCloseTo(1, 1);
    for (const ms of [0, 150, 299, 300, 599, 600]) {
      const snapshot = turn2At(startOf('cooking-starts') + ms).snapshot();
      const pot = computePotVisual(snapshot);
      expect(pot.frameTextureKey).toBe(COOK_STEAM_FRAMES[loopFrame(snapshot.clockMs)].textureKey);
    }
    expect(computePotVisual(inWave('animal-eats', 0.5))).toMatchObject({ visible: true, scale: 1 });
  });

  it('has the one animal eat: eat1 <-> eat2 every 300 ms, only from the feeding Wave on', () => {
    expect(computeAnimalEatVisual(inWave('cooking-starts', 0.99)).eating).toBe(false);
    for (const ms of [0, 100, 300, 450, 600, 1200]) {
      const snapshot = turn2At(startOf('animal-eats') + ms).snapshot();
      const eat = computeAnimalEatVisual(snapshot);
      expect(eat.eating).toBe(true);
      expect(eat.frameTextureKey).toBe(ANIMAL_EAT_FRAMES[loopFrame(snapshot.clockMs)].textureKey);
    }
  });

  it('keeps every element quietly looping after Turn 2 completes', () => {
    const game = turn2At(TURN2_MS + 1);
    expect(game.snapshot().phase).toBe('completed');
    const seen = { farm: new Set<string>(), pot: new Set<string>(), eat: new Set<string>() };
    for (let i = 0; i < 20; i += 1) {
      game.advance(100);
      const snapshot = game.snapshot();
      expect(computeShelterVisual(snapshot)).toMatchObject({ hutAlpha: 1, shelterAlpha: 0 });
      expect(computeLifeHuman(snapshot)?.alpha).toBe(0);
      expect(computePotVisual(snapshot)).toMatchObject({ visible: true, scale: 1 });
      expect(computeAnimalEatVisual(snapshot).eating).toBe(true);
      const farm = computeFarmVisual(snapshot);
      expect(farm).toMatchObject({ alpha: 1, scale: 1 });
      seen.farm.add(farm.frame?.textureKey ?? 'none');
      seen.pot.add(computePotVisual(snapshot).frameTextureKey);
      seen.eat.add(computeAnimalEatVisual(snapshot).frameTextureKey);
    }
    expect([...seen.farm].sort()).toEqual(['farm-harvest-1', 'farm-harvest-2']);
    expect(seen.pot.size).toBe(2);
    expect(seen.eat.size).toBe(2);
  });
});

describe('Turn 2 visuals follow the logical clock only', () => {
  function visualsAt(snapshot: SliceSnapshot) {
    const farm = computeFarmVisual(snapshot);
    return {
      life: computeLifeHuman(snapshot),
      farm: { ...farm, frame: farm.frame?.textureKey ?? null },
      shelter: computeShelterVisual(snapshot),
      pot: computePotVisual(snapshot),
      eat: computeAnimalEatVisual(snapshot),
    };
  }

  it('is identical at the same logical time at any playback speed', () => {
    for (const logicalMs of [500, 2600, 3500, 4300, 5200, 6600, 8000, 9500, TURN2_MS + 500]) {
      const baseline = visualsAt(turn2At(logicalMs).snapshot());
      for (const speed of [0.25, 0.5, 2, 4]) {
        expect(visualsAt(turn2At(logicalMs, speed).snapshot())).toEqual(baseline);
      }
    }
  });

  it('is identical however the same time is split into frames', () => {
    const jumped = turn2At(7000);
    const stepped = turn2At(0);
    for (let t = 0; t < 7000; t += 16) stepped.advance(Math.min(16, 7000 - t));
    expect(visualsAt(stepped.snapshot())).toEqual(visualsAt(jumped.snapshot()));
  });

  it('does not change WorldState: visuals read a frozen snapshot and the game is unaffected', () => {
    const game = turn2At(startOf('shelter-levels-up') + 300);
    const snapshot = game.snapshot();
    const frozen = JSON.parse(JSON.stringify(snapshot)) as SliceSnapshot;
    const deepFreeze = <T>(value: T): T => {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
      }
      return value;
    };
    deepFreeze(snapshot);
    visualsAt(snapshot);
    computeHumanPose(snapshot);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(frozen);
    expect(game.snapshot().world).toEqual(frozen.world);
    expect(game.snapshot().activeWave).toEqual(frozen.activeWave);
  });

  it('never compares stage numbers: the Turn 2 presentation asks semantic questions only', () => {
    for (const file of ['lifeAnimation.ts', 'IslandScene.ts', 'turn2Assets.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/plantStage|shelterStage/);
    }
  });
});
