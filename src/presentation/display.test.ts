import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './display';

describe('display configuration', () => {
  it('uses a 9:16 portrait design resolution', () => {
    expect(DESIGN_WIDTH * 16).toBe(DESIGN_HEIGHT * 9);
  });
});
