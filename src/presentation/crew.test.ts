import { describe, expect, it } from 'vitest';
import { snapshotAfter, snapshotAfterTurn, snapshotAt } from '../testSupport/trueRoute';
import { ROCK_WAVES, WATER_WAVES, type WaveId } from '../game/waves';
import { THIRD_RESIDENT_ID, VILLAGE_RESIDENT_IDS, type ResidentPlace } from '../game/worldState';
import { HUMAN_WALK_SPEED_PX_PER_MS } from './humanWalk';
import { readFileSync } from 'node:fs';
import { CREW_FRAME_MS, CREW_ROUTINES, LOADS, PLACE_SPOTS, WORK_ACTIONS, computeCrewVisuals, workLayers, type ObjectKind } from './crew';
import { HUMAN_ASSET_LIST, HUMAN_WALK_ASSET_LIST } from './humanAssets';
import { computeResidentVisuals } from './residents';
import { LAYOUT } from './layout';

const visualOf = (snapshot: Parameters<typeof computeCrewVisuals>[0], id: string) =>
  computeCrewVisuals(snapshot).find((visual) => visual.id === id);

// Where the third resident rests when a Wave starts, as set by the previous Wave's reveal.
function startPlace(wave: WaveId): ResidentPlace {
  const place = snapshotAt(wave, 0).world.residents.find((resident) => resident.id === THIRD_RESIDENT_ID)?.place;
  if (place === undefined) throw new Error(`no third resident at ${wave}`);
  return place;
}

describe('residents 3 to 6', () => {
  it('has no crew before Turn 3, so Turn 1 and Turn 2 residents are unchanged', () => {
    for (const snapshot of [snapshotAfterTurn(1), snapshotAfterTurn(2), snapshotAt('animal-eats', 0.5)]) {
      expect(computeCrewVisuals(snapshot)).toEqual([]);
    }
  });

  it('divides the third resident off the first at the fire, after the shake', () => {
    const early = visualOf(snapshotAt('human-divides', 0.2), THIRD_RESIDENT_ID)!;
    expect(early.alpha).toBe(0);
    const late = visualOf(snapshotAt('human-divides', 0.9), THIRD_RESIDENT_ID)!;
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
    expect(all.every((visual) => visual.alpha > 0 || visual.id === 'resident-2')).toBe(true);
    expect(ended.world.population).toBe(6);
    expect(ended.world.residents).toHaveLength(6);
  });

  it('knows a resting spot for every place', () => {
    const places: ResidentPlace[] = ['start', 'fire', 'plot', 'workshop', 'hut-site', 'riverbed', 'pen', 'village'];
    for (const place of places) expect(PLACE_SPOTS[place]).toBeDefined();
  });
});

describe('the third resident’s routines', () => {
  const routineWaves = Object.keys(CREW_ROUTINES) as WaveId[];

  it('belong to Turn 3 and Turn 4 Waves only, and use only declared work actions and loads', () => {
    const known = new Set([...ROCK_WAVES, ...WATER_WAVES].map((wave) => wave.id));
    for (const id of routineWaves) {
      expect(known.has(id), id).toBe(true);
      for (const { step } of CREW_ROUTINES[id]!) {
        if (step.kind === 'work') expect(WORK_ACTIONS).toContain(step.action);
        if (step.kind === 'carry') expect(LOADS).toContain(step.load);
      }
    }
  });

  it('are ordered windows that end at the Wave’s end and read before -> work -> after', () => {
    for (const id of routineWaves) {
      const steps = CREW_ROUTINES[id]!;
      expect(steps.at(-1)!.until, id).toBe(1);
      steps.reduce((previous, { until }) => {
        expect(until, id).toBeGreaterThan(previous);
        return until;
      }, 0);
      const kinds = steps.map(({ step }) => step.kind);
      // Whatever the resident does, they finish standing still (after).
      expect(kinds.at(-1), id).toBe('idle');
      // Working or carrying is never the very first or last thing.
      if (kinds.includes('work') || kinds.includes('carry')) expect(kinds.length, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('move at about the approved walking speed, never gliding or sprinting', () => {
    for (const id of routineWaves) {
      const wave = [...ROCK_WAVES, ...WATER_WAVES].find((candidate) => candidate.id === id)!;
      let from = PLACE_SPOTS[startPlace(id)];
      let last = 0;
      for (const { until, step } of CREW_ROUTINES[id]!) {
        if (step.kind === 'walk' || step.kind === 'carry') {
          const to = {
            workshop: LAYOUT.true.workshopStand,
            'hut-site': LAYOUT.true.hutSite,
            pen: LAYOUT.true.penGate,
            riverbed: LAYOUT.true.digSite,
            spring: LAYOUT.true.springBank,
          }[step.to];
          const distance = Math.hypot(to.x - from.x, to.y - from.y);
          const speed = distance / ((until - last) * wave.durationMs);
          expect(speed / HUMAN_WALK_SPEED_PX_PER_MS, `${id} -> ${step.to}`).toBeGreaterThan(0.45);
          expect(speed / HUMAN_WALK_SPEED_PX_PER_MS, `${id} -> ${step.to}`).toBeLessThan(1.5);
          from = to;
        }
        last = until;
      }
    }
  });

  it('hand over to the next Wave without a jump', () => {
    for (const id of routineWaves) {
      const endAt = visualOf(snapshotAt(id, 0.99999), THIRD_RESIDENT_ID)!.pose;
      const next = visualOf(snapshotAfter(id), THIRD_RESIDENT_ID)!.pose;
      expect(Math.hypot(endAt.x - next.x, endAt.y - next.y), id).toBeLessThan(1.5);
      const startAt = visualOf(snapshotAt(id, 0), THIRD_RESIDENT_ID)!.pose;
      const before = PLACE_SPOTS[startPlace(id)];
      expect(Math.hypot(startAt.x - before.x, startAt.y - before.y), `${id} start`).toBeLessThan(1.5);
    }
  });

  it('never teleports within a Wave', () => {
    for (const id of routineWaves) {
      let previous = visualOf(snapshotAt(id, 0), THIRD_RESIDENT_ID)!.pose;
      const wave = [...ROCK_WAVES, ...WATER_WAVES].find((candidate) => candidate.id === id)!;
      for (let i = 1; i <= 50; i += 1) {
        const pose = visualOf(snapshotAt(id, Math.min(0.99999, i / 50)), THIRD_RESIDENT_ID)!.pose;
        const dt = wave.durationMs / 50;
        expect(Math.hypot(pose.x - previous.x, pose.y - previous.y), `${id} @${i}`).toBeLessThan(HUMAN_WALK_SPEED_PX_PER_MS * dt * 2.2 + 1);
        previous = pose;
      }
    }
  });

  it('alternates exactly two object frames on the logical clock, while the human stays an approved still pose', () => {
    const wave = ROCK_WAVES.find((candidate) => candidate.id === 'human-gathers-stone')!;
    const frames = new Set<number>();
    const poses = new Set<string>();
    for (let ms = 0.2 * wave.durationMs; ms < 0.85 * wave.durationMs; ms += 50) {
      const visual = visualOf(snapshotAt('human-gathers-stone', ms / wave.durationMs), THIRD_RESIDENT_ID)!;
      frames.add(visual.layers!.object!.frame);
      poses.add(visual.pose.asset);
      expect(visual.scale).toBe(1);
    }
    expect([...frames].sort()).toEqual([0, 1]);
    expect([...poses]).toEqual(['idle']);
    // One frame lasts CREW_FRAME_MS of logical time.
    const at = (ms: number) => visualOf(snapshotAt('human-gathers-stone', (0.12 * wave.durationMs + ms) / wave.durationMs), THIRD_RESIDENT_ID)!.layers!.object!;
    expect(at(10).frame).not.toBe(at(CREW_FRAME_MS + 10).frame);
    expect(at(10).frame).toBe(at(2 * CREW_FRAME_MS + 10).frame);
  });

  it('carries a stone block in Turn 3 and a filled bucket only in the Turn 4 water carry', () => {
    const kindsIn = (waves: readonly { id: WaveId }[]): Set<ObjectKind> => {
      const kinds = new Set<ObjectKind>();
      for (const wave of waves) {
        for (let i = 0; i <= 40; i += 1) {
          const object = visualOf(snapshotAt(wave.id, Math.min(0.99999, i / 40)), THIRD_RESIDENT_ID)?.layers?.object;
          if (object) kinds.add(object.kind);
        }
      }
      return kinds;
    };
    expect(kindsIn(ROCK_WAVES)).not.toContain('bucket');
    expect(kindsIn(ROCK_WAVES)).toEqual(new Set(['stone', 'stone-block', 'mallet', 'spade']));
    expect([...kindsIn(WATER_WAVES)]).toEqual(['bucket']);
    // The carried bucket is full; the bucket is empty only before the fill and after the pour.
    const carrying = visualOf(snapshotAt('water-carried', 0.6), THIRD_RESIDENT_ID)!.layers!.object!;
    expect(carrying).toMatchObject({ kind: 'bucket', filled: true });
    const dipping = visualOf(snapshotAt('water-carried', 0.26), THIRD_RESIDENT_ID)!.layers!.object!;
    expect(dipping.filled).toBe(false);
    expect(visualOf(snapshotAt('water-carried', 0.999), THIRD_RESIDENT_ID)!.layers?.object ?? null).toBeNull();
    expect(WATER_WAVES.find((wave) => wave.id === 'water-carried')!.event).toBe('water-carried');
  });
});

describe('human, target object and effect are separate layers', () => {
  const approvedHumanKeys = new Set<string>([
    ...HUMAN_ASSET_LIST.map((asset) => asset.textureKey),
    ...HUMAN_WALK_ASSET_LIST.map((asset) => asset.textureKey),
  ]);
  const wavesWithRoutine = Object.keys(CREW_ROUTINES) as WaveId[];

  it('draws the human only from approved human sprites, never from a baked human-with-tool texture', () => {
    for (const id of wavesWithRoutine) {
      for (let i = 0; i <= 50; i += 1) {
        const visual = visualOf(snapshotAt(id, Math.min(0.99999, i / 50)), THIRD_RESIDENT_ID)!;
        expect(approvedHumanKeys.has(visual.pose.asset), `${id}@${i}: ${visual.pose.asset}`).toBe(true);
        expect(visual.pose.asset.startsWith('action-')).toBe(false);
      }
    }
  });

  it('keeps the object and effect in their own records, apart from the human pose', () => {
    const visual = visualOf(snapshotAt('riverbed-dug', 0.75), THIRD_RESIDENT_ID)!;
    expect(visual.layers!.object).toMatchObject({ kind: 'spade' });
    // Posing the object never changes the human: the same approved pose with and without layers.
    const pose = { ...visual.pose };
    expect(Object.keys(pose)).not.toEqual(expect.arrayContaining(['object', 'effect']));
    expect(approvedHumanKeys.has(pose.asset)).toBe(true);
  });

  it('shows each work action as before -> work -> after: nothing held, tool and effect, then nothing held', () => {
    for (const id of ['human-gathers-stone', 'human-builds-hut', 'riverbed-dug', 'livestock-fenced'] as const) {
      const before = visualOf(snapshotAt(id, 0.02), THIRD_RESIDENT_ID)!;
      const after = visualOf(snapshotAt(id, 0.999), THIRD_RESIDENT_ID)!;
      const objectsDuring = new Set<string>();
      let effects = 0;
      for (let i = 0; i <= 80; i += 1) {
        const layers = visualOf(snapshotAt(id, Math.min(0.99999, i / 80)), THIRD_RESIDENT_ID)!.layers;
        if (layers?.object) objectsDuring.add(layers.object.kind);
        if (layers?.effect) effects += 1;
      }
      expect(before.layers?.object ?? null, `${id} before`).toBeNull();
      expect(after.layers?.object ?? null, `${id} after`).toBeNull();
      expect(objectsDuring.size, id).toBeGreaterThan(0);
      expect(effects, id).toBeGreaterThan(0);
    }
  });

  it('poses every work action in two distinct loop frames with a drawn effect on at least one', () => {
    const at = { x: 100, y: 200 };
    for (const action of WORK_ACTIONS) {
      const first = workLayers(action, at, 1, 0, 0.3);
      const second = workLayers(action, at, 1, CREW_FRAME_MS, 0.3);
      expect(first.object, action).not.toBeNull();
      expect(second.object, action).not.toBeNull();
      expect([first.object!.frame, second.object!.frame], action).toEqual([0, 1]);
      expect(first.object!.x !== second.object!.x || first.object!.y !== second.object!.y || first.object!.angle !== second.object!.angle, action).toBe(true);
      expect(first.effect !== null || second.effect !== null, action).toBe(true);
    }
  });

  it('mirrors the object with the resident facing', () => {
    const at = { x: 100, y: 200 };
    const right = workLayers('build', at, 1, 0, 0.5).object!;
    const left = workLayers('build', at, -1, 0, 0.5).object!;
    expect(left.x - at.x).toBeCloseTo(-(right.x - at.x));
    expect(left.angle).toBeCloseTo(-right.angle);
  });

  it('is rendered by the scene as separate game objects: a human sprite, an object layer and an effect layer', () => {
    const scene = readFileSync(new URL('./IslandScene.ts', import.meta.url), 'utf8');
    expect(scene).toMatch(/readonly sprite: Phaser\.GameObjects\.Sprite;/);
    expect(scene).toMatch(/readonly object: Phaser\.GameObjects\.Graphics;/);
    expect(scene).toMatch(/readonly effect: Phaser\.GameObjects\.Graphics;/);
    expect(scene).toMatch(/drawCrewObject\(view\.object, object\)/);
    expect(scene).toMatch(/drawCrewEffect\(view\.effect, effect\)/);
    expect(scene).not.toMatch(/ACTION_/);
  });
});
