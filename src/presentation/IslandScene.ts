import Phaser from 'phaser';
import { SliceGame, type SliceSnapshot } from '../game/sliceGame';
import { MAX_FRAME_DELTA_MS } from '../game/timing';
import { ELEMENTS, type Element } from '../game/worldState';
import {
  computeEnvironmentMotion,
  computeFireVisual,
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
  HUMAN_SPRITE_SCALE,
  HUMAN_WALK_ASSET_LIST,
  selectHumanAsset,
} from './humanAssets';
import { HUMAN_WALK_ANIMATIONS, planHumanAnimation } from './humanWalk';
import { LAYOUT } from './layout';
import {
  computeAnimalVisual,
  computeCookingFireVisual,
  computeFarmTiles,
  computeFarmVisual,
  computeShelterVisual,
} from './lifeAnimation';
import { computeResidentVisuals, computeSplitEffect, type ResidentVisual } from './residents';
import {
  ANIMAL_EAT_FRAMES,
  COOK_STEAM_FRAMES,
  FARM_PLOT_TILE,
  FARM_WATER_FRAME,
  HUT_ASSET,
  TURN2_ASSET_LIST,
} from './turn2Assets';
import { computeTurn3Action, computeTurn3Props } from './turn3Animation';
import {
  TURN3_ACTION_FRAMES,
  TURN3_ASSET_LIST,
  TURN3_WORLD_ASSETS,
  type Turn3Asset,
} from './turn3Assets';
import {
  FIRE_ASSET,
  FIRE_FRAMES,
  WORLD_ASSETS,
  WORLD_ASSET_DIR,
  WORLD_ASSET_LIST,
  WORLD_WATER_COLOR,
  groundOrigin,
  type WorldAsset,
} from './worldAssets';

export const ISLAND_SCENE_KEY = 'Island';

const ICONS: Record<Element, string> = { fire: '🔥', plant: '🌱', rock: '🪨', water: '💧' };
const FONT_FAMILY = 'sans-serif';
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

interface ResidentView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Graphics;
  readonly cold: Phaser.GameObjects.Graphics;
}

type Turn3WorldKey = keyof typeof TURN3_WORLD_ASSETS;

// Fixed-camera miniature presentation. Gameplay lives entirely in SliceGame;
// this scene turns snapshots into toy-like shapes and clock-driven movement.
export class IslandScene extends Phaser.Scene {
  private slice = new SliceGame();
  private buttons: ElementButton[] = [];
  // World art: the baked island (terrain, cave, rocks, one landscape tree) and
  // three ground-anchored props. Rendering only; none of it owns game state.
  private animal!: Phaser.GameObjects.Image;
  // Turn 2 (🌱) props. Each is shown or hidden from computeXxxVisual(); none owns state.
  private shelter!: Phaser.GameObjects.Image;
  private hut!: Phaser.GameObjects.Image;
  private shelterGlow!: Phaser.GameObjects.Graphics;
  private shelterSparkles!: Phaser.GameObjects.Graphics;
  private farm!: Phaser.GameObjects.Image;
  // The standalone plot tiles of the expanded farm, in LAYOUT.farmPlotTiles order.
  private farmTiles: Phaser.GameObjects.Image[] = [];
  // The campfire levelled up: replaces fireSprite at the same ground point.
  private cookingFire!: Phaser.GameObjects.Image;
  private cookingGlow!: Phaser.GameObjects.Graphics;
  private cookingSparkles!: Phaser.GameObjects.Graphics;
  // The animal levelled up: replaces `animal` at the same ground point.
  private animalEat!: Phaser.GameObjects.Image;
  private animalGlow!: Phaser.GameObjects.Graphics;
  private animalSparkles!: Phaser.GameObjects.Graphics;
  private animalShadow!: Phaser.GameObjects.Graphics;
  private fireSprite!: Phaser.GameObjects.Image;
  private fireGlow!: Phaser.GameObjects.Graphics;
  private fireSparks!: Phaser.GameObjects.Graphics;
  // One view per resident id: a Sprite for every pose and walk frame. Views are
  // created on first sight of an id in the snapshot; the Scene never decides who exists.
  private residentViews = new Map<string, ResidentView>();
  private splitGlow!: Phaser.GameObjects.Graphics;
  private splitSparkles!: Phaser.GameObjects.Graphics;
  private turn3Props = new Map<Turn3WorldKey, Phaser.GameObjects.Image>();
  private turn3Action!: Phaser.GameObjects.Image;

  constructor() {
    super(ISLAND_SCENE_KEY);
  }

  preload(): void {
    for (const asset of WORLD_ASSET_LIST) {
      this.load.image(asset.textureKey, `${WORLD_ASSET_DIR}${asset.filename}`);
    }
    for (const asset of TURN2_ASSET_LIST) {
      this.load.image(asset.textureKey, `${asset.dir}${asset.filename}`);
    }
    for (const asset of TURN3_ASSET_LIST) {
      this.load.image(asset.textureKey, `${asset.dir}${asset.filename}`);
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
    this.residentViews = new Map();
    this.splitGlow = this.add.graphics().setDepth(LAYOUT.humanWarm.y - 0.4);
    this.splitSparkles = this.add.graphics().setDepth(LAYOUT.humanWarm.y + 4);
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
    this.renderShelter(snapshot);
    this.renderHuman(snapshot);
    this.renderFarm(snapshot);
    this.renderFarmTiles(snapshot);
    this.renderCookingFire(snapshot);
    this.renderFire(snapshot);
    this.renderTurn3(snapshot);
    this.renderButtons(snapshot);
  }

  private renderTurn3(snapshot: SliceSnapshot): void {
    const visuals = computeTurn3Props(snapshot);
    for (const [key, visual] of Object.entries(visuals) as [Turn3WorldKey, { alpha: number; scale: number }][]) {
      const sprite = this.turn3Props.get(key);
      if (!sprite) throw new Error(`missing Turn 3 sprite: ${key}`);
      const asset = TURN3_WORLD_ASSETS[key];
      sprite
        .setVisible(visual.alpha > 0)
        .setAlpha(visual.alpha)
        .setScale(asset.baseScale * visual.scale);
    }

    const action = computeTurn3Action(snapshot);
    if (action === null) {
      this.turn3Action.setVisible(false);
      return;
    }
    if (this.turn3Action.texture.key !== action.frame.textureKey) {
      this.turn3Action.setTexture(action.frame.textureKey);
    }
    this.turn3Action
      .setOrigin(...this.assetOriginTuple(action.frame))
      .setScale(action.frame.baseScale)
      .setPosition(LAYOUT.turn3Actions[action.action].x, LAYOUT.turn3Actions[action.action].y)
      .setDepth(LAYOUT.turn3Actions[action.action].y + 1)
      .setAlpha(action.alpha)
      .setVisible(action.alpha > 0);
  }

  // One animal, one ground point: the wild art levels up into the eating art by a
  // clock-derived cross-fade/swell under a short glow; they are never two animals.
  private renderEnvironment(snapshot: SliceSnapshot): void {
    const visual = computeAnimalVisual(snapshot);
    const drift = computeEnvironmentMotion(snapshot).animalOffset;
    const wildGround = { x: LAYOUT.animal.x + drift.x, y: LAYOUT.animal.y + drift.y };
    this.animal
      .setVisible(visual.wildAlpha > 0)
      .setAlpha(visual.wildAlpha)
      .setScale(WORLD_ASSETS.animal.baseScale * visual.wildScale)
      .setPosition(wildGround.x, wildGround.y)
      .setRotation(drift.turn * 0.025)
      .setDepth(wildGround.y);

    const frame = ANIMAL_EAT_FRAMES[visual.frame];
    const origin = groundOrigin(frame);
    if (this.animalEat.texture.key !== visual.frameTextureKey) this.animalEat.setTexture(visual.frameTextureKey);
    this.animalEat
      .setVisible(visual.eatAlpha > 0)
      .setAlpha(visual.eatAlpha)
      .setOrigin(origin.x, origin.y)
      .setScale(frame.baseScale * visual.eatScale)
      .setPosition(LAYOUT.animal.x, LAYOUT.animal.y)
      .setDepth(LAYOUT.animal.y + 0.1);

    // Shadow follows whichever art is mostly showing (0.71x as wide, 0.126x as tall as the sprite is wide).
    const eating = visual.eatAlpha >= 0.5;
    this.drawAnimalShadow(
      eating ? LAYOUT.animal : wildGround,
      eating
        ? frame.width * frame.baseScale * 0.55
        : WORLD_ASSETS.animal.width * WORLD_ASSETS.animal.baseScale * 0.71,
    );
    this.drawLevelUp(
      this.animalGlow,
      this.animalSparkles,
      LAYOUT.animal,
      WORLD_ASSETS.animal.width * WORLD_ASSETS.animal.baseScale,
      visual.glow,
      visual.sparkle,
    );
  }

  private drawAnimalShadow(ground: { x: number; y: number }, width: number): void {
    this.animalShadow.clear();
    this.animalShadow.fillStyle(0x183321, 0.24);
    this.animalShadow.fillEllipse(ground.x + 2, ground.y + 1, width, (width / 0.71) * 0.126);
    this.animalShadow.setDepth(ground.y - 0.5);
  }

  // The shared level-up accent: a soft warm glow behind the object and a few
  // sparkles rising from it, from the Wave's logical progress alone.
  private drawLevelUp(
    glow: Phaser.GameObjects.Graphics,
    sparkles: Phaser.GameObjects.Graphics,
    ground: { x: number; y: number },
    width: number,
    glowStrength: number,
    sparkle: number | null,
  ): void {
    glow.clear();
    sparkles.clear();
    if (sparkle === null) return;
    const { x, y } = ground;
    glow.fillStyle(0xfff0a0, 0.3 * glowStrength);
    glow.fillEllipse(x, y - 28, width * 1.15, width * 0.62);
    glow.fillStyle(0xffe27a, 0.22 * glowStrength);
    glow.fillEllipse(x, y - 4, width * 0.95, width * 0.2);
    for (let i = 0; i < 7; i += 1) {
      const t = (sparkle * 1.3 + i / 7) % 1;
      sparkles.fillStyle(0xfff3b0, (1 - t) * 0.9 * glowStrength);
      sparkles.fillCircle(x + ((i - 3) / 3) * width * 0.42, y - 10 - t * 70, 2.2);
    }
  }

  // The rain shelter levels up into the hut: both stand on the same ground
  // point; the hut rises out of the shelter under a short warm glow.
  private renderShelter(snapshot: SliceSnapshot): void {
    const visual = computeShelterVisual(snapshot);
    this.shelter
      .setAlpha(visual.shelterAlpha)
      .setVisible(visual.shelterAlpha > 0)
      .setScale(WORLD_ASSETS.shelter.baseScale * visual.shelterScale);
    this.hut
      .setAlpha(visual.hutAlpha)
      .setVisible(visual.hutAlpha > 0)
      .setScale(HUT_ASSET.baseScale * visual.hutScale);
    this.drawLevelUp(
      this.shelterGlow,
      this.shelterSparkles,
      LAYOUT.hut,
      HUT_ASSET.width * HUT_ASSET.baseScale,
      visual.glow,
      visual.sparkle,
    );
  }

  // The composite farm-work art (human + sprout plot) stands on the plot's ground
  // point; its frame comes from the logical clock, never from animation callbacks.
  private renderFarm(snapshot: SliceSnapshot): void {
    const farm = computeFarmVisual(snapshot);
    this.farm.setVisible(farm.frame !== null && farm.alpha > 0);
    if (farm.frame === null) return;
    const origin = groundOrigin(farm.frame);
    if (this.farm.texture.key !== farm.frame.textureKey) this.farm.setTexture(farm.frame.textureKey);
    this.farm
      .setOrigin(origin.x, origin.y)
      .setPosition(LAYOUT.plot.x, LAYOUT.plot.y)
      .setScale(farm.frame.baseScale * farm.scale)
      .setAlpha(farm.alpha)
      .setDepth(LAYOUT.plot.y + 2);
  }

  // Each tile grows in (scale and alpha) from its own ground point, from the logical
  // clock alone; once the farm has expanded they all simply stay.
  private renderFarmTiles(snapshot: SliceSnapshot): void {
    computeFarmTiles(snapshot).forEach((tile, index) => {
      this.farmTiles[index]
        .setVisible(tile.alpha > 0)
        .setAlpha(tile.alpha)
        .setScale(FARM_PLOT_TILE.baseScale * tile.scale);
    });
  }

  // The campfire levels up into the cooking fire at the campfire's ground point.
  // The campfire art fades out in renderFire() while this grows in, so the two are
  // never shown as independent fires.
  private renderCookingFire(snapshot: SliceSnapshot): void {
    const cook = computeCookingFireVisual(snapshot);
    this.cookingFire.setVisible(cook.visible).setAlpha(cook.alpha);
    if (cook.visible) {
      if (this.cookingFire.texture.key !== cook.frameTextureKey) this.cookingFire.setTexture(cook.frameTextureKey);
      const frame = COOK_STEAM_FRAMES[cook.frame];
      const origin = groundOrigin(frame);
      this.cookingFire.setOrigin(origin.x, origin.y).setScale(frame.baseScale * cook.scale);
    }
    this.drawLevelUp(
      this.cookingGlow,
      this.cookingSparkles,
      LAYOUT.cookingFire,
      FIRE_ASSET.width * FIRE_ASSET.baseScale,
      cook.glow,
      cook.sparkle,
    );
  }

  private renderHuman(snapshot: SliceSnapshot): void {
    if (WALK_PREVIEW_ENABLED) {
      const [first] = computeResidentVisuals(snapshot);
      const pose = computeWalkPreviewPose(snapshot.clockMs, snapshot.world.isCold);
      this.renderResident(first.id, { ...first, pose, alpha: 1, scale: 1, shakeX: 0 });
      return;
    }
    for (const visual of computeResidentVisuals(snapshot)) {
      this.renderResident(visual.id, visual);
    }
    const split = computeSplitEffect(snapshot);
    this.drawLevelUp(
      this.splitGlow,
      this.splitSparkles,
      split?.ground ?? LAYOUT.humanWarm,
      HUMAN_FRAME_SIZE * HUMAN_SPRITE_SCALE * 0.6,
      split?.glow ?? 0,
      split?.sparkle ?? null,
    );
  }

  private residentView(id: string): ResidentView {
    let view = this.residentViews.get(id);
    if (view === undefined) {
      const shadow = this.add.graphics();
      const initial = selectHumanAsset('cold', true);
      const sprite = this.add
        .sprite(LAYOUT.humanStart.x, LAYOUT.humanStart.y, initial.textureKey)
        .setScale(HUMAN_SPRITE_SCALE);
      view = { sprite, shadow, cold: this.add.graphics() };
      this.residentViews.set(id, view);
    }
    return view;
  }

  private renderResident(id: string, visual: ResidentVisual): void {
    const view = this.residentView(id);
    const { pose, alpha } = visual;
    const x = pose.x + visual.shakeX;
    view.sprite.setAlpha(alpha).setVisible(alpha > 0);
    view.sprite.setPosition(x, pose.y - pose.lift);
    view.sprite.setOrigin(pose.originX, pose.originY);
    this.applyHumanFrame(view.sprite, pose);
    view.sprite.setScale(pose.facing * HUMAN_SPRITE_SCALE * visual.scale, HUMAN_SPRITE_SCALE * visual.scale);
    view.sprite.setDepth(pose.y + 2);
    this.renderHumanCold(view.cold, pose);

    const shadowScale = (1 - Math.min(0.32, pose.lift / 28)) * visual.scale;
    view.shadow.clear();
    view.shadow.fillStyle(0x183321, 0.28 * shadowScale * alpha);
    view.shadow.fillEllipse(x, pose.y + 2, 34 * shadowScale, 8 * shadowScale);
    view.shadow.setDepth(pose.y);
  }

  // Walk poses play the per-direction Phaser animation; planHumanAnimation()
  // decides when to start (key change only), pin, or stop it. Phaser's own timer
  // is not trusted: after starting, the current frame is pinned to the one the
  // logical clock selects, so playback speed and frame-time hiccups cannot
  // desynchronize it, and no rule ever waits on animation completion. Any
  // non-walk pose stops the animation, so nothing keeps walking after arrival.
  private applyHumanFrame(sprite: Phaser.GameObjects.Sprite, pose: HumanPose): void {
    const anims = sprite.anims;
    const playingKey = anims.isPlaying ? (anims.currentAnim?.key ?? null) : null;
    const command = planHumanAnimation(playingKey, pose.walk);
    if (command.type === 'start') {
      sprite.play(command.key, true);
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
    if (sprite.texture.key !== pose.asset) sprite.setTexture(pose.asset);
  }

  // Draws the cold marks over a walk frame, in the sprite's own source-pixel
  // space so they track the frame's origin and the shared sprite scale.
  private renderHumanCold(g: Phaser.GameObjects.Graphics, pose: HumanPose): void {
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
    // Texture swap only: every frame has the same size, anchor and scale, so the
    // stones and contact point never move.
    this.fireSprite
      .setTexture(FIRE_FRAMES[fire.frame].textureKey)
      .setScale(FIRE_ASSET.baseScale * s)
      .setAlpha(fire.alpha);

    glow.fillStyle(0xffbd55, 0.16 * fire.alpha);
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
      sparks.fillStyle(0xffc860, (1 - t) * 0.85 * fire.alpha);
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
    // The one available element breathes gently to invite the next tap.
    const seconds = snapshot.clockMs / 1000;
    for (const button of this.buttons) {
      button.icon.setScale(button.state === 'available' ? 1 + 0.06 * Math.sin(seconds * Math.PI * 2 * 1.2) : 1);
    }
  }

  private buttonState(element: Element, snapshot: SliceSnapshot): ButtonState {
    if (snapshot.world.selectedElements.includes(element)) return 'selected';
    return snapshot.selectableElements.includes(element) ? 'available' : 'unavailable';
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

  // A sprite standing on its ground anchor: the origin is the anchor as a
  // fraction of the PNG, so position and scale act on the ground contact point.
  private addGroundSprite(asset: WorldAsset, x: number, y: number): Phaser.GameObjects.Image {
    const origin = groundOrigin(asset);
    return this.add
      .image(x, y, asset.textureKey)
      .setOrigin(origin.x, origin.y)
      .setFlipX(asset.flipX === true)
      .setScale(asset.baseScale)
      .setDepth(y);
  }

  private assetOriginTuple(asset: WorldAsset): [number, number] {
    const origin = groundOrigin(asset);
    return [origin.x, origin.y];
  }

  private createWorld(): void {
    const island = WORLD_ASSETS.island;
    // The island is the ground: always behind every depth-sorted prop.
    this.add
      .image(LAYOUT.island.x, LAYOUT.island.y, island.textureKey)
      .setOrigin(island.groundAnchor.x / island.width, island.groundAnchor.y / island.height)
      .setScale(island.baseScale)
      .setDepth(-1000);
    this.shelter = this.addGroundSprite(WORLD_ASSETS.shelter, LAYOUT.shelter.x, LAYOUT.shelter.y);
    // The hut stands where the shelter stood and is drawn over it while levelling up.
    this.shelterGlow = this.add.graphics().setDepth(LAYOUT.hut.y - 0.5);
    this.hut = this.addGroundSprite(HUT_ASSET, LAYOUT.hut.x, LAYOUT.hut.y)
      .setDepth(LAYOUT.hut.y + 0.1)
      .setVisible(false);
    this.shelterSparkles = this.add.graphics().setDepth(LAYOUT.hut.y + 1.5);
    this.animalShadow = this.add.graphics();
    this.animalGlow = this.add.graphics().setDepth(LAYOUT.animal.y - 0.4);
    this.animal = this.addGroundSprite(WORLD_ASSETS.animal, LAYOUT.animal.x, LAYOUT.animal.y);
    this.animalEat = this.addGroundSprite(ANIMAL_EAT_FRAMES[0], LAYOUT.animal.x, LAYOUT.animal.y).setVisible(false);
    this.animalSparkles = this.add.graphics().setDepth(LAYOUT.animal.y + 1.5);
    this.farm = this.addGroundSprite(FARM_WATER_FRAME, LAYOUT.plot.x, LAYOUT.plot.y).setVisible(false);
    this.farmTiles = LAYOUT.farmPlotTiles.map((ground) =>
      this.addGroundSprite(FARM_PLOT_TILE, ground.x, ground.y).setVisible(false),
    );
    // The cooking fire shares the campfire's ground point and is drawn just over it.
    this.cookingGlow = this.add.graphics().setDepth(LAYOUT.cookingFire.y - 0.4);
    this.cookingFire = this.addGroundSprite(COOK_STEAM_FRAMES[0], LAYOUT.cookingFire.x, LAYOUT.cookingFire.y)
      .setDepth(LAYOUT.cookingFire.y + 1.2)
      .setVisible(false);
    this.cookingSparkles = this.add.graphics().setDepth(LAYOUT.cookingFire.y + 1.6);
    this.fireGlow = this.add.graphics().setDepth(LAYOUT.fire.y - 0.5);
    this.fireSprite = this.addGroundSprite(FIRE_FRAMES[0], LAYOUT.fire.x, LAYOUT.fire.y)
      .setDepth(LAYOUT.fire.y + 1)
      .setVisible(false);
    this.fireSparks = this.add.graphics().setDepth(LAYOUT.fire.y + 1.5);

    const turn3Ground: Record<Turn3WorldKey, { readonly x: number; readonly y: number }> = {
      matureFarm: LAYOUT.matureFarm,
      secondHut: LAYOUT.secondHut,
      stoneWorkshop: LAYOUT.stoneWorkshop,
      practicalCave: LAYOUT.practicalCave,
      dryRiverbed: LAYOUT.dryRiverbed,
      livestockParent: LAYOUT.livestockParent,
      livestockChild: LAYOUT.livestockChild,
      fence: LAYOUT.fence,
      feedTrough: LAYOUT.feedTrough,
      waterTrough: LAYOUT.waterTrough,
    };
    this.turn3Props = new Map();
    for (const [key, asset] of Object.entries(TURN3_WORLD_ASSETS) as [Turn3WorldKey, Turn3Asset][]) {
      const ground = turn3Ground[key];
      const sprite = this.addGroundSprite(asset, ground.x, ground.y).setVisible(false);
      // The mature plot is ground under resident 2, not a foreground prop that
      // can cover the resident's feet/body.
      if (key === 'matureFarm') sprite.setDepth(LAYOUT.plotHuman.y - 1);
      this.turn3Props.set(key, sprite);
    }
    const firstAction = TURN3_ACTION_FRAMES.gather[0];
    this.turn3Action = this.addGroundSprite(firstAction, LAYOUT.workshopHuman.x, LAYOUT.workshopHuman.y)
      .setDepth(LAYOUT.workshopHuman.y + 1)
      .setVisible(false);
  }
}
