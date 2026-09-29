import { describe, expect, it } from 'vitest';
import { lerpPos } from '../actors';
import { screenSign } from '../camera';
import { marchRay } from '../vision';

describe('marchRay', () => {
  // Wall column at tile x = 3.
  const blocked = (tx: number) => tx === 3;

  it('stops at the first blocking tile', () => {
    expect(marchRay(0.5, 0.5, 1, 0, 10, blocked)).toBeCloseTo(2.5, 5);
  });

  it('is capped at the max distance', () => {
    expect(marchRay(0.5, 0.5, -1, 0, 4, blocked)).toBe(4);
    expect(marchRay(0.5, 0.5, 1, 0, 1.5, blocked)).toBe(1.5);
  });

  it('handles diagonals', () => {
    const d = marchRay(0.5, 0.5, Math.SQRT1_2, Math.SQRT1_2, 10, blocked);
    expect(d).toBeCloseTo(2.5 * Math.SQRT2, 5);
  });
});

describe('screenSign', () => {
  it('maps world directions to screen-left/right for the 45 deg camera', () => {
    expect(screenSign(1, 0)).toBe(1); // east -> right
    expect(screenSign(0, -1)).toBe(1); // north -> right
    expect(screenSign(-1, 0)).toBe(-1);
    expect(screenSign(0, 1)).toBe(-1);
    expect(screenSign(1, 1)).toBe(0); // straight towards the camera: keep facing
  });
});

describe('lerpPos', () => {
  it('interpolates sub-tile positions into world units', () => {
    const o = lerpPos({ x: 16, y: 32 }, { x: 32, y: 32 }, 0.5, { x: 0, z: 0 });
    expect(o).toEqual({ x: 1.5, z: 2 });
  });

  it('snaps on teleports (respawn at a checkpoint)', () => {
    const o = lerpPos({ x: 16, y: 16 }, { x: 160, y: 16 }, 0.1, { x: 0, z: 0 });
    expect(o).toEqual({ x: 10, z: 1 });
  });
});
