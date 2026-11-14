import type { WorldState } from '../game/worldState';
import type { Point } from './layout';
import type { WorldAsset } from './worldAssets';

// Durable world art for the plant plot, one PNG per WorldState.plantStage 1..5
// (PL-GROW-01..05). The five PNGs are the supplied plant_stages_final.zip files,
// added byte-for-byte. They are 512x512 transparent RGBA, share one plot footprint
// and differ only in what grows on it, so one origin, scale and ground point serve
// every stage and a stage change never moves the plot.
//
// The registry is data only. Which stage is on screen is decided by the
// authoritative WorldState (selectPlantStageAsset); nothing here, and no animation
// or Wave, ever sets or advances plantStage. Turn 2's transient work art
// (turn2Assets.ts: the Human farm-work frames and the growing tiles) is separate.

export const PLANT_STAGE_ASSET_DIR = '/assets/world/plant-stages/';
export const PLANT_STAGE_FRAME_SIZE = 512;

export type PlantStage = 1 | 2 | 3 | 4 | 5;

export interface PlantStageAsset extends WorldAsset {
  readonly stage: PlantStage;
  // Directory the file is served from, with a trailing slash.
  readonly dir: string;
}

// Anchor: bottom centre of the plot's wooden base, in each PNG's own pixels. Every
// stage's opaque bounds are centred on x 255-256 and end on y 490-491 (the taller
// fruit tree only adds height), so one anchor holds for all five.
//
// Scale 0.2 draws the plot about 94 design px wide (the Stage 1 plot about 71 px tall),
// close to the footprint of the Turn 2 farm it replaces, and keeps Stage 5's tree
// about 92 px tall. Placement is the island-PNG point on the left-middle grass
// terrace, just right of the idle Human's spot beside the plot (LAYOUT.plotHuman)
// and above the central growth space. Scale and placement are provisional: final
// scale, placement and readability are a Human Review decision.
const PLANT_STAGE_COMMON = {
  width: PLANT_STAGE_FRAME_SIZE,
  height: PLANT_STAGE_FRAME_SIZE,
  groundAnchor: { x: 256, y: 491 },
  baseScale: 0.2,
  placementSpace: 'island',
  placement: { x: 380, y: 674 },
  dir: PLANT_STAGE_ASSET_DIR,
} as const satisfies Omit<PlantStageAsset, 'textureKey' | 'filename' | 'stage'>;

export const PLANT_STAGE_ASSETS = [
  { ...PLANT_STAGE_COMMON, stage: 1, textureKey: 'plant-stage-1', filename: 'plant_stage_1.png' },
  { ...PLANT_STAGE_COMMON, stage: 2, textureKey: 'plant-stage-2', filename: 'plant_stage_2.png' },
  { ...PLANT_STAGE_COMMON, stage: 3, textureKey: 'plant-stage-3', filename: 'plant_stage_3.png' },
  { ...PLANT_STAGE_COMMON, stage: 4, textureKey: 'plant-stage-4', filename: 'plant_stage_4.png' },
  { ...PLANT_STAGE_COMMON, stage: 5, textureKey: 'plant-stage-5', filename: 'plant_stage_5.png' },
] as const satisfies readonly PlantStageAsset[];

// Everything the Scene loads for the plant plot.
export const PLANT_STAGE_ASSET_LIST: readonly PlantStageAsset[] = PLANT_STAGE_ASSETS;

// The plot's ground point, shared by every stage (no stage moves the plot).
export const PLANT_PLOT_PLACEMENT: Point = PLANT_STAGE_ASSETS[0].placement;

// The durable plant visual for the authoritative world: none at Stage 0, otherwise
// exactly the one asset for that Stage. A stage with no approved art (not 0..5, or
// not a whole number) is not defined by the specification, so it fails loudly
// instead of drawing a neighbouring stage.
export function selectPlantStageAsset(world: Pick<WorldState, 'plantStage'>): PlantStageAsset | null {
  const stage = world.plantStage;
  if (!Number.isInteger(stage) || stage < 0 || stage > PLANT_STAGE_ASSETS.length) {
    throw new RangeError(`plantStage has no plant asset: ${stage}`);
  }
  return stage === 0 ? null : PLANT_STAGE_ASSETS[stage - 1];
}
