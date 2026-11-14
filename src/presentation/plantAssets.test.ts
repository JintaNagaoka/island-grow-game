import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SliceGame, type SliceSnapshot } from '../game/sliceGame';
import { WAVE_DURATIONS_MS } from '../game/timing';
import { PLANT_LIFE_WAVES } from '../game/waves';
import { createInitialWorldState, type WorldState } from '../game/worldState';
import { readPng, type PngImage } from '../testSupport/png';
import { HUMAN_ASSET_LIST, HUMAN_WALK_ASSET_LIST } from './humanAssets';
import { LAYOUT } from './layout';
import {
  PLANT_PLOT_PLACEMENT,
  PLANT_STAGE_ASSETS,
  PLANT_STAGE_ASSET_DIR,
  PLANT_STAGE_ASSET_LIST,
  PLANT_STAGE_FRAME_SIZE,
  selectPlantStageAsset,
  type PlantStageAsset,
} from './plantAssets';
import { COOK_STEAM_FRAMES, HUT_ASSET, TURN2_ASSET_LIST } from './turn2Assets';
import { FIRE_FRAMES, WORLD_ASSET_LIST, WORLD_ASSETS, groundOrigin } from './worldAssets';

const ROOT = new URL('../../', import.meta.url);
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fileBytes = (asset: PlantStageAsset): Uint8Array =>
  readFileSync(new URL(`public${asset.dir}${asset.filename}`, ROOT));
const alphaAt = (png: PngImage, x: number, y: number): number => png.pixels[(y * png.width + x) * 4 + 3];

// SHA-256 of each PNG in plant_stages_final.zip (ZIP sha256 a716342a…9b97). The
// repository copies must be byte-identical: they are added unprocessed.
const ZIP_PNG_SHA256: Record<string, string> = {
  'plant_stage_1.png': '4a5bdce1755b2f907fb424ccf07d5b974385729bde050dbbb1ba1ad8b09adb47',
  'plant_stage_2.png': 'c0c0042c8f824890ada2f39fa25c05cbf942060d19231ce605da242017280a85',
  'plant_stage_3.png': 'bb7c2a148efa9e5e749aef9d6ef4528d3b3f86220551cb1e6ae0a744c7f973ae',
  'plant_stage_4.png': '97607cace7e5c5bcc5b7f2628bcc2612001c823552edf426d6130ff032f36f34',
  'plant_stage_5.png': '075eda82e7016994f142e3ddf46942ecf7d7e0154b9367fc6d1189220b5421cd',
};

const STAGES = [1, 2, 3, 4, 5] as const;
const worldAtStage = (plantStage: number): WorldState => ({ ...createInitialWorldState(), plantStage });

describe('plant stage PNGs (plant_stages_final.zip)', () => {
  it('registers exactly Stage 1..5, one asset each, in order, with unique keys and files', () => {
    expect(PLANT_STAGE_ASSETS.map((asset) => asset.stage)).toEqual([1, 2, 3, 4, 5]);
    expect(PLANT_STAGE_ASSETS.map((asset) => asset.filename)).toEqual(
      STAGES.map((stage) => `plant_stage_${stage}.png`),
    );
    expect(PLANT_STAGE_ASSETS.map((asset) => asset.textureKey)).toEqual(
      STAGES.map((stage) => `plant-stage-${stage}`),
    );
    expect(PLANT_STAGE_ASSET_LIST).toEqual(PLANT_STAGE_ASSETS);
    expect(PLANT_STAGE_ASSET_DIR).toBe('/assets/world/plant-stages/');
    for (const asset of PLANT_STAGE_ASSETS) expect(asset.dir).toBe(PLANT_STAGE_ASSET_DIR);

    const keys = [
      ...PLANT_STAGE_ASSET_LIST.map((asset) => asset.textureKey),
      ...TURN2_ASSET_LIST.map((asset) => asset.textureKey),
      ...WORLD_ASSET_LIST.map((asset) => asset.textureKey),
      ...HUMAN_ASSET_LIST.map((asset) => asset.textureKey),
      ...HUMAN_WALK_ASSET_LIST.map((asset) => asset.textureKey),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps the plant plot files in their own directory, with nothing but the five stage PNGs', () => {
    const files = readdirSync(new URL(`public${PLANT_STAGE_ASSET_DIR}`, ROOT)).sort();
    expect(files).toEqual(Object.keys(ZIP_PNG_SHA256).sort());
  });

  it.each(PLANT_STAGE_ASSETS)('$filename: byte-identical to the ZIP, 512x512 8-bit RGBA with transparency', (asset) => {
    const bytes = fileBytes(asset);
    expect(sha256(bytes)).toBe(ZIP_PNG_SHA256[asset.filename]);
    const png = readPng(bytes);
    expect([png.bitDepth, png.colorType]).toEqual([8, 6]);
    expect([png.width, png.height]).toEqual([512, 512]);
    expect([asset.width, asset.height]).toEqual([PLANT_STAGE_FRAME_SIZE, PLANT_STAGE_FRAME_SIZE]);
    expect(png.minAlpha).toBe(0);
    expect(png.maxAlpha).toBe(255);
    for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511]]) expect(alphaAt(png, x, y)).toBe(0);
  });

  it('shares one origin, scale and ground point across the five stages, so a stage change never moves the plot', () => {
    const [first, ...rest] = PLANT_STAGE_ASSETS;
    for (const asset of rest) {
      expect(asset.groundAnchor).toEqual(first.groundAnchor);
      expect(asset.baseScale).toBe(first.baseScale);
      expect(asset.placementSpace).toBe(first.placementSpace);
      expect(asset.placement).toEqual(first.placement);
      expect(groundOrigin(asset)).toEqual(groundOrigin(first));
    }
    expect(PLANT_PLOT_PLACEMENT).toEqual(first.placement);
    expect(first).toMatchObject({ groundAnchor: { x: 256, y: 491 }, baseScale: 0.2, placementSpace: 'island' });
  });

  it.each(PLANT_STAGE_ASSETS)('$textureKey: the shared anchor is the bottom centre of the plot base (within 1 px)', (asset) => {
    const png = readPng(fileBytes(asset));
    let [left, right, bottom] = [png.width, -1, -1];
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        if (alphaAt(png, x, y) < 128) continue;
        [left, right, bottom] = [Math.min(left, x), Math.max(right, x), Math.max(bottom, y)];
      }
    }
    expect(Math.abs(asset.groundAnchor.y - bottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(asset.groundAnchor.x - (left + right) / 2)).toBeLessThanOrEqual(1);
  });
});

describe('selectPlantStageAsset: the durable plant visual follows the authoritative plantStage', () => {
  it('shows no plant-stage asset at Stage 0', () => {
    expect(selectPlantStageAsset(worldAtStage(0))).toBeNull();
    expect(selectPlantStageAsset(createInitialWorldState())).toBeNull();
  });

  it.each(STAGES)('renders exactly the Stage %i asset for plantStage %i (one-to-one)', (stage) => {
    const asset = selectPlantStageAsset(worldAtStage(stage));
    expect(asset).toBe(PLANT_STAGE_ASSETS[stage - 1]);
    expect(asset).toMatchObject({ stage, textureKey: `plant-stage-${stage}`, filename: `plant_stage_${stage}.png` });
    // No other stage's asset is selected for this state.
    expect(PLANT_STAGE_ASSETS.filter((other) => other === asset)).toHaveLength(1);
  });

  it('maps every defined stage to a distinct asset, with no ordering or fallback between neighbours', () => {
    const selected = [0, ...STAGES].map((stage) => selectPlantStageAsset(worldAtStage(stage))?.textureKey ?? 'none');
    expect(selected).toEqual(['none', 'plant-stage-1', 'plant-stage-2', 'plant-stage-3', 'plant-stage-4', 'plant-stage-5']);
  });

  it('fails loudly for a stage the specification has no art for, instead of drawing a neighbour', () => {
    for (const stage of [-1, 6, 0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => selectPlantStageAsset(worldAtStage(stage)), String(stage)).toThrow(RangeError);
    }
  });

  it('only reads the world: a frozen world is not changed and the same world always selects the same asset', () => {
    for (const stage of [0, ...STAGES]) {
      const world = Object.freeze({ ...createInitialWorldState(), plantStage: stage });
      const snapshot = JSON.stringify(world);
      expect(selectPlantStageAsset(world)).toBe(selectPlantStageAsset(world));
      expect(JSON.stringify(world)).toBe(snapshot);
      expect(world.plantStage).toBe(stage);
    }
  });
});

describe('the persistent Turn 2 plant plot', () => {
  const TURN1_MS = Object.values(WAVE_DURATIONS_MS).reduce((sum, ms) => sum + ms, 0);
  const TURN2_MS = PLANT_LIFE_WAVES.reduce((sum, wave) => sum + wave.durationMs, 0);
  const FARM_EXPANDS_END_MS = PLANT_LIFE_WAVES.slice(
    0,
    PLANT_LIFE_WAVES.findIndex((wave) => wave.id === 'farm-expands') + 1,
  ).reduce((sum, wave) => sum + wave.durationMs, 0);

  function turn2At(intoTurn2Ms: number, speed = 1): SliceGame {
    const game = new SliceGame();
    game.selectElement('fire');
    game.advance(TURN1_MS);
    game.selectElement('plant');
    game.setPlaybackSpeed(speed);
    game.advance(intoTurn2Ms / speed);
    return game;
  }
  const keyAt = (snapshot: SliceSnapshot): string => selectPlantStageAsset(snapshot.world)?.textureKey ?? 'none';

  it('shows no plant-stage asset before Turn 2 completes the farm, and Stage 1 from then on', () => {
    const initial = new SliceGame();
    expect(keyAt(initial.snapshot())).toBe('none');
    initial.selectElement('fire');
    for (let t = 0; t <= TURN1_MS + 500; t += 100) {
      initial.advance(100);
      expect(keyAt(initial.snapshot())).toBe('none');
    }

    const game = turn2At(0);
    let sawNone = false;
    let sawStage1 = false;
    for (let t = 0; t < TURN2_MS + 2000; t += 20) {
      const snapshot = game.snapshot();
      const key = keyAt(snapshot);
      // The asset is a function of the authoritative stage and nothing else.
      expect(key).toBe(snapshot.world.plantStage === 0 ? 'none' : 'plant-stage-1');
      if (key === 'none') {
        sawNone = true;
        expect(sawStage1).toBe(false);
      } else {
        sawStage1 = true;
      }
      game.advance(20);
    }
    expect(sawNone).toBe(true);
    expect(sawStage1).toBe(true);
  });

  it('switches to Stage 1 exactly when the farm-expands Wave completes, not before and not by animation progress', () => {
    expect(keyAt(turn2At(FARM_EXPANDS_END_MS - 1).snapshot())).toBe('none');
    expect(turn2At(FARM_EXPANDS_END_MS - 1).snapshot().activeWave?.id).toBe('farm-expands');
    expect(keyAt(turn2At(FARM_EXPANDS_END_MS + 1).snapshot())).toBe('plant-stage-1');
  });

  it('stays Stage 1 after playback completes and while the game keeps running', () => {
    const game = turn2At(TURN2_MS + 1);
    expect(game.snapshot().phase).toBe('completed');
    for (let i = 0; i < 50; i += 1) {
      game.advance(100);
      const snapshot = game.snapshot();
      expect(snapshot.world.plantStage).toBe(1);
      expect(keyAt(snapshot)).toBe('plant-stage-1');
    }
  });

  it('never advances the stage by rendering: selecting from snapshots leaves the game state untouched', () => {
    const game = turn2At(FARM_EXPANDS_END_MS + 500);
    const before = JSON.stringify(game.snapshot());
    for (let i = 0; i < 200; i += 1) selectPlantStageAsset(game.snapshot().world);
    expect(JSON.stringify(game.snapshot())).toBe(before);
    expect(game.snapshot().world.plantStage).toBe(1);
  });

  it('does not depend on playback speed: the same logical time shows the same asset', () => {
    for (const logicalMs of [1000, FARM_EXPANDS_END_MS - 50, FARM_EXPANDS_END_MS + 50, TURN2_MS + 500]) {
      const baseline = keyAt(turn2At(logicalMs).snapshot());
      for (const speed of [0.25, 0.5, 2, 4]) expect(keyAt(turn2At(logicalMs, speed).snapshot())).toBe(baseline);
    }
  });
});

describe('IslandScene wiring (source contract; the Scene needs a browser to run)', () => {
  const scene = readFileSync(new URL('src/presentation/IslandScene.ts', ROOT), 'utf8');

  it('loads exactly the registered plant stage files and picks the visual from the snapshot world', () => {
    expect(scene).toContain('for (const asset of PLANT_STAGE_ASSET_LIST)');
    expect(scene).toContain('selectPlantStageAsset(snapshot.world)');
    expect(scene).not.toMatch(/plant_stage_|plant-stage-|plant-stages/);
  });

  it('only reads game state: the Scene never writes plantStage or advances a stage from rendering', () => {
    expect(scene).not.toMatch(/plantStage/);
    expect(scene).not.toMatch(/world\s*=|\.world\.[a-zA-Z]+\s*=[^=]/);
    const renderPlantPlot = scene.slice(scene.indexOf('private renderPlantPlot'), scene.indexOf('private renderCookingFire'));
    expect(renderPlantPlot).not.toMatch(/clockMs|activeWave|progress|delayedCall|time\.|tweens|anims|onComplete|ANIMATION_COMPLETE/);
  });
});

// --- Layout (provisional: final scale/placement is Human Review) -----------

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}
const overlaps = (a: Box, b: Box): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

describe('plant plot layout (360x640 and 390x844 share the 720x1280 design space)', () => {
  const ISLAND = WORLD_ASSETS.island;
  const island = readPng(readFileSync(new URL('public/assets/world/initial-turn1/island-base.png', ROOT)));
  const toIslandPx = (p: { x: number; y: number }) => ({
    x: Math.round(ISLAND.groundAnchor.x + (p.x - ISLAND.placement.x) / ISLAND.baseScale),
    y: Math.round(ISLAND.groundAnchor.y + (p.y - ISLAND.placement.y) / ISLAND.baseScale),
  });
  const onGrass = (p: { x: number; y: number }): boolean => {
    const c = toIslandPx(p);
    if (c.x < 0 || c.y < 0 || c.x >= island.width || c.y >= island.height) return false;
    const i = (c.y * island.width + c.x) * 4;
    const [r, g, b, a] = [island.pixels[i], island.pixels[i + 1], island.pixels[i + 2], island.pixels[i + 3]];
    return a >= 128 && g >= r - 5 && g > b + 25;
  };
  const boxes = PLANT_STAGE_ASSETS.map((asset) => ({ asset, box: visibleBoxOf(asset, fileBytes(asset), LAYOUT.plantPlot) }));
  const readFrame = (dir: string, name: string) => readFileSync(new URL(`public${dir}${name}`, ROOT));
  const FIRE_BOX = boxesUnion(FIRE_FRAMES.map((frame) => visibleBoxOf(frame, readFrame('/assets/world/initial-turn1/', frame.filename), LAYOUT.fire)));
  const COOK_BOX = boxesUnion(COOK_STEAM_FRAMES.map((frame) => visibleBoxOf(frame, readFrame(frame.dir, frame.filename), LAYOUT.cookingFire)));
  const HUT_BOX = visibleBoxOf(HUT_ASSET, readFrame(HUT_ASSET.dir, HUT_ASSET.filename), LAYOUT.hut);
  const ANIMAL_REACH: Box = {
    left: LAYOUT.animal.x - 50,
    right: LAYOUT.animal.x + 50,
    top: LAYOUT.animal.y - 40,
    bottom: LAYOUT.animal.y + 8,
  };

  it('stands every stage on the single plant-plot ground point, on the left-middle grass terrace', () => {
    expect(LAYOUT.plantPlot.x).toBeLessThan(LAYOUT.island.x);
    expect(LAYOUT.plantPlot.x).toBeLessThan(LAYOUT.animal.x);
    expect(LAYOUT.plantPlot.y).toBeLessThan(LAYOUT.hut.y - 100);
    expect(Math.abs(LAYOUT.plantPlot.y - LAYOUT.plot.y)).toBeLessThan(1e-9);
    for (const point of [LAYOUT.plantPlot, { x: LAYOUT.plantPlot.x - 30, y: LAYOUT.plantPlot.y }, { x: LAYOUT.plantPlot.x + 30, y: LAYOUT.plantPlot.y }]) {
      expect(onGrass(point)).toBe(true);
    }
  });

  it.each(PLANT_STAGE_ASSETS.map((asset) => [asset.textureKey, asset] as const))(
    '%s: stays inside the island and above the UI, clear of the hut, fire, animal and the growth spaces',
    (_key, asset) => {
      const { box } = boxes.find((entry) => entry.asset === asset) as { box: Box };
      expect(box.bottom).toBeLessThan(LAYOUT.ui.panelTop);
      expect(box.left).toBeGreaterThan(LAYOUT.island.left);
      expect(box.right).toBeLessThan(LAYOUT.island.right);
      expect(box.top).toBeGreaterThan(LAYOUT.island.top);
      for (const other of [HUT_BOX, FIRE_BOX, COOK_BOX, ANIMAL_REACH, ...LAYOUT.growthSpaces]) {
        expect(overlaps(box, other)).toBe(false);
      }
    },
  );

  it('keeps the standing resident beside the plot: the Human’s feet are left of every stage’s visible art', () => {
    for (const { box } of boxes) {
      expect(box.left).toBeGreaterThan(LAYOUT.plotHuman.x);
      expect(LAYOUT.plotHuman.y).toBeLessThan(LAYOUT.plantPlot.y);
    }
  });

  it('is about as wide as the Turn 2 farm it replaces and does not change width between stages', () => {
    const widths = boxes.map(({ box }) => box.right - box.left);
    for (const width of widths) {
      expect(width).toBeGreaterThan(80);
      expect(width).toBeLessThan(138 * 1.15);
      expect(Math.abs(width - widths[0])).toBeLessThan(4);
    }
  });
});

function boxesUnion(items: readonly Box[]): Box {
  return {
    left: Math.min(...items.map((b) => b.left)),
    top: Math.min(...items.map((b) => b.top)),
    right: Math.max(...items.map((b) => b.right)),
    bottom: Math.max(...items.map((b) => b.bottom)),
  };
}

function visibleBoxOf(
  asset: Parameters<typeof groundOrigin>[0],
  bytes: Uint8Array,
  ground: { x: number; y: number },
): Box {
  const png = readPng(bytes);
  const origin = groundOrigin(asset);
  let [minX, minY, maxX, maxY] = [png.width, png.height, -1, -1];
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (alphaAt(png, x, y) < 128) continue;
      [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
    }
  }
  return {
    left: ground.x + (minX - origin.x * asset.width) * asset.baseScale,
    right: ground.x + (maxX - origin.x * asset.width) * asset.baseScale,
    top: ground.y + (minY - origin.y * asset.height) * asset.baseScale,
    bottom: ground.y + (maxY - origin.y * asset.height) * asset.baseScale,
  };
}
