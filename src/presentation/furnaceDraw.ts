import type Phaser from 'phaser';

// The finished stone furnace: a domed stone kiln with a dark mouth, a flickering fire in it
// and a chimney that smokes. There is no furnace art in the repository or the supplied
// packages, so this is a PROVISIONAL code-native drawing (like the crew's effects), in the
// style of the game's other props: dark outline, mid-grey stone with lighter top edges.
// Replacing it with reviewed art is a Human Review decision. Drawn in local design pixels
// with the ground contact at (0, 0); the Scene positions and scales the Graphics there.
// Pure drawing from the logical clock: nothing here reads or changes game state.

type G = Phaser.GameObjects.Graphics;
const OUTLINE = 0x2b2a2e;
const STONE = 0x8f949b;
const STONE_LIGHT = 0xb9bec4;
const STONE_DARK = 0x6b7078;
const MOUTH = 0x1d1b20;
const FLAME_OUTER = 0xff8a2a;
const FLAME_INNER = 0xffd35c;

type Pt = readonly [number, number];

const polygon = (g: G, color: number, points: readonly Pt[], width = 1): void => {
  g.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillStyle(color, 1);
  g.fillPath();
  g.lineStyle(width, OUTLINE, 1);
  g.strokePath();
};

// Points of a half ellipse (the dome's outline) from the left foot over the top to the right.
const dome = (cx: number, baseY: number, rx: number, ry: number, steps: number): Pt[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const angle = Math.PI + (Math.PI * i) / steps;
    return [cx + rx * Math.cos(angle), baseY + ry * Math.sin(angle)] as const;
  });

export function drawFurnace(g: G, clockMs: number): void {
  const seconds = clockMs / 1000;
  g.clear();

  // Warm light on the ground in front of the mouth, and the shadow under the whole kiln.
  g.fillStyle(0x183321, 0.26);
  g.fillEllipse(2, 1, 56, 9);
  g.fillStyle(0xffbd55, 0.16 + 0.04 * Math.sin(seconds * 9));
  g.fillEllipse(0, 4, 40, 9);

  // Chimney, behind the dome: a short stack of stone with a rim.
  polygon(g, STONE_DARK, [[5, -16], [15, -16], [14, -40], [6, -40]]);
  polygon(g, STONE_LIGHT, [[4, -40], [16, -40], [16, -43], [4, -43]]);
  g.lineStyle(0.8, OUTLINE, 0.8);
  g.lineBetween(5.4, -26, 14.6, -26);
  g.lineBetween(5.8, -33, 14.2, -33);

  // Smoke rising from the chimney: three puffs, each drifting up and thinning out.
  for (let i = 0; i < 3; i += 1) {
    const t = (seconds * 0.45 + i / 3) % 1;
    g.fillStyle(0xd8d8de, 0.5 * (1 - t));
    g.fillCircle(10 + Math.sin(seconds * 1.7 + i * 2) * 3 + t * 5, -46 - t * 26, 2.4 + t * 3.4);
  }

  // The dome: a half ellipse of stone, its rows of blocks marked by joints and highlights.
  const outline = dome(0, -1, 22, 31, 16);
  polygon(g, STONE, [...outline, [22, 3], [-22, 3]]);
  // Lit top-left rim.
  g.lineStyle(2, STONE_LIGHT, 0.9);
  g.beginPath();
  dome(0, -1, 20, 29, 16)
    .slice(1, 8)
    .forEach(([x, y], index) => (index === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.strokePath();
  // Courses of stone: curved joints and the vertical seams between blocks.
  g.lineStyle(0.9, OUTLINE, 0.7);
  for (const [ry, rx, base] of [[22, 21.5, -1], [13, 20.5, -1]] as const) {
    g.beginPath();
    dome(0, base, rx, ry, 14).forEach(([x, y], index) => (index === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.strokePath();
  }
  const seams: readonly (readonly [number, number, number, number])[] = [
    [-15, -12, -13, -2],
    [-8, -22, -9, -12],
    [-1, -30, -1, -22],
    [8, -26, 7, -17],
    [15, -14, 14, -4],
    [-19, -5, -20, 2],
  ];
  for (const [x1, y1, x2, y2] of seams) g.lineBetween(x1, y1, x2, y2);

  // The stone base ring: a row of rounded blocks along the front.
  for (let i = 0; i < 7; i += 1) {
    const x = -21 + i * 7;
    const y = 1.5 + (i % 2) * 0.8;
    polygon(g, i % 2 === 0 ? STONE_LIGHT : STONE, [[x - 3.6, y - 3], [x + 3.6, y - 3], [x + 4, y + 1.5], [x - 4, y + 1.5]]);
  }

  // The mouth: a dark arch at the front, with the fire burning inside it.
  const mouth: Pt[] = [[-8, 0], [-8, -11], ...dome(0, -11, 8, 7, 8).slice(1, -1), [8, -11], [8, 0]];
  polygon(g, MOUTH, mouth, 1.2);
  const flicker = (phase: number): number => 0.5 + 0.5 * Math.sin(seconds * 11 + phase);
  g.fillStyle(FLAME_OUTER, 1);
  g.fillTriangle(-6, -1, -1, -1, -3.5, -8 - 4 * flicker(0));
  g.fillTriangle(-2.5, -1, 3.5, -1, 0.5, -12 - 5 * flicker(1.7));
  g.fillTriangle(1, -1, 6, -1, 3.8, -7 - 3.5 * flicker(3.1));
  g.fillStyle(FLAME_INNER, 1);
  g.fillTriangle(-2, -1, 2.4, -1, 0.2, -7 - 3 * flicker(0.9));
  // The arch's keystone-and-lintel rim.
  g.lineStyle(1.6, STONE_LIGHT, 0.95);
  g.beginPath();
  [[-9.4, 0], [-9.4, -11], ...dome(0, -11, 9.4, 8.4, 8).slice(1, -1), [9.4, -11], [9.4, 0]].forEach(([x, y], index) =>
    index === 0 ? g.moveTo(x as number, y as number) : g.lineTo(x as number, y as number),
  );
  g.strokePath();
}
