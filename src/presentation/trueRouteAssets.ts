import type { Point } from './layout';
import { WORLD_ASSETS, type WorldAsset } from './worldAssets';

// Runtime art for Turn 3 (🪨), Turn 4 (💧) and the Epilogue, from the supplied
// true-route-materials-v3 candidate package, plus the five plant growth stages and the
// shrine cave exterior of the true-route-review-fix-v2 package. The human action
// candidates are registered separately (humanActions.ts) as composite work sprites.
// EVERY file here is a PROVISIONAL candidate: it has not had human visual approval and
// must not be described as final art (see README "TRUE route assets"). The approved
// Turn 1/2 art is untouched.
//
// All PNGs are 512x512 RGBA. `groundAnchor` is the ground contact point in the PNG's
// own pixels: the horizontal centre of the opaque bounds and its bottom edge (the
// riverbeds and the spring use their stream ends instead, noted below), measured from
// the supplied files. Placement is chosen in layout.ts.

export const TRUE_ART_STATUS = 'provisional' as const;
export const TURN3_ASSET_DIR = '/assets/world/turn3/';
export const TURN4_ASSET_DIR = '/assets/world/turn4/';
export const TRUE_ART_SIZE = 512;

export type TrueAsset = Pick<WorldAsset, 'textureKey' | 'filename' | 'width' | 'height' | 'groundAnchor' | 'baseScale'> & {
  readonly dir: string;
};

const prop = (
  dir: string,
  textureKey: string,
  filename: string,
  groundAnchor: Point,
  baseScale: number,
): TrueAsset => ({ dir, textureKey, filename, width: TRUE_ART_SIZE, height: TRUE_ART_SIZE, groundAnchor, baseScale });

const centre = { x: 256, y: 479 } as const;

// Design pixels per PNG pixel. All are first-pass sizes chosen against the island at
// 360x640 and 390x844 and are a human play-review decision.
// The supplied shrine cave exterior (cave-shrine-exterior.png) is a whole hill, not a small
// prop, so it must not be stacked on the baked cave. It is fitted to the island art: its
// entrance sits on the baked entrance and it is scaled so the hill silhouette covers the
// baked stone arch and dark mouth completely (checked pixel by pixel in the tests).
// `islandGround` is where the PNG's ground anchor lands, and `islandScale` is island-art
// pixels per PNG pixel, both in the island PNG's own pixel space.
export const CAVE_EXTERIOR_PLACEMENT = {
  islandGround: { x: 503, y: 203 },
  islandScale: 0.55,
} as const;
export const CAVE_EXTERIOR_ANCHOR: Point = { x: 256, y: 433 };

// Design pixels per PNG pixel of the plant growth frames: the plot reads about 80 design
// pixels wide, a little wider than the Turn 2 composite plot it replaces.
export const PLANT_STAGE_BASE_SCALE = 0.17;

export const TRUE_PROPS = {
  stoneWorkshop: prop(TURN3_ASSET_DIR, 'true-stone-workshop', 'stone-workshop.png', centre, 0.24),
  secondHut: prop(TURN3_ASSET_DIR, 'true-hut-second', 'hut-second.png', centre, 0.3),
  practicalCave: prop(TURN3_ASSET_DIR, 'true-cave-practical', 'cave-practical.png', centre, 0.2),
  fence: prop(TURN3_ASSET_DIR, 'true-fence', 'fence.png', centre, 0.36),
  feedTrough: prop(TURN3_ASSET_DIR, 'true-feed-trough', 'feed-trough.png', centre, 0.12),
  // The existing water-trough.png already holds blue water, so Turn 3 uses the empty
  // candidate and Turn 4 swaps to the filled one after the carry.
  basinEmpty: prop(TURN3_ASSET_DIR, 'true-basin-empty', 'water-trough-empty-candidate.png', centre, 0.13),
  basinFilled: prop(TURN3_ASSET_DIR, 'true-basin-filled', 'water-trough.png', centre, 0.13),
  livestockParent: prop(TURN3_ASSET_DIR, 'true-livestock-parent', 'livestock-parent.png', centre, 0.18),
  livestockChild: prop(TURN3_ASSET_DIR, 'true-livestock-child', 'livestock-child.png', centre, 0.12),
  // The riverbed is anchored at its mouth (the south-west end at the ocean). The dry
  // and flowing candidates share one footprint within 2 px (checked by a test).
  dryRiverbed: prop(TURN3_ASSET_DIR, 'true-riverbed-dry', 'dry-riverbed.png', { x: 171, y: 479 }, 0.55),
  flowingRiverbed: prop(TURN4_ASSET_DIR, 'true-riverbed-flowing', 'flowing-riverbed-candidate.png', { x: 172, y: 480 }, 0.55),
  // The pond is anchored at the end of its outlet stream, which is joined to the
  // riverbed's source end in layout.ts.
  springPond: prop(TURN4_ASSET_DIR, 'true-spring-pond', 'spring-pond-candidate.png', { x: 84, y: 466 }, 0.35),
  // The Stage 4 cave: the whole shrine hill (shimenawa, lanterns, altar) that replaces the
  // baked cave mouth and the practical-cave furnishings. See CAVE_EXTERIOR_PLACEMENT.
  caveExterior: prop(
    TURN4_ASSET_DIR,
    'true-cave-exterior',
    'cave-shrine-exterior.png',
    CAVE_EXTERIOR_ANCHOR,
    CAVE_EXTERIOR_PLACEMENT.islandScale * WORLD_ASSETS.island.baseScale,
  ),
  // Feet bottoms differ from the livestock art (these carry leaves above the body), so
  // their anchors are their own foot lines.
  guardianParent: prop(TURN3_ASSET_DIR, 'true-guardian-parent', 'guardian-parent.png', { x: 256, y: 415 }, 0.18),
  guardianChild: prop(TURN3_ASSET_DIR, 'true-guardian-child', 'guardian-child.png', { x: 256, y: 450 }, 0.13),
} as const satisfies Record<string, TrueAsset>;

// The riverbed's source end in its own PNG pixels (where the spring's outlet joins).
export const RIVER_SOURCE_PX: Point = { x: 350, y: 46 };

export const TRUE_PROP_LIST: readonly TrueAsset[] = Object.values(TRUE_PROPS);

// The five plant growth stages (1 sprouts, 2 saplings, 3 red fruit, 4 blossoms, 5 golden
// fruit). Stage 0 has no art: nothing is planted. The generated canvases are all 512x512
// but the plot's base is not framed identically (the base of stage 2 sits higher and is
// narrower), so each frame carries its own measured anchor and size multiplier:
//  - groundAnchor: the horizontal centre of the plot base's widest row, and its lowest row;
//  - sizeMul: scales the base to the width of stage 1's base.
// Every frame is drawn on one ground point (LAYOUT.true.plantPlot), so the plot base does not
// move when the stage changes. Measured from the PNGs and checked by a test.
export const PLANT_STAGES = [1, 2, 3, 4, 5] as const;
export type PlantStage = (typeof PLANT_STAGES)[number];
export interface PlantStageFrame extends TrueAsset {
  readonly stage: PlantStage;
  readonly sizeMul: number;
}
export const PLANT_ASSET_DIR = '/assets/world/plants/';
const plantFrame = (
  stage: PlantStage,
  filename: string,
  groundAnchor: Point,
  sizeMul: number,
): PlantStageFrame => ({
  stage,
  sizeMul,
  dir: PLANT_ASSET_DIR,
  textureKey: `plant-stage-${stage}`,
  filename,
  width: TRUE_ART_SIZE,
  height: TRUE_ART_SIZE,
  groundAnchor,
  baseScale: PLANT_STAGE_BASE_SCALE * sizeMul,
});
export const PLANT_STAGE_FRAMES: Readonly<Record<PlantStage, PlantStageFrame>> = {
  1: plantFrame(1, 'plant-stage-1-sprouts.png', { x: 255.5, y: 491 }, 1),
  2: plantFrame(2, 'plant-stage-2-saplings.png', { x: 255, y: 469 }, 1.0378),
  3: plantFrame(3, 'plant-stage-3-red-fruit.png', { x: 256.5, y: 490 }, 0.9915),
  4: plantFrame(4, 'plant-stage-4-blossoms.png', { x: 256, y: 492 }, 1.0152),
  5: plantFrame(5, 'plant-stage-5-golden-fruit.png', { x: 255.5, y: 493 }, 0.9852),
};
export const PLANT_FRAME_LIST: readonly PlantStageFrame[] = PLANT_STAGES.map((stage) => PLANT_STAGE_FRAMES[stage]);
