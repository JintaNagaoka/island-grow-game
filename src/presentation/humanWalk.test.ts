import { describe, expect, it } from 'vitest';
import { computeWalkPreviewPose, type HumanPose } from './animation';
import { computeColdOverlay } from './coldOverlay';
import {
  HUMAN_WALK_ASSET_LIST,
  HUMAN_WALK_DIRECTIONS,
  humanWalkTextureKey,
} from './humanAssets';
import {
  HUMAN_WALK_ANIMATIONS,
  HUMAN_WALK_CYCLE_DURATION_MS,
  HUMAN_WALK_FRAME_DURATION_MS,
  HUMAN_WALK_FRAME_RATE,
  HUMAN_WALK_SPEED_PX_PER_MS,
  HUMAN_WALK_STOP_THRESHOLD_PX,
  humanWalkAnimationKey,
  planHumanAnimation,
  selectWalkDirection,
  walkFrameIndexAt,
  walkPoseAt,
  walkToward,
} from './humanWalk';
import { LAYOUT } from './layout';

describe('selectWalkDirection', () => {
  it.each([
    [10, 0, 'right'],
    [-10, 0, 'left'],
    [0, -10, 'up'],
    [0, 10, 'down'],
    [10, 3, 'right'],
    [-10, 3, 'left'],
    [3, -10, 'up'],
    [-3, 10, 'down'],
  ] as const)('dx=%d dy=%d -> %s', (dx, dy, expected) => {
    expect(selectWalkDirection(dx, dy)).toBe(expected);
  });

  it('breaks exact diagonals toward the horizontal axis', () => {
    expect(selectWalkDirection(5, 5)).toBe('right');
    expect(selectWalkDirection(5, -5)).toBe('right');
    expect(selectWalkDirection(-5, 5)).toBe('left');
    expect(selectWalkDirection(-5, -5)).toBe('left');
  });

  it('switches to the vertical axis only once |dy| strictly exceeds |dx|', () => {
    expect(selectWalkDirection(5, 5.001)).toBe('down');
    expect(selectWalkDirection(5, -5.001)).toBe('up');
    expect(selectWalkDirection(-5.001, 5)).toBe('left');
  });

  it('returns null at or inside the stop threshold', () => {
    expect(selectWalkDirection(0, 0)).toBeNull();
    expect(selectWalkDirection(HUMAN_WALK_STOP_THRESHOLD_PX, 0)).toBeNull();
    expect(selectWalkDirection(0, -HUMAN_WALK_STOP_THRESHOLD_PX)).toBeNull();
    expect(selectWalkDirection(HUMAN_WALK_STOP_THRESHOLD_PX + 0.01, 0)).toBe('right');
  });
});

describe('walk step cycle', () => {
  it('plays step-a -> stand -> step-b -> stand, 100ms each, 400ms per cycle', () => {
    expect(HUMAN_WALK_FRAME_DURATION_MS).toBe(100);
    expect(HUMAN_WALK_CYCLE_DURATION_MS).toBe(400);
    const at = (ms: number) => walkPoseAt(ms);
    expect([0, 99, 100, 199, 200, 299, 300, 399].map(at)).toEqual([
      'step-a', 'step-a', 'stand', 'stand', 'step-b', 'step-b', 'stand', 'stand',
    ]);
    expect([400, 500, 600, 700, 800].map(at)).toEqual([
      'step-a', 'stand', 'step-b', 'stand', 'step-a',
    ]);
    expect(at(-50)).toBe('step-a');
  });

  it('is continuous: sampling finer or coarser never restarts the cycle mid-walk', () => {
    const sequenceAt = (stepMs: number) => {
      const seen: string[] = [];
      for (let t = 0; t < 1600; t += stepMs) {
        const pose = walkPoseAt(t);
        if (seen[seen.length - 1] !== pose) seen.push(pose);
      }
      return seen;
    };
    const expected = ['step-a', 'stand', 'step-b', 'stand'];
    const fine = sequenceAt(7);
    expect(fine).toEqual(Array.from({ length: 16 }, (_, i) => expected[i % 4]).slice(0, fine.length));
    expect(fine).toHaveLength(16);
    expect(sequenceAt(16)).toEqual(fine);
  });
});

describe('walk animation definitions', () => {
  it('defines one looping 10fps animation per direction: step-a, stand, step-b, stand', () => {
    expect(HUMAN_WALK_FRAME_RATE).toBe(10);
    expect(HUMAN_WALK_ANIMATIONS.map((animation) => animation.key)).toEqual([
      'human-walk-up',
      'human-walk-down',
      'human-walk-left',
      'human-walk-right',
    ]);
    const textureKeys = new Set(HUMAN_WALK_ASSET_LIST.map((asset) => asset.textureKey));
    for (const direction of HUMAN_WALK_DIRECTIONS) {
      const animation = HUMAN_WALK_ANIMATIONS.find((a) => a.key === humanWalkAnimationKey(direction));
      expect(animation).toBeDefined();
      expect(animation?.frameRate).toBe(10);
      expect(animation?.repeat).toBe(-1);
      expect(animation?.frames).toHaveLength(4);
      expect(animation?.frames.map((frame) => frame.key)).toEqual([
        humanWalkTextureKey(direction, 'step-a'),
        humanWalkTextureKey(direction, 'stand'),
        humanWalkTextureKey(direction, 'step-b'),
        humanWalkTextureKey(direction, 'stand'),
      ]);
      for (const frame of animation?.frames ?? []) expect(textureKeys).toContain(frame.key);
    }
  });

  it('pins the logical frame to the same index the animation entries use', () => {
    for (const animation of HUMAN_WALK_ANIMATIONS) {
      for (const [ms, index] of [[0, 0], [150, 1], [250, 2], [399, 3], [400, 0], [1234, 0]] as const) {
        expect(walkFrameIndexAt(ms)).toBe(index);
        expect(animation.frames[walkFrameIndexAt(ms)].key.endsWith(walkPoseAt(ms))).toBe(true);
      }
    }
  });
});

describe('planHumanAnimation', () => {
  const right = { animationKey: 'human-walk-right', frameIndex: 2 } as const;

  it('starts only when the key changes and pins the frame without restarting otherwise', () => {
    expect(planHumanAnimation(null, right)).toEqual({ type: 'start', key: 'human-walk-right', frameIndex: 2 });
    expect(planHumanAnimation('human-walk-right', { ...right, frameIndex: 3 })).toEqual({
      type: 'pin',
      frameIndex: 3,
    });
    expect(planHumanAnimation('human-walk-right', right).type).not.toBe('start');
    expect(planHumanAnimation('human-walk-right', { animationKey: 'human-walk-down', frameIndex: 0 })).toEqual({
      type: 'start',
      key: 'human-walk-down',
      frameIndex: 0,
    });
  });

  it('stops when the pose stops walking, and does nothing while already still', () => {
    expect(planHumanAnimation('human-walk-right', null)).toEqual({ type: 'stop' });
    expect(planHumanAnimation(null, null)).toEqual({ type: 'none' });
  });

  it('issues exactly one start per direction across a preview sweep', () => {
    let playing: string | null = null;
    const starts: string[] = [];
    for (let t = 0; t < 12_000; t += 16) {
      const { walk } = computeWalkPreviewPose(t, true);
      const command = planHumanAnimation(playing, walk);
      if (command.type === 'start') {
        starts.push(command.key);
        playing = command.key;
      }
    }
    expect(starts.slice(0, 5)).toEqual([
      'human-walk-right',
      'human-walk-down',
      'human-walk-left',
      'human-walk-up',
      'human-walk-right',
    ]);
  });
});

describe('walkToward', () => {
  const origin = { x: 100, y: 100 };

  it('moves along each axis at the fixed ground speed and picks the matching view', () => {
    const dt = 500;
    const distance = HUMAN_WALK_SPEED_PX_PER_MS * dt;
    const cases = [
      { to: { x: 400, y: 100 }, direction: 'right', dx: distance, dy: 0 },
      { to: { x: -200, y: 100 }, direction: 'left', dx: -distance, dy: 0 },
      { to: { x: 100, y: -200 }, direction: 'up', dx: 0, dy: -distance },
      { to: { x: 100, y: 400 }, direction: 'down', dx: 0, dy: distance },
    ] as const;
    for (const { to, direction, dx, dy } of cases) {
      const step = walkToward(origin, to, dt);
      expect(step.direction).toBe(direction);
      expect(step.arrived).toBe(false);
      expect(step.x).toBeCloseTo(origin.x + dx, 6);
      expect(step.y).toBeCloseTo(origin.y + dy, 6);
    }
  });

  it('normalizes diagonal velocity so it is never faster than a straight line', () => {
    const dt = 400;
    const straight = walkToward(origin, { x: 1000, y: 100 }, dt);
    for (const to of [
      { x: 1000, y: 1000 },
      { x: 1000, y: 700 },
      { x: -800, y: 300 },
      { x: 130, y: -900 },
    ]) {
      const step = walkToward(origin, to, dt);
      const travelled = Math.hypot(step.x - origin.x, step.y - origin.y);
      expect(travelled).toBeCloseTo(Math.hypot(straight.x - origin.x, straight.y - origin.y), 6);
      expect(travelled).toBeCloseTo(HUMAN_WALK_SPEED_PX_PER_MS * dt, 6);
    }
  });

  it('keeps one direction for the whole leg and snaps onto the destination on arrival', () => {
    const to = { x: 300, y: 130 };
    const total = Math.hypot(to.x - origin.x, to.y - origin.y) / HUMAN_WALK_SPEED_PX_PER_MS;
    const directions = new Set<string | null>();
    let previous = 0;
    for (let t = 0; t < total - 20; t += 5) {
      const step = walkToward(origin, to, t);
      directions.add(step.direction);
      const travelled = Math.hypot(step.x - origin.x, step.y - origin.y);
      expect(travelled).toBeGreaterThanOrEqual(previous);
      previous = travelled;
    }
    expect(directions).toEqual(new Set(['right']));
    expect(walkToward(origin, to, total)).toEqual({ x: to.x, y: to.y, direction: null, arrived: true });
    expect(walkToward(origin, to, total * 3)).toEqual({ x: to.x, y: to.y, direction: null, arrived: true });
  });

  it('is already arrived when the destination is within the stop threshold', () => {
    const step = walkToward(origin, { x: 100.5, y: 100 }, 0);
    expect(step).toEqual({ x: 100.5, y: 100, direction: null, arrived: true });
  });

  it('does not depend on how the time was sliced (no per-frame state)', () => {
    const to = { x: 500, y: 400 };
    expect(walkToward(origin, to, 640)).toEqual(walkToward(origin, to, 640));
    expect(walkToward(origin, to, 0)).toMatchObject({ x: origin.x, y: origin.y, arrived: false });
  });
});

describe('walk preview loop', () => {
  const dirOf = (pose: HumanPose) => pose.walk?.direction ?? null;
  const sweep = () => {
    const poses = [];
    for (let t = 0; t < 9000; t += 10) poses.push({ t, pose: computeWalkPreviewPose(t, true) });
    return poses;
  };

  it('visits right, down, left and up in order with only approved walk frames', () => {
    const order: string[] = [];
    for (const { pose } of sweep()) {
      expect(pose.walk).not.toBeNull();
      expect(pose.asset).toMatch(/^human-walk-(up|down|left|right)-(step-a|stand|step-b)$/);
      expect(pose.walk?.animationKey).toBe(`human-walk-${dirOf(pose)}`);
      expect(pose.facing).toBe(1);
      if (order[order.length - 1] !== dirOf(pose)) order.push(dirOf(pose) ?? '');
    }
    expect(order.slice(0, 5)).toEqual(['right', 'down', 'left', 'up', 'right']);
    expect(new Set(order)).toEqual(new Set(HUMAN_WALK_DIRECTIONS));
  });

  it('moves up on screen for up and down on screen for down, left/right along x', () => {
    let previous = computeWalkPreviewPose(0, true);
    for (const { pose } of sweep().slice(1)) {
      if (dirOf(pose) === dirOf(previous)) {
        if (dirOf(pose) === 'up') expect(pose.y).toBeLessThanOrEqual(previous.y);
        if (dirOf(pose) === 'down') expect(pose.y).toBeGreaterThanOrEqual(previous.y);
        if (dirOf(pose) === 'left') expect(pose.x).toBeLessThanOrEqual(previous.x);
        if (dirOf(pose) === 'right') expect(pose.x).toBeGreaterThanOrEqual(previous.x);
        if (dirOf(pose) === 'up' || dirOf(pose) === 'down') {
          expect(pose.x).toBe(previous.x);
        } else {
          expect(pose.y).toBe(previous.y);
        }
      }
      previous = pose;
    }
  });

  it('restarts the step cycle only when the direction changes', () => {
    let previous = computeWalkPreviewPose(0, true);
    expect(previous.asset.endsWith('step-a')).toBe(true);
    for (const { pose } of sweep().slice(1)) {
      const sameDirection = dirOf(pose) === dirOf(previous);
      const restarted = pose.asset.endsWith('step-a') && !previous.asset.endsWith('step-a');
      const cycleWrapped = restarted && previous.asset.endsWith('stand');
      if (!sameDirection) expect(pose.asset.endsWith('step-a')).toBe(true);
      else if (restarted) expect(cycleWrapped).toBe(true);
      previous = pose;
    }
  });

  it('keeps the human on screen above the UI panel', () => {
    for (const { pose } of sweep()) {
      expect(pose.x).toBeGreaterThan(0);
      expect(pose.x).toBeLessThan(720);
      expect(pose.y).toBeGreaterThan(0);
      expect(pose.y).toBeLessThan(LAYOUT.ui.panelTop);
    }
  });

  it('loops from the logical clock only', () => {
    const a = computeWalkPreviewPose(1234, true);
    expect(computeWalkPreviewPose(1234, true)).toEqual(a);
    expect(computeWalkPreviewPose(1234, false)).toEqual({ ...a, coldOverlay: false });
  });
});

describe('cold overlay geometry', () => {
  it('covers only the head interior and tracks isCold-independent direction data', () => {
    for (const direction of HUMAN_WALK_DIRECTIONS) {
      const { head, tintBands, marks } = computeColdOverlay(direction);
      expect(marks).toHaveLength(4);
      expect(tintBands.length).toBeGreaterThan(1);
      let previousAlpha = Infinity;
      for (const band of tintBands) {
        expect(band.alpha).toBeGreaterThan(0);
        expect(band.alpha).toBeLessThanOrEqual(1);
        expect(band.alpha).toBeLessThan(previousAlpha);
        previousAlpha = band.alpha;
        for (const x of [band.left, band.left + band.width]) {
          for (const y of [band.top, band.top + band.height]) {
            expect(Math.hypot(x - head.cx, y - head.cy)).toBeLessThanOrEqual(head.r + 1e-6);
          }
        }
      }
    }
  });
});
