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
  ROLES,
  ROLES_FROM_POPULATION,
  ROUTINES,
  WORK_ACTIONS,
  arrivalMs,
  computeCrewVisuals,
  hiddenSpan,
  residentSpot,
  routineDurationMs,
  routineEndSpot,
  workStartMs,
} from './crew';
import { ACTION_FRAME_MS } from './humanActions';
import { HUMAN_WALK_SPEED_PX_PER_MS } from './humanWalk';
import { LAYOUT } from './layout';
import { computeResidentVisuals, type ResidentVisual } from './residents';
import { computeSettlementProps, computeVillageHomes } from './settlement';

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

describe('division of labour in Turn 4 and at the END', () => {
  it('gives every one of the six residents their own job', () => {
    const jobs = Object.values(ROLES).map((role) => role.job);
    expect(Object.keys(ROLES)).toHaveLength(ROLES_FROM_POPULATION);
    expect(new Set(jobs).size).toBe(ROLES_FROM_POPULATION);
    for (const wanted of ['communal cooking', 'cultivation', 'water delivery', 'stone work']) expect(jobs).toContain(wanted);
  });

  it('keeps all six residents at work after the END, in six different places, none of them an idle bob', () => {
    const game = new SliceGame();
    for (const element of TRUE_ROUTE) {
      game.selectElement(element);
      game.advance(120_000);
    }
    expect(game.snapshot().phase).toBe('ended');
    const texturesOver = new Map<string, Set<string>>();
    const spots = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      game.advance(ACTION_FRAME_MS / 2);
      for (const visual of computeResidentVisuals(game.snapshot())) {
        expect(visual.alpha, visual.id).toBe(1);
        expect(visual.pose.asset, `${visual.id} is not standing in the idle pose`).not.toBe('idle');
        const set = texturesOver.get(visual.id) ?? new Set<string>();
        set.add(visual.pose.asset);
        texturesOver.set(visual.id, set);
        spots.add(`${Math.round(visual.pose.x)},${Math.round(visual.pose.y)}`);
      }
    }
    expect([...texturesOver.keys()].sort()).toEqual(['resident-1', 'resident-2', 'resident-3', 'resident-4', 'resident-5', 'resident-6']);
    expect(spots.size).toBe(6);
    // The workers' two frames alternate with the logical clock.
    for (const id of ['resident-2', 'resident-4', 'resident-5', 'resident-6']) expect(texturesOver.get(id)!.size, id).toBe(2);
    // Different jobs read as different poses.
    const poses = new Set([...texturesOver.values()].map((set) => [...set].sort().join('+')));
    expect(poses.size).toBeGreaterThanOrEqual(4);
  });

  it('keeps each resident at their station, as the resident whose place it is', () => {
    const ended = snapshotAfterTurn(4);
    for (const resident of ended.world.residents) {
      const role = ROLES[resident.id];
      expect(resident.place, resident.id).toBe(role.station);
      expect(distance(visualOf(ended, resident.id).pose, residentSpot(role.station, resident.id)), resident.id).toBeLessThanOrEqual(0.5);
    }
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
    // Logical times inside Turn 3, Turn 4 and the Epilogue (the turns' Waves play back to back).
    for (const logical of [23_333, 31_111, 41_234, 52_345, 60_321, 69_876]) {
      const reference = stable(frames(at(logical, 1, 100)));
      for (const [speed, chunk] of [[2, 100], [4, 30], [0.5, 50], [1, 7]] as const) {
        expect(stable(frames(at(logical, speed, chunk))), `${logical} ms at ${speed}x`).toEqual(reference);
      }
    }
  });
});
