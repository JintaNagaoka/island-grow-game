import type { SliceSnapshot } from '../game/sliceGame';
import type { WaveId } from '../game/waves';
import {
  FIRST_RESIDENT_ID,
  SECOND_RESIDENT_ID,
  THIRD_RESIDENT_ID,
  VILLAGE_RESIDENT_IDS,
  type Resident,
  type ResidentPlace,
} from '../game/worldState';
import { clamp01, easeOutBack, smoothstep, stillPose, walkingPose, type HumanPose } from './animation';
import { actionFrameIndex, actionPose, contactOffset, ACTION_FRAME_MS, type ActionId } from './humanActions';
import { HUMAN_WALK_SPEED_PX_PER_MS, selectWalkDirection, walkToward } from './humanWalk';
import { LAYOUT, type Point } from './layout';
import type { ResidentVisual } from './residents';

// Residents beyond the Turn 1/2 founders, and the autonomous work of every resident from
// Turn 3 on: who walks where, what they do there, and when they are out of sight.
// Pure functions of the snapshot and the logical clock; nothing here creates, removes or
// moves a resident in game state. A resident's `place` (WorldState) is where a Wave
// leaves them, and the next Wave's routine starts there, so nobody jumps at a Wave
// boundary. Walking uses the approved four-direction walk at its fixed speed, so a
// routine's length comes from the layout's distances and not from a tuned fraction.

const T = LAYOUT.true;
const TAU = Math.PI * 2;

// Where a resident rests for each named place. Presentation owns the pixels; the game
// only knows the place. The village has three spots, one per added resident (residentSpot).
export const PLACE_SPOTS: Readonly<Record<ResidentPlace, Point>> = {
  start: LAYOUT.humanStart,
  fire: LAYOUT.humanWarm,
  plot: LAYOUT.plotHuman,
  workshop: T.workshopStand,
  'hut-site': T.hutSite,
  riverbed: T.digSite,
  pen: T.penGate,
  village: T.villageResidents[0],
  furnace: T.furnaceStand,
  cave: T.caveFront,
  'home-a': T.homeSites[0],
  'home-b': T.homeSites[1],
};

export function residentSpot(place: ResidentPlace, id: string): Point {
  if (place === 'village') {
    const index = VILLAGE_RESIDENT_IDS.indexOf(id as (typeof VILLAGE_RESIDENT_IDS)[number]);
    return T.villageResidents[Math.max(0, index)];
  }
  return PLACE_SPOTS[place];
}

// Points a routine can walk to: every resting place, plus the ones only visited in passing.
export type SpotId = ResidentPlace | 'spring' | 'cave-inside' | 'stone-pile';
const SPOTS: Readonly<Record<SpotId, Point>> = {
  ...PLACE_SPOTS,
  spring: T.springBank,
  'cave-inside': T.caveInside,
  'stone-pile': T.stonePile,
};

// --- Layers. A working resident is the HUMAN (a composite work sprite from humanActions.ts,
// or an approved walk/idle pose), the BUILDING / WORLD it works on (settlement.ts, never in
// the sprite), and the EFFECT (dust, chips, dirt, splash), which is its own record drawn as
// its own game object. Effect shapes are provisional code-native drawings in IslandScene.
export type EffectKind = 'dust' | 'chips' | 'dirt' | 'splash';

export interface EffectLayer {
  readonly kind: EffectKind;
  readonly x: number;
  readonly y: number;
  // 0..1 progress of one puff, from the logical clock.
  readonly phase: number;
}

export interface CrewLayers {
  readonly effect: EffectLayer | null;
}

export const WORK_ACTIONS = ['gather', 'build', 'dig', 'fill', 'pour'] as const;
export type WorkId = (typeof WORK_ACTIONS)[number];
// What a resident carries while walking (the composite carry / water-carry frames).
export const LOADS = ['stone-block', 'bucket'] as const;
export type LoadId = (typeof LOADS)[number];

const WORK_ART: Readonly<Record<WorkId, { readonly action: ActionId; readonly alternates: boolean }>> = {
  gather: { action: 'gather', alternates: true },
  build: { action: 'build', alternates: true },
  dig: { action: 'dig', alternates: true },
  // The bucket is full in the art: filling shows the splash at the pond, pouring the splash at
  // the basin, with the bucket held steady.
  fill: { action: 'water-carry', alternates: false },
  pour: { action: 'water-carry', alternates: false },
};

type Step =
  // The approved four-direction walk to a spot. `conceal` marks the walk into (in) or out of
  // (out) the cave entrance, during which the resident goes dark and out of sight.
  | { readonly kind: 'walk'; readonly to: SpotId; readonly conceal?: 'in' | 'out' }
  // Walking with a load in the hands (the composite carry frames).
  | { readonly kind: 'carry'; readonly load: LoadId; readonly to: SpotId }
  // Working in place for `ms` of logical time, facing `facing`.
  | { readonly kind: 'work'; readonly action: WorkId; readonly ms: number; readonly facing: -1 | 1 }
  // Inside the cave, out of sight: the short interior work interval. No interior is drawn.
  | { readonly kind: 'hidden'; readonly ms: number };

const walk = (to: SpotId): Step => ({ kind: 'walk', to });
const carry = (load: LoadId, to: SpotId): Step => ({ kind: 'carry', load, to });
const work = (action: WorkId, ms: number, facing: -1 | 1 = 1): Step => ({ kind: 'work', action, ms, facing });

// One resident's routine in one Wave: steps that run back to back from the resident's place.
// `from` is that place (checked against the Wave sequence by a test). A Wave without a routine
// for a resident leaves them to their role (below) or standing at their place.
export interface Routine {
  readonly from: ResidentPlace;
  readonly steps: readonly Step[];
}
const routine = (from: ResidentPlace, ...steps: Step[]): Routine => ({ from, steps });

// The cave trip: walk to the entrance, walk in (going dark as the entrance swallows the
// resident), work inside out of sight, walk out. The exterior changes after the work.
const CAVE_INTERIOR_WORK_MS = 1000;
const caveTrip = (from: ResidentPlace): Routine =>
  routine(
    from,
    walk('cave'),
    { kind: 'walk', to: 'cave-inside', conceal: 'in' },
    { kind: 'hidden', ms: CAVE_INTERIOR_WORK_MS },
    { kind: 'walk', to: 'cave', conceal: 'out' },
  );
const walkHome = (from: ResidentPlace, to: SpotId): Routine => routine(from, walk(to));

const R1 = FIRST_RESIDENT_ID;
const R2 = SECOND_RESIDENT_ID;
const R3 = THIRD_RESIDENT_ID;
const [R4, R5, R6] = VILLAGE_RESIDENT_IDS;

// Routines by Wave, then resident. Independent work is parallel: several residents may
// have a routine in the same Wave, each running from the Wave's start.
export const ROUTINES: Partial<Record<WaveId, Readonly<Record<string, Routine>>>> = {
  // Turn 3
  'farm-matures': { [R2]: routine('plot', work('dig', 1300)) },
  'human-walks-to-workshop': { [R3]: routine('fire', walk('workshop')) },
  'human-gathers-stone': { [R3]: routine('workshop', work('gather', 1700)) },
  'human-carries-stone': { [R3]: routine('workshop', carry('stone-block', 'hut-site')) },
  // The mallet strikes the second hut's wall; the hut rises after the first strikes.
  'human-builds-hut': { [R3]: routine('hut-site', work('build', 2100)) },
  // The furnace is built from the right, so the builder faces left (the mirrored frames).
  'furnace-lights': { [R3]: routine('hut-site', walk('furnace'), work('build', 1400, -1)) },
  'farm-blossoms': { [R2]: routine('plot', work('dig', 1300)) },
  'cave-furnished': { [R2]: caveTrip('plot') },
  'livestock-fenced': { [R3]: routine('furnace', walk('pen'), work('build', 2400)), [R2]: walkHome('cave', 'plot') },
  'riverbed-dug': { [R3]: routine('pen', walk('riverbed'), work('dig', 2600)) },
  // Turn 4
  'water-carried': {
    [R3]: routine(
      'riverbed',
      walk('spring'),
      // The bucket is filled at the pond (splash), carried to the animals' basin, and poured in.
      work('fill', 600),
      carry('bucket', 'pen'),
      work('pour', 700),
    ),
  },
  'village-built': {
    // The first home is built by its own builder.
    [R4]: routine('village', walk('home-a'), work('build', 1500)),
    // The second is built from stone fetched from the pile and carried over.
    [R5]: routine('village', walk('stone-pile'), work('gather', 600), carry('stone-block', 'home-b'), work('build', 1200)),
    // Stone work at the workshop meanwhile.
    [R6]: routine('village', walk('workshop'), work('build', 1500)),
  },
  'ecosystem-flourishes': { [R2]: routine('plot', work('dig', 1500)) },
  'shrine-appears': { [R2]: caveTrip('plot') },
  'epilogue-growth': { [R2]: walkHome('cave', 'plot') },
};

// --- Roles: once the village has gathered (six residents), every resident has a lasting
// job that goes on while no Wave gives them a routine, and after the END. Assignment is a
// presentation choice (which resident does what), not a rule; each stands at its station.
export const ROLES_FROM_POPULATION = 6;
type Activity =
  | { readonly kind: 'warm' }
  | { readonly kind: 'work'; readonly action: WorkId; readonly facing: -1 | 1 };
interface Role {
  readonly job: string;
  readonly station: ResidentPlace;
  readonly activity: Activity;
}
export const ROLES: Readonly<Record<string, Role>> = {
  [R1]: { job: 'communal cooking', station: 'fire', activity: { kind: 'warm' } },
  [R2]: { job: 'cultivation', station: 'plot', activity: { kind: 'work', action: 'dig', facing: 1 } },
  [R3]: { job: 'water delivery', station: 'pen', activity: { kind: 'work', action: 'pour', facing: 1 } },
  [R4]: { job: 'building and fetching stone', station: 'home-a', activity: { kind: 'work', action: 'gather', facing: 1 } },
  [R5]: { job: 'building', station: 'home-b', activity: { kind: 'work', action: 'build', facing: 1 } },
  [R6]: { job: 'stone work', station: 'workshop', activity: { kind: 'work', action: 'build', facing: 1 } },
};

// 0..1 within the current 300 ms frame.
const frameProgress = (elapsedMs: number): number => (Math.max(0, elapsedMs) % ACTION_FRAME_MS) / ACTION_FRAME_MS;

const restingPose = (at: Point, seconds: number, phase: number): HumanPose =>
  stillPose('idle', false, at, Math.max(0, Math.sin(seconds * TAU * 0.45 + phase)) * 1.2);

interface CrewPose {
  readonly pose: HumanPose;
  readonly layers: CrewLayers;
  // 0 hidden .. 1 in view (the cave entrance swallowing or releasing a resident).
  readonly visibility: number;
}

const NO_LAYERS: CrewLayers = { effect: null };
const visible = (pose: HumanPose, layers: CrewLayers = NO_LAYERS): CrewPose => ({ pose, layers, visibility: 1 });
const rest = (at: Point, seconds: number, phase: number): CrewPose => visible(restingPose(at, seconds, phase));

// The effect a work frame raises at its contact point, if that frame raises one.
function workEffect(work: WorkId, index: 0 | 1, at: Point, facing: -1 | 1, elapsedMs: number, t: number): EffectLayer | null {
  const phase = frameProgress(elapsedMs);
  const effect = (kind: EffectKind, p: Point): EffectLayer => ({ kind, x: p.x, y: p.y, phase });
  const contact = (action: ActionId, frame: 0 | 1): Point => {
    const offset = contactOffset(action, frame, facing)!;
    return { x: at.x + offset.x, y: at.y + offset.y };
  };
  switch (work) {
    case 'gather':
      // The stone lies at the feet in the stooped frame, and is lifted in the next.
      return index === 0 ? effect('dust', contact('gather', 0)) : null;
    case 'build':
      return index === 1 ? effect('chips', contact('build', 1)) : null;
    case 'dig':
      return index === 1 ? effect('dirt', contact('dig', 1)) : null;
    case 'fill':
      // Splash where the bucket meets the pond, just ahead of the resident.
      return effect('splash', { x: at.x + facing * 13, y: at.y - 2 });
    case 'pour':
      // The water leaves the bucket's rim toward the basin.
      return t > 0.15 && t < 0.8 ? effect('splash', { x: at.x + facing * 14, y: at.y - 12 }) : null;
  }
}

// A resident working in place `elapsedMs` into a step of length `t` (0..1) of its span.
export function workPose(work: WorkId, at: Point, facing: -1 | 1, elapsedMs: number, t: number): CrewPose {
  const art = WORK_ART[work];
  const index = art.alternates ? actionFrameIndex(elapsedMs) : 0;
  return visible(actionPose(art.action, index, at, facing), { effect: workEffect(work, index, at, facing, elapsedMs, t) });
}

interface Segment {
  readonly step: Step;
  readonly from: Point;
  readonly to: Point;
  readonly startMs: number;
  readonly endMs: number;
}

const walkMs = (from: Point, to: Point): number => Math.hypot(to.x - from.x, to.y - from.y) / HUMAN_WALK_SPEED_PX_PER_MS;

// The routine laid out in logical time from `start`.
function plan(steps: readonly Step[], start: Point): readonly Segment[] {
  const segments: Segment[] = [];
  let at = start;
  let now = 0;
  for (const step of steps) {
    const to = step.kind === 'walk' || step.kind === 'carry' ? SPOTS[step.to] : at;
    const length = step.kind === 'walk' || step.kind === 'carry' ? walkMs(at, to) : step.ms;
    segments.push({ step, from: at, to, startMs: now, endMs: now + length });
    at = to;
    now += length;
  }
  return segments;
}

// The routine's length in logical milliseconds, from its own starting place.
export function routineDurationMs(r: Routine, id: string): number {
  const segments = plan(r.steps, residentSpot(r.from, id));
  return segments.length === 0 ? 0 : segments[segments.length - 1].endMs;
}

// Where the resident ends up, and so where the Wave must leave them.
export function routineEndSpot(r: Routine, id: string): Point {
  const segments = plan(r.steps, residentSpot(r.from, id));
  return segments.length === 0 ? residentSpot(r.from, id) : segments[segments.length - 1].to;
}

// When (ms into the Wave) the resident's first `action` step begins, or null.
export function workStartMs(r: Routine, id: string, action: WorkId): number | null {
  const found = plan(r.steps, residentSpot(r.from, id)).find((s) => s.step.kind === 'work' && s.step.action === action);
  return found === undefined ? null : found.startMs;
}

// The span (ms into the Wave) the resident spends out of sight inside the cave.
export function hiddenSpan(r: Routine, id: string): { readonly startMs: number; readonly endMs: number } | null {
  const found = plan(r.steps, residentSpot(r.from, id)).find((s) => s.step.kind === 'hidden');
  return found === undefined ? null : { startMs: found.startMs, endMs: found.endMs };
}

// The first moment the resident has reached its destination and stopped walking.
export function arrivalMs(r: Routine, id: string, to: SpotId): number | null {
  const found = plan(r.steps, residentSpot(r.from, id)).find((s) => (s.step.kind === 'walk' || s.step.kind === 'carry') && s.step.to === to);
  return found === undefined ? null : found.endMs;
}

// 0..1: how much of the resident is in view while walking into or out of the entrance.
const swallowed = (conceal: 'in' | 'out', t: number): number =>
  conceal === 'in' ? 1 - smoothstep(0.4, 1, t) : smoothstep(0, 0.6, t);

function routinePose(steps: readonly Step[], start: Point, elapsedMs: number, seconds: number): CrewPose {
  const segments = plan(steps, start);
  const last = segments[segments.length - 1];
  if (last === undefined || elapsedMs >= last.endMs) return rest(last?.to ?? start, seconds, 0);
  const segment = segments.find((s) => elapsedMs < s.endMs)!;
  const { step } = segment;
  const local = elapsedMs - segment.startMs;
  const span = Math.max(1e-6, segment.endMs - segment.startMs);
  const t = clamp01(local / span);
  switch (step.kind) {
    case 'walk':
    case 'carry': {
      const at = walkToward(segment.from, segment.to, local);
      const direction = selectWalkDirection(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
      if (direction === null) return rest(segment.to, seconds, 0);
      if (step.kind === 'carry') {
        const action: ActionId = step.load === 'bucket' ? 'water-carry' : 'carry';
        const facing = segment.to.x < segment.from.x ? -1 : 1;
        return visible(actionPose(action, actionFrameIndex(local), at, facing));
      }
      const pose = walkingPose(at, direction, local, false);
      return { pose, layers: NO_LAYERS, visibility: step.conceal === undefined ? 1 : swallowed(step.conceal, t) };
    }
    case 'work':
      return workPose(step.action, segment.from, step.facing, local, t);
    case 'hidden':
      return { pose: walkingPose(segment.from, 'up', 0, false), layers: NO_LAYERS, visibility: 0 };
  }
}

function crewVisual(id: string, crew: CrewPose, scale = 1): ResidentVisual {
  // A resident going into the cave recedes as well as fades.
  const receding = 0.8 + 0.2 * crew.visibility;
  return { id, pose: crew.pose, alpha: crew.visibility, scale: scale * receding, shakeX: 0, layers: crew.layers };
}

// The role's stationary work while no Wave gives the resident a routine.
function rolePose(role: Role, at: Point, snapshot: SliceSnapshot): CrewPose {
  const { activity } = role;
  if (activity.kind === 'warm') return visible(stillPose('warm', false, at));
  // The splash of a pour is a short pulse once per loop frame pair.
  const t = (snapshot.clockMs % (ACTION_FRAME_MS * 2)) / (ACTION_FRAME_MS * 2);
  return workPose(activity.action, at, activity.facing, snapshot.clockMs, t);
}

// The pose for resident `resident` from a Wave routine, or from its role, or null when
// neither applies (the caller then falls back to the Turn 1/2 behaviour or standing still).
function autonomousPose(snapshot: SliceSnapshot, resident: Resident): CrewPose | null {
  const wave = snapshot.activeWave;
  const seconds = snapshot.clockMs / 1000;
  const waveRoutine = wave === null ? undefined : ROUTINES[wave.id]?.[resident.id];
  if (wave !== null && waveRoutine !== undefined) {
    return routinePose(waveRoutine.steps, residentSpot(resident.place, resident.id), wave.elapsedMs, seconds);
  }
  const role = ROLES[resident.id];
  if (role !== undefined && snapshot.world.population >= ROLES_FROM_POPULATION && resident.place === role.station) {
    return rolePose(role, residentSpot(resident.place, resident.id), snapshot);
  }
  return null;
}

// Residents 1 and 2 keep the approved Turn 1/2 behaviour; this is non-null only when one of
// them has autonomous work (a routine, or a role once the village stands) or has moved off
// their Turn 2 post (the second resident at the cave).
export function computeFounderVisual(snapshot: SliceSnapshot, resident: Resident): ResidentVisual | null {
  const crew = autonomousPose(snapshot, resident);
  if (crew !== null) return crewVisual(resident.id, crew);
  if (resident.place === 'cave') return crewVisual(resident.id, rest(PLACE_SPOTS.cave, snapshot.clockMs / 1000, 0));
  return null;
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
      const crew = third === undefined ? null : autonomousPose(snapshot, third);
      visuals.push(crewVisual(THIRD_RESIDENT_ID, crew ?? rest(start, seconds, 1)));
    }
  }

  // Residents 4 to 6 gather in the village: present once the Wave has completed,
  // popping in one after another while it plays; then each does their own work.
  VILLAGE_RESIDENT_IDS.forEach((id, index) => {
    const at = T.villageResidents[index];
    const resident = known(id);
    if (resident !== undefined) {
      const crew = autonomousPose(snapshot, resident) ?? rest(residentSpot(resident.place, id), seconds, 2 + index);
      visuals.push(crewVisual(id, crew));
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
