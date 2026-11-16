import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SliceGame } from '../game/sliceGame';
import { TRUE_ROUTE } from '../game/rules/state';
import { ROCK_WAVES, WATER_WAVES } from '../game/waves';
import { FIRST_RESIDENT_ID, SECOND_RESIDENT_ID, THIRD_RESIDENT_ID, VILLAGE_RESIDENT_IDS } from '../game/worldState';
import { readPng, type PngImage } from '../testSupport/png';
import { snapshotAfter, snapshotAfterTurn, snapshotAt, snapshotAtMs } from '../testSupport/trueRoute';
import { ROUTINES, arrivalMs, workEndMs, workStartMs } from './crew';
import { ACTION_FRAME_MS, contactOffset } from './humanActions';
import { LAYOUT, VILLAGE_HOME_SCALE, isMirroredHome } from './layout';
import { computeResidentVisuals } from './residents';
import {
  ANIMAL_DEPTH,
  ANIMAL_GLOW_DEPTH,
  GUARDIAN_SHADOW_ALPHA,
  GUARDIAN_SHADOW_DEPTH,
  WAVE_EFFECTS,
  computeGuardianShadows,
  computeSettlementEffects,
  computeSettlementProps,
  computeVillageHomes,
} from './settlement';
import { TRUE_PROPS } from './trueRouteAssets';
import { HUT_ASSET } from './turn2Assets';
import { groundOrigin } from './worldAssets';

// Deterministic outcomes of the TRUE route's construction presentation: who builds what, in what
// order, facing which way, and what the building looks like when it is done. These pin logical
// time, poses and layout; whether it LOOKS good is a human smartphone review.

const ROOT = new URL('../../', import.meta.url);
const load = (path: string): PngImage => readPng(readFileSync(new URL(path, ROOT)));
const alphaAt = (image: PngImage, x: number, y: number): number =>
  x < 0 || y < 0 || x >= image.width || y >= image.height ? 0 : image.pixels[(y * image.width + x) * 4 + 3];
const T = LAYOUT.true;
const R1 = FIRST_RESIDENT_ID;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const residentAt = (waveId: Parameters<typeof snapshotAtMs>[0], ms: number, id: string) =>
  computeResidentVisuals(snapshotAtMs(waveId, ms)).find((visual) => visual.id === id)!;
const slotAlpha = (snapshot: Parameters<typeof computeSettlementProps>[0], slot: string): number =>
  computeSettlementProps(snapshot).find((visual) => visual.slot === slot)!.alpha;

describe('the stone workshop is built by a resident who walks to it, hammers it, and then stops', () => {
  const routine = ROUTINES['workshop-appears']![R1];
  const arrive = arrivalMs(routine, R1, 'workshop-site')!;
  const start = workStartMs(routine, R1, 'build')!;
  const end = workEndMs(routine, R1, 'build')!;
  const wave = ROCK_WAVES.find((candidate) => candidate.id === 'workshop-appears')!;

  it('is presented before the third resident divides, so an existing resident (the first) is the builder', () => {
    const order = ROCK_WAVES.map((candidate) => candidate.id);
    expect(order.indexOf('workshop-appears')).toBeLessThan(order.indexOf('human-divides'));
    expect(routine.steps.map((step) => (step.kind === 'work' ? step.action : step.kind))).toEqual(['walk', 'build', 'walk']);
    const before = snapshotAtMs('workshop-appears', 0);
    expect(before.world.residents.map((resident) => resident.id)).toEqual([R1, SECOND_RESIDENT_ID]);
    expect(before.world.population).toBe(2);
    expect(before.world.props).not.toContain('stone-workshop');
    // Nobody else ever builds it: the first resident has exactly this one routine in the route.
    const routinesOfR1 = Object.entries(ROUTINES).filter(([, byResident]) => byResident?.[R1] !== undefined);
    expect(routinesOfR1.map(([waveId]) => waveId)).toEqual(['workshop-appears']);
  });

  it('shows no workshop while the builder walks over, and arrives at the site on the approved walk', () => {
    expect(distance(residentAt('workshop-appears', 0, R1).pose, LAYOUT.humanWarm)).toBeLessThanOrEqual(0.5);
    for (let ms = 40; ms < arrive; ms += 40) {
      const builder = residentAt('workshop-appears', ms, R1);
      expect(builder.pose.walk, `walking at ${ms}`).not.toBeNull();
      expect(slotAlpha(snapshotAtMs('workshop-appears', ms), 'stoneWorkshop'), `nothing built at ${ms}`).toBe(0);
    }
    expect(distance(residentAt('workshop-appears', arrive, R1).pose, T.workshopSite)).toBeLessThanOrEqual(1.5);
  });

  it('hammers with the existing build-1/build-2 body poses, the mallet face landing on the workshop face', () => {
    for (let n = 0; n < 6; n += 1) {
      const ms = start + n * ACTION_FRAME_MS + 20;
      const builder = residentAt('workshop-appears', ms, R1);
      expect(builder.pose.asset).toBe(n % 2 === 0 ? 'action-build-1' : 'action-build-2');
      expect(builder.pose.facing).toBe(1);
      expect(distance(builder.pose, T.workshopSite)).toBeLessThanOrEqual(1.5);
      if (n % 2 === 1) {
        // The strike frame: debris at the mallet face, which is the workshop's face.
        const debris = builder.layers!.effect!;
        expect(debris.kind).toBe('chips');
        expect(distance(debris, T.workshopFace)).toBeLessThanOrEqual(1.5);
        const tip = contactOffset('build', 1, 1)!;
        expect(distance({ x: builder.pose.x + tip.x, y: builder.pose.y + tip.y }, T.workshopFace)).toBeLessThanOrEqual(1.5);
      } else {
        expect(builder.layers!.effect).toBeNull();
      }
      // The workshop is not standing during the first mallet cycle.
      if (n < 2) expect(slotAlpha(snapshotAtMs('workshop-appears', ms), 'stoneWorkshop')).toBe(0);
    }
  });

  it('rises while it is hammered and is complete when the hammering stops, never before', () => {
    let last = 0;
    for (let ms = start; ms < wave.durationMs; ms += 20) {
      const alpha = slotAlpha(snapshotAtMs('workshop-appears', ms), 'stoneWorkshop');
      expect(alpha, `monotone at ${ms}`).toBeGreaterThanOrEqual(last - 1e-9);
      last = alpha;
    }
    expect(slotAlpha(snapshotAtMs('workshop-appears', end - 1), 'stoneWorkshop')).toBeGreaterThan(0.99);
    // And the accent glow plays over that same window, so it never precedes the builder.
    expect(computeSettlementEffects(snapshotAtMs('workshop-appears', arrive + ACTION_FRAME_MS))[0].glow).toBeCloseTo(0, 5);
    expect(computeSettlementEffects(snapshotAtMs('workshop-appears', end - 1))[0].glow).toBeCloseTo(0, 1);
  });

  it('stops: after the last strike the builder walks back to the fire and stands in the same pose the next Wave continues with', () => {
    const after = residentAt('workshop-appears', end + 100, R1);
    expect(after.pose.asset).not.toMatch(/^action-/);
    expect(after.layers?.effect ?? null).toBeNull();
    expect(after.pose.walk).not.toBeNull();
    expect(after.pose.x).toBeGreaterThan(LAYOUT.humanWarm.x);
    const done = snapshotAfter('workshop-appears');
    const settled = computeResidentVisuals(done).find((visual) => visual.id === R1)!;
    expect(distance(settled.pose, LAYOUT.humanWarm)).toBeLessThanOrEqual(0.5);
    const next = computeResidentVisuals(snapshotAt('human-divides', 0)).find((visual) => visual.id === R1)!;
    expect(next.pose.asset).toBe(settled.pose.asset);
    // Same two residents, same population, same ids; the workshop is part of the world from here to the END.
    expect(done.world.residents.map((resident) => resident.id)).toEqual([R1, SECOND_RESIDENT_ID]);
    expect(done.world.props).toContain('stone-workshop');
    for (const later of [done, snapshotAfterTurn(3), snapshotAfterTurn(4)]) expect(slotAlpha(later, 'stoneWorkshop')).toBe(1);
  });
});

describe('homes on the right of the island are mirrored buildings; the approved left hut is not', () => {
  const rightHomes = [
    { name: 'second hut', ground: T.secondHut, scale: TRUE_PROPS.secondHut.baseScale, face: T.hutFace, site: T.hutSite },
    { name: 'home A', ground: T.homes[0], scale: TRUE_PROPS.secondHut.baseScale * VILLAGE_HOME_SCALE, face: T.homeFaces[0], site: T.homeSites[0] },
    { name: 'home B', ground: T.homes[1], scale: TRUE_PROPS.secondHut.baseScale * VILLAGE_HOME_SCALE, face: T.homeFaces[1], site: T.homeSites[1] },
  ];
  const hut = load('public/assets/world/turn3/hut-second.png');
  // Opaque extent of a MIRRORED copy of the art at one row, in the mirrored image's pixels.
  const mirroredExtent = (row: number): { left: number; right: number } => {
    let [left, right] = [hut.width, -1];
    for (let x = 0; x < hut.width; x += 1) {
      if (alphaAt(hut, hut.width - 1 - x, row) >= 128) [left, right] = [Math.min(left, x), Math.max(right, x)];
    }
    return { left, right };
  };

  it('mirrors every right-side home (the second hut and both added homes), and never the approved Turn 2 hut', () => {
    expect(isMirroredHome(LAYOUT.hut)).toBe(false);
    expect(HUT_ASSET.flipX).not.toBe(true);
    for (const home of rightHomes) expect(isMirroredHome(home.ground), home.name).toBe(true);
    expect(T.secondHutMirrored).toBe(true);
    expect(T.homeMirrored).toEqual([true, true]);
    // The flag follows the home's side of the island's centre line: a data rule, not a per-home special case.
    expect(isMirroredHome({ x: 359, y: 700 })).toBe(false);
    expect(isMirroredHome({ x: 361, y: 700 })).toBe(true);
  });

  it('draws the second hut and the added homes mirrored at every moment of the route, and nothing else mirrored', () => {
    const game = new SliceGame();
    for (const element of TRUE_ROUTE) {
      game.selectElement(element);
      while (game.snapshot().phase === 'playing') {
        game.advance(250);
        const snapshot = game.snapshot();
        for (const visual of computeSettlementProps(snapshot)) expect(visual.flipX, `${visual.slot} @ ${snapshot.clockMs}`).toBe(visual.slot === 'secondHut');
        for (const home of computeVillageHomes(snapshot)) expect(home.flipX, `home ${home.index} @ ${snapshot.clockMs}`).toBe(true);
      }
    }
  });

  it('keeps the ground anchor where it was: mirroring changes the pixels, not the ground point or the origin', () => {
    const plain = groundOrigin(TRUE_PROPS.secondHut);
    const mirrored = groundOrigin({ ...TRUE_PROPS.secondHut, flipX: true });
    // The art's anchor is the centre of its opaque bounds, so mirroring keeps the origin on the same ground point.
    expect(mirrored.x).toBeCloseTo(plain.x, 9);
    expect(mirrored.y).toBe(plain.y);
    expect(computeSettlementProps(snapshotAfterTurn(3)).find((visual) => visual.slot === 'secondHut')!.ground).toEqual(T.secondHut);
    expect(computeVillageHomes(snapshotAfterTurn(4)).map((home) => home.ground)).toEqual([...T.homes]);
  });

  it('keeps every mirrored home, its wall and its builder on the island and clear of the panel', () => {
    for (const home of rightHomes) {
      const row = mirroredExtent(430);
      const left = home.ground.x + (row.left - 256) * home.scale;
      const right = home.ground.x + (row.right - 256) * home.scale;
      expect(left, `${home.name} left`).toBeGreaterThan(LAYOUT.island.left);
      expect(right, `${home.name} right`).toBeLessThan(LAYOUT.island.right);
      for (const point of [home.face, home.site]) {
        expect(point.x, home.name).toBeGreaterThan(LAYOUT.island.left);
        expect(point.x, home.name).toBeLessThan(LAYOUT.island.right);
        expect(point.y, home.name).toBeLessThan(LAYOUT.ui.panelTop - 60);
      }
      // The visible wall (the corner on the settlement side of the mirrored art) is where the face is.
      const wallRow = mirroredExtent(385);
      expect(Math.abs(home.face.x - (home.ground.x + (wallRow.left - 256) * home.scale)), `${home.name} face on the wall`).toBeLessThan(5 * home.scale + 1);
    }
  });

  it('has each builder stand on the settlement side facing right, with the mallet tip and the debris on the wall, through construction and completion', () => {
    const builds = [
      { name: 'second hut', wave: 'human-builds-hut', id: THIRD_RESIDENT_ID, site: T.hutSite, face: T.hutFace },
      { name: 'home A', wave: 'village-built', id: VILLAGE_RESIDENT_IDS[0], site: T.homeSites[0], face: T.homeFaces[0] },
      { name: 'home B', wave: 'village-built', id: VILLAGE_RESIDENT_IDS[1], site: T.homeSites[1], face: T.homeFaces[1] },
    ] as const;
    for (const build of builds) {
      const routine = ROUTINES[build.wave]![build.id];
      const start = workStartMs(routine, build.id, 'build')!;
      const end = workEndMs(routine, build.id, 'build')!;
      let strikes = 0;
      for (let ms = start + 10; ms < end; ms += 20) {
        const builder = residentAt(build.wave, ms, build.id);
        const frame = Math.floor((ms - start) / ACTION_FRAME_MS) % 2;
        expect(builder.pose.asset, `${build.name} @ ${ms}`).toBe(frame === 0 ? 'action-build-1' : 'action-build-2');
        expect(builder.pose.facing, build.name).toBe(1);
        expect(distance(builder.pose, build.site), `${build.name} stands still`).toBeLessThanOrEqual(1.5);
        expect(builder.pose.x, `${build.name} on the settlement side`).toBeLessThan(build.face.x);
        if (frame === 1) {
          strikes += 1;
          expect(distance(builder.layers!.effect!, build.face), `${build.name} debris`).toBeLessThanOrEqual(1.5);
        }
      }
      expect(strikes, build.name).toBeGreaterThan(10);
    }
  });
});

describe('guardian parent and child stay readable through the transformation and after the TRUE END', () => {
  const guardians = (snapshot: Parameters<typeof computeSettlementProps>[0]) => ({
    parent: slotAlpha(snapshot, 'guardianParent'),
    child: slotAlpha(snapshot, 'guardianChild'),
    livestockParent: slotAlpha(snapshot, 'livestockParent'),
    livestockChild: slotAlpha(snapshot, 'livestockChild'),
  });
  const guardianWave = WATER_WAVES.find((wave) => wave.id === 'guardian-transforms')!;

  it('is opaque and complete from the end of the Wave through the END, with the livestock art fully retired', () => {
    for (const snapshot of [snapshotAfter('guardian-transforms'), snapshotAfterTurn(4)]) {
      expect(guardians(snapshot)).toEqual({ parent: 1, child: 1, livestockParent: 0, livestockChild: 0 });
    }
    const game = new SliceGame();
    for (const element of TRUE_ROUTE) {
      game.selectElement(element);
      game.advance(200_000);
    }
    for (let i = 0; i < 20; i += 1) {
      game.advance(1000);
      expect(game.snapshot().phase).toBe('ended');
      expect(guardians(game.snapshot())).toEqual({ parent: 1, child: 1, livestockParent: 0, livestockChild: 0 });
    }
  });

  it('never leaves the pair faint while they change: the old and new art together are always at least 90% opaque', () => {
    for (let ms = 0; ms < guardianWave.durationMs; ms += 25) {
      const a = guardians(snapshotAtMs('guardian-transforms', ms));
      expect(a.parent + a.livestockParent, `parent @ ${ms}`).toBeGreaterThanOrEqual(0.9);
      expect(a.child + a.livestockChild, `child @ ${ms}`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('draws the pair over the fence and the blessing glow behind them (never as a veil over them)', () => {
    const props = computeSettlementProps(snapshotAfterTurn(4));
    const depthOf = (slot: string) => props.find((visual) => visual.slot === slot)!.depth;
    expect(depthOf('guardianParent')).toBe(ANIMAL_DEPTH);
    expect(depthOf('guardianChild')).toBe(ANIMAL_DEPTH);
    expect(depthOf('guardianParent')).toBeGreaterThan(depthOf('fence'));
    expect(depthOf('guardianChild')).toBeGreaterThan(depthOf('fence'));
    // The glow layer sits above the fence but below the animals.
    expect(ANIMAL_GLOW_DEPTH).toBeGreaterThan(depthOf('fence'));
    expect(ANIMAL_GLOW_DEPTH).toBeLessThan(ANIMAL_DEPTH);
    // Every accent around the pen or its animals draws its glow behind them, in every Wave that has one.
    for (const [waveId, spots] of Object.entries(WAVE_EFFECTS)) {
      for (const spot of spots!) {
        const aroundAnimals = [T.pen, T.parent, T.child, T.guardianParent, T.guardianChild].some((ground) => ground.x === spot.ground.x && ground.y === spot.ground.y);
        expect(spot.behindAnimals === true, `${waveId} @ ${spot.ground.x},${spot.ground.y}`).toBe(aroundAnimals);
      }
    }
    const during = computeSettlementEffects(snapshotAt('guardian-transforms', 0.5));
    expect(during.length).toBeGreaterThan(0);
    expect(during.every((effect) => effect.behindAnimals)).toBe(true);
  });

  it('leaves no blessing light on the pair after the Wave or at the END', () => {
    for (const snapshot of [snapshotAfter('guardian-transforms'), snapshotAfterTurn(4)]) {
      expect(computeSettlementEffects(snapshot)).toEqual([]);
    }
  });

  // The opaque pixels of a prop as a set of design-pixel cells (art pixels with alpha >= 128, placed
  // by the ground point, anchor and scale it is drawn with).
  const silhouette = (asset: (typeof TRUE_PROPS)[keyof typeof TRUE_PROPS], ground: { x: number; y: number }): Set<string> => {
    const image = load(`public${asset.dir}${asset.filename}`);
    const cells = new Set<string>();
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        if (alphaAt(image, x, y) < 128) continue;
        cells.add(`${Math.floor(ground.x + (x - asset.groundAnchor.x) * asset.baseScale)},${Math.floor(ground.y + (y - asset.groundAnchor.y) * asset.baseScale)}`);
      }
    }
    return cells;
  };
  const cellBounds = (cells: Set<string>) => {
    const xs = [...cells].map((cell) => Number(cell.split(',')[0]));
    const ys = [...cells].map((cell) => Number(cell.split(',')[1]));
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  };
  const overlapOf = (a: Set<string>, b: Set<string>): number => [...a].filter((cell) => b.has(cell)).length;

  it('stands the parent and child apart: their silhouettes barely touch, one behind-left and one forward in the gate', () => {
    const parent = silhouette(TRUE_PROPS.guardianParent, T.guardianParent);
    const child = silhouette(TRUE_PROPS.guardianChild, T.guardianChild);
    // Two animals, not one mass: under 3% of the child's silhouette is covered by the parent's.
    expect(overlapOf(parent, child) / child.size).toBeLessThan(0.03);
    // Their feet are well apart in both directions (the parent is behind and to the left).
    expect(T.guardianChild.y - T.guardianParent.y).toBeGreaterThanOrEqual(20);
    expect(T.guardianChild.x - T.guardianParent.x).toBeGreaterThanOrEqual(20);
    // The child is clear of the parent's whole body, not only its feet: its top is no higher than the parent's feet.
    expect(cellBounds(child).top).toBeGreaterThanOrEqual(cellBounds(parent).bottom - 6);
  });

  it('keeps both inside the fence ring: feet on open ground inside it, bodies within its footprint, rails almost uncovered', () => {
    const fence = load('public/assets/world/turn3/fence.png');
    const fenceAsset = TRUE_PROPS.fence;
    const column = (x: number) => Math.round(fenceAsset.groundAnchor.x + (x - T.pen.x) / fenceAsset.baseScale);
    const row = (y: number) => Math.round(fenceAsset.groundAnchor.y + (y - T.pen.y) / fenceAsset.baseScale);
    for (const point of [T.guardianParent, T.guardianChild]) {
      expect(alphaAt(fence, column(point.x), row(point.y)), 'feet are on open ground, not on a rail').toBeLessThan(128);
      expect(point.y, 'feet are no lower than the fence ground').toBeLessThanOrEqual(T.pen.y);
    }
    // The fence's opaque footprint: the pair's bodies stay within its width.
    const fenceCells = silhouette(fenceAsset, T.pen);
    const footprint = cellBounds(fenceCells);
    const parent = silhouette(TRUE_PROPS.guardianParent, T.guardianParent);
    const child = silhouette(TRUE_PROPS.guardianChild, T.guardianChild);
    for (const body of [parent, child]) {
      const extent = cellBounds(body);
      expect(extent.left).toBeGreaterThanOrEqual(footprint.left - 4);
      expect(extent.right).toBeLessThanOrEqual(footprint.right + 4);
      // The pair sits in the pen, never below its front rail.
      expect(extent.bottom).toBeLessThanOrEqual(footprint.bottom);
    }
    // Rails stay readable. The parent stands in front of the ring's rear rails (so it covers part of
    // them, as the livestock did: about a fifth of the fence's pixels); the child stands in the open
    // gate and covers almost none, and nothing of the front rails below the animals' feet is hidden.
    expect(overlapOf(fenceCells, parent) / fenceCells.size).toBeLessThan(0.25);
    expect(overlapOf(fenceCells, child) / fenceCells.size).toBeLessThan(0.05);
    const frontRails = new Set([...fenceCells].filter((cell) => Number(cell.split(',')[1]) > T.guardianChild.y));
    expect(overlapOf(frontRails, parent) + overlapOf(frontRails, child)).toBe(0);
  });

  it('draws the guardians larger than the livestock they transform from, and the child smaller than the parent', () => {
    expect(TRUE_PROPS.guardianParent.baseScale).toBeGreaterThan(TRUE_PROPS.livestockParent.baseScale);
    expect(TRUE_PROPS.guardianChild.baseScale).toBeGreaterThan(TRUE_PROPS.livestockChild.baseScale);
    expect(TRUE_PROPS.guardianChild.baseScale).toBeLessThan(TRUE_PROPS.guardianParent.baseScale);
    // The same position is kept to within the pen: the transformation stays in the same ring.
    for (const [from, to] of [
      [T.parent, T.guardianParent],
      [T.child, T.guardianChild],
    ]) {
      expect(distance(from, to)).toBeLessThan(45);
    }
  });

  it('puts a steady contact shadow under each guardian: on the ground, under the fence, with no glow', () => {
    const during = computeGuardianShadows(snapshotAt('guardian-transforms', 0.5));
    expect(during).toHaveLength(2);
    for (const snapshot of [snapshotAfter('guardian-transforms'), snapshotAfterTurn(4)]) {
      const shadows = computeGuardianShadows(snapshot);
      expect(shadows.map((shadow) => shadow.alpha)).toEqual([GUARDIAN_SHADOW_ALPHA, GUARDIAN_SHADOW_ALPHA]);
      // A dark, subtle, flat ellipse: faint enough never to read as a stain, wide enough to ground the animal.
      expect(GUARDIAN_SHADOW_ALPHA).toBeGreaterThan(0.1);
      expect(GUARDIAN_SHADOW_ALPHA).toBeLessThan(0.4);
      for (const shadow of shadows) expect(shadow.height).toBeLessThan(shadow.width / 2);
      // Centred just under each animal's feet.
      expect(shadows[0].ground.x).toBe(T.guardianParent.x);
      expect(shadows[1].ground.x).toBe(T.guardianChild.x);
      expect(shadows[1].ground.y).toBeGreaterThan(shadows[0].ground.y);
      expect(computeSettlementEffects(snapshot)).toEqual([]);
    }
    // It is part of the guardians: absent before they stand, fading in with them, never fainter than them.
    expect(computeGuardianShadows(snapshotAfterTurn(3))).toEqual([]);
    for (let ms = 0; ms < guardianWave.durationMs; ms += 50) {
      const snapshot = snapshotAtMs('guardian-transforms', ms);
      const shadows = computeGuardianShadows(snapshot);
      const alphas = [slotAlpha(snapshot, 'guardianParent'), slotAlpha(snapshot, 'guardianChild')];
      expect(shadows.map((shadow) => shadow.alpha)).toEqual(alphas.filter((alpha) => alpha > 0).map((alpha) => GUARDIAN_SHADOW_ALPHA * alpha));
    }
    // Ground level: above the riverbeds, below the fence rails and the animals.
    const depthOf = (slot: string) => computeSettlementProps(snapshotAfterTurn(4)).find((visual) => visual.slot === slot)!.depth;
    expect(GUARDIAN_SHADOW_DEPTH).toBeLessThan(depthOf('fence'));
    expect(GUARDIAN_SHADOW_DEPTH).toBeGreaterThan(depthOf('flowingRiverbed'));
    expect(GUARDIAN_SHADOW_DEPTH).toBeLessThan(depthOf('guardianParent'));
  });

  it('keeps the same art files and foot anchors the pair had (no candidate art was promoted or replaced)', () => {
    expect(TRUE_PROPS.guardianChild.filename).toBe('guardian-child.png');
    expect(TRUE_PROPS.guardianParent.filename).toBe('guardian-parent.png');
    expect(TRUE_PROPS.guardianParent.groundAnchor).toEqual({ x: 256, y: 415 });
    expect(TRUE_PROPS.guardianChild.groundAnchor).toEqual({ x: 256, y: 450 });
  });
});
