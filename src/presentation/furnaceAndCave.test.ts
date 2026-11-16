import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SliceGame } from '../game/sliceGame';
import { TRUE_ROUTE } from '../game/rules/state';
import { ROCK_WAVES } from '../game/waves';
import { createInitialWorldState, THIRD_RESIDENT_ID } from '../game/worldState';
import { readPng, type PngImage } from '../testSupport/png';
import { snapshotAfter, snapshotAfterTurn, snapshotAtMs } from '../testSupport/trueRoute';
import { ROUTINES, workStartMs } from './crew';
import { drawFurnace } from './furnaceDraw';
import { ACTION_FRAME_MS } from './humanActions';
import { LAYOUT } from './layout';
import { computeCookingFireVisual } from './lifeAnimation';
import { computePlantVisual } from './plantGrowth';
import { computeResidentVisuals } from './residents';
import { CAVE_SILL_DEPTH, computeFurnaceVisual, computeSettlementEffects, computeSettlementProps, computeVillageHomes } from './settlement';
import { CAVE_EXTERIOR_ANCHOR, CAVE_EXTERIOR_PLACEMENT, TRUE_PROPS } from './trueRouteAssets';
import { WORLD_ASSETS } from './worldAssets';

const ROOT = new URL('../../', import.meta.url);
const load = (path: string): PngImage => readPng(readFileSync(new URL(path, ROOT)));
const alphaAt = (image: PngImage, x: number, y: number): number =>
  x < 0 || y < 0 || x >= image.width || y >= image.height ? 0 : image.pixels[(y * image.width + x) * 4 + 3];
const T = LAYOUT.true;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('the finished furnace', () => {
  const routine = ROUTINES['furnace-lights']![THIRD_RESIDENT_ID];
  const struck = workStartMs(routine, THIRD_RESIDENT_ID, 'build')! + 2 * ACTION_FRAME_MS;
  const duration = ROCK_WAVES.find((wave) => wave.id === 'furnace-lights')!.durationMs;

  it('is the visible result of the Rule Engine’s furnace-built Event, revealed by the Wave that presents it', () => {
    const wave = ROCK_WAVES.find((candidate) => candidate.event === 'furnace-built')!;
    expect(wave.id).toBe('furnace-lights');
    expect(createInitialWorldState().props).not.toContain('furnace');
    expect(wave.complete(createInitialWorldState()).props).toContain('furnace');
  });

  it('is built after the builder has walked to it and struck it, from the right, and not before', () => {
    expect(computeFurnaceVisual(snapshotAtMs('furnace-lights', 0)).alpha).toBe(0);
    // Walking over from the second hut.
    const walking = computeResidentVisuals(snapshotAtMs('furnace-lights', 100)).find((v) => v.id === THIRD_RESIDENT_ID)!;
    expect(walking.pose.walk).not.toBeNull();
    expect(distance(walking.pose, T.furnaceStand)).toBeGreaterThan(5);
    // Striking, with the mallet frames, facing left at the furnace's right face; nothing standing yet.
    const working = snapshotAtMs('furnace-lights', struck - 50);
    const builder = computeResidentVisuals(working).find((v) => v.id === THIRD_RESIDENT_ID)!;
    expect(builder.pose.asset).toMatch(/^action-build-/);
    expect(builder.pose.facing).toBe(-1);
    expect(distance(builder.pose, T.furnaceStand)).toBeLessThanOrEqual(1.5);
    expect(computeFurnaceVisual(working).alpha).toBe(0);
    // Then it rises, and is complete (full size) before the Wave ends.
    expect(computeFurnaceVisual(snapshotAtMs('furnace-lights', (struck + duration) / 2)).alpha).toBeGreaterThan(0);
    expect(computeFurnaceVisual(snapshotAtMs('furnace-lights', duration - 1))).toMatchObject({ alpha: 1 });
  });

  it('becomes part of the world by the logical clock at the Wave’s end, not by when the drawing finishes', () => {
    expect(snapshotAtMs('furnace-lights', duration - 1).world.props).not.toContain('furnace');
    expect(snapshotAfter('furnace-lights').world.props).toContain('furnace');
    // One advance of the whole Wave, in any chunking, leaves the same state.
    const game = new SliceGame();
    for (const element of TRUE_ROUTE.slice(0, 3)) {
      game.selectElement(element);
      game.advance(200_000);
    }
    expect(game.snapshot().world.props).toContain('furnace');
  });

  it('stays after the lighting Wave and at the END, while the Turn 2 cooking fire stays distinct', () => {
    for (const snapshot of [snapshotAfter('furnace-lights'), snapshotAfter('cave-furnished'), snapshotAfterTurn(3), snapshotAfterTurn(4)]) {
      expect(computeFurnaceVisual(snapshot)).toMatchObject({ alpha: 1, scale: 1 });
      expect(computeCookingFireVisual(snapshot).visible).toBe(true);
    }
    const ended = snapshotAfterTurn(4);
    expect(ended.phase).toBe('ended');
    expect(computeFurnaceVisual(ended).ground).toEqual(T.furnace);
    // Its own ground point, well apart from the cooking fire's and the campfire's.
    expect(distance(T.furnace, LAYOUT.cookingFire)).toBeGreaterThan(40);
    expect(distance(T.furnace, LAYOUT.fire)).toBeGreaterThan(40);
    expect(distance(T.furnace, T.workshop)).toBeLessThan(100);
  });

  it('draws a flickering fire and smoke from the clock alone', () => {
    const calls = (clockMs: number): string[] => {
      const log: string[] = [];
      const graphics = new Proxy({}, { get: (_target, name) => (...args: unknown[]) => log.push(`${String(name)}:${args.map((a) => (typeof a === 'number' ? a.toFixed(3) : a)).join(',')}`) });
      drawFurnace(graphics as never, clockMs);
      return log;
    };
    expect(calls(1000)).toEqual(calls(1000));
    expect(calls(1000)).not.toEqual(calls(1090));
    expect(calls(1000).some((entry) => entry.startsWith('fillTriangle'))).toBe(true);
  });
});

describe('Retry clears every piece of autonomous-work presentation', () => {
  it('returns residents, work effects, the plant plot, the furnace, the cave exterior, the homes and the END to the initial state', () => {
    const game = new SliceGame();
    for (const element of TRUE_ROUTE) {
      game.selectElement(element);
      game.advance(200_000);
    }
    const ended = game.snapshot();
    expect(ended.phase).toBe('ended');
    expect(computeFurnaceVisual(ended).alpha).toBe(1);
    expect(computePlantVisual(ended).stages.find((stage) => stage.alpha > 0)?.stage).toBe(5);
    expect(game.retry()).toBe(true);
    const after = game.snapshot();
    const fresh = new SliceGame().snapshot();
    expect(after.phase).toBe('awaiting-input');
    expect(after.ending).toBeNull();
    expect(after.world).toEqual(fresh.world);
    expect(computeResidentVisuals(after)).toEqual(computeResidentVisuals(fresh));
    expect(computeResidentVisuals(after)).toHaveLength(1);
    expect(computePlantVisual(after)).toEqual(computePlantVisual(fresh));
    expect(computePlantVisual(after).stages.every((stage) => stage.alpha === 0)).toBe(true);
    expect(computeFurnaceVisual(after)).toEqual(computeFurnaceVisual(fresh));
    expect(computeFurnaceVisual(after).alpha).toBe(0);
    expect(computeSettlementProps(after)).toEqual(computeSettlementProps(fresh));
    expect(computeSettlementProps(after).every((visual) => visual.alpha === 0)).toBe(true);
    expect(computeVillageHomes(after).every((home) => home.alpha === 0)).toBe(true);
    expect(computeVillageHomes(after)).toEqual(computeVillageHomes(fresh));
    // The workshop, every home (and its mirroring), the guardians and any glow are cleared or reset.
    for (const slot of ['stoneWorkshop', 'secondHut', 'guardianParent', 'guardianChild']) {
      expect(computeSettlementProps(after).find((visual) => visual.slot === slot)!.alpha, slot).toBe(0);
    }
    expect(computeSettlementEffects(after)).toEqual([]);
    expect(after.world.residents.map((resident) => resident.id)).toEqual(['resident-1']);
    // Nothing from the finished run is left to draw: no effect layers, no hidden resident.
    for (const visual of computeResidentVisuals(after)) expect(visual.layers?.effect ?? null).toBeNull();
  });
});

describe('the cave exterior fits the island art', () => {
  const island = load('public/assets/world/initial-turn1/island-base.png');
  const hill = load(`public${TRUE_PROPS.caveExterior.dir}${TRUE_PROPS.caveExterior.filename}`);
  const { islandGround: ground, islandScale: scale } = CAVE_EXTERIOR_PLACEMENT;
  // The island pixel under a hill pixel, and the hill pixel under an island pixel.
  const toIsland = (cx: number, cy: number) => ({ x: ground.x + (cx - CAVE_EXTERIOR_ANCHOR.x) * scale, y: ground.y + (cy - CAVE_EXTERIOR_ANCHOR.y) * scale });
  const toHill = (ix: number, iy: number) => ({ x: CAVE_EXTERIOR_ANCHOR.x + (ix - ground.x) / scale, y: CAVE_EXTERIOR_ANCHOR.y + (iy - ground.y) / scale });

  it('is a 512x512 transparent RGBA hill drawn at the island art’s own scale ratio', () => {
    expect([hill.width, hill.height, hill.bitDepth, hill.colorType]).toEqual([512, 512, 8, 6]);
    expect(hill.minAlpha).toBe(0);
    expect(TRUE_PROPS.caveExterior.baseScale).toBeCloseTo(scale * WORLD_ASSETS.island.baseScale, 9);
    expect(T.caveHill.x).toBeCloseTo(LAYOUT.island.x + (ground.x - WORLD_ASSETS.island.groundAnchor.x) * WORLD_ASSETS.island.baseScale, 6);
  });

  it('covers the baked cave’s stone arch and dark mouth completely, so there are never two cave rocks', () => {
    // The baked cave: dark mouth x 454-551, y 96-182 (island px, measured), its stone arch around it.
    let total = 0;
    let covered = 0;
    for (let y = 82; y <= 196; y += 1) {
      for (let x = 440; x <= 565; x += 1) {
        total += 1;
        const at = toHill(x, y);
        if (alphaAt(hill, Math.round(at.x), Math.round(at.y)) >= 250) covered += 1;
      }
    }
    expect(covered / total).toBeGreaterThan(0.99);
  });

  it('stays on the island: the hill does not hang over the sea or past the island’s top edge', () => {
    let opaque = 0;
    let onIsland = 0;
    for (let y = 0; y < hill.height; y += 1) {
      for (let x = 0; x < hill.width; x += 1) {
        if (alphaAt(hill, x, y) < 128) continue;
        opaque += 1;
        const at = toIsland(x, y);
        if (alphaAt(island, Math.round(at.x), Math.round(at.y)) >= 128) onIsland += 1;
      }
    }
    expect(onIsland / opaque).toBeGreaterThan(0.97);
  });

  it('keeps the entrance walkable: the resident goes in at the mouth’s own centre, behind the hill and in front of its steps', () => {
    // The hill's doorway (about hill x 168-345) sits on the baked mouth (island x 454-551).
    const door = { left: toIsland(168, 300).x, right: toIsland(345, 300).x };
    expect(Math.abs(door.left - 454)).toBeLessThan(10);
    expect(Math.abs(door.right - 551)).toBeLessThan(10);
    // Walking in: the front is below the hill's base and the inside is above it, both on the mouth's centre line.
    expect(T.caveFront.y).toBeGreaterThan(T.caveHill.y);
    expect(T.caveInside.y).toBeLessThan(CAVE_SILL_DEPTH);
    expect(Math.abs(T.caveInside.x - T.caveHill.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(T.caveFront.x - T.caveHill.x)).toBeLessThanOrEqual(1);
    // The step at the hill's foot is open ground at the front of the walk (opaque hill pixels, not rock above).
    const step = toHill(503, 200);
    expect(alphaAt(hill, Math.round(step.x), Math.round(step.y))).toBeGreaterThanOrEqual(128);
    // The resident sorts behind the hill while inside and in front of it once out on the path.
    expect(CAVE_SILL_DEPTH).toBeGreaterThan(T.caveInside.y + 2);
    expect(CAVE_SILL_DEPTH).toBeLessThan(T.caveFront.y);
  });

  it('draws the hill only as the shrine stage, and no old cave furnishings with it', () => {
    const slots = (snapshot: ReturnType<typeof snapshotAfterTurn>) =>
      computeSettlementProps(snapshot)
        .filter((visual) => visual.alpha > 0 && (visual.slot === 'caveExterior' || visual.slot === 'practicalCave'))
        .map((visual) => visual.slot);
    expect(slots(snapshotAfterTurn(2))).toEqual([]);
    expect(slots(snapshotAfterTurn(3))).toEqual(['practicalCave']);
    expect(slots(snapshotAfterTurn(4))).toEqual(['caveExterior']);
  });
});
