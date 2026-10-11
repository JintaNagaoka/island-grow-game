import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SliceGame, type SliceSnapshot } from './sliceGame';
import { BEAT_MS, WAVE_DURATIONS_MS } from './timing';
import { FIRE_WARMING_WAVES, PLANT_LIFE_WAVES, type Wave, type WaveId } from './waves';
import { ELEMENTS, createInitialWorldState, hasSproutPlot, hasUpgradedHut } from './worldState';

const TURN1_MS = Object.values(WAVE_DURATIONS_MS).reduce((sum, ms) => sum + ms, 0);
const TURN2_MS = PLANT_LIFE_WAVES.reduce((sum, wave) => sum + wave.durationMs, 0);
const PLANT_IDS = PLANT_LIFE_WAVES.map((wave) => wave.id);

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
    expect(game.snapshot().activeWave?.id).toBe('sprout-plot-appears');
    game.advance(TURN2_MS);
    expect(game.snapshot().completedWaves).toEqual([
      ...FIRE_WARMING_WAVES.map((wave) => wave.id),
      ...PLANT_IDS,
    ]);
  });
});

describe('Turn 2 completion', () => {
  it('reaches the Turn 2 state: sprout plot and hut, one resident, one animal', () => {
    const game = inTurn2();
    game.advance(TURN2_MS);
    const snapshot = game.snapshot();
    expect(snapshot.phase).toBe('completed');
    expect(snapshot.inputLocked).toBe(false);
    expect(snapshot.activeWave).toBeNull();
    expect(snapshot.world).toEqual({
      turn: 0,
      selectedElements: ['fire', 'plant'],
      fireStage: 1,
      plantStage: 1,
      shelterStage: 2,
      humanStage: 1,
      population: 1,
      isCold: false,
    });
    expect(hasSproutPlot(snapshot.world)).toBe(true);
    expect(hasUpgradedHut(snapshot.world)).toBe(true);
    // Population is unchanged and WorldState has no animal-count, fence, pond or shrine field to change.
    expect(snapshot.world.population).toBe(1);
    expect(Object.keys(snapshot.world).sort()).toEqual(
      ['fireStage', 'humanStage', 'isCold', 'plantStage', 'population', 'selectedElements', 'shelterStage', 'turn'],
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
      'sprout-plot-appears',
      'human-waters-plot',
      'human-harvests-plot',
      'shelter-levels-up',
      'cooking-starts',
      'animal-eats',
    ]);
    const base = { ...createInitialWorldState(), isCold: false, fireStage: 1 };
    const effects = new Map(PLANT_LIFE_WAVES.map((wave) => [wave.id, wave.complete(base)]));
    expect(effects.get('sprout-plot-appears')).toEqual({ ...base, plantStage: 1 });
    expect(effects.get('shelter-levels-up')).toEqual({ ...base, shelterStage: 2 });
    for (const id of PLANT_IDS.filter((id) => id !== 'sprout-plot-appears' && id !== 'shelter-levels-up')) {
      expect(effects.get(id)).toEqual(base);
    }
  });

  it('applies each persistent effect only when its own Wave completes', () => {
    const game = inTurn2();
    const world = () => game.snapshot().world;
    const [walk, plot, water, harvest, hut] = PLANT_LIFE_WAVES.map((wave) => wave.durationMs);

    game.advance(walk + plot - 1);
    expect(game.snapshot().activeWave?.id).toBe('sprout-plot-appears');
    expect(hasSproutPlot(world())).toBe(false);
    game.advance(1);
    expect(hasSproutPlot(world())).toBe(true);
    expect(hasUpgradedHut(world())).toBe(false);

    game.advance(water + harvest + hut - 1);
    expect(game.snapshot().activeWave?.id).toBe('shelter-levels-up');
    expect(hasUpgradedHut(world())).toBe(false);
    game.advance(1);
    expect(hasUpgradedHut(world())).toBe(true);
    expect(game.snapshot().activeWave?.id).toBe('cooking-starts');
    expect(game.snapshot().phase).toBe('playing');
  });

  it('plays Turn 1 first: Turn 2 does not disturb the Turn 1 end state', () => {
    const turn1 = afterTurn1().snapshot().world;
    const turn2 = (() => {
      const game = inTurn2();
      game.advance(TURN2_MS);
      return game.snapshot().world;
    })();
    expect({ ...turn2, plantStage: turn1.plantStage, shelterStage: turn1.shelterStage, selectedElements: turn1.selectedElements }).toEqual(turn1);
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

  it('lays the Waves out on the 97 BPM beat grid', () => {
    for (const wave of PLANT_LIFE_WAVES) {
      const beats = wave.durationMs / BEAT_MS;
      expect(Math.abs(beats * 2 - Math.round(beats * 2))).toBeLessThan(0.01);
    }
    expect(BEAT_MS).toBeCloseTo(618.56, 1);
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
