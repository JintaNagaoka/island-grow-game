import type Phaser from 'phaser';
import type { EffectLayer, ObjectLayer } from './crew';

// Provisional, code-native drawings for the crew's object and effect layers (the
// human layer is an approved sprite). They are placeholder shapes in design pixels:
// replacing them with reviewed art is a Human Review decision. Pure drawing from a
// layer record; nothing here reads or changes game state.

type G = Phaser.GameObjects.Graphics;
const OUTLINE = 0x2b2a2e;
const STONE = 0x8f949b;
const STONE_LIGHT = 0xb4b9bf;
const WOOD = 0x9a6b3c;
const METAL = 0x6b7078;
const WATER = 0x58b7e6;
const SOIL = 0x7a5634;

interface Pt {
  readonly x: number;
  readonly y: number;
}

// A point given in the object's own space (origin at the grip, +y down) to the scene.
const place = (layer: ObjectLayer, x: number, y: number): Pt => {
  const cos = Math.cos(layer.angle);
  const sin = Math.sin(layer.angle);
  return { x: layer.x + x * cos - y * sin, y: layer.y + x * sin + y * cos };
};
const poly = (g: G, layer: ObjectLayer, color: number, points: readonly (readonly [number, number])[]): void => {
  const world = points.map(([x, y]) => place(layer, x, y));
  g.beginPath();
  world.forEach((point, index) => (index === 0 ? g.moveTo(point.x, point.y) : g.lineTo(point.x, point.y)));
  g.closePath();
  g.fillStyle(color, 1);
  g.fillPath();
  g.lineStyle(0.8, OUTLINE, 1);
  g.strokePath();
};
const line = (g: G, layer: ObjectLayer, color: number, width: number, a: readonly [number, number], b: readonly [number, number]): void => {
  const from = place(layer, a[0], a[1]);
  const to = place(layer, b[0], b[1]);
  g.lineStyle(width, color, 1);
  g.lineBetween(from.x, from.y, to.x, to.y);
};

export function drawCrewObject(g: G, layer: ObjectLayer): void {
  switch (layer.kind) {
    case 'stone':
      poly(g, layer, STONE, [[-3.4, 0], [-2.2, -3], [1.4, -3.4], [3.4, -0.6], [2.4, 1.4], [-2, 1.6]]);
      poly(g, layer, STONE_LIGHT, [[-1.8, -1.2], [-0.4, -2.4], [1, -1.4], [-0.6, -0.6]]);
      break;
    case 'stone-block':
      poly(g, layer, STONE, [[-4.5, -3], [4.5, -3], [4.5, 3.2], [-4.5, 3.2]]);
      poly(g, layer, STONE_LIGHT, [[-4.5, -3], [4.5, -3], [3.2, -5], [-3.2, -5]]);
      break;
    case 'spade':
      line(g, layer, WOOD, 1.8, [0, -9], [0, 8]);
      line(g, layer, WOOD, 1.8, [-2, -9], [2, -9]);
      poly(g, layer, METAL, [[-2.8, 8], [2.8, 8], [2, 13], [-2, 13]]);
      break;
    case 'mallet':
      line(g, layer, WOOD, 2, [0, 2], [0, -12]);
      poly(g, layer, WOOD, [[-4.5, -12], [4.5, -12], [4.5, -17], [-4.5, -17]]);
      line(g, layer, METAL, 1.2, [-4.5, -14.5], [4.5, -14.5]);
      break;
    case 'bucket':
      poly(g, layer, WOOD, [[-4.2, -3.5], [4.2, -3.5], [3.2, 4], [-3.2, 4]]);
      line(g, layer, METAL, 1.2, [-3.8, -0.5], [3.8, -0.5]);
      if (layer.filled) poly(g, layer, WATER, [[-3.6, -3.6], [3.6, -3.6], [3.2, -2.2], [-3.2, -2.2]]);
      break;
  }
}

const DROPS: readonly (readonly [number, number])[] = [
  [-1, 0.9],
  [0.4, 1.3],
  [1.2, 0.7],
  [-0.4, 1.1],
];

export function drawCrewEffect(g: G, layer: EffectLayer): void {
  const p = Math.min(1, Math.max(0, layer.phase));
  const fade = 1 - p;
  switch (layer.kind) {
    case 'dust':
      DROPS.slice(0, 3).forEach(([dx], index) => {
        g.fillStyle(0xd8d0c0, 0.55 * fade);
        g.fillCircle(layer.x + dx * (3 + 6 * p), layer.y - 1 - 5 * p - index, 1.3 + 2.2 * p);
      });
      break;
    case 'chips':
      DROPS.forEach(([dx, speed], index) => {
        g.fillStyle(index % 2 === 0 ? WOOD : STONE_LIGHT, fade);
        g.fillRect(layer.x + dx * 9 * p, layer.y - 8 * speed * p + 12 * p * p - 1, 1.6, 1.6);
      });
      break;
    case 'dirt':
      DROPS.forEach(([dx, speed]) => {
        g.fillStyle(SOIL, fade);
        g.fillCircle(layer.x + dx * 10 * p, layer.y - 9 * speed * p + 14 * p * p, 1.2);
      });
      break;
    case 'splash':
      DROPS.forEach(([dx, speed]) => {
        g.fillStyle(WATER, 0.9 * fade);
        g.fillCircle(layer.x + dx * 7 * p, layer.y - 7 * speed * p + 10 * p * p, 1.1);
      });
      break;
  }
}
