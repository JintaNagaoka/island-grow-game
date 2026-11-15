import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SliceGame, type SliceSnapshot } from '../game/sliceGame';
import { TRUE_ROUTE } from '../game/rules/state';
import { PLANT_LIFE_WAVES, ROCK_WAVES, WATER_WAVES, type WaveId } from '../game/waves';
import { readPng, type PngImage } from '../testSupport/png';
import { snapshotAfter, snapshotAfterTurn, snapshotAtMs } from '../testSupport/trueRoute';
import { SECOND_RESIDENT_ID } from '../game/worldState';
import { ROUTINES } from './crew';
import { LAYOUT } from './layout';
import { GROWTH_AFTER_WORK_MS, computePlantVisual, growthWindow } from './plantGrowth';
import { computeResidentVisuals } from './residents';
import { PLANT_FRAME_LIST, PLANT_STAGES, PLANT_STAGE_BASE_SCALE, PLANT_STAGE_FRAMES } from './trueRouteAssets';

const ROOT = new URL('../../', import.meta.url);
const frameImage = (frame: (typeof PLANT_FRAME_LIST)[number]): PngImage =>
  readPng(readFileSync(new URL(`public${frame.dir}${frame.filename}`, ROOT)));
const alphaAt = (image: PngImage, x: number, y: number): number => image.pixels[(y * image.width + x) * 4 + 3];

// Supplied plant-stage PNGs (true-route-review-fix-v2/asset-manifest.json).
const SUPPLIED_SHA256: Readonly<Record<string, string>> = {
  'plant-stage-1-sprouts.png': '5bbd83e76666c1724ed565d54acc1441e9e1e4e8e2feb89e07812d1eb22a3f42',
  'plant-stage-2-saplings.png': 'd9ee1cb7e4851d832fb78fae3666dabba09096b6f2312814b730cb37ecca5f0b',
  'plant-stage-3-red-fruit.png': 'd187ceb94c7aef1b70f624a3ed282657529a473eca96aa905ebbad2b4ba5dc78',
  'plant-stage-4-blossoms.png': '869e80037e4f5e20fef88b6333ef21d6bd43e313efee8179acf8590c83f73c84',
  'plant-stage-5-golden-fruit.png': '7a57b9197e9c3fc1f98116cacb25e3d04888a99713ae3509a05b61030d1dee67',
};

function bounds(image: PngImage): { left: number; right: number; top: number; bottom: number } {
  let [left, right, top, bottom] = [image.width, -1, image.height, -1];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) < 128) continue;
      [left, right, top, bottom] = [Math.min(left, x), Math.max(right, x), Math.min(top, y), Math.max(bottom, y)];
    }
  }
  return { left, right, top, bottom };
}

// The plot base: its widest opaque row in the lower part of the art, and its lowest row.
function plotBase(image: PngImage): { centreX: number; width: number; bottom: number } {
  const box = bounds(image);
  let best = { width: 0, left: 0, right: 0 };
  for (let y = box.top + Math.round((box.bottom - box.top) * 0.55); y <= box.bottom - 30; y += 1) {
    let [left, right] = [image.width, -1];
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) >= 128) [left, right] = [Math.min(left, x), Math.max(right, x)];
    }
    if (right - left > best.width) best = { width: right - left, left, right };
  }
  return { centreX: (best.left + best.right) / 2, width: best.width, bottom: box.bottom };
}

describe('the five plant stage frames', () => {
  it('ship byte-for-byte as supplied, once each, in their own folder', () => {
    const shipped = readdirSync(new URL('public/assets/world/plants/', ROOT)).sort();
    expect(shipped).toEqual(Object.keys(SUPPLIED_SHA256).sort());
    expect(PLANT_FRAME_LIST.map((frame) => frame.filename)).toEqual(Object.keys(SUPPLIED_SHA256));
    for (const frame of PLANT_FRAME_LIST) {
      const hash = createHash('sha256').update(readFileSync(new URL(`public${frame.dir}${frame.filename}`, ROOT))).digest('hex');
      expect(hash, frame.filename).toBe(SUPPLIED_SHA256[frame.filename]);
    }
    expect(new Set(PLANT_FRAME_LIST.map((frame) => frame.textureKey)).size).toBe(5);
    expect(PLANT_STAGES).toEqual([1, 2, 3, 4, 5]);
  });

  it('are 512x512 transparent RGBA', () => {
    for (const frame of PLANT_FRAME_LIST) {
      const image = frameImage(frame);
      expect([image.width, image.height, image.bitDepth, image.colorType], frame.filename).toEqual([512, 512, 8, 6]);
      expect(image.minAlpha).toBe(0);
    }
  });

  it('carry the measured plot-base anchor and size multiplier of their own art', () => {
    const reference = plotBase(frameImage(PLANT_STAGE_FRAMES[1]));
    for (const frame of PLANT_FRAME_LIST) {
      const base = plotBase(frameImage(frame));
      expect(Math.abs(frame.groundAnchor.x - base.centreX), `${frame.filename} x`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(frame.groundAnchor.y - base.bottom), `${frame.filename} y`).toBeLessThanOrEqual(1);
      expect(Math.abs(frame.sizeMul - reference.width / base.width), `${frame.filename} size`).toBeLessThanOrEqual(0.01);
      expect(frame.baseScale).toBeCloseTo(PLANT_STAGE_BASE_SCALE * frame.sizeMul, 9);
    }
  });

  it('put the plot base on one ground contact and at one width, so the base does not move between stages', () => {
    const ground = LAYOUT.true.plantPlot;
    const bottoms: number[] = [];
    const centres: number[] = [];
    const widths: number[] = [];
    for (const frame of PLANT_FRAME_LIST) {
      const base = plotBase(frameImage(frame));
      // Where the base's lowest row and centre land in the design space when drawn at the one ground point.
      bottoms.push(ground.y + (base.bottom - frame.groundAnchor.y) * frame.baseScale);
      centres.push(ground.x + (base.centreX - frame.groundAnchor.x) * frame.baseScale);
      widths.push(base.width * frame.baseScale);
    }
    for (const value of bottoms) expect(Math.abs(value - ground.y)).toBeLessThanOrEqual(0.25);
    for (const value of centres) expect(Math.abs(value - ground.x)).toBeLessThanOrEqual(0.4);
    // Same base width to within 1% (the drawings differ by a few percent before the size multipliers).
    for (const value of widths) expect(Math.abs(value / widths[0] - 1)).toBeLessThanOrEqual(0.01);
  });

  it('are drawn on that single ground point, by every stage, and never beside an old farm', () => {
    const scene = readFileSync(new URL('src/presentation/IslandScene.ts', ROOT), 'utf8');
    expect(scene).toMatch(/PLANT_FRAME_LIST\.map/);
    expect(scene).toMatch(/\.image\(plot\.x, plot\.y, frame\.textureKey\)/);
    for (const stale of ['farmTiles', 'farmPlotTiles', 'FARM_PLOT_TILE', 'matureFarm']) expect(scene.includes(stale), stale).toBe(false);
    // Exactly one plant plot ground point exists.
    expect(Object.keys(LAYOUT.true).filter((key) => /plant|farm/i.test(key))).toEqual(['plantPlot']);
  });
});

// The revealed plant stage, sampled every 50 ms across the whole route.
function sampleRoute(visit: (snapshot: SliceSnapshot) => void): void {
  const game = new SliceGame();
  for (const element of TRUE_ROUTE) {
    game.selectElement(element);
    while (game.snapshot().phase === 'playing') {
      game.advance(50);
      visit(game.snapshot());
    }
  }
}

describe('plant stages follow the plant Events, in causal order', () => {
  it('raises the visible plant 0 -> 2 -> 3 -> 4 -> 5, each time exactly when the Wave presenting the plant Event completes', () => {
    const seen: [number, WaveId | undefined][] = [];
    let last = 0;
    sampleRoute((snapshot) => {
      if (snapshot.world.plantStage !== last) {
        last = snapshot.world.plantStage;
        seen.push([last, snapshot.completedWaves.at(-1)]);
      }
    });
    expect(seen).toEqual([
      [2, 'farm-expands'],
      [3, 'farm-matures'],
      [4, 'farm-blossoms'],
      [5, 'ecosystem-flourishes'],
    ]);
    // Each of those Waves presents the plant Event that raised the plant in the Rule Engine.
    const events = new Map([...ROCK_WAVES, ...WATER_WAVES].map((wave) => [wave.id, wave.event]));
    expect(events.get('farm-matures')).toBe('plant-fruits');
    expect(events.get('farm-blossoms')).toBe('plant-spreads');
    expect(events.get('ecosystem-flourishes')).toBe('ecosystem-flourishes');
    expect(PLANT_LIFE_WAVES.some((wave) => wave.id === 'farm-expands')).toBe(true);
  });

  it('matches the authoritative Stage at the end of every turn, and never runs ahead of it', () => {
    for (const turn of [1, 2, 3, 4] as const) {
      const snapshot = snapshotAfterTurn(turn);
      expect(snapshot.world.plantStage).toBe(snapshot.resolved.stages.plant);
    }
    sampleRoute((snapshot) => {
      for (const stage of computePlantVisual(snapshot).stages) {
        if (stage.alpha > 0) expect(stage.stage, `${snapshot.clockMs}`).toBeLessThanOrEqual(snapshot.resolved.stages.plant);
      }
    });
  });

  it('shows nothing before Turn 2 plants, then at most two adjacent stages cross-fading, and always something once planted', () => {
    let planted = false;
    sampleRoute((snapshot) => {
      const showing = computePlantVisual(snapshot).stages.filter((stage) => stage.alpha > 0);
      if (snapshot.resolved.turn < 2 || snapshot.activeWave?.id === 'human-splits') {
        expect(showing).toEqual([]);
        return;
      }
      if (showing.length > 0) planted = true;
      expect(showing.length).toBeLessThanOrEqual(2);
      if (showing.length === 2) expect(showing[1].stage - showing[0].stage).toBe(1);
      // Once a plant stands, a change is a cross-fade: the plot never dips out of sight.
      if (snapshot.world.plantStage >= 2) expect(showing.reduce((sum, stage) => sum + stage.alpha, 0)).toBeGreaterThan(0.95);
    });
    expect(planted).toBe(true);
  });

  it('shows a short Stage in passing: Turn 2 goes through sprouts before saplings', () => {
    const wave = PLANT_LIFE_WAVES.find((candidate) => candidate.id === 'farm-expands')!;
    const shown = new Set<number>();
    const game = new SliceGame();
    game.selectElement('fire');
    game.advance(60_000);
    game.selectElement('plant');
    while (game.snapshot().activeWave?.id !== 'farm-expands') game.advance(20);
    for (let ms = 0; ms < wave.durationMs; ms += 10) {
      for (const stage of computePlantVisual(game.snapshot()).stages) if (stage.alpha > 0.5) shown.add(stage.stage);
      game.advance(10);
    }
    expect([...shown]).toEqual([1, 2]);
  });

  it('works the plot before it grows: the tending resident digs while the old stage stays, then the new stage fades in', () => {
    const window = growthWindow({ id: 'farm-matures', durationMs: ROCK_WAVES.find((wave) => wave.id === 'farm-matures')!.durationMs });
    expect(window.fromMs).toBe(GROWTH_AFTER_WORK_MS);
    const early = snapshotAtMs('farm-matures', GROWTH_AFTER_WORK_MS - 100);
    const stages = (snapshot: SliceSnapshot) => Object.fromEntries(computePlantVisual(snapshot).stages.map((stage) => [stage.stage, stage.alpha]));
    expect(stages(early)).toMatchObject({ 2: 1, 3: 0 });
    const worker = computeResidentVisuals(early).find((visual) => visual.id === SECOND_RESIDENT_ID)!;
    expect(worker.pose.asset).toMatch(/^action-dig-/);
    expect(ROUTINES['farm-matures']![SECOND_RESIDENT_ID].steps[0]).toMatchObject({ kind: 'work', action: 'dig' });
    const late = snapshotAtMs('farm-matures', window.toMs - 20);
    expect(stages(late)[3]).toBeGreaterThan(0.9);
    expect(stages(snapshotAfter('farm-matures'))).toMatchObject({ 2: 0, 3: 1 });
  });

  it('does not read the turn number, the END or the authoritative Stage', () => {
    const source = readFileSync(new URL('src/presentation/plantGrowth.ts', ROOT), 'utf8').replace(/\/\/.*$/gm, '');
    for (const forbidden of ['resolved', 'ending', '.turn', 'selectedElements', 'stages.plant']) expect(source.includes(forbidden), forbidden).toBe(false);
  });

  it('is a pure function of the snapshot', () => {
    const snapshot = snapshotAtMs('farm-blossoms', 900);
    expect(computePlantVisual(snapshot)).toEqual(computePlantVisual(snapshot));
  });
});
