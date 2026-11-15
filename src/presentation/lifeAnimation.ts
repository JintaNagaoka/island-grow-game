import type { SliceSnapshot } from '../game/sliceGame';
import { PLANT_LIFE_WAVES, type WaveId } from '../game/waves';
import { hasCaredForAnimal, hasCookingFire, hasDomesticLivestockFamily, hasMatureFarm, hasSproutPlot, hasUpgradedHut } from '../game/worldState';
import { clamp01, easeOutBack, levelUpBlend, stillPose, walkingPose, type HumanPose } from './animation';
import { walkRoute } from './humanWalk';
import { LAYOUT } from './layout';
import {
  ANIMAL_EAT_FRAMES,
  COOK_STEAM_FRAMES,
  FARM_HARVEST_FRAMES,
  FARM_WATER_FRAME,
  TURN2_FRAME_DURATION_MS,
  type Turn2Frame,
} from './turn2Assets';

// Pure visual state for Turn 2 (🌱), derived from the authoritative snapshot
// exactly like animation.ts does for Turn 1. Nothing here changes game state or
// waits on a Phaser animation: frames and effects are functions of the logical
// clock (SliceSnapshot.clockMs) and the active Wave's logical progress, so a
// global playback speed scales all of it together. Persistent facts come from
// the semantic WorldState predicates, never from stage numbers.

const PLANT_WAVE_IDS: readonly WaveId[] = PLANT_LIFE_WAVES.map((wave) => wave.id);
const waveOrder = (id: WaveId): number => PLANT_WAVE_IDS.indexOf(id);

// Frame of a two-frame, 300 ms/frame repeating animation at `timeMs`.
export const loopFrame = (timeMs: number): 0 | 1 =>
  (Math.floor(Math.max(0, timeMs) / TURN2_FRAME_DURATION_MS) % 2) as 0 | 1;

function activePlantWave(snapshot: SliceSnapshot) {
  const wave = snapshot.activeWave;
  return wave !== null && waveOrder(wave.id) >= 0 ? wave : null;
}

export interface LifeHuman {
  readonly pose: HumanPose;
  // 0 once the composite farm-work art (which contains the human) stands in.
  readonly alpha: number;
}

// The human sprite during Turn 2, or null while Turn 1's pose logic applies
// (before Turn 2 starts). The human walks to the plot and stands there until the
// water Wave begins; from then on the composite farm art (which contains the
// human, at the same spot) represents the human.
export function computeLifeHuman(snapshot: SliceSnapshot): LifeHuman | null {
  const wave = activePlantWave(snapshot);
  const isCold = snapshot.world.isCold;
  const atPlot = stillPose('idle', isCold, LAYOUT.plotHuman);

  if (wave?.id === 'human-walks-to-plot') {
    const step = walkRoute(LAYOUT.humanPlotRoute, wave.elapsedMs);
    if (step.direction === null) return { pose: stillPose('idle', isCold, step), alpha: 1 };
    return { pose: walkingPose(step, step.direction, wave.elapsedMs, isCold), alpha: 1 };
  }
  if (hasMatureFarm(snapshot.world)) return { pose: atPlot, alpha: 1 };
  if (wave !== null || hasSproutPlot(snapshot.world)) return { pose: atPlot, alpha: 0 };
  return null;
}

export interface FarmVisual {
  // The composite human + plot frame to show, or null.
  readonly frame: Turn2Frame | null;
  readonly alpha: number;
  readonly scale: number;
}

const NO_FARM: FarmVisual = { frame: null, alpha: 0, scale: 1 };

// The composite farm-work frame, from the Wave sequence alone: water1 for the whole
// 1.5 s water Wave, harvest2 for the whole 1.5 s harvest Wave, then harvest1 held
// for good. Each pose is one continuous frame (no alternation); the plot pops in
// with a small scale-up at the start of the water Wave.
export function computeFarmVisual(snapshot: SliceSnapshot): FarmVisual {
  const wave = activePlantWave(snapshot);
  const settlement = snapshot.activeWave?.id === 'settlement-expands' ? snapshot.activeWave : null;
  if (settlement) return { frame: FARM_HARVEST_FRAMES[0], alpha: 1 - settlement.progress, scale: 1 };
  if (hasMatureFarm(snapshot.world)) return NO_FARM;
  if (wave?.id === 'human-walks-to-plot') return NO_FARM;
  if (wave?.id === 'human-waters-plot') {
    return { frame: FARM_WATER_FRAME, alpha: 1, scale: 0.9 + 0.1 * easeOutBack(wave.progress / 0.15) };
  }
  if (wave?.id === 'human-harvests-plot') return { frame: FARM_HARVEST_FRAMES[1], alpha: 1, scale: 1 };
  // The farm-expands Wave (the state is set when it completes) and everything after: settled on harvest1.
  if (wave?.id === 'farm-expands' || hasSproutPlot(snapshot.world)) return { frame: FARM_HARVEST_FRAMES[0], alpha: 1, scale: 1 };
  return NO_FARM;
}

export interface FarmTileVisual {
  readonly alpha: number;
  readonly scale: number;
}

// The standalone plot tiles (LAYOUT.farmPlotTiles, in reveal order). During the
// farm-expands Wave they grow in one after another across the first 70% of the
// Wave (each over 30%); afterwards, once the farm has expanded, they all stay.
export function computeFarmTiles(snapshot: SliceSnapshot): readonly FarmTileVisual[] {
  const count = LAYOUT.farmPlotTiles.length;
  const wave = snapshot.activeWave;
  if (wave?.id === 'settlement-expands') {
    return LAYOUT.farmPlotTiles.map(() => ({ alpha: 1 - wave.progress, scale: 1 }));
  }
  if (hasMatureFarm(snapshot.world)) return LAYOUT.farmPlotTiles.map(() => ({ alpha: 0, scale: 1 }));
  if (wave?.id === 'farm-expands') {
    return LAYOUT.farmPlotTiles.map((_, index) => {
      const start = (0.7 * index) / Math.max(1, count - 1);
      const local = clamp01((wave.progress - start) / 0.3);
      return { alpha: clamp01(local * 2), scale: local === 0 ? 0.7 : 0.7 + 0.3 * easeOutBack(local) };
    });
  }
  // The Wave has completed: the Turn 2 sprout plot (the expanded farm) exists for good.
  const expanded = hasSproutPlot(snapshot.world);
  return LAYOUT.farmPlotTiles.map(() => ({ alpha: expanded ? 1 : 0, scale: 1 }));
}

export interface ShelterVisual {
  readonly shelterAlpha: number;
  // The old shelter swells slightly while it gives way, so it reads as growing.
  readonly shelterScale: number;
  readonly hutAlpha: number;
  readonly hutScale: number;
  // 0..1 warm glow behind the shelter, peaking mid level-up.
  readonly glow: number;
  // 0..1 progress of the level-up sparkles, or null outside the level-up.
  readonly sparkle: number | null;
}

// The rain shelter develops into the hut: the hut rises out of the shelter's own
// ground point while the shelter swells and fades, under a short warm glow. All
// from the level-up Wave's logical progress; no new art is generated.
export function computeShelterVisual(snapshot: SliceSnapshot): ShelterVisual {
  const wave = snapshot.activeWave;
  if (wave?.id === 'shelter-levels-up') {
    const blend = levelUpBlend(wave.progress);
    return {
      shelterAlpha: blend.oldAlpha,
      shelterScale: blend.oldScale,
      hutAlpha: blend.newAlpha,
      hutScale: blend.newScale,
      glow: blend.glow,
      sparkle: blend.sparkle,
    };
  }
  const upgraded = hasUpgradedHut(snapshot.world);
  return {
    shelterAlpha: upgraded ? 0 : 1,
    shelterScale: 1,
    hutAlpha: upgraded ? 1 : 0,
    hutScale: 1,
    glow: 0,
    sparkle: null,
  };
}

export interface CookingFireVisual {
  readonly visible: boolean;
  readonly alpha: number;
  readonly scale: number;
  // Which cook_steam frame to show.
  readonly frame: 0 | 1;
  readonly frameTextureKey: string;
  readonly glow: number;
  readonly sparkle: number | null;
}

// The campfire levels up into the cooking fire at the campfire's own ground point:
// the campfire (computeFireVisual) swells and fades while this grows in; afterwards
// only this remains. The two are never independent objects.
export function computeCookingFireVisual(snapshot: SliceSnapshot): CookingFireVisual {
  const frame = loopFrame(snapshot.clockMs);
  const base = { frame, frameTextureKey: COOK_STEAM_FRAMES[frame].textureKey };
  const wave = snapshot.activeWave;
  if (wave?.id === 'cooking-starts') {
    const blend = levelUpBlend(wave.progress);
    return { ...base, visible: blend.newAlpha > 0, alpha: blend.newAlpha, scale: blend.newScale, glow: blend.glow, sparkle: blend.sparkle };
  }
  if (hasCookingFire(snapshot.world)) return { ...base, visible: true, alpha: 1, scale: 1, glow: 0, sparkle: null };
  return { ...base, visible: false, alpha: 0, scale: 1, glow: 0, sparkle: null };
}

export interface AnimalVisual {
  // The wild animal art (grazing): fades and swells slightly as it levels up.
  readonly wildAlpha: number;
  readonly wildScale: number;
  // The eating art: grows in from the same ground point. Still the one animal.
  readonly eatAlpha: number;
  readonly eatScale: number;
  readonly frame: 0 | 1;
  readonly frameTextureKey: string;
  readonly glow: number;
  readonly sparkle: number | null;
}

export function computeAnimalVisual(snapshot: SliceSnapshot): AnimalVisual {
  const frame = loopFrame(snapshot.clockMs);
  const base = { frame, frameTextureKey: ANIMAL_EAT_FRAMES[frame].textureKey };
  const wave = snapshot.activeWave;
  if (wave?.id === 'livestock-domesticated') {
    const blend = levelUpBlend(wave.progress);
    return {
      ...base,
      wildAlpha: 0,
      wildScale: 1,
      eatAlpha: blend.oldAlpha,
      eatScale: blend.oldScale,
      glow: blend.glow,
      sparkle: blend.sparkle,
    };
  }
  if (hasDomesticLivestockFamily(snapshot.world)) {
    return { ...base, wildAlpha: 0, wildScale: 1, eatAlpha: 0, eatScale: 1, glow: 0, sparkle: null };
  }
  if (wave?.id === 'animal-eats') {
    const blend = levelUpBlend(wave.progress);
    return {
      ...base,
      wildAlpha: blend.oldAlpha,
      wildScale: blend.oldScale,
      eatAlpha: blend.newAlpha,
      eatScale: blend.newScale,
      glow: blend.glow,
      sparkle: blend.sparkle,
    };
  }
  const caredFor = hasCaredForAnimal(snapshot.world);
  return {
    ...base,
    wildAlpha: caredFor ? 0 : 1,
    wildScale: 1,
    eatAlpha: caredFor ? 1 : 0,
    eatScale: 1,
    glow: 0,
    sparkle: null,
  };
}
