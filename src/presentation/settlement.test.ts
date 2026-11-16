import { describe, expect, it } from 'vitest';
import { snapshotAfter, snapshotAfterTurn, snapshotAt, snapshotAtMs } from '../testSupport/trueRoute';
import { ROCK_WAVES, WATER_WAVES, type WaveId } from '../game/waves';
import { LAYOUT } from './layout';
import {
  SETTLEMENT_SLOTS,
  WAVE_EFFECTS,
  computeFurnaceVisual,
  computeSettlementEffects,
  computeSettlementProps,
  computeVillageHomes,
  eatingAnimalRetirement,
  type PropSlot,
} from './settlement';

const alphas = (snapshot: Parameters<typeof computeSettlementProps>[0]): Record<PropSlot, number> =>
  Object.fromEntries(computeSettlementProps(snapshot).map((visual) => [visual.slot, visual.alpha])) as Record<PropSlot, number>;

const standing = (snapshot: Parameters<typeof computeSettlementProps>[0]): PropSlot[] =>
  SETTLEMENT_SLOTS.filter((slot) => alphas(snapshot)[slot] > 0);

describe('settlement props through the TRUE route', () => {
  it('shows nothing of Turn 3 or Turn 4 during and after Turns 1 and 2, leaving them unchanged', () => {
    for (const snapshot of [snapshotAfterTurn(1), snapshotAfterTurn(2), snapshotAt('human-splits', 0.5), snapshotAt('animal-eats', 0.5)]) {
      expect(standing(snapshot)).toEqual([]);
      expect(computeVillageHomes(snapshot).every((home) => home.alpha === 0)).toBe(true);
      expect(computeSettlementEffects(snapshot)).toEqual([]);
      expect(computeFurnaceVisual(snapshot).alpha).toBe(0);
      expect(eatingAnimalRetirement(snapshot)).toBe(1);
    }
  });

  it('ends Turn 3 with livestock parent and child, fence, feed area, an EMPTY bucket, a DRY riverbed and no water', () => {
    const turn3 = snapshotAfterTurn(3);
    expect(standing(turn3).sort()).toEqual(
      [
        'stoneWorkshop',
        'secondHut',
        'practicalCave',
        'fence',
        'feedTrough',
        'basinEmpty',
        'livestockParent',
        'livestockChild',
        'dryRiverbed',
      ].sort(),
    );
    const a = alphas(turn3);
    expect([a.springPond, a.flowingRiverbed, a.basinFilled, a.caveExterior, a.guardianParent, a.guardianChild]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(a.basinEmpty).toBe(1);
    expect(a.dryRiverbed).toBe(1);
    // The Turn 2 eating animal has given way; the finished furnace stands (as a world prop, not a prop slot).
    expect(eatingAnimalRetirement(turn3)).toBe(0);
    expect(computeFurnaceVisual(turn3)).toMatchObject({ alpha: 1, scale: 1 });
  });

  it('never shows freshwater, flow or a filled bucket at any moment of Turn 3', () => {
    for (const wave of ROCK_WAVES) {
      for (const progress of [0, 0.25, 0.5, 0.75, 0.9999]) {
        const a = alphas(snapshotAt(wave.id, progress));
        expect([wave.id, a.springPond, a.flowingRiverbed, a.basinFilled]).toEqual([wave.id, 0, 0, 0]);
      }
    }
  });

  it('ends Turn 4 with the flowing riverbed, transported filled bucket, village and shrine; Epilogue transforms the pair', () => {
    const ended = snapshotAfterTurn(4);
    const a = alphas(ended);
    expect(a.flowingRiverbed).toBe(1);
    expect(a.dryRiverbed).toBe(0);
    expect(a.basinFilled).toBe(1);
    expect(a.basinEmpty).toBe(0);
    expect(a.springPond).toBe(1);
    // The shrine hill stands and the practical-cave furnishings are retired: no stale cargo overlay.
    expect(a.caveExterior).toBe(1);
    expect(a.practicalCave).toBe(0);
    expect(computeFurnaceVisual(ended)).toMatchObject({ alpha: 1, scale: 1 });
    expect([a.guardianParent, a.guardianChild]).toEqual([1, 1]);
    expect([a.livestockParent, a.livestockChild]).toEqual([0, 0]);
    // Four homes: the approved hut, the second hut and two more standing in the village.
    expect(computeVillageHomes(ended).map((home) => home.alpha)).toEqual([1, 1]);
    expect(a.secondHut).toBe(1);
  });

  it('keeps the parent and child standing (not guardians) until the guardian Wave, after TRUE is judged', () => {
    const judged = snapshotAfter('true-judged');
    expect(alphas(judged).livestockParent).toBe(1);
    expect(alphas(judged).guardianParent).toBe(0);
    const mid = alphas(snapshotAt('guardian-transforms', 0.5));
    expect(mid.guardianParent).toBeGreaterThan(0);
    expect(mid.livestockParent).toBeGreaterThan(0);
    expect(mid.guardianParent + mid.livestockParent).toBeGreaterThan(0.9);
  });

  it('is continuous at every Wave boundary: no prop pops when the visible world flips', () => {
    for (const wave of [...ROCK_WAVES, ...WATER_WAVES]) {
      const before = alphas(snapshotAt(wave.id, 0.99999));
      const after = alphas(snapshotAfter(wave.id));
      for (const slot of SETTLEMENT_SLOTS) {
        expect(Math.abs(before[slot] - after[slot]), `${wave.id}/${slot}`).toBeLessThan(0.02);
      }
      const homesBefore = computeVillageHomes(snapshotAt(wave.id, 0.99999));
      const homesAfter = computeVillageHomes(snapshotAfter(wave.id));
      homesBefore.forEach((home, index) => expect(Math.abs(home.alpha - homesAfter[index].alpha), `${wave.id}/home`).toBeLessThan(0.02));
      // And the start of the Wave continues from the end of the previous one.
      const start = alphas(snapshotAt(wave.id, 0));
      const index = [...ROCK_WAVES, ...WATER_WAVES].indexOf(wave);
      const previous = [...ROCK_WAVES, ...WATER_WAVES][index - 1];
      if (previous !== undefined && (index !== ROCK_WAVES.length)) {
        const end = alphas(snapshotAfter(previous.id));
        for (const slot of SETTLEMENT_SLOTS) expect(Math.abs(start[slot] - end[slot]), `${wave.id}/${slot} start`).toBeLessThan(0.02);
      }
    }
  });

  it('is a pure function of the snapshot', () => {
    const snapshot = snapshotAt('livestock-fenced', 0.7);
    expect(computeSettlementProps(snapshot)).toEqual(computeSettlementProps(snapshot));
    expect(computeSettlementEffects(snapshot)).toEqual(computeSettlementEffects(snapshot));
  });

  it('shows glow only during Waves that build or grow something, at the moment it is being made', () => {
    const glowWaves = Object.keys(WAVE_EFFECTS) as WaveId[];
    for (const wave of [...ROCK_WAVES, ...WATER_WAVES]) {
      if (!glowWaves.includes(wave.id)) {
        expect(computeSettlementEffects(snapshotAt(wave.id, 0.5)), wave.id).toEqual([]);
        continue;
      }
      // Each accent peaks in the middle of its own window: the whole Wave, or (for a building)
      // the span in which its builder works on it, so the glow never precedes the builder.
      WAVE_EFFECTS[wave.id]!.forEach((spot, index) => {
        const middle = spot.window === undefined ? wave.durationMs / 2 : (spot.window.fromMs + spot.window.toMs) / 2;
        const peak = computeSettlementEffects(snapshotAtMs(wave.id, middle))[index];
        expect(peak.glow, `${wave.id}#${index} peak`).toBeGreaterThan(0.99);
        expect(computeSettlementEffects(snapshotAtMs(wave.id, 0))[index].glow, `${wave.id}#${index} start`).toBeCloseTo(0, 5);
      });
    }
  });

  it('keeps no blessing effect once a Wave is over: nothing glows between Waves, after the guardians or at the END', () => {
    for (const snapshot of [snapshotAfter('guardian-transforms'), snapshotAfterTurn(3), snapshotAfterTurn(4)]) {
      expect(computeSettlementEffects(snapshot)).toEqual([]);
    }
  });

});

describe('TRUE route layout', () => {
  const T = LAYOUT.true;
  const distanceToSegment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };

  it('puts the spring uphill of the farm and the cave above the spring, with the river running south-west to the sea', () => {
    expect(T.spring.y).toBeLessThan(LAYOUT.plot.y);
    expect(T.cave.y).toBeLessThan(T.spring.y);
    // South-west: the mouth is below and to the left of the source.
    expect(T.riverMouth.y).toBeGreaterThan(T.riverSource.y);
    expect(T.riverMouth.x).toBeLessThan(T.riverSource.x);
    // The mouth reaches the island's left shore.
    expect(T.riverMouth.x - LAYOUT.island.left).toBeLessThan(80);
  });

  it('has no direct water channel to the animal pen or its basin', () => {
    for (const target of [T.pen, T.basin, T.parent, T.child, T.guardianParent, T.guardianChild]) {
      expect(distanceToSegment(target, T.riverMouth, T.riverSource)).toBeGreaterThan(150);
      expect(Math.hypot(target.x - T.spring.x, target.y - T.spring.y)).toBeGreaterThan(150);
    }
  });

  it('keeps every placement on the island and clear of the selection panel', () => {
    const points = [
      T.plantPlot,
      T.workshop,
      T.furnace,
      T.furnaceStand,
      T.hutSite,
      T.secondHut,
      T.cave,
      T.caveHill,
      T.caveFront,
      T.caveInside,
      T.pen,
      T.penGate,
      T.basin,
      T.feed,
      T.spring,
      T.riverMouth,
      ...T.homes,
      ...T.homeSites,
      ...T.villageResidents,
    ];
    for (const point of points) {
      expect(point.y).toBeLessThan(LAYOUT.ui.panelTop - 60);
      expect(point.x).toBeGreaterThan(LAYOUT.island.left);
      expect(point.x).toBeLessThan(LAYOUT.island.right);
    }
  });
});
