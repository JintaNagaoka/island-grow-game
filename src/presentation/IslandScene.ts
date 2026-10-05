import Phaser from 'phaser';
import { SliceGame, type SliceSnapshot } from '../game/sliceGame';
import { MAX_FRAME_DELTA_MS } from '../game/timing';
import { ELEMENTS, type Element } from '../game/worldState';
import { computeFireVisual, computeHumanPose } from './animation';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './display';
import { LAYOUT } from './layout';

export const ISLAND_SCENE_KEY = 'Island';

const ICONS: Record<Element, string> = { fire: '🔥', plant: '🌱', rock: '🪨', water: '💧' };
const FONT_FAMILY = 'sans-serif';

type ButtonState = 'available' | 'selected' | 'unavailable';

interface ElementButton {
  readonly element: Element;
  readonly background: Phaser.GameObjects.Graphics;
  readonly icon: Phaser.GameObjects.Text;
  readonly caption: Phaser.GameObjects.Text;
  state: ButtonState | null;
}

// Vertical Slice 01 screen. It owns no gameplay state: input is forwarded to
// SliceGame, and every frame is drawn from SliceGame.snapshot() through the
// pure functions in animation.ts. No tweens or timers are used, so playback
// speed is controlled solely by the logical clock in SliceGame.
export class IslandScene extends Phaser.Scene {
  private slice = new SliceGame();
  private buttons: ElementButton[] = [];
  private shadow!: Phaser.GameObjects.Graphics;
  private fireGraphics!: Phaser.GameObjects.Graphics;
  private human!: Phaser.GameObjects.Container;
  private head!: Phaser.GameObjects.Container;
  private leftArm!: Phaser.GameObjects.Graphics;
  private rightArm!: Phaser.GameObjects.Graphics;

  constructor() {
    super(ISLAND_SCENE_KEY);
  }

  create(): void {
    this.slice = new SliceGame();
    this.buttons = [];
    this.drawScenery();
    this.createHuman();
    this.fireGraphics = this.add.graphics();
    this.createButtons();
    this.render(this.slice.snapshot());
  }

  update(_time: number, delta: number): void {
    const frameDelta = Number.isFinite(delta) && delta > 0 ? Math.min(delta, MAX_FRAME_DELTA_MS) : 0;
    this.slice.advance(frameDelta);
    this.render(this.slice.snapshot());
  }

  // ---- rendering from snapshot ------------------------------------------

  private render(snapshot: SliceSnapshot): void {
    this.renderHuman(snapshot);
    this.renderFire(snapshot);
    this.renderButtons(snapshot);
  }

  private renderHuman(snapshot: SliceSnapshot): void {
    const pose = computeHumanPose(snapshot);
    this.human.setPosition(pose.x, pose.y - pose.lift);
    this.human.setScale(pose.scaleX, pose.scaleY);
    this.human.setRotation(pose.lean);
    this.head.setRotation(pose.headTilt);
    this.leftArm.setRotation(-pose.armRaise * 1.9);
    this.rightArm.setRotation(-pose.armRaise * 1.9);

    const shadowScale = 1 - Math.min(0.4, pose.lift / 40);
    this.shadow.clear();
    this.shadow.fillStyle(0x000000, 0.22 * shadowScale);
    this.shadow.fillEllipse(pose.x, pose.y + 2, 48 * shadowScale, 14 * shadowScale);
  }

  private renderFire(snapshot: SliceSnapshot): void {
    const g = this.fireGraphics;
    g.clear();
    const fire = computeFireVisual(snapshot);
    if (!fire.visible) return;

    const { x, y } = LAYOUT.fire;
    const s = fire.scale;

    // Warm light on the ground.
    g.fillStyle(0xffa640, 0.16);
    g.fillEllipse(x, y + 4, 190 * s, 70 * s);
    g.fillStyle(0xffc060, 0.14);
    g.fillEllipse(x, y + 4, 120 * s, 44 * s);

    // Stone ring and logs.
    g.fillStyle(0x8a8f96, 1);
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * Math.PI * 2;
      g.fillCircle(x + Math.cos(a) * 26, y + 2 + Math.sin(a) * 9, 6);
    }
    g.fillStyle(0x6b4423, 1);
    g.fillEllipse(x - 6, y + 2, 34, 9);
    g.fillEllipse(x + 6, y + 4, 34, 9);

    // Flame: outer, mid, and core.
    g.fillStyle(0xe8541c, 1);
    g.fillTriangle(x - 20 * s, y, x + 20 * s, y, x, y - 64 * s);
    g.fillEllipse(x, y - 8 * s, 40 * s, 26 * s);
    g.fillStyle(0xffa63a, 1);
    g.fillTriangle(x - 13 * s, y - 2 * s, x + 13 * s, y - 2 * s, x + 1 * s, y - 46 * s);
    g.fillEllipse(x, y - 8 * s, 26 * s, 18 * s);
    g.fillStyle(0xffe07a, 1);
    g.fillTriangle(x - 7 * s, y - 3 * s, x + 7 * s, y - 3 * s, x, y - 26 * s);

    // One-shot spark burst on appearance.
    if (fire.burst !== null && fire.burst < 0.8) {
      const t = fire.burst / 0.8;
      const radius = (1 - (1 - t) ** 3) * 70;
      g.fillStyle(0xffd35c, 1 - t);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        g.fillCircle(x + Math.cos(a) * radius, y - 20 + Math.sin(a) * radius * 0.7, 4 * (1 - t) + 1);
      }
    }

    // Idle embers rising from the fire.
    for (let i = 0; i < 3; i += 1) {
      const t = (fire.seconds * 0.5 + i / 3) % 1;
      g.fillStyle(0xffc860, (1 - t) * 0.9);
      g.fillCircle(x + Math.sin(fire.seconds * 3 + i * 2.1) * 10 * s, y - 40 * s - t * 50, 2.5);
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
    // Gentle cue on the one available button, driven by the logical clock.
    const fire = this.buttons.find((b) => b.element === 'fire');
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
    const colors: Record<ButtonState, { fill: number; border: number; alpha: number }> = {
      available: { fill: 0xc2561f, border: 0xffd18a, alpha: 1 },
      selected: { fill: 0x3a2a22, border: 0x7a5a44, alpha: 1 },
      unavailable: { fill: 0x2a3340, border: 0x46505e, alpha: 1 },
    };
    const style = colors[state];
    const index = ELEMENTS.indexOf(button.element);
    const cx = LAYOUT.ui.buttonCenterXs[index];
    const cy = LAYOUT.ui.buttonCenterY;

    button.background.clear();
    button.background.fillStyle(style.fill, style.alpha);
    button.background.fillRoundedRect(cx - size / 2, cy - size / 2, size, size, 22);
    button.background.lineStyle(4, style.border, 1);
    button.background.strokeRoundedRect(cx - size / 2, cy - size / 2, size, size, 22);

    button.icon.setAlpha(state === 'available' ? 1 : 0.4);
    button.caption.setText(
      state === 'selected' ? '✓ 選択済み' : state === 'unavailable' ? '準備中' : '',
    );
  }

  // ---- construction ------------------------------------------------------

  private createButtons(): void {
    this.add
      .rectangle(0, LAYOUT.ui.panelTop, DESIGN_WIDTH, DESIGN_HEIGHT - LAYOUT.ui.panelTop, 0x141c26)
      .setOrigin(0, 0);

    ELEMENTS.forEach((element, index) => {
      const cx = LAYOUT.ui.buttonCenterXs[index];
      const cy = LAYOUT.ui.buttonCenterY;
      const size = LAYOUT.ui.buttonSize;

      const background = this.add.graphics();
      const icon = this.add
        .text(cx, cy - 10, ICONS[element], { fontFamily: FONT_FAMILY, fontSize: `${Math.round(size * 0.45)}px` })
        .setOrigin(0.5);
      const caption = this.add
        .text(cx, cy + size * 0.33, '', { fontFamily: FONT_FAMILY, fontSize: '20px', color: '#e8d9c4' })
        .setOrigin(0.5);

      const zone = this.add.zone(cx, cy, size, size).setInteractive();
      zone.on('pointerdown', () => {
        // The result only matters to game logic; the screen redraws from state.
        this.slice.selectElement(element);
      });

      this.buttons.push({ element, background, icon, caption, state: null });
    });
  }

  private createHuman(): void {
    this.shadow = this.add.graphics();

    const body = this.add.graphics();
    body.fillStyle(0xc9885a, 1);
    body.fillEllipse(0, -26, 42, 50);
    body.fillStyle(0xb2744a, 1);
    body.fillEllipse(0, -14, 34, 22);

    this.leftArm = this.add.graphics();
    this.rightArm = this.add.graphics();
    for (const arm of [this.leftArm, this.rightArm]) {
      arm.fillStyle(0xf0c9a0, 1);
      arm.fillEllipse(0, 12, 12, 28);
    }
    this.leftArm.setPosition(-20, -38);
    this.rightArm.setPosition(20, -38);

    // Faceless round head, pivoting at the neck.
    const headShape = this.add.graphics();
    headShape.fillStyle(0xf0c9a0, 1);
    headShape.fillCircle(0, -15, 18);
    headShape.fillStyle(0x5a3a26, 1);
    headShape.fillEllipse(0, -26, 34, 15);
    this.head = this.add.container(0, -46, [headShape]);

    this.human = this.add.container(LAYOUT.humanStart.x, LAYOUT.humanStart.y, [
      this.leftArm,
      body,
      this.rightArm,
      this.head,
    ]);
  }

  private drawScenery(): void {
    const g = this.add.graphics();
    const { island, rock, cave, shelter } = LAYOUT;

    // Sea.
    g.fillStyle(0x2f6f8f, 1);
    g.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    g.fillStyle(0x3a82a3, 1);
    g.fillEllipse(island.x, island.y + island.depth, island.rx * 2.25, island.ry * 2.5);

    // Island cliff, then grass top.
    g.fillStyle(0x7a5a3a, 1);
    g.fillEllipse(island.x, island.y + island.depth, island.rx * 2, island.ry * 2);
    g.fillStyle(0x6fae4f, 1);
    g.fillEllipse(island.x, island.y, island.rx * 2, island.ry * 2);
    g.fillStyle(0x7fbd5c, 1);
    g.fillEllipse(island.x, island.y + island.ry * 0.12, island.rx * 1.7, island.ry * 1.55);

    // Rocky hill and an ordinary cave opening.
    g.fillStyle(0x7d8288, 1);
    g.fillTriangle(
      rock.x - rock.width / 2,
      rock.baseY,
      rock.x + rock.width / 2,
      rock.baseY,
      rock.x - rock.width * 0.05,
      rock.baseY - rock.height,
    );
    g.fillStyle(0x969ba1, 1);
    g.fillTriangle(
      rock.x - rock.width * 0.1,
      rock.baseY,
      rock.x + rock.width / 2,
      rock.baseY,
      rock.x + rock.width * 0.12,
      rock.baseY - rock.height * 0.75,
    );
    g.fillStyle(0x2b2e33, 1);
    g.fillEllipse(cave.x, cave.y, cave.width, cave.height);

    // Trees.
    for (const tree of LAYOUT.trees) {
      g.fillStyle(0x6b4a2b, 1);
      g.fillRect(tree.x - 7 * tree.scale, tree.y - 30 * tree.scale, 14 * tree.scale, 32 * tree.scale);
      g.fillStyle(0x2f7a3c, 1);
      g.fillCircle(tree.x, tree.y - 52 * tree.scale, 32 * tree.scale);
      g.fillStyle(0x3a9148, 1);
      g.fillCircle(tree.x - 10 * tree.scale, tree.y - 60 * tree.scale, 20 * tree.scale);
    }

    // Animals: a sheep and a deer, very simple.
    for (const animal of LAYOUT.animals) {
      const { x, y } = animal;
      if (animal.kind === 'sheep') {
        g.fillStyle(0xf2f2ec, 1);
        g.fillCircle(x, y - 14, 15);
        g.fillCircle(x - 12, y - 12, 11);
        g.fillCircle(x + 12, y - 12, 11);
        g.fillStyle(0x4a4a4a, 1);
        g.fillCircle(x + 20, y - 18, 8);
        g.fillRect(x - 10, y - 2, 4, 10);
        g.fillRect(x + 6, y - 2, 4, 10);
      } else {
        g.fillStyle(0xb98a58, 1);
        g.fillEllipse(x, y - 16, 36, 20);
        g.fillRect(x - 12, y - 8, 4, 14);
        g.fillRect(x + 8, y - 8, 4, 14);
        g.fillRect(x - 20, y - 38, 6, 24);
        g.fillCircle(x - 20, y - 40, 8);
        g.fillStyle(0x8a6238, 1);
        g.fillTriangle(x - 24, y - 46, x - 20, y - 56, x - 17, y - 46);
      }
    }

    // Crude rain shelter: two posts and a slanted roof.
    g.fillStyle(0x5a3d22, 1);
    g.fillRect(shelter.x - shelter.width / 2, shelter.y - shelter.height, 6, shelter.height);
    g.fillRect(shelter.x + shelter.width / 2 - 6, shelter.y - shelter.height * 0.65, 6, shelter.height * 0.65);
    g.fillStyle(0xa98255, 1);
    g.fillTriangle(
      shelter.x - shelter.width / 2 - 8,
      shelter.y - shelter.height + 4,
      shelter.x + shelter.width / 2 + 8,
      shelter.y - shelter.height * 0.65 + 4,
      shelter.x - shelter.width / 2 - 8,
      shelter.y - shelter.height * 0.65 + 4,
    );
    g.fillStyle(0x8a6a42, 1);
    g.fillEllipse(shelter.x, shelter.y + 2, shelter.width * 0.9, 12);
  }
}
