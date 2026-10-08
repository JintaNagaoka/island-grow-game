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
import { LAYOUT, type AnimalKind, type TierId } from './layout';

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
  private trees: Phaser.GameObjects.Container[] = [];
  private animals: Phaser.GameObjects.Container[] = [];
  private shadow!: Phaser.GameObjects.Graphics;
  private fireGraphics!: Phaser.GameObjects.Graphics;
  // The single human renderer: one Sprite for every pose and walk frame.
  private human!: Phaser.GameObjects.Sprite;
  private humanCold!: Phaser.GameObjects.Graphics;

  constructor() {
    super(ISLAND_SCENE_KEY);
  }

  preload(): void {
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
    this.trees = [];
    this.animals = [];
    this.drawTerrainAndProps();
    this.createLivingScenery();
    this.createHuman();
    this.fireGraphics = this.add.graphics().setDepth(LAYOUT.fire.y + 1);
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
    const motion = computeEnvironmentMotion(snapshot);
    this.trees.forEach((tree, index) => tree.setRotation(motion.treeSways[index] ?? 0));
    this.animals.forEach((animal, index) => {
      const home = LAYOUT.animals[index];
      const offset = motion.animalOffsets[index];
      animal.setPosition(home.x + offset.x, home.y + offset.y);
      animal.setRotation(offset.turn * 0.025);
    });
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

  private renderFire(snapshot: SliceSnapshot): void {
    const g = this.fireGraphics;
    g.clear();
    const fire = computeFireVisual(snapshot);
    if (!fire.visible) return;
    const { x, y } = LAYOUT.fire;
    const s = fire.scale;

    g.fillStyle(0xffbd55, 0.13);
    g.fillEllipse(x, y + 4, 116 * s, 35 * s);
    g.fillStyle(0x777b80, 1);
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2;
      g.fillCircle(x + Math.cos(angle) * 19, y + Math.sin(angle) * 6, 4.5);
    }
    g.fillStyle(0x704423, 1);
    g.fillRoundedRect(x - 19, y - 2, 38, 6, 3);
    g.fillStyle(0xe85620, 1);
    g.fillTriangle(x - 13 * s, y, x + 13 * s, y, x, y - 43 * s);
    g.fillEllipse(x, y - 6 * s, 27 * s, 18 * s);
    g.fillStyle(0xffb43c, 1);
    g.fillTriangle(x - 7 * s, y - 1, x + 7 * s, y - 1, x + 2 * s, y - 28 * s);

    if (fire.burst !== null && fire.burst < 0.8) {
      const t = fire.burst / 0.8;
      const radius = (1 - (1 - t) ** 3) * 48;
      g.fillStyle(0xffd35c, 1 - t);
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        g.fillCircle(x + Math.cos(angle) * radius, y - 16 + Math.sin(angle) * radius * 0.55, 3);
      }
    }

    for (let i = 0; i < 3; i += 1) {
      const t = (fire.seconds * 0.55 + i / 3) % 1;
      g.fillStyle(0xffc860, (1 - t) * 0.85);
      g.fillCircle(x + Math.sin(fire.seconds * 3 + i * 2.1) * 7 * s, y - 28 * s - t * 38, 2);
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

  private drawTerrainAndProps(): void {
    const g = this.add.graphics();
    g.fillStyle(0x397b99, 1);
    g.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    g.fillStyle(0x4a91aa, 0.7);
    g.fillEllipse(DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.61, DESIGN_WIDTH * 1.03, DESIGN_HEIGHT * 0.39);

    const colors: Record<TierId, { cliff: number; top: number; edge: number }> = {
      base: { cliff: 0x765039, top: 0x72a958, edge: 0x91c56c },
      terrace: { cliff: 0x806044, top: 0x7fb762, edge: 0x9bcb78 },
      plateau: { cliff: 0x676b69, top: 0x858b86, edge: 0xa0a6a0 },
    };
    for (const tier of LAYOUT.terrain) {
      const palette = colors[tier.id];
      const surface = tier.surface.map((point) => new Phaser.Math.Vector2(point.x, point.y));
      const lower = tier.surface.map(
        (point) => new Phaser.Math.Vector2(point.x, point.y + tier.cliff),
      );
      g.fillStyle(palette.cliff, 1);
      g.fillPoints(lower, true);
      g.fillStyle(palette.top, 1);
      g.fillPoints(surface, true);
      g.lineStyle(3, palette.edge, 0.7);
      g.strokePoints(surface, true);
    }

    const caveY = LAYOUT.cave.baseY - LAYOUT.cave.height * 0.38;
    g.fillStyle(0x303432, 1);
    g.fillEllipse(LAYOUT.cave.x, caveY, LAYOUT.cave.width, LAYOUT.cave.height);
    g.fillStyle(0x1f2423, 1);
    g.fillEllipse(LAYOUT.cave.x, caveY + 5, LAYOUT.cave.width * 0.72, LAYOUT.cave.height * 0.72);

    for (const rock of LAYOUT.boulders) {
      g.fillStyle(0x6c716d, 1);
      g.fillTriangle(
        rock.x - 19 * rock.size,
        rock.y,
        rock.x + 19 * rock.size,
        rock.y,
        rock.x + 3 * rock.size,
        rock.y - 27 * rock.size,
      );
      g.fillStyle(0x999f99, 0.65);
      g.fillTriangle(
        rock.x - 8 * rock.size,
        rock.y - 4,
        rock.x + 3 * rock.size,
        rock.y - 27 * rock.size,
        rock.x + 12 * rock.size,
        rock.y - 2,
      );
    }

    const shelter = LAYOUT.shelter;
    g.fillStyle(0x5a3d22, 1);
    g.fillRoundedRect(shelter.x - shelter.width / 2, shelter.y - shelter.height, 7, shelter.height, 3);
    g.fillRoundedRect(shelter.x + shelter.width / 2 - 7, shelter.y - shelter.height * 0.72, 7, shelter.height * 0.72, 3);
    g.fillStyle(0xb08a59, 1);
    g.fillTriangle(
      shelter.x - shelter.width / 2 - 9,
      shelter.y - shelter.height + 2,
      shelter.x + shelter.width / 2 + 9,
      shelter.y - shelter.height * 0.72 + 2,
      shelter.x - shelter.width / 2 - 9,
      shelter.y - shelter.height * 0.7,
    );
    g.fillStyle(0x3e6b3b, 0.35);
    for (const space of LAYOUT.growthSpaces) {
      g.fillRoundedRect(space.left, space.top, space.right - space.left, space.bottom - space.top, 12);
    }
  }

  private createLivingScenery(): void {
    [...LAYOUT.trees, ...LAYOUT.foreground].forEach((tree) => {
      this.trees.push(this.createTree(tree.x, tree.y, tree.scale));
    });
    LAYOUT.animals.forEach((animal) => {
      this.animals.push(this.createAnimal(animal.x, animal.y, animal.kind));
    });
  }

  private createTree(x: number, y: number, scale: number): Phaser.GameObjects.Container {
    const shadow = this.add.graphics();
    shadow.fillStyle(0x26472f, 0.28);
    shadow.fillEllipse(5, 1, 42, 11);
    const shape = this.add.graphics();
    shape.fillStyle(0x65472c, 1);
    shape.fillRoundedRect(-5, -38, 10, 39, 4);
    shape.fillStyle(0x2f7541, 1);
    shape.fillCircle(0, -52, 26);
    shape.fillStyle(0x489255, 1);
    shape.fillCircle(-10, -61, 15);
    shape.fillCircle(13, -55, 13);
    return this.add.container(x, y, [shadow, shape]).setScale(scale).setDepth(y);
  }

  private createAnimal(x: number, y: number, kind: AnimalKind): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(0x24402a, 0.22);
    g.fillEllipse(0, 2, 34, 8);
    if (kind === 'sheep') {
      g.fillStyle(0xf0eee3, 1);
      g.fillCircle(-7, -15, 11);
      g.fillCircle(5, -15, 12);
      g.fillStyle(0x55504a, 1);
      g.fillCircle(15, -17, 6);
    } else {
      g.fillStyle(0xb77e4e, 1);
      g.fillEllipse(0, -15, 30, 15);
      g.fillCircle(15, -25, 6);
    }
    g.fillStyle(kind === 'sheep' ? 0x55504a : 0x805532, 1);
    g.fillRoundedRect(-9, -8, 3, 11, 1);
    g.fillRoundedRect(6, -8, 3, 11, 1);
    return this.add.container(x, y, [g]).setDepth(y);
  }
}
