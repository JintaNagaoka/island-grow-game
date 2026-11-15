import type { SliceSnapshot } from '../game/sliceGame';
import type { WaveId } from '../game/waves';
import { SECOND_RESIDENT_ID, THIRD_RESIDENT_ID, VILLAGE_RESIDENT_IDS, hasProp, type PropId } from '../game/worldState';
import { clamp01, levelUpBlend, smoothstep } from './animation';
import { ROUTINES, hiddenSpan, workStartMs } from './crew';
import { ACTION_FRAME_MS } from './humanActions';
import { LAYOUT, VILLAGE_HOME_SCALE, type Point } from './layout';
import { TRUE_PROPS, type TrueAsset } from './trueRouteAssets';

// Pure visual state for the Turn 3 / Turn 4 / Epilogue props, derived from the
// snapshot exactly like lifeAnimation.ts does for Turn 2. Which props stand comes
// from the visible world's revealed `props` (and from the active Wave's logical
// progress while one is being revealed); nothing here changes game state or waits
// on a Phaser animation, so a global playback speed scales all of it together.
//
// A prop that someone builds appears only after that resident has arrived and worked at
// it: the windows below come from the resident's own routine (crew.ts), in logical ms,
// so the cause (walk, work) always precedes the result (the prop rising).

export type PropSlot = keyof typeof TRUE_PROPS;

export interface PropVisual {
  readonly slot: PropSlot;
  readonly asset: TrueAsset;
  readonly ground: Point;
  readonly alpha: number;
  // Multiplier on the asset's baseScale.
  readonly scale: number;
  // Draw order. Ground-level props (riverbeds) sit under everything; the rest sort by ground y.
  readonly depth: number;
}

// The active Wave's logical clock.
interface WaveClock {
  readonly progress: number;
  readonly elapsedMs: number;
  readonly durationMs: number;
}
type Appear = (wave: WaveClock) => { alpha: number; scale: number };

// Progress 0..1 through [fromMs, toMs] of the Wave (toMs defaults to the Wave's end).
const over = (wave: WaveClock, fromMs: number, toMs?: number): number =>
  clamp01((wave.elapsedMs - fromMs) / Math.max(1, (toMs ?? wave.durationMs) - fromMs));

// The shared level-up read (see animation.ts): grows out of its own ground point.
const levelUpAppear: Appear = (w) => {
  const blend = levelUpBlend(w.progress);
  return { alpha: blend.newAlpha, scale: blend.newScale };
};
const levelUpRetire: Appear = (w) => {
  const blend = levelUpBlend(w.progress);
  return { alpha: blend.oldAlpha, scale: blend.oldScale };
};
const fadeIn =
  (from: number, to: number): Appear =>
  (w) => ({ alpha: smoothstep(from, to, w.progress), scale: 1 });
const fadeOut =
  (from: number, to: number): Appear =>
  (w) => ({ alpha: 1 - smoothstep(from, to, w.progress), scale: 1 });
// The same reads over a window of the Wave in ms instead of a fraction of it.
const levelUpOver =
  (fromMs: number, toMs?: number): Appear =>
  (w) => levelUpAppear({ ...w, progress: over(w, fromMs, toMs) });
const levelUpRetireOver =
  (fromMs: number, toMs?: number): Appear =>
  (w) => levelUpRetire({ ...w, progress: over(w, fromMs, toMs) });
const fadeInOver =
  (fromMs: number, toMs?: number): Appear =>
  (w) => ({ alpha: smoothstep(0, 1, over(w, fromMs, toMs)), scale: 1 });
const fadeOutOver =
  (fromMs: number, toMs?: number): Appear =>
  (w) => ({ alpha: 1 - smoothstep(0, 1, over(w, fromMs, toMs)), scale: 1 });

const R2 = SECOND_RESIDENT_ID;
const R3 = THIRD_RESIDENT_ID;
const [R4, R5] = VILLAGE_RESIDENT_IDS;
const routineOf = (wave: WaveId, id: string) => ROUTINES[wave]![id];
const startOf = (wave: WaveId, id: string, action: 'build' | 'dig' | 'pour'): number => workStartMs(routineOf(wave, id), id, action)!;

// One mallet cycle (a raise, then a strike) before the thing being built shows.
const FIRST_STRIKES_MS = 2 * ACTION_FRAME_MS;
const HUT_FROM_MS = startOf('human-builds-hut', R3, 'build') + FIRST_STRIKES_MS;
const FURNACE_FROM_MS = startOf('furnace-lights', R3, 'build') + FIRST_STRIKES_MS;
const DUG_FROM_MS = startOf('riverbed-dug', R3, 'dig') + FIRST_STRIKES_MS;
const POURED_FROM_MS = startOf('water-carried', R3, 'pour');
// The cave's exterior changes while the resident is inside: after they have gone in and
// worked a little, completing as they start to come out. The same trip in both cave Waves.
const CAVE_SPAN = hiddenSpan(routineOf('cave-furnished', R2), R2)!;
const CAVE_CHANGE = { fromMs: CAVE_SPAN.startMs + 300, toMs: CAVE_SPAN.endMs + 100 } as const;

interface SlotRule {
  readonly slot: PropSlot;
  // Stands once this prop has been revealed.
  readonly prop: PropId;
  // The Wave that reveals it, and how it shows while that Wave plays.
  readonly wave: WaveId;
  readonly appear: Appear;
  readonly ground: Point;
  // Gives way to another prop once that one is revealed (and while its Wave plays).
  readonly retiredBy?: { readonly prop: PropId; readonly wave: WaveId; readonly retire: Appear };
  readonly depth?: number;
}

const T = LAYOUT.true;
const GROUND_DEPTH = -500;
// The animals stand inside the fence ring and are drawn over its rails.
const ANIMAL_DEPTH = T.pen.y + 1;
// The shrine hill is drawn behind a resident standing on its steps and in front of one
// still inside: its depth is the entrance sill, so a resident leaving the cave is hidden by
// the hill until they cross the sill and then walks out in front of it.
export const CAVE_SILL_DEPTH = T.caveHill.y - 4;

// One rule per art slot. Replacement pairs (dry -> flowing riverbed, empty -> filled
// basin, practical cave -> shrine hill, livestock -> guardians) are rules that retire each other.
const SLOT_RULES: readonly SlotRule[] = [
  { slot: 'stoneWorkshop', prop: 'stone-workshop', wave: 'workshop-appears', appear: levelUpAppear, ground: T.workshop },
  // The hut rises while the resident hammers its wall: after the first strikes.
  { slot: 'secondHut', prop: 'second-hut', wave: 'human-builds-hut', appear: levelUpOver(HUT_FROM_MS), ground: T.secondHut },
  {
    slot: 'practicalCave',
    prop: 'practical-cave',
    wave: 'cave-furnished',
    // The furnishings appear only after the resident has been inside.
    appear: levelUpOver(CAVE_CHANGE.fromMs, CAVE_CHANGE.toMs),
    ground: T.cave,
    retiredBy: { prop: 'shrine', wave: 'shrine-appears', retire: levelUpRetireOver(CAVE_CHANGE.fromMs, CAVE_CHANGE.toMs) },
  },
  // The Stage 4 cave: the supplied shrine hill, fitted over the baked cave mouth.
  {
    slot: 'caveExterior',
    prop: 'shrine',
    wave: 'shrine-appears',
    appear: levelUpOver(CAVE_CHANGE.fromMs, CAVE_CHANGE.toMs),
    ground: T.caveHill,
    depth: CAVE_SILL_DEPTH,
  },
  { slot: 'fence', prop: 'fence', wave: 'livestock-fenced', appear: fadeIn(0.45, 0.95), ground: T.pen },
  { slot: 'feedTrough', prop: 'feed-area', wave: 'livestock-fenced', appear: fadeIn(0.55, 1), ground: T.feed },
  {
    slot: 'basinEmpty',
    prop: 'empty-bucket',
    wave: 'livestock-fenced',
    appear: fadeIn(0.55, 1),
    ground: T.basin,
    // The carried water arrives as it is poured: a short cross-fade.
    retiredBy: { prop: 'filled-bucket', wave: 'water-carried', retire: fadeOutOver(POURED_FROM_MS + 250, POURED_FROM_MS + 700) },
  },
  { slot: 'basinFilled', prop: 'filled-bucket', wave: 'water-carried', appear: fadeInOver(POURED_FROM_MS + 250, POURED_FROM_MS + 700), ground: T.basin },
  {
    slot: 'livestockParent',
    prop: 'livestock-parent',
    wave: 'livestock-fenced',
    appear: levelUpAppear,
    ground: T.parent,
    depth: ANIMAL_DEPTH,
    retiredBy: { prop: 'guardians', wave: 'guardian-transforms', retire: levelUpRetire },
  },
  {
    slot: 'livestockChild',
    prop: 'livestock-child',
    wave: 'livestock-breeds',
    appear: levelUpAppear,
    ground: T.child,
    depth: ANIMAL_DEPTH,
    retiredBy: { prop: 'guardians', wave: 'guardian-transforms', retire: levelUpRetire },
  },
  { slot: 'guardianParent', prop: 'guardians', wave: 'guardian-transforms', appear: levelUpAppear, ground: T.parent, depth: ANIMAL_DEPTH },
  { slot: 'guardianChild', prop: 'guardians', wave: 'guardian-transforms', appear: levelUpAppear, ground: T.child, depth: ANIMAL_DEPTH },
  {
    slot: 'dryRiverbed',
    prop: 'dry-riverbed',
    wave: 'riverbed-dug',
    // Dug while the resident works the spade: the bed shows once they have started digging.
    appear: fadeInOver(DUG_FROM_MS),
    ground: T.riverMouth,
    depth: GROUND_DEPTH,
    retiredBy: { prop: 'flowing-riverbed', wave: 'river-flows', retire: fadeOut(0.1, 0.9) },
  },
  { slot: 'flowingRiverbed', prop: 'flowing-riverbed', wave: 'river-flows', appear: fadeIn(0.1, 0.9), ground: T.riverMouth, depth: GROUND_DEPTH + 1 },
  { slot: 'springPond', prop: 'spring-pond', wave: 'spring-appears', appear: levelUpAppear, ground: T.spring },
];

function ruleVisual(rule: SlotRule, snapshot: SliceSnapshot): PropVisual {
  const { world, activeWave: wave } = snapshot;
  let alpha = 0;
  let scale = 1;
  if (hasProp(world, rule.prop)) {
    alpha = 1;
  } else if (wave?.id === rule.wave) {
    ({ alpha, scale } = rule.appear({ progress: clamp01(wave.progress), elapsedMs: wave.elapsedMs, durationMs: wave.durationMs }));
  }
  const retired = rule.retiredBy;
  if (retired !== undefined && alpha > 0) {
    if (hasProp(world, retired.prop)) {
      alpha = 0;
    } else if (wave?.id === retired.wave) {
      const out = retired.retire({ progress: clamp01(wave.progress), elapsedMs: wave.elapsedMs, durationMs: wave.durationMs });
      alpha *= out.alpha;
      scale = out.scale;
    }
  }
  return {
    slot: rule.slot,
    asset: TRUE_PROPS[rule.slot],
    ground: rule.ground,
    alpha,
    scale,
    depth: rule.depth ?? rule.ground.y,
  };
}

// Every art slot, in a fixed order, with alpha 0 for the ones that are not standing.
export function computeSettlementProps(snapshot: SliceSnapshot): readonly PropVisual[] {
  return SLOT_RULES.map((rule) => ruleVisual(rule, snapshot));
}

export const SETTLEMENT_SLOTS: readonly PropSlot[] = SLOT_RULES.map((rule) => rule.slot);

// The finished stone furnace: the visible result of the Rule Engine's furnace-built Event.
// It rises beside the workshop after the builder has struck its wall, then stands for good
// (it is a world prop, so it is still there at the END); the flame is drawn from the clock.
export interface FurnaceVisual {
  readonly ground: Point;
  readonly alpha: number;
  readonly scale: number;
}

export function computeFurnaceVisual(snapshot: SliceSnapshot): FurnaceVisual {
  const { world, activeWave: wave } = snapshot;
  const ground = LAYOUT.true.furnace;
  if (hasProp(world, 'furnace')) return { ground, alpha: 1, scale: 1 };
  if (wave?.id === 'furnace-lights') {
    const blend = levelUpBlend(over(wave, FURNACE_FROM_MS));
    return { ground, alpha: blend.newAlpha, scale: blend.newScale };
  }
  return { ground, alpha: 0, scale: 1 };
}

// The four homes of the Turn 4 village: the approved hut, the second hut, and two more
// instances of the second hut art (the same candidate texture, not new art), drawn smaller
// so four homes fit the village plateau (provisional; a human layout decision). Each of the
// two added homes rises only after its own builder has walked to it and struck its wall.
export { VILLAGE_HOME_SCALE };

export interface VillageHomeVisual {
  readonly index: 2 | 3;
  readonly ground: Point;
  readonly alpha: number;
  readonly scale: number;
}

// The two builders and how long each takes before its home shows (after its first strikes).
const HOME_BUILDERS = [R4, R5] as const;
const HOME_FROM_MS = HOME_BUILDERS.map((id) => startOf('village-built', id, 'build') + FIRST_STRIKES_MS);

export function computeVillageHomes(snapshot: SliceSnapshot): readonly VillageHomeVisual[] {
  const { world, activeWave: wave } = snapshot;
  return LAYOUT.true.homes.map((ground, offset) => {
    const index = (offset + 2) as 2 | 3;
    if (hasProp(world, 'village-homes')) return { index, ground, alpha: 1, scale: VILLAGE_HOME_SCALE };
    if (wave?.id !== 'village-built') return { index, ground, alpha: 0, scale: VILLAGE_HOME_SCALE };
    // Each home rises as its builder works, finishing as the builder's work ends.
    const builderEndMs = startOf('village-built', HOME_BUILDERS[offset], 'build') + buildMs(HOME_BUILDERS[offset]);
    const blend = levelUpBlend(over(wave, HOME_FROM_MS[offset], builderEndMs));
    return { index, ground, alpha: blend.newAlpha, scale: VILLAGE_HOME_SCALE * blend.newScale };
  });
}

function buildMs(id: string): number {
  const step = routineOf('village-built', id).steps.find((s) => s.kind === 'work' && s.action === 'build');
  return step !== undefined && step.kind === 'work' ? step.ms : 0;
}

// --- Effects: a soft glow and rising sparkles at ground points, from the Wave's
// logical progress alone.
export interface EffectVisual {
  readonly ground: Point;
  // Footprint width in design px.
  readonly width: number;
  readonly glow: number;
  readonly sparkle: number;
}

const effectSpots = (...spots: readonly (readonly [Point, number])[]): readonly { ground: Point; width: number }[] =>
  spots.map(([ground, width]) => ({ ground, width }));

const WAVE_EFFECTS: Partial<Record<WaveId, readonly { ground: Point; width: number }[]>> = {
  'farm-matures': effectSpots([T.plantPlot, 100]),
  'farm-blossoms': effectSpots([T.plantPlot, 100]),
  'workshop-appears': effectSpots([T.workshop, 90]),
  'human-builds-hut': effectSpots([T.secondHut, 110]),
  // The furnace is lit beside the workshop; the Turn 2 cooking fire is not touched.
  'furnace-lights': effectSpots([T.furnace, 70]),
  'cave-furnished': effectSpots([T.cave, 90]),
  'livestock-fenced': effectSpots([T.pen, 130]),
  'livestock-breeds': effectSpots([T.child, 60]),
  'spring-appears': effectSpots([T.spring, 100]),
  'village-built': effectSpots([T.homes[0], 90], [T.homes[1], 90]),
  'ecosystem-flourishes': effectSpots([T.plantPlot, 100], [T.pen, 120], [T.spring, 80]),
  'shrine-appears': effectSpots([T.cave, 90]),
  // The Epilogue Growth: one gentle pass of light over everything that grew.
  'epilogue-growth': effectSpots([T.cave, 90], [T.plantPlot, 100], [T.secondHut, 100], [T.pen, 120], [T.spring, 80], [T.homes[1], 90]),
  'true-judged': effectSpots([T.pen, 190]),
  'guardian-transforms': effectSpots([T.parent, 110], [T.child, 70]),
};

export function computeSettlementEffects(snapshot: SliceSnapshot): readonly EffectVisual[] {
  const wave = snapshot.activeWave;
  const spots = wave === null ? undefined : WAVE_EFFECTS[wave.id];
  if (wave === null || spots === undefined) return [];
  const progress = clamp01(wave.progress);
  return spots.map(({ ground, width }) => ({ ground, width, glow: Math.sin(Math.PI * progress), sparkle: progress }));
}

// How much of the Turn 2 animal art (the eating animal) is still standing: the
// fenced livestock take its place.
export function eatingAnimalRetirement(snapshot: SliceSnapshot): number {
  if (hasProp(snapshot.world, 'livestock-parent')) return 0;
  const wave = snapshot.activeWave;
  if (wave?.id === 'livestock-fenced') return levelUpBlend(clamp01(wave.progress)).oldAlpha;
  return 1;
}
