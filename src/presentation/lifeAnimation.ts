import type { SliceSnapshot } from '../game/sliceGame';
import { PLANT_LIFE_WAVES, type WaveId } from '../game/waves';
import { hasSproutPlot, hasUpgradedHut } from '../game/worldState';
import { clamp01, easeOutBack, stillPose, walkingPose, type HumanPose } from './animation';
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

const smoothstep = (from: number, to: number, value: number): number => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

function activePlantWave(snapshot: SliceSnapshot) {
  const wave = snapshot.activeWave;
  return wave !== null && waveOrder(wave.id) >= 0 ? wave : null;
}

const hasCompleted = (snapshot: SliceSnapshot, id: WaveId): boolean => snapshot.completedWaves.includes(id);

export interface LifeHuman {
  readonly pose: HumanPose;
  // 0 once the composite farm-work art (which contains the human) stands in.
  readonly alpha: number;
}

// The human sprite during Turn 2, or null while Turn 1's pose logic applies
// (before Turn 2 starts). The human walks to the plot, stands, and is then
// represented by the composite farm art.
export function computeLifeHuman(snapshot: SliceSnapshot): LifeHuman | null {
  const wave = activePlantWave(snapshot);
  const isCold = snapshot.world.isCold;
  const atPlot = stillPose('idle', isCold, LAYOUT.plotHuman);

  if (wave?.id === 'human-walks-to-plot') {
    const step = walkRoute(LAYOUT.humanPlotRoute, wave.elapsedMs);
    if (step.direction === null) return { pose: stillPose('idle', isCold, step), alpha: 1 };
    return { pose: walkingPose(step, step.direction, wave.elapsedMs, isCold), alpha: 1 };
  }
  // The standing human gives way to the composite art that appears over it.
  if (wave?.id === 'sprout-plot-appears') return { pose: atPlot, alpha: 1 - clamp01(wave.progress / 0.4) };
  // farm_water's first frame is the approved standing idle.
  if (wave?.id === 'human-waters-plot') return { pose: atPlot, alpha: loopFrame(wave.elapsedMs) === 0 ? 1 : 0 };
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

export function computeFarmVisual(snapshot: SliceSnapshot): FarmVisual {
  const wave = activePlantWave(snapshot);
  if (wave?.id === 'human-walks-to-plot') return NO_FARM;
  // The plot pops in with the human posed to water it.
  if (wave?.id === 'sprout-plot-appears') {
    return {
      frame: FARM_WATER_FRAME,
      alpha: clamp01(wave.progress / 0.4),
      scale: 0.9 + 0.1 * easeOutBack(wave.progress / 0.6),
    };
  }
  // farm_water: standing idle (no plot art) then the water pose, alternating.
  if (wave?.id === 'human-waters-plot') {
    return loopFrame(wave.elapsedMs) === 1 ? { frame: FARM_WATER_FRAME, alpha: 1, scale: 1 } : NO_FARM;
  }
  // From the harvest on, and after Turn 2, farm_harvest keeps the plot in view.
  if (hasSproutPlot(snapshot.world)) {
    return { frame: FARM_HARVEST_FRAMES[loopFrame(snapshot.clockMs)], alpha: 1, scale: 1 };
  }
  return NO_FARM;
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
    const p = wave.progress;
    return {
      shelterAlpha: 1 - smoothstep(0.35, 0.8, p),
      shelterScale: 1 + 0.06 * smoothstep(0, 0.8, p),
      hutAlpha: smoothstep(0.2, 0.65, p),
      hutScale: 0.88 + 0.12 * easeOutBack(p / 0.7),
      glow: Math.sin(Math.PI * p),
      sparkle: p,
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

export interface PotVisual {
  readonly visible: boolean;
  readonly scale: number;
  // Which cook_steam frame to show.
  readonly frame: 0 | 1;
  readonly frameTextureKey: string;
}

export function computePotVisual(snapshot: SliceSnapshot): PotVisual {
  const frame = loopFrame(snapshot.clockMs);
  const base = { frame, frameTextureKey: COOK_STEAM_FRAMES[frame].textureKey };
  if (snapshot.activeWave?.id === 'cooking-starts') {
    return { ...base, visible: true, scale: easeOutBack(snapshot.activeWave.progress / 0.6) };
  }
  if (hasCompleted(snapshot, 'cooking-starts')) return { ...base, visible: true, scale: 1 };
  return { ...base, visible: false, scale: 0 };
}

export interface AnimalEatVisual {
  // True once the animal is feeding; its grazing art is then replaced.
  readonly eating: boolean;
  readonly frame: 0 | 1;
  readonly frameTextureKey: string;
}

export function computeAnimalEatVisual(snapshot: SliceSnapshot): AnimalEatVisual {
  const frame = loopFrame(snapshot.clockMs);
  const eating = snapshot.activeWave?.id === 'animal-eats' || hasCompleted(snapshot, 'animal-eats');
  return { eating, frame, frameTextureKey: ANIMAL_EAT_FRAMES[frame].textureKey };
}
