import type Phaser from 'phaser';
import type { EffectLayer } from './crew';

// Provisional, code-native drawings for the crew's effect layer (dust, chips, dirt, splash).
// The human (and the tool or load its composite work frame bakes in) is a sprite; the
// effect is its own record, drawn here as its own game object. Replacing these with reviewed
// art is a Human Review decision. Pure drawing from a layer record; nothing here reads or
// changes game state.

type G = Phaser.GameObjects.Graphics;
const STONE_LIGHT = 0xb4b9bf;
const WOOD = 0x9a6b3c;
const WATER = 0x58b7e6;
const SOIL = 0x7a5634;

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
