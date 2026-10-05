import Phaser from 'phaser';
import { BACKGROUND_COLOR, DESIGN_HEIGHT, DESIGN_WIDTH } from './presentation/display';
import { IslandScene } from './presentation/IslandScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  backgroundColor: BACKGROUND_COLOR,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [IslandScene],
});
