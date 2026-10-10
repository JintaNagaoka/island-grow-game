import Phaser from 'phaser';
import { SliceGame, type SliceSnapshot } from '../game/sliceGame';
import { MAX_FRAME_DELTA_MS } from '../game/timing';
import { ELEMENTS, type Element } from '../game/worldState';
import {
  computeEnvironmentMotion,
  computeFireVisual,
  computeHumanPose,
  computeWalkPreviewPose,
  type HumanPose,
} from './animation';
import {
  COLD_HEAD_COLOR,
  COLD_MARK_COLOR,
  COLD_MARK_WIDTH,
  computeColdOverlay,
} from './coldOverlay';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './display';
import {
  HUMAN_ASSET_LIST,
  HUMAN_FRAME_SIZE,
  HUMAN_WALK_ASSET_LIST,
  selectHumanAsset,
} from './humanAssets';
import { HUMAN_WALK_ANIMATIONS, planHumanAnimation } from './humanWalk';
import { LAYOUT } from './layout';
import {
  WORLD_ASSETS,
  WORLD_ASSET_DIR,
  WORLD_ASSET_LIST,
  WORLD_WATER_COLOR,
  type WorldAsset,
} from './worldAssets';

export const ISLAND_SCENE_KEY = 'Island';

const ICONS: Record<Element, string> = { fire: '🔥', plant: '🌱', rock: '🪨', water: '💧' };
const FONT_FAMILY = 'sans-serif';
// Keep the resident visibly subordinate to the island and cave. The source
// canvases are all 512px, so one uniform scale works for every pose.
const HUMAN_SPRITE_SCALE = 0.1;
// Review-only loop that walks the human up/down/left/right (npm run dev, then
// open /?humanWalkPreview). Never active in production builds.
const WALK_PREVIEW_ENABLED =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('humanWalkPreview');
type ButtonState = 'available' | 'selected' | 'unavailable';

interface ElementButton {
  readonly element: Element;
  readonly background: Phaser.GameObjects.Graphics;
  readonly icon: Phaser.GameObjects.Text;
  readonly caption: Phaser.GameObjects.Text;
  state: ButtonState | null;
}

// Fixed-camera miniature presentation. Gameplay lives entirely in SliceGame;
// this scene turns snapshots into toy-like shapes and clock-driven movement.
export class IslandScene extends Phaser.Scene {
  private slice = new SliceGame();
  private buttons: ElementButton[] = [];
  // World art: the baked island (terrain, cave, rocks, one landscape tree) and
  // three ground-anchored props. Rendering only; none of it owns game state.
  private animal!: Phaser.GameObjects.Image;
  private animalShadow!: Phaser.GameObjects.Graphics;
  private fireSprite!: Phaser.GameObjects.Image;
  private fireGlow!: Phaser.GameObjects.Graphics;
  private fireSparks!: Phaser.GameObjects.Graphics;
  private shadow!: Phaser.GameObjects.Graphics;
  // The single human renderer: one Sprite for every pose and walk frame.
  private human!: Phaser.GameObjects.Sprite;
  private humanCold!: Phaser.GameObjects.Graphics;

  constructor() {
    super(ISLAND_SCENE_KEY);
  }

  preload(): void {
    for (const asset of WORLD_ASSET_LIST) {
      this.load.image(asset.textureKey, `${WORLD_ASSET_DIR}${asset.filename}`);
    }
    for (const asset of HUMAN_ASSET_LIST) {
      this.load.image(asset.textureKey, `/assets/human/${asset.filename}`);
    }
    for (const asset of HUMAN_WALK_ASSET_LIST) {
      this.load.image(asset.textureKey, `/assets/human/${asset.filename}`);
    }
  }

  create(): void {
    for (const definition of HUMAN_WALK_ANIMATIONS) {
      if (this.anims.exists(definition.key)) continue;
      this.anims.create({
        key: definition.key,
        frames: definition.frames.map((frame) => ({ key: frame.key })),
        frameRate: definition.frameRate,
        repeat: definition.repeat,
      });
    }
    this.slice = new SliceGame();
    this.buttons = [];
    this.cameras.main.setBackgroundColor(WORLD_WATER_COLOR);
    this.createWorld();
    this.createHuman();
    this.createButtons();
    this.render(this.slice.snapshot());
  }

  update(_time: number, delta: number): void {
    const frameDelta = Number.isFinite(delta) && delta > 0 ? Math.min(delta, MAX_FRAME_DELTA_MS) : 0;
    this.slice.advance(frameDelta);
    this.render(this.slice.snapshot());
  }

  private render(snapshot: SliceSnapshot): void {
    this.renderEnvironment(snapshot);
    this.renderHuman(snapshot);
    this.renderFire(snapshot);
    this.renderButtons(snapshot);
  }

  private renderEnvironment(snapshot: SliceSnapshot): void {
    const { x, y, turn } = computeEnvironmentMotion(snapshot).animalOffset;
    const ground = { x: LAYOUT.animal.x + x, y: LAYOUT.animal.y + y };
    this.animal.setPosition(ground.x, ground.y);
    this.animal.setRotation(turn * 0.025);
    this.animal.setDepth(ground.y);
    this.animalShadow.clear();
    this.animalShadow.fillStyle(0x183321, 0.24);
    this.animalShadow.fillEllipse(ground.x + 2, ground.y + 1, 62, 11);
    this.animalShadow.setDepth(ground.y - 0.5);
  }

  private renderHuman(snapshot: SliceSnapshot): void {
    const pose = WALK_PREVIEW_ENABLED
      ? computeWalkPreviewPose(snapshot.clockMs, snapshot.world.isCold)
      : computeHumanPose(snapshot);
    this.human.setPosition(pose.x, pose.y - pose.lift);
    this.human.setOrigin(pose.originX, pose.originY);
    this.applyHumanFrame(pose);
    this.human.setScale(pose.facing * HUMAN_SPRITE_SCALE, HUMAN_SPRITE_SCALE);
    this.human.setDepth(pose.y + 2);
    this.renderHumanCold(pose);

    const shadowScale = 1 - Math.min(0.32, pose.lift / 28);
    this.shadow.clear();
    this.shadow.fillStyle(0x183321, 0.28 * shadowScale);
    this.shadow.fillEllipse(
      pose.x,
      pose.y + 2,
      34 * shadowScale,
      8 * shadowScale,
    );
    this.shadow.setDepth(pose.y);
  }

  // Walk poses play the per-direction Phaser animation; planHumanAnimation()
  // decides when to start (key change only), pin, or stop it. Phaser's own timer
  // is not trusted: after starting, the current frame is pinned to the one the
  // logical clock selects, so playback speed and frame-time hiccups cannot
  // desynchronize it, and no rule ever waits on animation completion. Any
  // non-walk pose stops the animation, so nothing keeps walking after arrival.
  private applyHumanFrame(pose: HumanPose): void {
    const anims = this.human.anims;
    const playingKey = anims.isPlaying ? (anims.currentAnim?.key ?? null) : null;
    const command = planHumanAnimation(playingKey, pose.walk);
    if (command.type === 'start') {
      this.human.play(command.key, true);
    } else if (command.type === 'stop') {
      anims.stop();
    }
    if (pose.walk && (command.type === 'start' || command.type === 'pin')) {
      const animation = this.anims.get(pose.walk.animationKey);
      // Registered in create(); a missing one is a programming error.
      if (!animation) throw new Error(`missing human walk animation: ${pose.walk.animationKey}`);
      anims.setCurrentFrame(animation.frames[command.frameIndex]);
      return;
    }
    if (this.human.texture.key !== pose.asset) this.human.setTexture(pose.asset);
  }

  // Draws the cold marks over a walk frame, in the sprite's own source-pixel
  // space so they track the frame's origin and the shared sprite scale.
  private renderHumanCold(pose: HumanPose): void {
    const g = this.humanCold;
    g.clear();
    if (!pose.coldOverlay || !pose.walk) return;
    const shapes = computeColdOverlay(pose.walk.direction);
    const originX = pose.originX * HUMAN_FRAME_SIZE;
    const originY = pose.originY * HUMAN_FRAME_SIZE;
    const worldX = (sourceX: number): number =>
      pose.x + (sourceX - originX) * pose.facing * HUMAN_SPRITE_SCALE;
    const worldY = (sourceY: number): number =>
      pose.y - pose.lift + (sourceY - originY) * HUMAN_SPRITE_SCALE;

    for (const band of shapes.tintBands) {
      g.fillStyle(COLD_HEAD_COLOR, band.alpha);
      g.fillRect(
        worldX(band.left),
        worldY(band.top),
        band.width * HUMAN_SPRITE_SCALE,
        band.height * HUMAN_SPRITE_SCALE,
      );
    }
    g.lineStyle(COLD_MARK_WIDTH * HUMAN_SPRITE_SCALE, COLD_MARK_COLOR, 1);
    for (const mark of shapes.marks) {
      g.beginPath();
      mark.forEach((point, index) => {
        if (index === 0) g.moveTo(worldX(point.x), worldY(point.y));
        else g.lineTo(worldX(point.x), worldY(point.y));
      });
      g.strokePath();
    }
    g.setDepth(pose.y + 3);
  }

  // The fire is the PNG sprite, shown only once computeFireVisual() says so and
  // scaled from its ground point; the glow, Wave-1 burst and rising sparks are
  // small Graphics accents around it.
  private renderFire(snapshot: SliceSnapshot): void {
    const glow = this.fireGlow;
    const sparks = this.fireSparks;
    glow.clear();
    sparks.clear();
    const fire = computeFireVisual(snapshot);
    this.fireSprite.setVisible(fire.visible);
    if (!fire.visible) return;
    const { x, y } = LAYOUT.fire;
    const s = fire.scale;
    const baseScale = WORLD_ASSETS.fire.baseScale;
    this.fireSprite.setScale(baseScale * s).setRotation(fire.rotation).setAlpha(fire.alpha);

    glow.fillStyle(0xffbd55, 0.16);
    glow.fillEllipse(x, y + 2, 116 * s, 35 * s);

    if (fire.burst !== null && fire.burst < 0.8) {
      const t = fire.burst / 0.8;
      const radius = (1 - (1 - t) ** 3) * 48;
      sparks.fillStyle(0xffd35c, 1 - t);
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        sparks.fillCircle(x + Math.cos(angle) * radius, y - 20 + Math.sin(angle) * radius * 0.55, 3);
      }
    }

    for (let i = 0; i < 3; i += 1) {
      const t = (fire.seconds * 0.55 + i / 3) % 1;
      sparks.fillStyle(0xffc860, (1 - t) * 0.85);
      sparks.fillCircle(x + Math.sin(fire.seconds * 3 + i * 2.1) * 7 * s, y - 40 * s - t * 38, 2);
    }
  }

  private renderButtons(snapshot: SliceSnapshot): void {
    for (const button of this.buttons) {
      const state = this.buttonState(button.element, snapshot);
      if (state !== button.state) {
        button.state = state;
        this.drawButton(button, state);
      }
    }
    const fire = this.buttons.find((button) => button.element === 'fire');
    if (fire) {
      const seconds = snapshot.clockMs / 1000;
      fire.icon.setScale(fire.state === 'available' ? 1 + 0.06 * Math.sin(seconds * Math.PI * 2 * 1.2) : 1);
    }
  }

  private buttonState(element: Element, snapshot: SliceSnapshot): ButtonState {
    if (snapshot.world.selectedElements.includes(element)) return 'selected';
    return element === 'fire' ? 'available' : 'unavailable';
  }

  private drawButton(button: ElementButton, state: ButtonState): void {
    const size = LAYOUT.ui.buttonSize;
    const colors: Record<ButtonState, { fill: number; border: number }> = {
      available: { fill: 0xb95624, border: 0xffd18a },
      selected: { fill: 0x3a2a22, border: 0x7a5a44 },
      unavailable: { fill: 0x26323d, border: 0x465563 },
    };
    const style = colors[state];
    const index = ELEMENTS.indexOf(button.element);
    const cx = LAYOUT.ui.buttonCenterXs[index];
    const cy = LAYOUT.ui.buttonCenterY;
    button.background.clear();
    button.background.fillStyle(style.fill, 1);
    button.background.fillRoundedRect(cx - size / 2, cy - size / 2, size, size, 20);
    button.background.lineStyle(4, style.border, 1);
    button.background.strokeRoundedRect(cx - size / 2, cy - size / 2, size, size, 20);
    button.icon.setAlpha(state === 'available' ? 1 : 0.42);
    button.caption.setText(state === 'selected' ? '✓ 選択済み' : state === 'unavailable' ? '準備中' : '');
  }

  private createButtons(): void {
    this.add
      .rectangle(0, LAYOUT.ui.panelTop, DESIGN_WIDTH, DESIGN_HEIGHT - LAYOUT.ui.panelTop, 0x111b24)
      .setOrigin(0, 0)
      .setDepth(2000);
    ELEMENTS.forEach((element, index) => {
      const cx = LAYOUT.ui.buttonCenterXs[index];
      const cy = LAYOUT.ui.buttonCenterY;
      const size = LAYOUT.ui.buttonSize;
      const background = this.add.graphics().setDepth(2001);
      const icon = this.add
        .text(cx, cy - 10, ICONS[element], {
          fontFamily: FONT_FAMILY,
          fontSize: `${Math.round(size * 0.45)}px`,
        })
        .setOrigin(0.5)
        .setDepth(2002);
      const caption = this.add
        .text(cx, cy + size * 0.33, '', {
          fontFamily: FONT_FAMILY,
          fontSize: '20px',
          color: '#e8d9c4',
        })
        .setOrigin(0.5)
        .setDepth(2002);
      this.add
        .zone(cx, cy, size, size)
        .setInteractive()
        .setDepth(2003)
        .on('pointerdown', () => this.slice.selectElement(element));
      this.buttons.push({ element, background, icon, caption, state: null });
    });
  }

  private createHuman(): void {
    this.shadow = this.add.graphics();
    const initial = selectHumanAsset('cold', true);
    this.human = this.add
      .sprite(LAYOUT.humanStart.x, LAYOUT.humanStart.y, initial.textureKey)
      .setScale(HUMAN_SPRITE_SCALE);
    this.humanCold = this.add.graphics();
  }

  // A sprite standing on its ground anchor: the origin is the anchor as a
  // fraction of the PNG, so position and scale act on the ground contact point.
  private addGroundSprite(asset: WorldAsset, x: number, y: number): Phaser.GameObjects.Image {
    return this.add
      .image(x, y, asset.textureKey)
      .setOrigin(asset.groundAnchor.x / asset.width, asset.groundAnchor.y / asset.height)
      .setScale(asset.baseScale)
      .setDepth(y);
  }

  private createWorld(): void {
    const island = WORLD_ASSETS.island;
    // The island is the ground: always behind every depth-sorted prop.
    this.add
      .image(LAYOUT.island.x, LAYOUT.island.y, island.textureKey)
      .setOrigin(island.groundAnchor.x / island.width, island.groundAnchor.y / island.height)
      .setScale(island.baseScale)
      .setDepth(-1000);
    this.addGroundSprite(WORLD_ASSETS.shelter, LAYOUT.shelter.x, LAYOUT.shelter.y);
    this.animalShadow = this.add.graphics();
    this.animal = this.addGroundSprite(WORLD_ASSETS.animal, LAYOUT.animal.x, LAYOUT.animal.y);
    this.fireGlow = this.add.graphics().setDepth(LAYOUT.fire.y - 0.5);
    this.fireSprite = this.addGroundSprite(WORLD_ASSETS.fire, LAYOUT.fire.x, LAYOUT.fire.y)
      .setDepth(LAYOUT.fire.y + 1)
      .setVisible(false);
    this.fireSparks = this.add.graphics().setDepth(LAYOUT.fire.y + 1.5);
  }
}
