import { describe, expect, it } from 'vitest';
import { SliceGame, type SliceSnapshot } from './sliceGame';
import { WAVE_DURATIONS_MS } from './timing';
import { PLANT_LIFE_WAVES, ROCK_SETTLEMENT_WAVES, type WaveId } from './waves';
import {
  hasDomesticLivestockFamily,
  hasDryRiverbed,
  hasLivestockFacilities,
  hasMatureFarm,
  hasPracticalCave,
  hasSecondDwelling,
  hasStoneWorkshop,
} from './worldState';

const TURN1_MS = Object.values(WAVE_DURATIONS_MS).reduce((sum, ms) => sum + ms, 0);
const TURN2_MS = PLANT_LIFE_WAVES.reduce((sum, wave) => sum + wave.durationMs, 0);
const TURN3_MS = ROCK_SETTLEMENT_WAVES.reduce((sum, wave) => sum + wave.durationMs, 0);

function afterTurn2(options: ConstructorParameters<typeof SliceGame>[0] = {}): SliceGame {
  const game = new SliceGame(options);
  expect(game.selectElement('fire')).toEqual({ accepted: true });
  game.advance(TURN1_MS / (options.playbackSpeed ?? 1));
  expect(game.selectElement('plant')).toEqual({ accepted: true });
  game.advance(TURN2_MS / (options.playbackSpeed ?? 1));
  return game;
}

describe('Turn 3 rock route', () => {
  it('accepts rock only as the third selection and creates the third resident once', () => {
    const game = afterTurn2();
    expect(game.snapshot().selectableElements).toEqual(['rock']);
    expect(game.selectElement('rock')).toEqual({ accepted: true });
    const { world, activeWave } = game.snapshot();
    expect(world.selectedElements).toEqual(['fire', 'plant', 'rock']);
    expect(world.population).toBe(3);
    expect(world.humanStage).toBe(3);
    expect(world.residents.map((resident) => resident.id)).toEqual(['resident-1', 'resident-2', 'resident-3']);
    expect(activeWave).toMatchObject({ id: 'human-splits-third', index: 0, progress: 0 });
    expect(game.selectElement('rock')).toEqual({ accepted: false, reason: 'input-locked' });
    expect(game.snapshot().world.population).toBe(3);
  });

  it('declares the serial cause and grouped results in the approved order and 5-8 second target', () => {
    expect(ROCK_SETTLEMENT_WAVES.map((wave) => wave.id)).toEqual([
      'human-splits-third',
      'human-gathers-stone',
      'stone-workshop-built',
      'settlement-expands',
      'livestock-domesticated',
    ]);
    expect(TURN3_MS).toBeGreaterThanOrEqual(5000);
    expect(TURN3_MS).toBeLessThanOrEqual(8000);
  });

  it('commits each persistent result only at its Wave boundary', () => {
    const game = afterTurn2();
    game.selectElement('rock');
    const [split, gather, workshop, settlement, livestock] = ROCK_SETTLEMENT_WAVES.map((wave) => wave.durationMs);

    game.advance(split + gather + workshop - 1);
    expect(game.snapshot().activeWave?.id).toBe('stone-workshop-built');
    expect(hasStoneWorkshop(game.snapshot().world)).toBe(false);
    game.advance(1);
    expect(hasStoneWorkshop(game.snapshot().world)).toBe(true);
    expect(game.snapshot().activeWave?.id).toBe('settlement-expands');

    game.advance(settlement - 1);
    expect(hasMatureFarm(game.snapshot().world)).toBe(false);
    expect(hasSecondDwelling(game.snapshot().world)).toBe(false);
    expect(hasPracticalCave(game.snapshot().world)).toBe(false);
    expect(hasDryRiverbed(game.snapshot().world)).toBe(false);
    game.advance(1);
    expect(hasMatureFarm(game.snapshot().world)).toBe(true);
    expect(hasSecondDwelling(game.snapshot().world)).toBe(true);
    expect(hasPracticalCave(game.snapshot().world)).toBe(true);
    expect(hasDryRiverbed(game.snapshot().world)).toBe(true);

    game.advance(livestock - 1);
    expect(hasDomesticLivestockFamily(game.snapshot().world)).toBe(false);
    expect(hasLivestockFacilities(game.snapshot().world)).toBe(false);
    game.advance(1);
    expect(game.snapshot().phase).toBe('completed');
    expect(hasDomesticLivestockFamily(game.snapshot().world)).toBe(true);
    expect(hasLivestockFacilities(game.snapshot().world)).toBe(true);
  });

  it('finishes with the explicit Turn 3 state and no water, pond, canal or shrine state', () => {
    const game = afterTurn2();
    game.selectElement('rock');
    game.advance(TURN3_MS);
    const { world } = game.snapshot();
    expect(world).toMatchObject({
      selectedElements: ['fire', 'plant', 'rock'],
      fireStage: 2,
      plantStage: 2,
      shelterStage: 2,
      animalStage: 3,
      stoneStage: 1,
      caveStage: 1,
      riverStage: 1,
      dwellingCount: 2,
      animalCount: 2,
      livestockFacilitiesStage: 1,
      humanStage: 3,
      population: 3,
    });
    expect(world.residents).toEqual([
      { id: 'resident-1', place: 'fire', target: null, motion: 'idle' },
      { id: 'resident-2', place: 'plot', target: null, motion: 'idle' },
      { id: 'resident-3', place: 'workshop', target: null, motion: 'idle' },
    ]);
    expect(game.snapshot().selectableElements).toEqual([]);
    expect(game.selectElement('water')).toEqual({ accepted: false, reason: 'not-implemented' });
    expect(Object.keys(world)).not.toEqual(expect.arrayContaining(['pondStage', 'canalStage', 'shrineStage']));
  });
});

describe('Turn 3 logical clock', () => {
  const outcome = (snapshot: SliceSnapshot): {
    world: SliceSnapshot['world'];
    phase: string;
    completed: readonly WaveId[];
  } => ({ world: snapshot.world, phase: snapshot.phase, completed: snapshot.completedWaves });

  it('is invariant to frame splitting and playback speed', () => {
    const reference = afterTurn2();
    reference.selectElement('rock');
    reference.advance(TURN3_MS + 1);

    for (const speed of [0.25, 0.5, 1, 2, 4]) {
      for (const step of [1, 7, 16.667, 33, 100]) {
        const game = afterTurn2({ playbackSpeed: speed });
        game.selectElement('rock');
        const realTotal = (TURN3_MS + 1) / speed;
        let elapsed = 0;
        while (elapsed < realTotal) {
          const delta = Math.min(step, realTotal - elapsed);
          game.advance(delta);
          elapsed += delta;
        }
        expect(outcome(game.snapshot())).toEqual(outcome(reference.snapshot()));
      }
    }
  });

  it('runs every completion callback in order even across one large frame', () => {
    const applied: WaveId[] = [];
    const rockWaves = ROCK_SETTLEMENT_WAVES.map((wave) => ({
      ...wave,
      complete: (world: Parameters<typeof wave.complete>[0]) => {
        applied.push(wave.id);
        return wave.complete(world);
      },
    }));
    const game = afterTurn2({ rockWaves });
    game.selectElement('rock');
    game.advance(1_000_000);
    expect(applied).toEqual(ROCK_SETTLEMENT_WAVES.map((wave) => wave.id));
  });
});
