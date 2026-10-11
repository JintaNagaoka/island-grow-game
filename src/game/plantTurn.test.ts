import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SliceGame, type SliceSnapshot } from './sliceGame';
import { BEAT_MS, WAVE_DURATIONS_MS } from './timing';
import { FIRE_WARMING_WAVES, PLANT_LIFE_WAVES, type Wave, type WaveId } from './waves';
import {
  ELEMENTS,
  createInitialWorldState,
  hasCaredForAnimal,
  hasCookingFire,
  hasSproutPlot,
  hasUpgradedHut,
} from './worldState';

const TURN1_MS = Object.values(WAVE_DURATIONS_MS).reduce((sum, ms) => sum + ms, 0);
const TURN2_MS = PLANT_LIFE_WAVES.reduce((sum, wave) => sum + wave.durationMs, 0);
const PLANT_IDS = PLANT_LIFE_WAVES.map((wave) => wave.id);
const WAVE_MS = Object.fromEntries(PLANT_LIFE_WAVES.map((wave) => [wave.id, wave.durationMs])) as Record<string, number>;

function afterTurn1(): SliceGame {
  const game = new SliceGame();
  game.selectElement('fire');
  game.advance(TURN1_MS);
  return game;
}

function inTurn2(): SliceGame {
  const game = afterTurn1();
  expect(game.selectElement('plant')).toEqual({ accepted: true });
  return game;
}

describe('Turn 2 availability', () => {
  it('rejects plant on the initial screen without changing anything', () => {
    const game = new SliceGame();
    const before = game.snapshot();
    expect(game.selectElement('plant')).toEqual({ accepted: false, reason: 'prerequisite-not-met' });
    expect(game.snapshot()).toEqual(before);
    game.advance(TURN1_MS + TURN2_MS);
    expect(game.snapshot().phase).toBe('awaiting-input');
    expect(game.snapshot().world).toEqual(createInitialWorldState());
  });

  it('keeps plant unavailable for the whole of Turn 1 (input locked)', () => {
    const game = new SliceGame();
    game.selectElement('fire');
    for (const delta of [0, 700, 700, 1600, 1600, 1100]) {
      game.advance(delta);
      const before = game.snapshot();
      expect(before.selectableElements).toEqual([]);
      expect(game.selectElement('plant')).toEqual({ accepted: false, reason: 'input-locked' });
      expect(game.snapshot()).toEqual(before);
    }
    expect(game.snapshot().world.plantStage).toBe(0);
    expect(game.snapshot().world.selectedElements).toEqual(['fire']);
  });

  it('opens plant (and only plant) once Turn 1 has completed', () => {
    const game = afterTurn1();
    expect(game.snapshot().phase).toBe('completed');
    expect(game.snapshot().selectableElements).toEqual(['plant']);
    expect(game.selectElement('rock')).toEqual({ accepted: false, reason: 'not-implemented' });
    expect(game.selectElement('water')).toEqual({ accepted: false, reason: 'not-implemented' });
    expect(game.selectElement('fire')).toEqual({ accepted: false, reason: 'already-selected' });
    expect(game.snapshot().world.selectedElements).toEqual(['fire']);
  });

  it('accepts plant exactly once, locks input and starts the first Turn 2 Wave', () => {
    const game = afterTurn1();
    expect(game.selectElement('plant')).toEqual({ accepted: true });
    const snapshot = game.snapshot();
    expect(snapshot.phase).toBe('playing');
    expect(snapshot.inputLocked).toBe(true);
    expect(snapshot.selectableElements).toEqual([]);
    expect(snapshot.world.selectedElements).toEqual(['fire', 'plant']);
    expect(snapshot.activeWave).toMatchObject({ id: 'human-walks-to-plot', index: 0, progress: 0 });
    // Nothing persistent has changed yet.
    expect(snapshot.world.plantStage).toBe(0);
    expect(snapshot.world.shelterStage).toBe(1);
    expect(snapshot.world.fireStage).toBe(1);
    expect(snapshot.world.animalStage).toBe(1);
  });
});

describe('Turn 2 input lock', () => {
  it.each(ELEMENTS)('rejects %s in every Wave and leaves the snapshot untouched', (element) => {
    const game = inTurn2();
    const checkpoints = PLANT_LIFE_WAVES.flatMap((wave) => [wave.durationMs / 2, wave.durationMs / 2]);
    for (const delta of [0, ...checkpoints.slice(0, -1)]) {
      game.advance(delta);
      expect(game.snapshot().inputLocked).toBe(true);
      const before = game.snapshot();
      expect(game.selectElement(element)).toEqual({ accepted: false, reason: 'input-locked' });
      expect(game.snapshot()).toEqual(before);
    }
  });

  it('cannot start a second playback by mashing plant (or anything else)', () => {
    const game = inTurn2();
    game.advance(PLANT_LIFE_WAVES[0].durationMs + 100);
    for (let i = 0; i < 30; i += 1) for (const element of ELEMENTS) game.selectElement(element);
    expect(game.snapshot().world.selectedElements).toEqual(['fire', 'plant']);
    expect(game.snapshot().activeWave?.id).toBe('human-waters-plot');
    game.advance(TURN2_MS);
    expect(game.snapshot().completedWaves).toEqual([
      ...FIRE_WARMING_WAVES.map((wave) => wave.id),
      ...PLANT_IDS,
    ]);
  });
});

describe('Turn 2 completion', () => {
  it('reaches the Turn 2 state: plot, hut, cooking fire and cared-for animal, one resident, one animal', () => {
    const game = inTurn2();
    game.advance(TURN2_MS);
    const snapshot = game.snapshot();
    expect(snapshot.phase).toBe('completed');
    expect(snapshot.inputLocked).toBe(false);
    expect(snapshot.activeWave).toBeNull();
    expect(snapshot.world).toEqual({
      turn: 0,
      selectedElements: ['fire', 'plant'],
      fireStage: 2,
      plantStage: 1,
      shelterStage: 2,
      animalStage: 2,
      humanStage: 1,
      population: 1,
      isCold: false,
    });
    expect(hasSproutPlot(snapshot.world)).toBe(true);
    expect(hasUpgradedHut(snapshot.world)).toBe(true);
    expect(hasCookingFire(snapshot.world)).toBe(true);
    expect(hasCaredForAnimal(snapshot.world)).toBe(true);
    // Population is unchanged and WorldState has no animal-count, fence, pond or shrine field to change.
    expect(snapshot.world.population).toBe(1);
    expect(Object.keys(snapshot.world).sort()).toEqual(
      ['animalStage', 'fireStage', 'humanStage', 'isCold', 'plantStage', 'population', 'selectedElements', 'shelterStage', 'turn'],
    );
  });

  it('rejects every element after Turn 2 completes, without changing state', () => {
    const game = inTurn2();
    game.advance(TURN2_MS);
    const completed = game.snapshot();
    expect(completed.selectableElements).toEqual([]);
    expect(game.selectElement('plant')).toEqual({ accepted: false, reason: 'already-selected' });
    expect(game.selectElement('fire')).toEqual({ accepted: false, reason: 'already-selected' });
    expect(game.selectElement('rock')).toEqual({ accepted: false, reason: 'not-implemented' });
    expect(game.selectElement('water')).toEqual({ accepted: false, reason: 'not-implemented' });
    expect(game.snapshot()).toEqual(completed);
    game.advance(100_000);
    expect(game.snapshot().world).toEqual(completed.world);
  });

  it('declares the Waves in the specified order with the specified effects', () => {
    expect(PLANT_IDS).toEqual([
      'human-walks-to-plot',
      'human-waters-plot',
      'human-harvests-plot',
      'farm-expands',
      'shelter-levels-up',
      'cooking-starts',
      'animal-eats',
    ]);
    const base = { ...createInitialWorldState(), isCold: false, fireStage: 1 };
    const effects = new Map(PLANT_LIFE_WAVES.map((wave) => [wave.id, wave.complete(base)]));
    // The sprout plot is established when the water Wave completes; the farm has expanded when its Wave completes.
    // plantStage stays 0 through the walk, water1 and harvest2; it becomes 1 only when farm-expands completes.
    expect(effects.get('human-waters-plot')).toEqual(base);
    expect(effects.get('human-harvests-plot')).toEqual(base);
    expect(effects.get('farm-expands')).toEqual({ ...base, plantStage: 1 });
    expect(effects.get('shelter-levels-up')).toEqual({ ...base, shelterStage: 2 });
    // The fire levels up from 1 to 2 (the same fire, not a second one).
    expect(effects.get('cooking-starts')).toEqual({ ...base, fireStage: 2 });
    // The one animal levels up from 1 to 2; population and everything else is untouched.
    expect(effects.get('animal-eats')).toEqual({ ...base, animalStage: 2 });
    const persistent = ['human-waters-plot', 'farm-expands', 'shelter-levels-up', 'cooking-starts', 'animal-eats'];
    for (const id of PLANT_IDS.filter((id) => !persistent.includes(id))) {
      expect(effects.get(id)).toEqual(base);
    }
  });

  it('applies each persistent effect only when its own Wave completes', () => {
    const game = inTurn2();
    const world = () => game.snapshot().world;
    const [walk, water, harvest, expand, hut] = PLANT_LIFE_WAVES.map((wave) => wave.durationMs);

    // plantStage stays 0 through the walk, the 1.5 s water1 Wave and the 1.5 s harvest2 Wave.
    game.advance(walk + water - 1);
    expect(game.snapshot().activeWave?.id).toBe('human-waters-plot');
    expect(world().plantStage).toBe(0);
    game.advance(1);
    expect(game.snapshot().activeWave?.id).toBe('human-harvests-plot');
    expect(hasSproutPlot(world())).toBe(false);
    game.advance(harvest - 1);
    expect(game.snapshot().activeWave?.id).toBe('human-harvests-plot');
    expect(hasSproutPlot(world())).toBe(false);
    game.advance(1);
    expect(game.snapshot().activeWave?.id).toBe('farm-expands');

    // ...and through the whole active farm-expands Wave; it becomes 1 exactly when that Wave completes.
    game.advance(expand - 1);
    expect(game.snapshot().activeWave?.id).toBe('farm-expands');
    expect(world().plantStage).toBe(0);
    expect(hasSproutPlot(world())).toBe(false);
    game.advance(1);
    expect(game.snapshot().activeWave?.id).toBe('shelter-levels-up');
    expect(world().plantStage).toBe(1);
    expect(hasSproutPlot(world())).toBe(true);
    expect(hasUpgradedHut(world())).toBe(false);

    game.advance(hut - 1);
    expect(game.snapshot().activeWave?.id).toBe('shelter-levels-up');
    expect(hasUpgradedHut(world())).toBe(false);
    game.advance(1);
    expect(hasUpgradedHut(world())).toBe(true);
    expect(game.snapshot().activeWave?.id).toBe('cooking-starts');
    expect(game.snapshot().phase).toBe('playing');

    // Cooking: the fire is still the campfire until the cooking Wave completes.
    const cooking = PLANT_LIFE_WAVES[5].durationMs;
    game.advance(cooking - 1);
    expect(hasCookingFire(world())).toBe(false);
    expect(world().fireStage).toBe(1);
    game.advance(1);
    expect(hasCookingFire(world())).toBe(true);
    expect(world().fireStage).toBe(2);
    expect(hasCaredForAnimal(world())).toBe(false);

    // Feeding: the animal is still wild until the feeding Wave completes; then it is cared for, still one.
    const feeding = PLANT_LIFE_WAVES[6].durationMs;
    expect(game.snapshot().activeWave?.id).toBe('animal-eats');
    game.advance(feeding - 1);
    expect(hasCaredForAnimal(world())).toBe(false);
    expect(world().animalStage).toBe(1);
    game.advance(1);
    expect(hasCaredForAnimal(world())).toBe(true);
    expect(world().animalStage).toBe(2);
    expect(world().population).toBe(1);
    expect(game.snapshot().phase).toBe('completed');
  });

  it('plays Turn 1 first: Turn 2 does not disturb the Turn 1 end state', () => {
    const turn1 = afterTurn1().snapshot().world;
    const turn2 = (() => {
      const game = inTurn2();
      game.advance(TURN2_MS);
      return game.snapshot().world;
    })();
    expect({
      ...turn2,
      plantStage: turn1.plantStage,
      shelterStage: turn1.shelterStage,
      fireStage: turn1.fireStage,
      animalStage: turn1.animalStage,
      selectedElements: turn1.selectedElements,
    }).toEqual(turn1);
  });
});

describe('Turn 2 logical clock', () => {
  function outcome(game: SliceGame): { world: SliceSnapshot['world']; phase: string; completed: readonly WaveId[] } {
    const { world, phase, completedWaves } = game.snapshot();
    return { world, phase, completed: completedWaves };
  }

  it('is invariant to how the same time is split into frames', () => {
    // A 1 ms margin keeps float accumulation over many tiny steps from landing a
    // hair short of the final Wave boundary; the compared state is the end state.
    const MARGIN_MS = 1;
    const reference = new SliceGame();
    reference.selectElement('fire');
    reference.advance(TURN1_MS + MARGIN_MS);
    reference.selectElement('plant');
    reference.advance(TURN2_MS + MARGIN_MS);

    const stepTo = (game: SliceGame, totalMs: number, step: number): void => {
      let elapsed = 0;
      while (elapsed < totalMs) {
        const delta = Math.min(step, totalMs - elapsed);
        game.advance(delta);
        elapsed += delta;
      }
    };
    for (const step of [1, 7, 16, 16.667, 33, 100]) {
      const game = new SliceGame();
      game.selectElement('fire');
      stepTo(game, TURN1_MS + MARGIN_MS, step);
      expect(game.selectElement('plant')).toEqual({ accepted: true });
      stepTo(game, TURN2_MS + MARGIN_MS, step);
      expect(outcome(game)).toEqual(outcome(reference));
    }
  });

  it('gives the same state at every checkpoint whether stepped or jumped', () => {
    for (const checkpoint of PLANT_LIFE_WAVES.reduce<number[]>((acc, wave) => [...acc, (acc.at(-1) ?? 0) + wave.durationMs], [])) {
      const jumped = inTurn2();
      jumped.advance(checkpoint - 1);
      const stepped = inTurn2();
      for (let t = 0; t < checkpoint - 1; t += 5) stepped.advance(Math.min(5, checkpoint - 1 - t));
      expect(outcome(stepped)).toEqual(outcome(jumped));
      expect(stepped.snapshot().activeWave?.id).toBe(jumped.snapshot().activeWave?.id);
    }
  });

  it('applies completion effects in order even when one huge delta spans every Wave', () => {
    const applied: string[] = [];
    const plantWaves: Wave[] = PLANT_LIFE_WAVES.map((wave) => ({
      ...wave,
      complete: (world) => {
        applied.push(wave.id);
        return wave.complete(world);
      },
    }));
    const game = new SliceGame({ plantWaves });
    game.selectElement('fire');
    game.advance(TURN1_MS);
    game.selectElement('plant');
    game.advance(1_000_000);
    expect(applied).toEqual(PLANT_IDS);
    expect(game.snapshot().world.shelterStage).toBe(2);
    expect(game.snapshot().world.fireStage).toBe(2);
    expect(game.snapshot().world.animalStage).toBe(2);
  });

  function playBothTurns(speed: number, realStepMs: number) {
    const game = new SliceGame({ playbackSpeed: speed });
    game.selectElement('fire');
    const order: string[] = [];
    const run = () => {
      let guard = 0;
      while (game.snapshot().phase === 'playing') {
        game.advance(realStepMs);
        const id = game.snapshot().activeWave?.id;
        if (id && order[order.length - 1] !== id) order.push(id);
        guard += 1;
        expect(guard).toBeLessThan(200_000);
      }
    };
    run();
    game.selectElement('plant');
    run();
    return { ...outcome(game), order };
  }

  it('keeps final state and Wave order identical across playback speeds', () => {
    const baseline = playBothTurns(1, 16);
    expect(baseline.order).toEqual([...FIRE_WARMING_WAVES.map((wave) => wave.id), ...PLANT_IDS]);
    for (const speed of [0.25, 0.5, 2, 4, 16]) {
      expect(playBothTurns(speed, 16)).toEqual(baseline);
    }
  });

  it('scales real time to logical time inside Turn 2', () => {
    const slow = afterTurn1();
    const fast = afterTurn1();
    slow.setPlaybackSpeed(0.5);
    fast.setPlaybackSpeed(2);
    for (const game of [slow, fast]) game.selectElement('plant');
    const first = PLANT_LIFE_WAVES[0].durationMs;
    slow.advance(first / 4);
    fast.advance(first / 4);
    expect(slow.snapshot().activeWave?.progress).toBeCloseTo(0.125);
    expect(fast.snapshot().activeWave?.progress).toBeCloseTo(0.5);
  });

  it('can change speed mid-Turn 2 without changing order or result', () => {
    const game = inTurn2();
    game.advance(PLANT_LIFE_WAVES[0].durationMs / 2);
    game.setPlaybackSpeed(8);
    game.advance(TURN2_MS / 4);
    expect(game.snapshot().phase).toBe('completed');
    expect(game.snapshot().completedWaves).toEqual([
      ...FIRE_WARMING_WAVES.map((wave) => wave.id),
      ...PLANT_IDS,
    ]);
  });

  it('lays the Waves out on the 97 BPM beat grid, except the two farm-work poses fixed at 1.5 s', () => {
    for (const wave of PLANT_LIFE_WAVES) {
      if (wave.id === 'human-waters-plot' || wave.id === 'human-harvests-plot') continue;
      const beats = wave.durationMs / BEAT_MS;
      expect(Math.abs(beats * 2 - Math.round(beats * 2))).toBeLessThan(0.01);
    }
    expect(BEAT_MS).toBeCloseTo(618.56, 1);
  });

  it('runs water1 for exactly 1500 ms, then harvest2 for exactly 1500 ms, then farm-expands (logical ms)', () => {
    expect(WAVE_MS['human-waters-plot']).toBe(1500);
    expect(WAVE_MS['human-harvests-plot']).toBe(1500);
    const order = PLANT_IDS.slice(0, 4);
    expect(order).toEqual(['human-walks-to-plot', 'human-waters-plot', 'human-harvests-plot', 'farm-expands']);
    const game = inTurn2();
    game.advance(WAVE_MS['human-walks-to-plot']);
    expect(game.snapshot().activeWave).toMatchObject({ id: 'human-waters-plot', elapsedMs: 0, durationMs: 1500 });
    game.advance(1499);
    expect(game.snapshot().activeWave).toMatchObject({ id: 'human-waters-plot', elapsedMs: 1499 });
    game.advance(1);
    expect(game.snapshot().activeWave).toMatchObject({ id: 'human-harvests-plot', elapsedMs: 0, durationMs: 1500 });
    game.advance(1500);
    expect(game.snapshot().activeWave).toMatchObject({ id: 'farm-expands', elapsedMs: 0 });
  });

  it('keeps the farm Waves at exactly 1500 ms at any playback speed (logical time, not real time)', () => {
    for (const speed of [0.25, 0.5, 2, 4]) {
      const game = inTurn2();
      game.setPlaybackSpeed(speed);
      game.advance(WAVE_MS['human-walks-to-plot'] / speed);
      expect(game.snapshot().activeWave?.id).toBe('human-waters-plot');
      game.advance(1499 / speed);
      expect(game.snapshot().activeWave?.id).toBe('human-waters-plot');
      game.advance(1 / speed + 1e-9);
      expect(game.snapshot().activeWave?.id).toBe('human-harvests-plot');
      game.advance(1500 / speed + 1e-9);
      expect(game.snapshot().activeWave?.id).toBe('farm-expands');
    }
  });

  it('establishes the plant state once: plantStage only ever goes 0, then 1 (at farm-expands), never 2', () => {
    const game = inTurn2();
    const seen: number[] = [];
    for (let t = 0; t < TURN2_MS + 200; t += 7) {
      const stage = game.snapshot().world.plantStage;
      if (seen[seen.length - 1] !== stage) seen.push(stage);
      game.advance(7);
    }
    expect(seen).toEqual([0, 1]);
    expect(game.snapshot().completedWaves.filter((id) => id === 'farm-expands')).toHaveLength(1);
  });

  it('requires at least one Wave in each Turn', () => {
    expect(() => new SliceGame({ plantWaves: [] })).toThrow(RangeError);
  });
});

describe('game logic stays independent of presentation', () => {
  const gameDir = new URL('./', import.meta.url);
  const presentationDir = new URL('../presentation/', import.meta.url);

  it('never imports Phaser or the presentation layer from src/game', () => {
    for (const file of readdirSync(gameDir).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
      const source = readFileSync(new URL(file, gameDir), 'utf8');
      expect(source, file).not.toMatch(/from ['"](phaser|\.\.\/presentation)/);
    }
  });

  it('never advances state from animation completion, tweens or timers', () => {
    for (const file of ['IslandScene.ts', 'lifeAnimation.ts', 'turn2Assets.ts', 'animation.ts']) {
      const source = readFileSync(new URL(file, presentationDir), 'utf8');
      expect(source, file).not.toMatch(/animationcomplete|ANIMATION_COMPLETE|animationupdate|delayedCall|\.tweens|setTimeout|setInterval|requestAnimationFrame/);
    }
  });

  it('has the Scene touch the game only through selectElement, advance and snapshot', () => {
    const source = readFileSync(new URL('IslandScene.ts', presentationDir), 'utf8');
    const calls = [...source.matchAll(/this\.slice\.(\w+)/g)].map((match) => match[1]);
    expect(new Set(calls)).toEqual(new Set(['advance', 'snapshot', 'selectElement']));
  });
});
