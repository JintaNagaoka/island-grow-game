import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SliceGame, type SliceSnapshot } from '../game/sliceGame';
import { PLANT_LIFE_WAVES } from '../game/waves';
import { WAVE_DURATIONS_MS } from '../game/timing';
import { computeFireVisual, computeHumanPose } from './animation';
import { LAYOUT } from './layout';
import {
  computeAnimalVisual,
  computeFarmTiles,
  computeCookingFireVisual,
  computeFarmVisual,
  computeLifeHuman,
  computeShelterVisual,
  loopFrame,
} from './lifeAnimation';
import { walkRoute } from './humanWalk';
import {
  ANIMAL_EAT_FRAMES,
  COOK_STEAM_FRAMES,
  FARM_HARVEST_FRAMES,
  FARM_WATER_FRAME,
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
      expect(computeCookingFireVisual(snapshot).visible).toBe(false);
      expect(computeAnimalVisual(snapshot)).toMatchObject({ wildAlpha: 1, eatAlpha: 0, glow: 0, sparkle: null });
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
    expect(walking?.pose.asset).toMatch(/^human-walk-up-/);
    expect(walking?.pose.coldOverlay).toBe(false);
    const late = computeLifeHuman(inWave('human-walks-to-plot', 0.6));
    // Later legs head left along the free lane to the plot's lower left, then up to it.
    expect(['up', 'left']).toContain(late?.pose.walk?.direction);
    const directions = new Set<string | undefined>();
    for (let f = 0.05; f < 0.9; f += 0.05) directions.add(computeLifeHuman(inWave('human-walks-to-plot', f))?.pose.walk?.direction);
    // Every leg climbs toward the plot (up the shelter/fire gap, then up-left to the Human's spot).
    expect([...directions].filter((d) => d !== undefined).every((d) => d === 'up' || d === 'left')).toBe(true);
    expect(directions.has('up')).toBe(true);
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

  it('keeps the campfire burning at full size until the cooking level-up (no replay of the Wave-1 grow-in)', () => {
    for (const id of ['human-walks-to-plot', 'human-waters-plot', 'human-harvests-plot', 'farm-expands', 'shelter-levels-up']) {
      for (const fraction of [0, 0.5]) {
        expect(computeFireVisual(inWave(id, fraction))).toMatchObject({ visible: true, alpha: 1, scale: 1, burst: null });
      }
    }
  });

  const sample = (id: string, count = 60) =>
    Array.from({ length: count }, (_, i) => inWave(id, (i + 0.5) / count));

  it('shows water1 continuously for the whole 1500 ms water Wave, from the moment the Human has reached the plot', () => {
    // Before: the standing Human at the plot, no composite art.
    const before = inWave('human-walks-to-plot', 0.999);
    expect(computeFarmVisual(before).frame).toBeNull();
    expect(computeLifeHuman(before)).toMatchObject({ alpha: 1, pose: { asset: 'idle' } });
    // During: the water1 composite at every sampled instant (never the idle, never another frame).
    for (const snapshot of [inWave('human-waters-plot', 0), ...sample('human-waters-plot')]) {
      expect(computeFarmVisual(snapshot).frame).toBe(FARM_WATER_FRAME);
      expect(computeFarmVisual(snapshot).alpha).toBe(1);
      expect(computeLifeHuman(snapshot)?.alpha).toBe(0);
    }
    // The plot pops in with a small scale-up that has settled to 1 well before the Wave ends.
    expect(computeFarmVisual(inWave('human-waters-plot', 0)).scale).toBeLessThan(1);
    expect(computeFarmVisual(inWave('human-waters-plot', 0.5)).scale).toBe(1);
  });

  it('shows harvest2 continuously for the whole 1500 ms harvest Wave', () => {
    for (const snapshot of [inWave('human-harvests-plot', 0), ...sample('human-harvests-plot')]) {
      expect(computeFarmVisual(snapshot)).toMatchObject({ frame: FARM_HARVEST_FRAMES[1], alpha: 1, scale: 1 });
      expect(computeLifeHuman(snapshot)?.alpha).toBe(0);
    }
    expect(FARM_HARVEST_FRAMES[1].filename).toBe('human_farm_harvest2.png');
    expect(FARM_WATER_FRAME.filename).toBe('human_farm_water1.png');
  });

  it('settles on harvest1 for the farm-expands Wave and for good afterwards', () => {
    for (const snapshot of [inWave('farm-expands', 0), ...sample('farm-expands'), ...sample('shelter-levels-up', 5), ...sample('animal-eats', 5), turn2At(TURN2_MS + 1000).snapshot()]) {
      expect(computeFarmVisual(snapshot)).toMatchObject({ frame: FARM_HARVEST_FRAMES[0], alpha: 1, scale: 1 });
    }
    expect(FARM_HARVEST_FRAMES[0].filename).toBe('human_farm_harvest1.png');
  });

  it('grows the standalone plot tiles in one after another during farm-expands, then keeps them', () => {
    const count = LAYOUT.farmPlotTiles.length;
    // Exactly three standalone four-plant components (plus the composite plot): 16 plants, not a carpet.
    expect(count).toBe(3);
    // Hidden until the Wave starts (water and harvest Waves).
    for (const id of ['human-walks-to-plot', 'human-waters-plot', 'human-harvests-plot']) {
      expect(computeFarmTiles(inWave(id, 0.9)).every((tile) => tile.alpha === 0)).toBe(true);
    }
    expect(computeFarmTiles(inWave('farm-expands', 0)).every((tile) => tile.alpha === 0)).toBe(true);
    // Growing: the number of visible tiles never decreases, and each tile's alpha and scale never go down.
    let previous = computeFarmTiles(inWave('farm-expands', 0));
    let sawPartial = false;
    for (const snapshot of sample('farm-expands', 80)) {
      const tiles = computeFarmTiles(snapshot);
      tiles.forEach((tile, i) => {
        expect(tile.alpha).toBeGreaterThanOrEqual(previous[i].alpha - 1e-12);
      });
      const visible = tiles.filter((tile) => tile.alpha > 0).length;
      if (visible > 0 && visible < count) sawPartial = true;
      previous = tiles;
    }
    expect(sawPartial).toBe(true);
    // By the end of the Wave every tile is fully in, and it stays so for the rest of Turn 2 and after.
    expect(computeFarmTiles(inWave('farm-expands', 0.999)).every((tile) => tile.alpha > 0.99)).toBe(true);
    for (const snapshot of [...sample('shelter-levels-up', 4), ...sample('animal-eats', 4), turn2At(TURN2_MS + 5000).snapshot()]) {
      expect(computeFarmTiles(snapshot).every((tile) => tile.alpha === 1 && tile.scale === 1)).toBe(true);
    }
  });

  it('shows no second farm object: the composite is never hidden once the expansion starts', () => {
    for (const snapshot of [...sample('farm-expands', 20), turn2At(TURN2_MS + 1).snapshot()]) {
      expect(computeFarmVisual(snapshot).frame).not.toBeNull();
    }
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
    for (const id of ['human-walks-to-plot', 'human-waters-plot', 'human-harvests-plot', 'farm-expands']) {
      expect(computeShelterVisual(inWave(id, 0.5))).toMatchObject({ shelterAlpha: 1, hutAlpha: 0 });
    }
  });

  it('levels the campfire up into the cooking fire at the same ground point: swell, cross-fade, glow, sparkles', () => {
    const fractions = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.999];
    const fires = fractions.map((f) => computeFireVisual(inWave('cooking-starts', f)));
    const cooks = fractions.map((f) => computeCookingFireVisual(inWave('cooking-starts', f)));
    // Starts as the campfire alone; ends as the cooking fire alone.
    expect(fires[0]).toMatchObject({ visible: true, alpha: 1, scale: 1 });
    expect(cooks[0]).toMatchObject({ visible: false, alpha: 0 });
    expect(cooks[cooks.length - 1].alpha).toBeCloseTo(1, 1);
    expect(fires[fires.length - 1].alpha).toBeCloseTo(0, 1);
    // Monotonic hand-over with a moment where both are on screen (one fire developing, not a hard swap).
    for (let i = 1; i < fractions.length; i += 1) {
      expect(cooks[i].alpha).toBeGreaterThanOrEqual(cooks[i - 1].alpha);
      expect(fires[i].alpha).toBeLessThanOrEqual(fires[i - 1].alpha);
    }
    expect(fires.some((f, i) => f.alpha > 0.2 && cooks[i].alpha > 0.2)).toBe(true);
    // Campfire swells slightly; cooking fire grows in from a little smaller; glow peaks mid-way.
    expect(Math.max(...fires.map((f) => f.scale))).toBeGreaterThan(1);
    expect(Math.max(...fires.map((f) => f.scale))).toBeLessThan(1.1);
    expect(cooks[0].scale).toBeLessThan(1);
    expect(Math.max(...cooks.map((c) => c.glow))).toBeGreaterThan(0.9);
    expect(cooks.every((c) => c.sparkle !== null)).toBe(true);
    // Same ground point: the cooking fire art is anchored on the campfire's.
    expect(LAYOUT.cookingFire).toEqual(LAYOUT.fire);
  });

  it('shows only the cooking fire once the fire has levelled up, steaming steam1 <-> steam2 every 300 ms', () => {
    // Before the level-up: only the campfire.
    for (const id of ['shelter-levels-up']) {
      const snapshot = inWave(id, 0.99);
      expect(computeCookingFireVisual(snapshot).visible).toBe(false);
      expect(computeFireVisual(snapshot).visible).toBe(true);
    }
    // After: only the cooking fire, in every later moment.
    for (const [id, f] of [['animal-eats', 0.1], ['animal-eats', 0.9]] as const) {
      const snapshot = inWave(id, f);
      expect(computeFireVisual(snapshot).visible).toBe(false);
      expect(computeCookingFireVisual(snapshot)).toMatchObject({ visible: true, alpha: 1, scale: 1, glow: 0, sparkle: null });
    }
    for (const ms of [0, 150, 299, 300, 599, 600]) {
      const snapshot = turn2At(startOf('animal-eats') + ms).snapshot();
      expect(computeCookingFireVisual(snapshot).frameTextureKey).toBe(COOK_STEAM_FRAMES[loopFrame(snapshot.clockMs)].textureKey);
    }
  });

  it('never shows the campfire and the cooking fire as two independent fires, at any moment of Turn 2', () => {
    const game = turn2At(0);
    for (let t = 0; t <= TURN2_MS + 500; t += 20) {
      const snapshot = game.snapshot();
      const fire = computeFireVisual(snapshot);
      const cook = computeCookingFireVisual(snapshot);
      const fireOn = fire.visible && fire.alpha > 0;
      const cookOn = cook.visible && cook.alpha > 0;
      if (fireOn && cookOn) {
        // Only inside the cooking level-up Wave, as a cross-fade: their opacities trade off.
        expect(snapshot.activeWave?.id).toBe('cooking-starts');
        expect(fire.alpha + cook.alpha).toBeLessThan(1.5);
        expect(Math.min(fire.alpha, cook.alpha)).toBeLessThan(1);
      } else {
        expect(fireOn || cookOn).toBe(true);
      }
      game.advance(20);
    }
    const done = game.snapshot();
    expect(computeFireVisual(done).visible).toBe(false);
    expect(computeCookingFireVisual(done)).toMatchObject({ visible: true, alpha: 1 });
  });

  it('levels the one animal up from wild to eating: same ground point, cross-fade, glow, sparkles', () => {
    expect(computeAnimalVisual(inWave('cooking-starts', 0.99))).toMatchObject({ wildAlpha: 1, eatAlpha: 0 });
    const fractions = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.999];
    const visuals = fractions.map((f) => computeAnimalVisual(inWave('animal-eats', f)));
    expect(visuals[0]).toMatchObject({ wildAlpha: 1, eatAlpha: 0 });
    expect(visuals[visuals.length - 1].eatAlpha).toBeCloseTo(1, 1);
    expect(visuals[visuals.length - 1].wildAlpha).toBeCloseTo(0, 1);
    for (let i = 1; i < visuals.length; i += 1) {
      expect(visuals[i].eatAlpha).toBeGreaterThanOrEqual(visuals[i - 1].eatAlpha);
      expect(visuals[i].wildAlpha).toBeLessThanOrEqual(visuals[i - 1].wildAlpha);
    }
    expect(visuals.some((v) => v.wildAlpha > 0.2 && v.eatAlpha > 0.2)).toBe(true);
    expect(Math.max(...visuals.map((v) => v.wildScale))).toBeGreaterThan(1);
    expect(Math.max(...visuals.map((v) => v.wildScale))).toBeLessThan(1.1);
    expect(visuals[0].eatScale).toBeLessThan(1);
    expect(Math.max(...visuals.map((v) => v.glow))).toBeGreaterThan(0.9);
    expect(visuals.every((v) => v.sparkle !== null)).toBe(true);
    // Eating art alternates eat1 <-> eat2 every 300 ms of the logical clock.
    for (const ms of [0, 100, 300, 450, 600, 1200]) {
      const snapshot = turn2At(startOf('animal-eats') + ms).snapshot();
      expect(computeAnimalVisual(snapshot).frameTextureKey).toBe(ANIMAL_EAT_FRAMES[loopFrame(snapshot.clockMs)].textureKey);
    }
  });

  it('is never two animals: outside the level-up exactly one of the wild and eating art shows, and it stays one animal', () => {
    const game = turn2At(0);
    let sawBoth = false;
    for (let t = 0; t <= TURN2_MS + 500; t += 20) {
      const snapshot = game.snapshot();
      const animal = computeAnimalVisual(snapshot);
      const wildOn = animal.wildAlpha > 0;
      const eatOn = animal.eatAlpha > 0;
      expect(wildOn || eatOn).toBe(true);
      if (wildOn && eatOn) {
        sawBoth = true;
        expect(snapshot.activeWave?.id).toBe('animal-eats');
      }
      expect(snapshot.world.population).toBe(1);
      game.advance(20);
    }
    expect(sawBoth).toBe(true);
    expect(computeAnimalVisual(game.snapshot())).toMatchObject({ wildAlpha: 0, eatAlpha: 1, glow: 0, sparkle: null });
  });

  it('keeps every element quietly looping after Turn 2 completes', () => {
    const game = turn2At(TURN2_MS + 1);
    expect(game.snapshot().phase).toBe('completed');
    const seen = { farm: new Set<string>(), pot: new Set<string>(), eat: new Set<string>() };
    expect(computeFireVisual(game.snapshot()).visible).toBe(false);
    for (let i = 0; i < 20; i += 1) {
      game.advance(100);
      const snapshot = game.snapshot();
      expect(computeShelterVisual(snapshot)).toMatchObject({ hutAlpha: 1, shelterAlpha: 0 });
      expect(computeLifeHuman(snapshot)?.alpha).toBe(0);
      expect(computeCookingFireVisual(snapshot)).toMatchObject({ visible: true, alpha: 1, scale: 1 });
      expect(computeFireVisual(snapshot).visible).toBe(false);
      expect(computeAnimalVisual(snapshot)).toMatchObject({ wildAlpha: 0, eatAlpha: 1 });
      const farm = computeFarmVisual(snapshot);
      expect(farm).toMatchObject({ alpha: 1, scale: 1 });
      seen.farm.add(farm.frame?.textureKey ?? 'none');
      seen.pot.add(computeCookingFireVisual(snapshot).frameTextureKey);
      seen.eat.add(computeAnimalVisual(snapshot).frameTextureKey);
    }
    // The farm is settled on harvest1 (no more alternation).
    expect([...seen.farm]).toEqual(['farm-harvest-1']);
    expect(seen.pot.size).toBe(2);
    expect(seen.eat.size).toBe(2);
  });
});

describe('Turn 2 visuals follow the logical clock only', () => {
  function visualsAt(snapshot: SliceSnapshot) {
    const farm = computeFarmVisual(snapshot);
    return {
      life: computeLifeHuman(snapshot),
      tiles: computeFarmTiles(snapshot),
      farm: { ...farm, frame: farm.frame?.textureKey ?? null },
      shelter: computeShelterVisual(snapshot),
      fire: computeFireVisual(snapshot),
      cook: computeCookingFireVisual(snapshot),
      animal: computeAnimalVisual(snapshot),
    };
  }

  it('is identical at the same logical time at any playback speed', () => {
    for (const logicalMs of [500, 1800, 2600, 3300, 4500, 5300, 5900, 6600, 7600, 9000, 10500, TURN2_MS + 500]) {
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
      expect(source, file).not.toMatch(/plantStage|shelterStage|animalStage|fireStage/);
    }
  });
});
