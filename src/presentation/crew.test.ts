import { describe, expect, it } from 'vitest';
import { SliceGame, type SliceSnapshot } from '../game/sliceGame';
import { TRUE_ROUTE } from '../game/rules/state';
import { ROCK_WAVES, WATER_WAVES, type WaveId } from '../game/waves';
import {
  FIRST_RESIDENT_ID,
  SECOND_RESIDENT_ID,
  THIRD_RESIDENT_ID,
  VILLAGE_RESIDENT_IDS,
  type ResidentPlace,
} from '../game/worldState';
import { snapshotAfter, snapshotAfterTurn, snapshotAt, snapshotAtMs } from '../testSupport/trueRoute';
import {
  LOADS,
  PLACE_SPOTS,
  ROUTINES,
  WORK_ACTIONS,
  arrivalMs,
  computeCrewVisuals,
  hiddenSpan,
  residentSpot,
  routineDurationMs,
  routineEndSpot,
  workEndMs,
  workStartMs,
} from './crew';
import * as crewModule from './crew';
import { ACTION_FRAME_MS } from './humanActions';
import { HUMAN_WALK_SPEED_PX_PER_MS } from './humanWalk';
import { LAYOUT } from './layout';
import { computeResidentVisuals, type ResidentVisual } from './residents';
import { computePlantVisual } from './plantGrowth';
import { computeFurnaceVisual, computeSettlementEffects, computeSettlementProps, computeVillageHomes } from './settlement';

const T = LAYOUT.true;
const ALL_WAVES = [...ROCK_WAVES, ...WATER_WAVES];
const visualOf = (snapshot: SliceSnapshot, id: string): ResidentVisual => {
  const found = computeResidentVisuals(snapshot).find((visual) => visual.id === id);
  if (found === undefined) throw new Error(`no visual for ${id}`);
  return found;
};
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

// Every frame of the TRUE route, `stepMs` of logical time apart.
function eachFrame(stepMs: number, visit: (snapshot: SliceSnapshot) => void): void {
  const game = new SliceGame();
  for (const element of TRUE_ROUTE) {
    game.selectElement(element);
    while (game.snapshot().phase === 'playing') {
      game.advance(stepMs);
      visit(game.snapshot());
    }
  }
}

describe('residents 3 to 6', () => {
  it('has no crew before Turn 3, so Turn 1 and Turn 2 residents are unchanged', () => {
    for (const snapshot of [snapshotAfterTurn(1), snapshotAfterTurn(2), snapshotAt('animal-eats', 0.5)]) {
      expect(computeCrewVisuals(snapshot)).toEqual([]);
    }
  });

  it('divides the third resident off the first at the fire, after the shake', () => {
    const early = visualOf(snapshotAt('human-divides', 0.2), THIRD_RESIDENT_ID);
    expect(early.alpha).toBe(0);
    const late = visualOf(snapshotAt('human-divides', 0.9), THIRD_RESIDENT_ID);
    expect(late.alpha).toBe(1);
    expect(late.pose.x).toBe(LAYOUT.humanWarm.x);
    expect(late.pose.y).toBe(LAYOUT.humanWarm.y);
    // The first resident shakes during the same Wave (the Turn 2 split behaviour).
    const first = computeResidentVisuals(snapshotAt('human-divides', 0.25)).find((visual) => visual.id === 'resident-1')!;
    expect(first.shakeX).not.toBe(0);
    // The resident joins the world only when the Wave completes.
    expect(snapshotAt('human-divides', 0.5).world.residents.map((r) => r.id)).not.toContain(THIRD_RESIDENT_ID);
    expect(snapshotAfter('human-divides').world.residents.map((r) => r.id)).toContain(THIRD_RESIDENT_ID);
  });

  it('adds residents 4 to 6 one after another in the village, ending with six humans in all', () => {
    const early = computeCrewVisuals(snapshotAt('village-gathers', 0.1));
    const mid = computeCrewVisuals(snapshotAt('village-gathers', 0.5));
    const visible = (visuals: typeof early) => VILLAGE_RESIDENT_IDS.filter((id) => (visuals.find((v) => v.id === id)?.alpha ?? 0) > 0);
    expect(visible(early).length).toBeLessThan(visible(mid).length);
    const ended = snapshotAfterTurn(4);
    const all = computeResidentVisuals(ended);
    expect(new Set(all.map((visual) => visual.id)).size).toBe(6);
    expect(all.every((visual) => visual.alpha > 0)).toBe(true);
    expect(ended.world.population).toBe(6);
    expect(ended.world.residents).toHaveLength(6);
  });

  it('knows a resting spot for every place, and a village spot for each added resident', () => {
    const places: ResidentPlace[] = ['start', 'fire', 'plot', 'workshop', 'hut-site', 'riverbed', 'pen', 'village', 'furnace', 'cave', 'home-a', 'home-b'];
    for (const place of places) expect(PLACE_SPOTS[place]).toBeDefined();
    VILLAGE_RESIDENT_IDS.forEach((id, index) => expect(residentSpot('village', id)).toEqual(T.villageResidents[index]));
  });
});

describe('Wave routines', () => {
  const waves = new Map(ALL_WAVES.map((wave) => [wave.id, wave]));
  const entries = Object.entries(ROUTINES).flatMap(([waveId, byResident]) =>
    Object.entries(byResident ?? {}).map(([id, routine]) => ({ waveId: waveId as WaveId, id, routine })),
  );

  it('belong to Turn 3 and Turn 4 Waves only, and use only declared work actions and loads', () => {
    expect(entries.length).toBeGreaterThan(10);
    for (const { waveId, routine } of entries) {
      expect(waves.has(waveId), waveId).toBe(true);
      for (const step of routine.steps) {
        if (step.kind === 'work') expect(WORK_ACTIONS).toContain(step.action);
        if (step.kind === 'carry') expect(LOADS).toContain(step.load);
      }
    }
  });

  it('fit inside their Wave at the approved walking speed, so nobody is cut off or teleported at the Wave’s end', () => {
    for (const { waveId, id, routine } of entries) {
      expect(routineDurationMs(routine, id), `${waveId}/${id}`).toBeLessThanOrEqual(waves.get(waveId)!.durationMs);
    }
  });

  it('start where the previous Wave left the resident and end where the Wave leaves them', () => {
    for (const { waveId, id, routine } of entries) {
      const before = snapshotAtMs(waveId, 0).world.residents.find((resident) => resident.id === id);
      expect(before?.place, `${waveId}/${id} starts at its place`).toBe(routine.from);
      const after = snapshotAfter(waveId).world.residents.find((resident) => resident.id === id)!;
      expect(distance(residentSpot(after.place, id), routineEndSpot(routine, id)), `${waveId}/${id} ends at its new place`).toBeLessThanOrEqual(1.5);
    }
  });

  it('never moves a resident faster than the approved walk, never duplicates an id, and never drops one', () => {
    const last = new Map<string, { x: number; y: number; alpha: number }>();
    const stepMs = 40;
    eachFrame(stepMs, (snapshot) => {
      if (snapshot.resolved.turn < 3) return;
      const visuals = computeResidentVisuals(snapshot);
      const ids = visuals.map((visual) => visual.id);
      expect(new Set(ids).size, 'one visual per resident id').toBe(ids.length);
      for (const resident of snapshot.world.residents) expect(ids, `${resident.id} is always drawn`).toContain(resident.id);
      for (const visual of visuals) {
        const now = { x: visual.pose.x, y: visual.pose.y, alpha: visual.alpha };
        const before = last.get(visual.id);
        // Hidden or just-arrived residents are skipped: nothing to compare.
        if (before !== undefined && before.alpha > 0 && now.alpha > 0) {
          expect(distance(before, now), `${visual.id} at ${snapshot.clockMs}`).toBeLessThanOrEqual(HUMAN_WALK_SPEED_PX_PER_MS * stepMs * 1.08 + 0.8);
        }
        last.set(visual.id, now);
      }
    });
  });

  it('lets independent work run in parallel: several residents work in the same Wave', () => {
    for (const waveId of ['livestock-fenced', 'village-built'] as const) {
      expect(Object.keys(ROUTINES[waveId]!).length, waveId).toBeGreaterThanOrEqual(2);
    }
    // And they are visibly doing different things at the same instant.
    const snapshot = snapshotAtMs('village-built', 1500);
    const assets = VILLAGE_RESIDENT_IDS.map((id) => visualOf(snapshot, id).pose.asset);
    expect(new Set(assets).size).toBeGreaterThanOrEqual(2);
  });
});

// Where each resident stands once the village stands. Presentation's choice of station, not a rule.
const STATIONS: Readonly<Record<string, ResidentPlace>> = {
  'resident-1': 'fire',
  'resident-2': 'plot',
  'resident-3': 'pen',
  'resident-4': 'home-a',
  'resident-5': 'home-b',
  'resident-6': 'workshop',
};
const isWorkAsset = (asset: string): boolean => /^action-/.test(asset);

describe('work ends when its creation step ends, and nobody works at the END', () => {
  it('has a standing station for each of the six residents but no standing job (no endless work routines)', () => {
    expect(Object.keys(STATIONS)).toHaveLength(6);
    const ended = snapshotAfterTurn(4);
    for (const resident of ended.world.residents) expect(resident.place, resident.id).toBe(STATIONS[resident.id]);
    expect(Object.keys(crewModule).some((name) => /ROLES/.test(name))).toBe(false);
  });

  it('keeps all six residents standing still at their stations after the END, with no work pose and no effect', () => {
    const game = new SliceGame();
    for (const element of TRUE_ROUTE) {
      game.selectElement(element);
      game.advance(120_000);
    }
    expect(game.snapshot().phase).toBe('ended');
    const spots = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      game.advance(250);
      const visuals = computeResidentVisuals(game.snapshot());
      expect(visuals.map((visual) => visual.id).sort()).toEqual(['resident-1', 'resident-2', 'resident-3', 'resident-4', 'resident-5', 'resident-6']);
      for (const visual of visuals) {
        expect(visual.alpha, visual.id).toBe(1);
        expect(isWorkAsset(visual.pose.asset), `${visual.id} @ ${i}: ${visual.pose.asset}`).toBe(false);
        expect(visual.layers?.effect ?? null, `${visual.id} @ ${i}`).toBeNull();
        // At its station: the resident neither walks nor drifts.
        expect(distance(visual.pose, residentSpot(STATIONS[visual.id], visual.id)), visual.id).toBeLessThanOrEqual(0.5);
        expect(visual.pose.walk, visual.id).toBeNull();
        spots.add(`${Math.round(visual.pose.x)},${Math.round(visual.pose.y)}`);
      }
    }
    expect(spots.size).toBe(6);
  });

  it('shows a work pose only for a resident whose routine is in the Wave being played, at any moment of the route', () => {
    let work = 0;
    eachFrame(40, (snapshot) => {
      const wave = snapshot.activeWave;
      for (const visual of computeResidentVisuals(snapshot)) {
        const routine = wave === null ? undefined : ROUTINES[wave.id]?.[visual.id];
        if (isWorkAsset(visual.pose.asset)) {
          work += 1;
          expect(routine, `${visual.id} works at ${snapshot.clockMs} in ${wave?.id ?? 'no Wave'}`).toBeDefined();
        }
        if (visual.layers?.effect != null) expect(routine, `${visual.id} raises an effect at ${snapshot.clockMs}`).toBeDefined();
      }
    });
    expect(work).toBeGreaterThan(100);
  });

  // Every piece of creation work: who does it, in which Wave, and what it creates. The result is
  // complete when the work ends, the resident is not working a moment later, and does not work on it again.
  const creations = [
    { target: 'workshop', wave: 'workshop-appears', id: FIRST_RESIDENT_ID, action: 'build', alpha: (s: SliceSnapshot) => propAlpha(s, 'stoneWorkshop') },
    { target: 'second hut', wave: 'human-builds-hut', id: THIRD_RESIDENT_ID, action: 'build', alpha: (s: SliceSnapshot) => propAlpha(s, 'secondHut') },
    { target: 'furnace', wave: 'furnace-lights', id: THIRD_RESIDENT_ID, action: 'build', alpha: (s: SliceSnapshot) => computeFurnaceVisual(s).alpha },
    { target: 'fence', wave: 'livestock-fenced', id: THIRD_RESIDENT_ID, action: 'build', alpha: (s: SliceSnapshot) => propAlpha(s, 'fence') },
    { target: 'feed area', wave: 'livestock-fenced', id: THIRD_RESIDENT_ID, action: 'build', alpha: (s: SliceSnapshot) => propAlpha(s, 'feedTrough') },
    { target: 'empty basin', wave: 'livestock-fenced', id: THIRD_RESIDENT_ID, action: 'build', alpha: (s: SliceSnapshot) => propAlpha(s, 'basinEmpty') },
    { target: 'riverbed', wave: 'riverbed-dug', id: THIRD_RESIDENT_ID, action: 'dig', alpha: (s: SliceSnapshot) => propAlpha(s, 'dryRiverbed') },
    { target: 'home A', wave: 'village-built', id: VILLAGE_RESIDENT_IDS[0], action: 'build', alpha: (s: SliceSnapshot) => computeVillageHomes(s)[0].alpha },
    { target: 'home B', wave: 'village-built', id: VILLAGE_RESIDENT_IDS[1], action: 'build', alpha: (s: SliceSnapshot) => computeVillageHomes(s)[1].alpha },
    { target: 'filled basin', wave: 'water-carried', id: THIRD_RESIDENT_ID, action: 'pour', alpha: (s: SliceSnapshot) => propAlpha(s, 'basinFilled') },
  ] as const;
  const propAlpha = (snapshot: SliceSnapshot, slot: string): number => computeSettlementProps(snapshot).find((visual) => visual.slot === slot)!.alpha;

  for (const creation of creations) {
    it(`${creation.target}: not there while the resident walks, complete exactly as the ${creation.action} work ends, and the resident stops`, () => {
      const routine = ROUTINES[creation.wave]![creation.id];
      const start = workStartMs(routine, creation.id, creation.action)!;
      const end = workEndMs(routine, creation.id, creation.action)!;
      const wave = ALL_WAVES.find((candidate) => candidate.id === creation.wave)!;
      expect(end, 'the work fits in the Wave').toBeLessThanOrEqual(wave.durationMs);
      // Before the work starts nothing of it stands; the resident is not yet working.
      expect(creation.alpha(snapshotAtMs(creation.wave, Math.max(0, start - 50))), 'not yet').toBe(0);
      // It is complete as the work ends, and not a moment before the last strikes.
      expect(creation.alpha(snapshotAtMs(creation.wave, end - 1)), 'complete at the end of the work').toBeGreaterThan(0.99);
      expect(creation.alpha(snapshotAtMs(creation.wave, start + ACTION_FRAME_MS)), 'still being made after the first frame').toBeLessThan(0.5);
      // The moment the work ends the resident is no longer working: no work pose, no effect.
      if (end + 20 < wave.durationMs) {
        const after = visualOf(snapshotAtMs(creation.wave, end + 20), creation.id);
        expect(isWorkAsset(after.pose.asset), 'stops working').toBe(false);
        expect(after.layers?.effect ?? null).toBeNull();
      }
      // At the Wave's end and from then on, still not working on it (nothing restarts it).
      for (const snapshot of [snapshotAfter(creation.wave), snapshotAfterTurn(4)]) {
        const later = visualOf(snapshot, creation.id);
        expect(isWorkAsset(later.pose.asset), 'does not work again').toBe(false);
        expect(later.layers?.effect ?? null).toBeNull();
      }
      // Exactly one routine in the whole route does this work on this target's resident and action.
      const same = Object.entries(ROUTINES).filter(([, byResident]) =>
        byResident?.[creation.id]?.steps.some((step) => step.kind === 'work' && step.action === creation.action),
      );
      expect(same.map(([waveId]) => waveId)).toContain(creation.wave);
    });
  }

  it('does no digging or farming for the plant: the only digging in the whole route is the riverbed', () => {
    const digging = Object.entries(ROUTINES).filter(([, byResident]) =>
      Object.values(byResident ?? {}).some((routine) => routine.steps.some((step) => step.kind === 'work' && step.action === 'dig')),
    );
    expect(digging.map(([waveId]) => waveId)).toEqual(['riverbed-dug']);
    for (const waveId of ['farm-matures', 'farm-blossoms', 'ecosystem-flourishes'] as const) expect(ROUTINES[waveId]).toBeUndefined();
  });

  it('shows the added homes only after their builders have walked to them and worked', () => {
    const homes = (ms: number) => computeVillageHomes(snapshotAtMs('village-built', ms)).map((home) => home.alpha);
    expect(homes(0)).toEqual([0, 0]);
    VILLAGE_RESIDENT_IDS.slice(0, 2).forEach((id, offset) => {
      const routine = ROUTINES['village-built']![id];
      const site = T.homeSites[offset];
      const arrive = arrivalMs(routine, id, offset === 0 ? 'home-a' : 'home-b')!;
      // Before arrival: the home is not there and the builder is still on the way.
      expect(homes(arrive - 100)[offset]).toBe(0);
      expect(distance(visualOf(snapshotAtMs('village-built', arrive - 100), id).pose, site)).toBeGreaterThan(1);
      // At arrival the builder is at the site, working with the mallet (the build frames), and the home is still not there.
      const working = visualOf(snapshotAtMs('village-built', arrive + 100), id);
      expect(distance(working.pose, site)).toBeLessThanOrEqual(1.5);
      expect(working.pose.asset).toMatch(/^action-build-/);
      expect(homes(arrive + 100)[offset]).toBe(0);
    });
    // By the end of the Wave both stand, and the resolved population and homes are 6 and 4.
    const end = snapshotAfter('village-built');
    expect(computeVillageHomes(end).map((home) => home.alpha)).toEqual([1, 1]);
    expect(end.resolved.population).toBe(6);
    expect(end.resolved.homes).toBe(4);
    expect(end.world.population).toBe(6);
    // One carries stone to the second home before building it.
    const carrier = ROUTINES['village-built']![VILLAGE_RESIDENT_IDS[1]];
    expect(carrier.steps.map((step) => step.kind)).toEqual(['walk', 'work', 'carry', 'work']);
  });
});

describe('water carrying', () => {
  const routine = ROUTINES['water-carried']![THIRD_RESIDENT_ID];

  it('collects at the spring, carries across the island and pours into the animals’ basin', () => {
    expect(routine.steps.map((step) => (step.kind === 'work' ? step.action : step.kind))).toEqual(['walk', 'fill', 'carry', 'pour']);
    const fill = workStartMs(routine, THIRD_RESIDENT_ID, 'fill')!;
    const pour = workStartMs(routine, THIRD_RESIDENT_ID, 'pour')!;
    const at = (ms: number) => visualOf(snapshotAtMs('water-carried', ms), THIRD_RESIDENT_ID);
    // Filling: at the spring bank, with a splash at the pond.
    expect(distance(at(fill + 100).pose, T.springBank)).toBeLessThanOrEqual(1.5);
    expect(distance(at(fill + 100).pose, T.spring)).toBeLessThan(40);
    expect(at(fill + 100).layers?.effect?.kind).toBe('splash');
    // Carrying: the water-carry frames, moving between the spring and the pen, nowhere near a channel to the pen.
    const midCarry = at((fill + pour) / 2);
    expect(midCarry.pose.asset).toMatch(/^action-water-carry-/);
    expect(distance(midCarry.pose, T.springBank)).toBeGreaterThan(40);
    expect(distance(midCarry.pose, T.penGate)).toBeGreaterThan(40);
    // Pouring: at the basin.
    expect(distance(at(pour + 100).pose, T.penGate)).toBeLessThanOrEqual(1.5);
    expect(distance(T.penGate, T.basin)).toBeLessThan(40);
  });

  it('shows the basin filled only once the water has been poured', () => {
    const pour = workStartMs(routine, THIRD_RESIDENT_ID, 'pour')!;
    const filled = (ms: number) => computeSettlementProps(snapshotAtMs('water-carried', ms)).find((visual) => visual.slot === 'basinFilled')!.alpha;
    expect(filled(0)).toBe(0);
    expect(filled(pour)).toBe(0);
    expect(filled(pour + 100)).toBe(0);
    expect(snapshotAfter('water-carried').world.props).toContain('filled-bucket');
    expect(computeSettlementProps(snapshotAfter('water-carried')).find((visual) => visual.slot === 'basinFilled')!.alpha).toBe(1);
  });
});

describe('the cave trip', () => {
  for (const waveId of ['cave-furnished', 'shrine-appears'] as const) {
    describe(waveId, () => {
      const routine = ROUTINES[waveId]![SECOND_RESIDENT_ID];
      const span = hiddenSpan(routine, SECOND_RESIDENT_ID)!;
      const at = (ms: number) => visualOf(snapshotAtMs(waveId, ms), SECOND_RESIDENT_ID);
      const exterior = (ms: number) => {
        const props = computeSettlementProps(snapshotAtMs(waveId, ms));
        return waveId === 'cave-furnished'
          ? props.find((visual) => visual.slot === 'practicalCave')!.alpha
          : props.find((visual) => visual.slot === 'caveExterior')!.alpha;
      };

      it('walks from the plot to the entrance on the approved walk before anything goes out of sight', () => {
        expect(distance(at(0).pose, LAYOUT.plotHuman)).toBeLessThanOrEqual(1.5);
        const toEntrance = arrivalMs(routine, SECOND_RESIDENT_ID, 'cave')!;
        for (let ms = 0; ms < toEntrance; ms += 60) {
          const visual = at(ms);
          expect(visual.alpha, `visible on the way at ${ms}`).toBe(1);
          expect(visual.pose.walk, 'walking').not.toBeNull();
        }
        expect(distance(at(toEntrance).pose, T.caveFront)).toBeLessThanOrEqual(1.5);
      });

      it('goes dark only at the entrance, and stays the same resident (id and population) while inside', () => {
        for (let ms = 0; ms < routineDurationMs(routine, SECOND_RESIDENT_ID); ms += 25) {
          const visual = at(ms);
          if (visual.alpha < 0.5) expect(distance(visual.pose, T.caveInside), `hides ${ms} ms in`).toBeLessThanOrEqual(30);
        }
        const inside = snapshotAtMs(waveId, (span.startMs + span.endMs) / 2);
        expect(visualOf(inside, SECOND_RESIDENT_ID).alpha).toBe(0);
        expect(inside.world.residents.map((resident) => resident.id)).toContain(SECOND_RESIDENT_ID);
        expect(computeResidentVisuals(inside).map((visual) => visual.id).sort()).toEqual(inside.world.residents.map((resident) => resident.id).sort());
        expect(inside.world.population).toBe(inside.world.residents.length);
      });

      it('changes the exterior only after the resident has been inside, and has it complete as they come out', () => {
        expect(exterior(0)).toBe(0);
        expect(exterior(span.startMs)).toBe(0);
        expect(exterior(span.startMs + 250)).toBe(0);
        expect(exterior(span.endMs + 100)).toBeGreaterThan(0.95);
        expect(exterior(span.endMs + 200)).toBeGreaterThan(0.95);
      });

      it('brings the resident out of the entrance and leaves them at the cave, ready to walk back', () => {
        const total = routineDurationMs(routine, SECOND_RESIDENT_ID);
        expect(distance(at(total - 1).pose, T.caveFront)).toBeLessThanOrEqual(2);
        expect(at(total - 1).alpha).toBe(1);
        const after = snapshotAfter(waveId);
        expect(after.world.residents.find((resident) => resident.id === SECOND_RESIDENT_ID)!.place).toBe('cave');
        expect(distance(visualOf(after, SECOND_RESIDENT_ID).pose, T.caveFront)).toBeLessThanOrEqual(0.5);
      });
    });
  }

  it('turns the practical-cave furnishings into the shrine hill, never both and never neither', () => {
    const slots = (snapshot: SliceSnapshot) => {
      const props = computeSettlementProps(snapshot);
      return {
        practical: props.find((visual) => visual.slot === 'practicalCave')!.alpha,
        hill: props.find((visual) => visual.slot === 'caveExterior')!.alpha,
      };
    };
    const span = hiddenSpan(ROUTINES['shrine-appears']![SECOND_RESIDENT_ID], SECOND_RESIDENT_ID)!;
    // Midway through the change the two cross-fade, so something is always standing.
    const during = slots(snapshotAtMs('shrine-appears', (span.startMs + 300 + span.endMs + 100) / 2));
    expect(during.practical).toBeGreaterThan(0);
    expect(during.practical + during.hill).toBeGreaterThanOrEqual(0.9);
    expect(slots(snapshotAfter('shrine-appears'))).toEqual({ practical: 0, hill: 1 });
    expect(slots(snapshotAfter('cave-furnished'))).toEqual({ practical: 1, hill: 0 });
  });
});

describe('the second resident between Waves', () => {
  it('walks to the cave and back, is at the plot again once each trip home ends, and is never in two places', () => {
    const at = (snapshot: SliceSnapshot) => visualOf(snapshot, SECOND_RESIDENT_ID).pose;
    for (const [back, expected] of [['livestock-fenced', 'plot'], ['epilogue-growth', 'plot']] as const) {
      const after = snapshotAfter(back);
      expect(after.world.residents.find((resident) => resident.id === SECOND_RESIDENT_ID)!.place).toBe(expected);
      expect(distance(at(after), LAYOUT.plotHuman)).toBeLessThanOrEqual(0.5);
    }
    expect(FIRST_RESIDENT_ID).not.toBe(SECOND_RESIDENT_ID);
  });
});

describe('autonomous work follows the logical clock only', () => {
  const frames = (snapshot: SliceSnapshot) => ({
    residents: computeResidentVisuals(snapshot),
    props: computeSettlementProps(snapshot),
    homes: computeVillageHomes(snapshot),
    furnace: computeFurnaceVisual(snapshot),
    effects: computeSettlementEffects(snapshot),
    plant: computePlantVisual(snapshot),
  });

  function at(clockMs: number, speed: number, chunk: number): SliceSnapshot {
    const game = new SliceGame({ playbackSpeed: speed });
    let remaining = clockMs / speed;
    for (const element of TRUE_ROUTE) {
      game.selectElement(element);
      // Play each turn through, back to back, until the requested logical time has passed.
      // A step never runs past the end of a Wave, so no logical time is lost at a turn's end
      // however the time is split (a Wave's own end is where the game stops consuming it).
      while (game.snapshot().phase === 'playing' && remaining > 0) {
        const wave = game.snapshot().activeWave!;
        const step = Math.max(1e-6, Math.min(chunk, remaining, (wave.durationMs - wave.elapsedMs) / speed));
        game.advance(step);
        remaining -= step;
      }
      if (remaining <= 0) break;
    }
    return game.snapshot();
  }

  // Floating-point accumulation differs by ~1e-12 between ways of splitting the same time.
  const stable = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'number' ? Math.round(item * 1e5) / 1e5 : item)));

  it('is identical at the same logical time at any playback speed and however the time is split', () => {
    // Logical times inside Turn 3, Turn 4 and the Epilogue (the turns' Waves play back to back),
    // including the workshop build (about 20.5 s to 24 s), plant growth and the guardian Wave.
    for (const logical of [20_900, 22_400, 23_333, 26_500, 31_111, 41_234, 52_345, 60_321, 69_876, 80_500]) {
      const reference = stable(frames(at(logical, 1, 100)));
      if (logical === 22_400) expect(at(logical, 1, 100).activeWave?.id, 'inside the workshop build').toBe('workshop-appears');
      for (const [speed, chunk] of [[2, 100], [4, 30], [0.5, 50], [1, 7]] as const) {
        expect(stable(frames(at(logical, speed, chunk))), `${logical} ms at ${speed}x`).toEqual(reference);
      }
    }
  });
});
