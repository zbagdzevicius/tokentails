/**
 * Screen-relative controls for the isometric camera (yaw 45 degrees, see render/camera.ts).
 *
 * On screen, grid +x (east) points down-right and grid -y (north) points up-right. So pressing
 * "right" moves grid (+1, -1) and "up" moves grid (-1, -1): the true screen direction in grid space.
 * Cat movement is continuous and the sim normalises diagonals (x 181/256 per axis), so a screen-
 * straight input moves at the same 5 tiles/s as any other. Along a grid wall (which looks diagonal on
 * screen) the blocked axis drops out and the cat slides along the wall at full speed.
 * The 'grid' scheme passes directions through unchanged (solver, tests, `?controls=grid`).
 */
import type { Axis } from '../types';

const sgn = (n: number): Axis => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** Screen direction (dx right, dy down) -> grid direction. */
export function isoMapDir(dx: Axis, dy: Axis): [Axis, Axis] {
  return [sgn(dx + dy), sgn(dy - dx)];
}

export type ControlScheme = 'screen' | 'grid';

export function mapperFor(scheme: ControlScheme): ((dx: Axis, dy: Axis) => [Axis, Axis]) | undefined {
  return scheme === 'screen' ? isoMapDir : undefined;
}
