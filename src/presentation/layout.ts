import { DESIGN_HEIGHT, DESIGN_WIDTH } from './display';

// All layout is expressed as ratios of the 9:16 design resolution so aspect
// ratio dependence stays in display.ts. Positions are provisional placeholders.
const x = (ratio: number): number => DESIGN_WIDTH * ratio;
const y = (ratio: number): number => DESIGN_HEIGHT * ratio;

const BUTTON_COUNT = 4;
const BUTTON_SIZE = x(0.2);
const BUTTON_GAP = (DESIGN_WIDTH - BUTTON_COUNT * BUTTON_SIZE) / (BUTTON_COUNT + 1);

export const LAYOUT = {
  // Oblique top-down island ellipse; `depth` is the visible cliff thickness.
  island: { x: x(0.5), y: y(0.5), rx: x(0.47), ry: y(0.195), depth: y(0.03) },
  // Back: rocky hill with an ordinary cave opening.
  rock: { x: x(0.5), baseY: y(0.37), width: x(0.56), height: y(0.115) },
  cave: { x: x(0.5), y: y(0.345), width: x(0.15), height: y(0.055) },
  // Centre to left/right: nature and animals.
  trees: [
    { x: x(0.14), y: y(0.42), scale: 1 },
    { x: x(0.88), y: y(0.43), scale: 1.05 },
    { x: x(0.23), y: y(0.5), scale: 0.85 },
    { x: x(0.79), y: y(0.52), scale: 0.9 },
  ],
  animals: [
    { x: x(0.1), y: y(0.535), kind: 'sheep' },
    { x: x(0.9), y: y(0.58), kind: 'deer' },
  ],
  // Front-centre: shelter, human, and the open living space kept free for growth.
  shelter: { x: x(0.14), y: y(0.625), width: x(0.15), height: y(0.065) },
  humanStart: { x: x(0.3), y: y(0.625) },
  humanWarm: { x: x(0.6), y: y(0.625) },
  fire: { x: x(0.7), y: y(0.63) },
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
