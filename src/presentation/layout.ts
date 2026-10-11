import { DESIGN_HEIGHT, DESIGN_WIDTH } from './display';
import {
  COOK_STEAM_FRAMES,
  FARM_WATER_FRAME,
  FARM_WATER_HUMAN_FEET,
  HUT_ASSET,
} from './turn2Assets';
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
  // Turn 2. The plot sits on the right grass terrace; the hut stands exactly where
  // the rain shelter stood; the pot is on the sand just right of the fire.
  plot: PLOT,
  plotHuman: PLOT_HUMAN,
  hut: assetGround(HUT_ASSET),
  pot: assetGround(COOK_STEAM_FRAMES[0]),
  // The human's walk from the fire to the plot. The warm-up spot is a pocket
  // between the shelter's right leg and the fire, so the walk first threads up
  // that gap (about 8 design px wide at its narrowest; the feet clear both
  // silhouettes), then crosses above the fire to the plot.
  humanPlotRoute: [
    HUMAN_WARM,
    onIsland(381, 953),
    onIsland(399, 933),
    onIsland(400, 917),
    onIsland(401, 877),
    PLOT_HUMAN,
  ] as readonly Point[],
  // Empty ground on purpose, so later growth has room to appear: the central
  // sand path and the beach in front of it.
  growthSpaces: [
    { id: 'central', ...islandRect(400, 700, 540, 860) },
    { id: 'front', ...islandRect(260, 1030, 460, 1100) },
  ],
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
