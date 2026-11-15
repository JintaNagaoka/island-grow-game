import type { SliceSnapshot } from '../game/sliceGame';
import type { WaveId } from '../game/waves';
import {
  THIRD_RESIDENT_ID,
  VILLAGE_RESIDENT_IDS,
  type Resident,
  type ResidentPlace,
} from '../game/worldState';
import { clamp01, easeOutBack, stillPose, walkingPose, type HumanPose } from './animation';
import { selectWalkDirection } from './humanWalk';
import { LAYOUT, type Point } from './layout';
import type { ResidentVisual } from './residents';

// The residents who join the island in Turn 3 and Turn 4 (ids 3 to 6): where each
// stands, how the third resident works and walks between Waves, and how new
// residents arrive. Pure functions of the snapshot and the logical clock; nothing
// here creates, removes or moves a resident in game state.

const T = LAYOUT.true;
const TAU = Math.PI * 2;

// Where a resident rests for each named place. Presentation owns the pixels;
// the game only knows the place.
export const PLACE_SPOTS: Readonly<Record<ResidentPlace, Point>> = {
  start: LAYOUT.humanStart,
  fire: LAYOUT.humanWarm,
  plot: LAYOUT.plotHuman,
  workshop: T.workshopStand,
  'hut-site': T.hutSite,
  riverbed: T.digSite,
  pen: T.penGate,
  village: T.villageResidents[0],
};

export type SpotId = 'workshop' | 'hut-site' | 'pen' | 'riverbed' | 'spring';
const SPOTS: Readonly<Record<SpotId, Point>> = {
  workshop: T.workshopStand,
  'hut-site': T.hutSite,
  pen: T.penGate,
  riverbed: T.digSite,
  spring: T.springBank,
};

// --- Layers. A working resident is three separate things, each its own record that
// the scene draws as its own game object: the HUMAN (an approved sprite pose, the same
// art every other resident uses), the TARGET OBJECT (a tool or carried load) and the
// EFFECT (dust, chips, dirt, splash). No baked "human holding a tool" image exists at
// runtime. Object and effect shapes are provisional code-native drawings in
// IslandScene; replacing them with art is a Human Review decision.
export type ObjectKind = 'stone' | 'stone-block' | 'spade' | 'mallet' | 'bucket';
export type EffectKind = 'dust' | 'chips' | 'dirt' | 'splash';

export interface ObjectLayer {
  readonly kind: ObjectKind;
  // Design pixels, absolute. Where the object's grip or resting point is.
  readonly x: number;
  readonly y: number;
  // Radians, already mirrored for the resident's facing.
  readonly angle: number;
  // The bucket only: true while it holds water.
  readonly filled: boolean;
  // Which of the two loop frames this is (0 for an object that does not alternate).
  readonly frame: 0 | 1;
}

export interface EffectLayer {
  readonly kind: EffectKind;
  readonly x: number;
  readonly y: number;
  // 0..1 progress of one puff, from the logical clock.
  readonly phase: number;
}

export interface CrewLayers {
  readonly object: ObjectLayer | null;
  readonly effect: EffectLayer | null;
}

// Logical milliseconds each frame of a two-frame work loop is shown; read from the
// logical clock, so a global playback speed scales it.
export const CREW_FRAME_MS = 300;
// Hand and ground offsets from the resident's ground point, in design pixels, for a
// right-facing resident (mirrored by facing). The approved human is about 51 px tall.
const HAND = { x: 9, y: -13 } as const;
const FOOT_REACH = { x: 11, y: -1 } as const;

// What a resident does in place. `workLayers` poses the object and the effect each
// action raises for the two loop frames.
export const WORK_ACTIONS = ['gather', 'build', 'dig', 'fill', 'pour'] as const;
export type WorkId = (typeof WORK_ACTIONS)[number];
// What a resident carries while walking.
export const LOADS = ['stone-block', 'bucket'] as const;
export type LoadId = (typeof LOADS)[number];

// One step of a Wave's routine, ending at `until` (a fraction of the Wave's logical
// progress). Before -> work -> after: the resident stands, works, then stands again.
type StepAction =
  | { readonly kind: 'idle' }
  // The approved four-direction walk to a spot.
  | { readonly kind: 'walk'; readonly to: SpotId }
  // A two-frame work loop where the resident stands.
  | { readonly kind: 'work'; readonly action: WorkId; readonly facing?: -1 | 1 }
  // The approved walk to a spot, with a load in the hands.
  | { readonly kind: 'carry'; readonly load: LoadId; readonly to: SpotId };
interface Step {
  readonly until: number;
  readonly step: StepAction;
}

const idle = (until: number): Step => ({ until, step: { kind: 'idle' } });
const walk = (until: number, to: SpotId): Step => ({ until, step: { kind: 'walk', to } });
const work = (until: number, action: WorkId, facing?: -1 | 1): Step => ({ until, step: { kind: 'work', action, facing } });
const carry = (until: number, load: LoadId, to: SpotId): Step => ({ until, step: { kind: 'carry', load, to } });

// The third resident's routine in each Wave that has one. A Wave without a routine
// leaves the resident standing at their place.
export const CREW_ROUTINES: Partial<Record<WaveId, readonly Step[]>> = {
  'human-walks-to-workshop': [walk(0.6, 'workshop'), idle(1)],
  'human-gathers-stone': [idle(0.12), work(0.88, 'gather'), idle(1)],
  'human-carries-stone': [idle(0.1), carry(0.74, 'stone-block', 'hut-site'), idle(1)],
  'human-builds-hut': [idle(0.1), work(0.9, 'build', -1), idle(1)],
  'livestock-fenced': [walk(0.48, 'pen'), work(0.92, 'build'), idle(1)],
  'riverbed-dug': [walk(0.5, 'riverbed'), work(0.94, 'dig'), idle(1)],
  'water-carried': [
    walk(0.24, 'spring'),
    // Fill the bucket at the pond, carry it to the basin, pour, then stand.
    work(0.32, 'fill'),
    carry(0.84, 'bucket', 'pen'),
    work(0.94, 'pour'),
    idle(1),
  ],
};

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

const loopIndex = (elapsedMs: number): 0 | 1 =>
  (Math.floor(Math.max(0, elapsedMs) / CREW_FRAME_MS) % 2) as 0 | 1;
// 0..1 within the current loop frame.
const frameProgress = (elapsedMs: number): number => (Math.max(0, elapsedMs) % CREW_FRAME_MS) / CREW_FRAME_MS;

const restingPose = (at: Point, seconds: number, phase: number): HumanPose =>
  stillPose('idle', false, at, Math.max(0, Math.sin(seconds * TAU * 0.45 + phase)) * 1.2);

interface CrewPose {
  readonly pose: HumanPose;
  readonly layers: CrewLayers;
}

const NO_LAYERS: CrewLayers = { object: null, effect: null };
const rest = (at: Point, seconds: number, phase: number): CrewPose => ({ pose: restingPose(at, seconds, phase), layers: NO_LAYERS });

// The object a resident holds while working in place, posed for loop frame 0 or 1.
// `t` is progress through the whole work step (used by the fill and pour changes).
export function workLayers(action: WorkId, at: Point, facing: -1 | 1, elapsedMs: number, t: number): CrewLayers {
  const frame = loopIndex(elapsedMs);
  const hand = { x: at.x + facing * HAND.x, y: at.y + HAND.y };
  const ground = { x: at.x + facing * FOOT_REACH.x, y: at.y + FOOT_REACH.y };
  const object = (kind: ObjectKind, p: Point, angle: number, filled = false): ObjectLayer => ({
    kind,
    x: p.x,
    y: p.y,
    angle: facing * angle,
    filled,
    frame,
  });
  const effect = (kind: EffectKind, p: Point): EffectLayer => ({ kind, x: p.x, y: p.y, phase: frameProgress(elapsedMs) });
  switch (action) {
    case 'gather':
      // Frame 0: the stone lies at the feet. Frame 1: it is lifted in the hand.
      return frame === 0
        ? { object: object('stone', ground, 0), effect: effect('dust', ground) }
        : { object: object('stone', hand, 0), effect: null };
    case 'build':
      // Frame 0: the mallet is raised. Frame 1: it comes down and chips fly.
      return frame === 0
        ? { object: object('mallet', hand, -0.9), effect: null }
        : { object: object('mallet', { x: hand.x + facing * 3, y: hand.y + 5 }, 0.55), effect: effect('chips', { x: hand.x + facing * 8, y: at.y - 5 }) };
    case 'dig':
      // Frame 0: the spade is lifted. Frame 1: its blade is in the ground and soil flies.
      return frame === 0
        ? { object: object('spade', hand, -0.5), effect: null }
        : { object: object('spade', { x: hand.x + facing * 2, y: hand.y + 6 }, 0.25), effect: effect('dirt', ground) };
    case 'fill':
      // The bucket is dipped into the pond and comes up full halfway through.
      return {
        object: object('bucket', hand, frame === 0 ? 0 : 0.12, t >= 0.5),
        effect: t < 0.5 ? effect('splash', { x: hand.x + facing * 6, y: at.y - 3 }) : null,
      };
    case 'pour':
      // The bucket tips over the basin, spilling its water, and is empty by the end.
      return {
        object: object('bucket', { x: hand.x + facing * 3, y: hand.y }, 0.4 + 0.9 * clamp01(t * 2) + 0.1 * frame, t < 0.5),
        effect: t > 0.15 && t < 0.75 ? effect('splash', { x: hand.x + facing * 11, y: at.y - 6 }) : null,
      };
  }
}

// The load held while walking.
export function carryLayers(load: LoadId, at: Point, facing: -1 | 1): CrewLayers {
  return {
    object: {
      kind: load,
      x: at.x + facing * HAND.x,
      y: at.y + HAND.y,
      angle: 0,
      // The only carried bucket is the one filled at the pond.
      filled: load === 'bucket',
      frame: 0,
    },
    effect: null,
  };
}

// The pose and layers of the third resident during a Wave with a routine, from the
// Wave's logical progress and elapsed time alone.
function routinePose(snapshot: SliceSnapshot, steps: readonly Step[], start: Point): CrewPose {
  const wave = snapshot.activeWave!;
  const progress = clamp01(wave.progress);
  const seconds = snapshot.clockMs / 1000;
  let from = start;
  let stepStart = 0;
  for (const { until, step } of steps) {
    const isLast = until >= 1;
    if (progress < until || isLast) {
      const span = Math.max(1e-6, until - stepStart);
      const t = clamp01((progress - stepStart) / span);
      const elapsedMs = (progress - stepStart) * wave.durationMs;
      if (step.kind === 'walk' || step.kind === 'carry') {
        const to = SPOTS[step.to];
        const at = lerp(from, to, t);
        const direction = selectWalkDirection(to.x - from.x, to.y - from.y);
        if (t >= 1 || direction === null) return rest(to, seconds, 0);
        const pose = walkingPose(at, direction, elapsedMs, false);
        if (step.kind === 'walk') return { pose, layers: NO_LAYERS };
        // The human layer is the approved walk; the load is a separate layer in the hands.
        return { pose, layers: carryLayers(step.load, at, to.x < from.x ? -1 : 1) };
      }
      if (step.kind === 'work') {
        const facing = step.facing ?? 1;
        // The human layer is the approved standing pose with a small bob on each loop frame.
        const pose = { ...stillPose('idle', false, from, loopIndex(elapsedMs) === 1 ? 1.2 : 0), facing };
        return { pose, layers: workLayers(step.action, from, facing, elapsedMs, t) };
      }
      return rest(from, seconds, 0);
    }
    // This step is over: the next one starts where this one ended.
    if (step.kind === 'walk' || step.kind === 'carry') from = SPOTS[step.to];
    stepStart = until;
  }
  return rest(from, seconds, 0);
}

const SPLIT_SHAKE_END = 0.5;

// Residents 3 to 6 as Presentation draws them: every one in the snapshot's world, plus
// the ones whose arrival Wave is playing right now (they join the world when it ends).
export function computeCrewVisuals(snapshot: SliceSnapshot): readonly ResidentVisual[] {
  const { world, activeWave: wave } = snapshot;
  const seconds = snapshot.clockMs / 1000;
  const visuals: ResidentVisual[] = [];
  const known = (id: string): Resident | undefined => world.residents.find((resident) => resident.id === id);

  // The third resident: divides off the first at the fire, then works.
  const third = known(THIRD_RESIDENT_ID);
  if (third !== undefined || wave?.id === 'human-divides') {
    const place = third?.place ?? 'fire';
    const start = PLACE_SPOTS[place];
    const routine = wave === null ? undefined : CREW_ROUTINES[wave.id];
    if (wave?.id === 'human-divides' && third === undefined) {
      const p = clamp01(wave.progress);
      // Not drawn during the first resident's shake, then pops out beside them.
      const popping = p >= SPLIT_SHAKE_END;
      visuals.push({
        id: THIRD_RESIDENT_ID,
        pose: restingPose(start, seconds, 1),
        alpha: popping ? 1 : 0,
        scale: popping ? 0.6 + 0.4 * easeOutBack((p - SPLIT_SHAKE_END) / (1 - SPLIT_SHAKE_END)) : 0.6,
        shakeX: 0,
      });
    } else {
      const crew = routine === undefined ? rest(start, seconds, 1) : routinePose(snapshot, routine, start);
      visuals.push({ id: THIRD_RESIDENT_ID, pose: crew.pose, alpha: 1, scale: 1, shakeX: 0, layers: crew.layers });
    }
  }

  // Residents 4 to 6 gather in the village: present once the Wave has completed,
  // popping in one after another while it plays.
  VILLAGE_RESIDENT_IDS.forEach((id, index) => {
    const at = T.villageResidents[index];
    if (known(id) !== undefined) {
      visuals.push({ id, pose: restingPose(at, seconds, 2 + index), alpha: 1, scale: 1, shakeX: 0 });
    } else if (wave?.id === 'village-gathers') {
      const local = clamp01((wave.progress - 0.2 * index) / 0.5);
      visuals.push({
        id,
        pose: restingPose(at, seconds, 2 + index),
        alpha: local > 0 ? 1 : 0,
        scale: local > 0 ? 0.6 + 0.4 * easeOutBack(local) : 0.6,
        shakeX: 0,
      });
    }
  });
  return visuals;
}
