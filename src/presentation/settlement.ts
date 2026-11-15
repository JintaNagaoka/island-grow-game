import type { SliceSnapshot } from '../game/sliceGame';
import type { WaveId } from '../game/waves';
import { hasProp, type PropId } from '../game/worldState';
import { clamp01, levelUpBlend, smoothstep } from './animation';
import { LAYOUT, type Point } from './layout';
import { TRUE_PROPS, type TrueAsset } from './trueRouteAssets';

// Pure visual state for the Turn 3 / Turn 4 / Epilogue props, derived from the
// snapshot exactly like lifeAnimation.ts does for Turn 2. Which props stand comes
// from the visible world's revealed `props` (and from the active Wave's logical
// progress while one is being revealed); nothing here changes game state or waits
// on a Phaser animation, so a global playback speed scales all of it together.

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

type Appear = (progress: number) => { alpha: number; scale: number };

// The shared level-up read (see animation.ts): grows out of its own ground point.
const levelUpAppear: Appear = (p) => {
  const blend = levelUpBlend(p);
  return { alpha: blend.newAlpha, scale: blend.newScale };
};
const levelUpRetire: Appear = (p) => {
  const blend = levelUpBlend(p);
  return { alpha: blend.oldAlpha, scale: blend.oldScale };
};
const fadeIn =
  (from: number, to: number): Appear =>
  (p) => ({ alpha: smoothstep(from, to, p), scale: 1 });
const fadeOut =
  (from: number, to: number): Appear =>
  (p) => ({ alpha: 1 - smoothstep(from, to, p), scale: 1 });

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

// One rule per art slot. Replacement pairs (dry -> flowing riverbed, empty -> filled
// basin, practical cave -> shrine, livestock -> guardians) are rules that retire each other.
const SLOT_RULES: readonly SlotRule[] = [
  { slot: 'matureFarm', prop: 'mature-farm', wave: 'farm-matures', appear: levelUpAppear, ground: T.farm },
  { slot: 'stoneWorkshop', prop: 'stone-workshop', wave: 'workshop-appears', appear: levelUpAppear, ground: T.workshop },
  // The hut rises while the resident works: it shows through the second half of the Wave.
  {
    slot: 'secondHut',
    prop: 'second-hut',
    wave: 'human-builds-hut',
    appear: (p) => levelUpAppear(clamp01((p - 0.35) / 0.65)),
    ground: T.secondHut,
  },
  {
    slot: 'practicalCave',
    prop: 'practical-cave',
    wave: 'cave-furnished',
    appear: levelUpAppear,
    ground: T.cave,
    retiredBy: { prop: 'shrine', wave: 'shrine-appears', retire: fadeOut(0.3, 0.9) },
  },
  { slot: 'caveShrine', prop: 'shrine', wave: 'shrine-appears', appear: levelUpAppear, ground: T.cave },
  { slot: 'fence', prop: 'fence', wave: 'livestock-fenced', appear: fadeIn(0.45, 0.95), ground: T.pen },
  { slot: 'feedTrough', prop: 'feed-area', wave: 'livestock-fenced', appear: fadeIn(0.55, 1), ground: T.feed },
  {
    slot: 'basinEmpty',
    prop: 'empty-bucket',
    wave: 'livestock-fenced',
    appear: fadeIn(0.55, 1),
    ground: T.basin,
    // The transported water arrives at the very end of the carry: a short cross-fade.
    retiredBy: { prop: 'filled-bucket', wave: 'water-carried', retire: fadeOut(0.85, 1) },
  },
  { slot: 'basinFilled', prop: 'filled-bucket', wave: 'water-carried', appear: fadeIn(0.85, 1), ground: T.basin },
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
    // Dug while the resident works the spade: the bed shows through the middle of the Wave.
    appear: fadeIn(0.3, 0.9),
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
    ({ alpha, scale } = rule.appear(clamp01(wave.progress)));
  }
  const retired = rule.retiredBy;
  if (retired !== undefined && alpha > 0) {
    if (hasProp(world, retired.prop)) {
      alpha = 0;
    } else if (wave?.id === retired.wave) {
      const out = retired.retire(clamp01(wave.progress));
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

// The four homes of the Turn 4 village: the approved hut, the second hut, and two more
// instances of the second hut art (the same candidate texture, not new art).
// The third and fourth homes are the second hut's art drawn smaller so four homes fit
// the village plateau (provisional; a human layout decision).
export const VILLAGE_HOME_SCALE = 0.8;

export interface VillageHomeVisual {
  readonly index: 2 | 3;
  readonly ground: Point;
  readonly alpha: number;
  readonly scale: number;
}

export function computeVillageHomes(snapshot: SliceSnapshot): readonly VillageHomeVisual[] {
  const { world, activeWave: wave } = snapshot;
  return LAYOUT.true.homes.map((ground, offset) => {
    const index = (offset + 2) as 2 | 3;
    if (hasProp(world, 'village-homes')) return { index, ground, alpha: 1, scale: VILLAGE_HOME_SCALE };
    if (wave?.id !== 'village-built') return { index, ground, alpha: 0, scale: VILLAGE_HOME_SCALE };
    // The two homes rise one after the other across the Wave.
    const local = clamp01((wave.progress - 0.45 * offset) / 0.55);
    const blend = levelUpBlend(local);
    return { index, ground, alpha: blend.newAlpha, scale: VILLAGE_HOME_SCALE * blend.newScale };
  });
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
  'farm-matures': effectSpots([T.farm, 120]),
  'workshop-appears': effectSpots([T.workshop, 90]),
  'human-builds-hut': effectSpots([T.secondHut, 110]),
  'furnace-lights': effectSpots([LAYOUT.cookingFire, 70], [T.workshop, 70]),
  'cave-furnished': effectSpots([T.cave, 90]),
  'livestock-fenced': effectSpots([T.pen, 130]),
  'livestock-breeds': effectSpots([T.child, 60]),
  'spring-appears': effectSpots([T.spring, 100]),
  'village-built': effectSpots([T.homes[0], 90], [T.homes[1], 90]),
  'ecosystem-flourishes': effectSpots([T.farm, 120], [T.pen, 120], [T.spring, 80]),
  'shrine-appears': effectSpots([T.cave, 90]),
  // The Epilogue Growth: one gentle pass of light over everything that grew.
  'epilogue-growth': effectSpots([T.cave, 90], [T.farm, 120], [T.secondHut, 100], [T.pen, 120], [T.spring, 80], [T.homes[1], 90]),
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

// Multiplier for the Turn 2 standalone farm tiles: the mature farm takes their place.
export function farmTileRetirement(snapshot: SliceSnapshot): number {
  if (hasProp(snapshot.world, 'mature-farm')) return 0;
  const wave = snapshot.activeWave;
  if (wave?.id === 'farm-matures') return levelUpBlend(clamp01(wave.progress)).oldAlpha;
  return 1;
}

// How much of the Turn 2 animal art (the eating animal) is still standing: the
// fenced livestock take its place.
export function eatingAnimalRetirement(snapshot: SliceSnapshot): number {
  if (hasProp(snapshot.world, 'livestock-parent')) return 0;
  const wave = snapshot.activeWave;
  if (wave?.id === 'livestock-fenced') return levelUpBlend(clamp01(wave.progress)).oldAlpha;
  return 1;
}
