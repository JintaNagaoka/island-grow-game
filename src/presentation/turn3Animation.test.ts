import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SliceGame, type SliceSnapshot } from '../game/sliceGame';
import { WAVE_DURATIONS_MS } from '../game/timing';
import { PLANT_LIFE_WAVES, ROCK_SETTLEMENT_WAVES } from '../game/waves';
import { computeTurn3Action, computeTurn3Props } from './turn3Animation';
import { computeAnimalVisual, computeFarmTiles, computeFarmVisual } from './lifeAnimation';
import { computeResidentVisuals } from './residents';
import { LAYOUT } from './layout';
import {
  TURN3_ACTION_ANIMATIONS,
  TURN3_ACTION_ASSET_LIST,
  TURN3_ACTION_FRAMES,
  TURN3_ASSET_LIST,
  TURN3_ASSET_STATUS,
  TURN3_WORLD_ASSET_LIST,
} from './turn3Assets';

const TURN1_MS = Object.values(WAVE_DURATIONS_MS).reduce((sum, ms) => sum + ms, 0);
const TURN2_MS = PLANT_LIFE_WAVES.reduce((sum, wave) => sum + wave.durationMs, 0);
const TURN3_MS = ROCK_SETTLEMENT_WAVES.reduce((sum, wave) => sum + wave.durationMs, 0);

function atTurn3(ms: number, speed = 1): SliceSnapshot {
  const game = new SliceGame({ playbackSpeed: speed });
  game.selectElement('fire');
  game.advance(TURN1_MS / speed);
  game.selectElement('plant');
  game.advance(TURN2_MS / speed);
  game.selectElement('rock');
  game.advance(ms / speed);
  return game.snapshot();
}

describe('Turn 3 provisional asset contract', () => {
  it('registers ten world props and three three-frame actions without duplicate keys', () => {
    expect(TURN3_WORLD_ASSET_LIST).toHaveLength(10);
    expect(TURN3_ACTION_ASSET_LIST).toHaveLength(9);
    expect(TURN3_ASSET_LIST).toHaveLength(19);
    expect(new Set(TURN3_ASSET_LIST.map((asset) => asset.textureKey)).size).toBe(19);
    for (const asset of TURN3_ASSET_LIST) {
      expect(asset).toMatchObject({
        width: 512,
        height: 512,
        status: TURN3_ASSET_STATUS,
        placementSpace: 'island',
      });
      expect(asset.filename).toMatch(/\.png$/);
      expect(asset.groundAnchor.x).toBeGreaterThanOrEqual(0);
      expect(asset.groundAnchor.x).toBeLessThan(512);
      expect(asset.groundAnchor.y).toBeGreaterThanOrEqual(0);
      expect(asset.groundAnchor.y).toBeLessThan(512);
    }
  });

  it('centralizes frame order, duration, repeat, origin and no-root-motion metadata', () => {
    expect(TURN3_ACTION_ANIMATIONS).toMatchObject({
      status: 'provisional',
      frameSize: { width: 512, height: 512 },
      frameDurationMs: 180,
      cycleDurationMs: 540,
      repeat: true,
      origin: { x: 0.5, y: 480 / 512 },
      direction: 'right',
      rootMotion: false,
    });
    expect(TURN3_ACTION_ANIMATIONS.animations.map((animation) => animation.id)).toEqual(['gather', 'build', 'carry']);
    for (const id of ['gather', 'build', 'carry'] as const) {
      const animation = TURN3_ACTION_ANIMATIONS.animations.find((candidate) => candidate.id === id);
      expect(animation?.sequence).toEqual(TURN3_ACTION_FRAMES[id].map((frame) => frame.filename));
      expect(animation?.frameTextureKeys).toEqual(TURN3_ACTION_FRAMES[id].map((frame) => frame.textureKey));
    }
  });

  it('keeps the bundled animation.json in sync with the runtime contract', () => {
    const file = new URL('../../public/assets/human/actions/animation.json', import.meta.url);
    const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const { animations, ...shared } = TURN3_ACTION_ANIMATIONS;
    expect(json).toEqual({
      ...shared,
      animations: animations.map(({ id, sequence }) => ({ id, sequence })),
    });
  });
});

describe('Turn 3 pure presentation', () => {
  it('shows no Turn 3 props before rock and all required props at completion', () => {
    const before = atTurn3(0);
    expect(Object.values(computeTurn3Props(before)).every((visual) => visual.alpha === 0)).toBe(true);
    const completed = atTurn3(TURN3_MS + 1);
    expect(Object.values(computeTurn3Props(completed)).every((visual) => visual.alpha === 1)).toBe(true);
  });

  it('replaces Turn 2 farm/animal art and leaves three state-backed residents', () => {
    const completed = atTurn3(TURN3_MS + 1);
    expect(computeFarmVisual(completed)).toMatchObject({ frame: null, alpha: 0 });
    expect(computeFarmTiles(completed).every((tile) => tile.alpha === 0)).toBe(true);
    expect(computeAnimalVisual(completed)).toMatchObject({ wildAlpha: 0, eatAlpha: 0 });
    const residents = computeResidentVisuals(completed);
    expect(residents.map((resident) => resident.id)).toEqual(['resident-1', 'resident-2', 'resident-3']);
    expect(residents.find((resident) => resident.id === 'resident-3')).toMatchObject({ alpha: 1 });
    expect(residents.find((resident) => resident.id === 'resident-1')).toMatchObject({
      alpha: 1,
      pose: { x: LAYOUT.livestockHuman.x, y: LAYOUT.livestockHuman.y },
    });
    expect(residents.find((resident) => resident.id === 'resident-2')).toMatchObject({
      pose: { x: LAYOUT.plotHuman.x, y: LAYOUT.plotHuman.y },
    });
    expect(residents.find((resident) => resident.id === 'resident-3')).toMatchObject({
      pose: { x: LAYOUT.workshopHuman.x, y: LAYOUT.workshopHuman.y },
    });
  });

  it('maps gather, build and carry frames from logical Wave time only', () => {
    const offsets = ROCK_SETTLEMENT_WAVES.reduce<number[]>((acc, wave) => [
      ...acc,
      (acc.at(-1) ?? 0) + wave.durationMs,
    ], []);
    expect(computeTurn3Action(atTurn3(0))).toBeNull();
    expect(computeTurn3Action(atTurn3(offsets[0] + 200))?.action).toBe('gather');
    expect(computeTurn3Action(atTurn3(offsets[1] + 200))?.action).toBe('build');
    expect(computeTurn3Action(atTurn3(offsets[2] + 200))?.action).toBe('carry');
    expect(computeTurn3Action(atTurn3(offsets[2] + 200))?.ground).toEqual(LAYOUT.turn3Actions.carry);
    expect(computeTurn3Action(atTurn3(offsets[3] + 200))).toMatchObject({
      action: 'carry',
      ground: LAYOUT.livestockHuman,
    });
  });

  it('moves the livestock worker into place while leaving the workshop worker visible', () => {
    const livestockStart = ROCK_SETTLEMENT_WAVES.slice(0, 4).reduce((sum, wave) => sum + wave.durationMs, 0);
    const during = computeResidentVisuals(atTurn3(livestockStart + 200));
    expect(during.find((resident) => resident.id === 'resident-1')?.alpha).toBe(0);
    expect(during.find((resident) => resident.id === 'resident-3')).toMatchObject({
      alpha: 1,
      pose: { x: LAYOUT.workshopHuman.x, y: LAYOUT.workshopHuman.y },
    });
  });

  it('is playback-speed invariant and never mutates WorldState', () => {
    for (const logicalMs of [0, 800, 1800, 3200, 5000, TURN3_MS]) {
      const baseline = atTurn3(logicalMs);
      const before = structuredClone(baseline.world);
      const expected = { props: computeTurn3Props(baseline), action: computeTurn3Action(baseline) };
      expect(baseline.world).toEqual(before);
      for (const speed of [0.25, 0.5, 2, 4]) {
        const snapshot = atTurn3(logicalMs, speed);
        expect({ props: computeTurn3Props(snapshot), action: computeTurn3Action(snapshot) }).toEqual(expected);
      }
    }
  });
});
