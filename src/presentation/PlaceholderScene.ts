import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './display';

export const PLACEHOLDER_SCENE_KEY = 'Placeholder';

// Confirms that Phaser boots and renders. It holds no game state, input, or rules.
export class PlaceholderScene extends Phaser.Scene {
  constructor() {
    super(PLACEHOLDER_SCENE_KEY);
  }

  create(): void {
    this.add
      .text(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, 'Island Grow Game\n(placeholder)', {
        align: 'center',
        color: '#ffffff',
        fontFamily: 'sans-serif',
        fontSize: '40px',
      })
      .setOrigin(0.5);
  }
}
