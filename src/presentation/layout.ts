import { DESIGN_HEIGHT, DESIGN_WIDTH } from './display';

// All layout is expressed as ratios of the 9:16 design resolution so aspect
// ratio dependence stays in display.ts. Positions are provisional placeholders.
const x = (ratio: number): number => DESIGN_WIDTH * ratio;
const y = (ratio: number): number => DESIGN_HEIGHT * ratio;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type AnimalKind = 'sheep' | 'deer';
export type TierId = 'base' | 'terrace' | 'plateau';

const poly = (pairs: ReadonlyArray<readonly [number, number]>): readonly Point[] =>
  pairs.map(([px, py]) => ({ x: x(px), y: y(py) }));

const BUTTON_COUNT = 4;
const BUTTON_SIZE = x(0.2);
const BUTTON_GAP = (DESIGN_WIDTH - BUTTON_COUNT * BUTTON_SIZE) / (BUTTON_COUNT + 1);

// Fixed 2.5D miniature seen from a fixed camera. The island is stacked tiers
// listed lowest elevation first (painter's order): each tier's `surface` is its
// top face and `cliff` is how far its front face drops below the surface front
// edge. Higher tiers therefore cover the back of lower ones, which gives the
// height difference. Props and characters are depth-sorted by their ground y.
export const LAYOUT = {
  terrain: [
    // Lowest: the open living space at the front and the island's outer cliff.
    {
      id: 'base',
      surface: poly([
        [0.05, 0.55], [0.08, 0.48], [0.18, 0.43], [0.34, 0.405], [0.5, 0.4], [0.66, 0.405],
        [0.82, 0.43], [0.92, 0.48], [0.95, 0.55], [0.94, 0.64], [0.88, 0.71], [0.74, 0.75],
        [0.5, 0.762], [0.26, 0.75], [0.12, 0.71], [0.06, 0.64],
      ]),
      cliff: y(0.04),
    },
    // Middle: grass terrace for trees and animals, one step above the base.
    {
      id: 'terrace',
      surface: poly([
        [0.12, 0.5], [0.18, 0.44], [0.34, 0.415], [0.66, 0.415], [0.82, 0.44], [0.88, 0.5],
        [0.84, 0.545], [0.7, 0.565], [0.5, 0.572], [0.3, 0.565], [0.16, 0.545],
      ]),
      cliff: y(0.03),
    },
    // Highest: rocky plateau at the back; the cave opens in its front face.
    {
      id: 'plateau',
      surface: poly([
        [0.27, 0.375], [0.36, 0.335], [0.5, 0.315], [0.64, 0.335], [0.73, 0.375], [0.7, 0.425],
        [0.58, 0.445], [0.5, 0.45], [0.42, 0.445], [0.3, 0.425],
      ]),
      cliff: y(0.055),
    },
  ],
  // Back: an ordinary cave in the plateau's cliff face, plus boulders on top.
  cave: { x: x(0.5), baseY: y(0.5), width: x(0.17), height: y(0.052) },
  boulders: [
    { x: x(0.4), y: y(0.385), size: 1 },
    { x: x(0.61), y: y(0.375), size: 0.8 },
    { x: x(0.55), y: y(0.415), size: 0.6 },
  ],
  // Middle: nature and animals on the terrace, on both sides of the cave.
  trees: [
    { x: x(0.17), y: y(0.505), scale: 1 },
    { x: x(0.82), y: y(0.51), scale: 1.05 },
    { x: x(0.27), y: y(0.54), scale: 0.85 },
    { x: x(0.74), y: y(0.545), scale: 0.9 },
  ],
  animals: [
    { x: x(0.4), y: y(0.55), kind: 'sheep' },
    { x: x(0.62), y: y(0.555), kind: 'deer' },
  ] as ReadonlyArray<{ readonly x: number; readonly y: number; readonly kind: AnimalKind }>,
  // Front: shelter, human, and the open living space kept free for growth.
  shelter: { x: x(0.17), y: y(0.655), width: x(0.15), height: y(0.065) },
  humanStart: { x: x(0.3), y: y(0.665) },
  humanWarm: { x: x(0.6), y: y(0.665) },
  fire: { x: x(0.7), y: y(0.67) },
  // Foreground framing drawn in front of everything on the island.
  foreground: [
    { x: x(0.15), y: y(0.69), scale: 1 },
    { x: x(0.87), y: y(0.685), scale: 0.85 },
  ],
  // Empty ground on purpose, so later growth has room to appear.
  growthSpaces: [
    { id: 'front-left', left: x(0.24), right: x(0.46), top: y(0.7), bottom: y(0.73) },
    { id: 'front-right', left: x(0.56), right: x(0.8), top: y(0.7), bottom: y(0.73) },
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
