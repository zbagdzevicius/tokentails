/** Query grid key (8 m cells), shared by the track build, the query and the dressing. Sim-safe. */
import { TRACK } from '../../tuning';

export const cellKey = (x: number, z: number): number => (Math.floor(x / TRACK.cell) + 2048) * 4096 + (Math.floor(z / TRACK.cell) + 2048);
