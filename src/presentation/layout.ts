import { DESIGN_HEIGHT, DESIGN_WIDTH } from './display';
import { BUILD_STRIKE_REACH } from './humanActions';
import {
  COOK_STEAM_FRAMES,
  FARM_WATER_FRAME,
  FARM_WATER_HUMAN_FEET,
  HUT_ASSET,
} from './turn2Assets';
import { CAVE_EXTERIOR_PLACEMENT, RIVER_SOURCE_PX, TRUE_PROPS } from './trueRouteAssets';
import { FIRE_ASSET, WORLD_ASSETS, type WorldAsset } from './worldAssets';

// All layout is expressed as ratios of the 9:16 design resolution so aspect
// ratio dependence stays in display.ts. World positions are provisional and
// registered to the island art; they are a human play-review decision.
const x = (ratio: number): number => DESIGN_WIDTH * ratio;
const y = (ratio: number): number => DESIGN_HEIGHT * ratio;

export interface Point {
  readonly x: number;
  readonly y: number;
}

const BUTTON_COUNT = 4;
const BUTTON_SIZE = x(0.2);
const BUTTON_GAP = (DESIGN_WIDTH - BUTTON_COUNT * BUTTON_SIZE) / (BUTTON_COUNT + 1);

// Island art pixel -> design pixel. Everything standing on the island is placed
// in the island PNG's pixel space and converted here, so the art and its props
// can never drift apart.
const ISLAND = WORLD_ASSETS.island;
const onIsland = (px: number, py: number): Point => ({
  x: ISLAND.placement.x + (px - ISLAND.groundAnchor.x) * ISLAND.baseScale,
  y: ISLAND.placement.y + (py - ISLAND.groundAnchor.y) * ISLAND.baseScale,
});
const assetGround = (asset: WorldAsset): Point => {
  if (asset.placementSpace === 'design') return asset.placement;
  return onIsland(asset.placement.x, asset.placement.y);
};

const HUMAN_WARM = onIsland(373, 971);
const PLOT = assetGround(FARM_WATER_FRAME);
// Where the human stands at the plot: its feet in the water-pose art, relative to
// that frame's ground anchor, at the frame's scale.
const PLOT_HUMAN: Point = {
  x: PLOT.x + (FARM_WATER_HUMAN_FEET.x - FARM_WATER_FRAME.groundAnchor.x) * FARM_WATER_FRAME.baseScale,
  y: PLOT.y + (FARM_WATER_HUMAN_FEET.y - FARM_WATER_FRAME.groundAnchor.y) * FARM_WATER_FRAME.baseScale,
};

const at = (px: number, py: number): Point => ({ x: px, y: py });
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// The one plant plot. Every growth stage (plant-stage-1..5) stands on this single ground
// contact, so a stage change never moves the plot. It sits just right of the Turn 2 plot
// so the resident who tends it (PLOT_HUMAN) stands at its left corner instead of on it.
const PLANT_PLOT = at(PLOT.x + 30, PLOT.y + 4);

// How wide a village home is drawn relative to the second hut it reuses (provisional).
export const VILLAGE_HOME_SCALE = 0.8;
// Where the second hut's left (visible, lit) wall meets the ground, in hut-second.png
// pixels: the builder's mallet face is aimed at this wall.
export const HUT_WALL_PX = { x: 80, y: 380 } as const;
const HUT_ANCHOR_PX = TRUE_PROPS.secondHut.groundAnchor;
// The wall point of a hut standing at `ground` drawn at `scale`.
const hutWall = (ground: Point, scale: number): Point =>
  at(ground.x + (HUT_WALL_PX.x - HUT_ANCHOR_PX.x) * scale, ground.y + (HUT_WALL_PX.y - HUT_ANCHOR_PX.y) * scale);
// Where a resident facing right stands so the strike frame's mallet face lands on `face`.
const standLeftOf = (face: Point): Point => at(face.x - BUILD_STRIKE_REACH.x, face.y + BUILD_STRIKE_REACH.y);
// ...and facing left, for a target on the resident's left.
const standRightOf = (face: Point): Point => at(face.x + BUILD_STRIKE_REACH.x, face.y + BUILD_STRIKE_REACH.y);

// Turn 3 / Turn 4 / Epilogue placements, in design pixels (all provisional: the
// candidate art and its arrangement await human review). The riverbed runs from the
// spring uphill to the ocean at the south-west; the spring pond's outlet is derived
// from the riverbed so the two can never drift apart, and neither touches the animal pen.
const RIVER_MOUTH = at(88, 546);
const RIVER_SCALE = TRUE_PROPS.dryRiverbed.baseScale;
const RIVER_SOURCE = at(
  RIVER_MOUTH.x + (RIVER_SOURCE_PX.x - TRUE_PROPS.dryRiverbed.groundAnchor.x) * RIVER_SCALE,
  RIVER_MOUTH.y + (RIVER_SOURCE_PX.y - TRUE_PROPS.dryRiverbed.groundAnchor.y) * RIVER_SCALE,
);
const PEN = at(500, 506);
const TRUE_SPOTS = {
  riverMouth: RIVER_MOUTH,
  riverSource: RIVER_SOURCE,
  // The pond is anchored at its outlet stream, which is the riverbed's source.
  spring: RIVER_SOURCE,
  // Where the resident stands to take water from the pond.
  springBank: at(RIVER_SOURCE.x + 18, RIVER_SOURCE.y + 22),
  // Mid-riverbed, where the channel is dug.
  digSite: lerp(RIVER_MOUTH, RIVER_SOURCE, 0.55),
  // The single plant plot's ground contact (every growth stage stands on it).
  plantPlot: PLANT_PLOT,
  workshop: at(452, 642),
  secondHut: at(548, 702),
  // The second hut's visible left wall, and where the builder stands (facing right) so the
  // strike frame's mallet face lands on it.
  hutFace: hutWall(at(548, 702), TRUE_PROPS.secondHut.baseScale),
  hutSite: standLeftOf(hutWall(at(548, 702), TRUE_PROPS.secondHut.baseScale)),
  // Where the resident stands to work the stone at the workshop (just left of it).
  workshopStand: at(414, 656),
  // The stone-working station: the finished stone furnace stands beside the workshop. Its
  // right face is what the builder strikes (from the right, facing left); the furnace
  // never shares a ground point with the Turn 2 cooking fire.
  furnace: at(388, 652),
  furnaceFace: at(388 + 22, 652 - 8),
  furnaceStand: standRightOf(at(388 + 22, 652 - 8)),
  // Where stone is picked up before it is carried to the new homes.
  stonePile: at(470, 664),
  // The cave: the practical-cave furnishings stand on the path in front of it. The
  // supplied shrine exterior replaces the baked cave mouth: it is placed on the island art
  // by CAVE_EXTERIOR_PLACEMENT (its entrance on the baked entrance), and a resident walks
  // from `caveFront` into `caveInside`, which is dark and behind the entrance.
  cave: at(378, 172),
  caveHill: onIsland(CAVE_EXTERIOR_PLACEMENT.islandGround.x, CAVE_EXTERIOR_PLACEMENT.islandGround.y),
  caveFront: onIsland(503, 222),
  caveInside: onIsland(503, 150),
  pen: PEN,
  // The fence ring's centre is about 43 design px above its ground point.
  parent: at(PEN.x - 22, PEN.y - 26),
  child: at(PEN.x + 26, PEN.y - 16),
  // Just behind the fence ring, on the grass above it.
  feed: at(PEN.x + 24, PEN.y - 88),
  basin: at(PEN.x - 30, PEN.y + 38),
  // Where the resident stands to build the fence and to pour water into the basin: just left
  // of the basin, so the bucket's rim is over it as the water is poured.
  penGate: at(PEN.x - 56, PEN.y + 42),
  homes: [at(452, 742), at(596, 754)] as readonly Point[],
  // The added homes' visible left walls, and where their builders stand (facing right) so the
  // strike frame's mallet face lands on them.
  homeFaces: [
    hutWall(at(452, 742), TRUE_PROPS.secondHut.baseScale * VILLAGE_HOME_SCALE),
    hutWall(at(596, 754), TRUE_PROPS.secondHut.baseScale * VILLAGE_HOME_SCALE),
  ] as readonly Point[],
  homeSites: [
    standLeftOf(hutWall(at(452, 742), TRUE_PROPS.secondHut.baseScale * VILLAGE_HOME_SCALE)),
    standLeftOf(hutWall(at(596, 754), TRUE_PROPS.secondHut.baseScale * VILLAGE_HOME_SCALE)),
  ] as readonly Point[],
  villageResidents: [at(526, 770), at(556, 786), at(500, 792)] as readonly Point[],
} as const;

const islandRect = (left: number, top: number, right: number, bottom: number) => {
  const a = onIsland(left, top);
  const b = onIsland(right, bottom);
  return { left: a.x, top: a.y, right: b.x, bottom: b.y };
};

// Fixed 2.5D miniature seen from a fixed camera. The baked island PNG is the
// terrain, cave, rocks and its single landscape tree. Props and characters are
// depth-sorted by their ground y.
export const LAYOUT = {
  // Island sprite origin (top centre) and its on-screen bounds.
  island: {
    ...assetGround(ISLAND),
    left: ISLAND.placement.x - ISLAND.groundAnchor.x * ISLAND.baseScale,
    right: ISLAND.placement.x + (ISLAND.width - ISLAND.groundAnchor.x) * ISLAND.baseScale,
    top: ISLAND.placement.y,
    bottom: ISLAND.placement.y + ISLAND.height * ISLAND.baseScale,
  },
  // Grass terrace on the right of the island, beside the baked tree.
  animal: assetGround(WORLD_ASSETS.animal),
  // Front: shelter, human, fire on the sand, with the open path kept free.
  shelter: assetGround(WORLD_ASSETS.shelter),
  humanStart: onIsland(346, 971),
  humanWarm: HUMAN_WARM,
  // Dev-only review loop (?humanWalkPreview): a rectangle that walks right,
  // down, left, then up so each approved view can be checked on a phone screen.
  humanWalkPreview: [onIsland(390, 740), onIsland(540, 740), onIsland(540, 850), onIsland(390, 850)] as readonly Point[],
  fire: assetGround(FIRE_ASSET),
  // Turn 2. The plot sits on the left-middle grass terrace above the hut; the hut
  // stands exactly where the rain shelter stood; the cooking fire is the
  // campfire's own ground point (it replaces the campfire).
  plot: PLOT,
  plotHuman: PLOT_HUMAN,
  hut: assetGround(HUT_ASSET),
  cookingFire: assetGround(COOK_STEAM_FRAMES[0]),
  // The human's walk from the fire to the plot. The warm-up spot is a pocket
  // between the shelter's right leg and the fire, so the walk first threads up
  // that gap (about 8 design px wide at its narrowest; the feet clear both
  // silhouettes), then goes left along the free lane between the shelter's roof and the farm, and
  // up to the plot from its lower left.
  humanPlotRoute: [
    HUMAN_WARM,
    onIsland(381, 953),
    onIsland(399, 933),
    onIsland(400, 917),
    onIsland(401, 877),
    onIsland(360, 800),
    onIsland(326, 741),
    PLOT_HUMAN,
  ] as readonly Point[],
  // Empty ground on purpose, so later growth has room to appear: the central
  // sand path and the beach in front of it.
  growthSpaces: [
    { id: 'central', ...islandRect(400, 700, 540, 860) },
    { id: 'front', ...islandRect(260, 1030, 460, 1100) },
  ],
  true: TRUE_SPOTS,
  // Bottom: four-icon selection UI.
  ui: {
    panelTop: y(0.84),
    buttonSize: BUTTON_SIZE,
    buttonCenterY: y(0.925),
    buttonCenterXs: Array.from(
      { length: BUTTON_COUNT },
      (_, i) => BUTTON_GAP + BUTTON_SIZE / 2 + i * (BUTTON_SIZE + BUTTON_GAP),
    ),
  },
} as const;
