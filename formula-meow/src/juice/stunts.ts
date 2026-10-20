/**
 * Set-piece callouts and the stunt tally (iteration 3, juice lane; SETPIECES.md section 9). Pure: race events in,
 * HUD callouts and counts out (unit-tested in juice.test.ts). Render-side only: nothing here is hashed or replayed.
 *
 * - Callouts (HUD slot, priority 1, so they never replace "Final lap" or the finish): "LOOP-DE-MEOW!" on a loop,
 *   "WALL RIDE!" on a wall lane, "BIG AIR!" off a jump lip, "NICE LANDING!" on a clean landing, "TUNNEL RUN!" on the
 *   first tunnel of a race, and a friendly "SAFETY NET!" when the net catches you.
 * - The trick bonus rewards and never punishes: every clean stunt (a loop ridden, a wall lane ridden clean, a clean
 *   landing) counts; stunts within `STUNT_BONUS.comboTicks` of each other chain into a combo ("STUNT COMBO ×3"). A
 *   net catch, a messy landing or a wall brush simply does not count: nothing is taken away, and a combo only ends
 *   when time runs out. The sim already pays the speed part (the loop's exit boost, the clean-landing boost and the
 *   wall lane's boost); `stuntFish` is the fish part (a contract request: progression pays it with the race fish).
 */
import type { RaceEvent } from '../types';
import type { PopTone } from './vfx/popups';

export const STUNT_BONUS = {
  /** a stunt within this many ticks of the last one extends the combo (8 s) */
  comboTicks: 8 * 60,
  /** fish per clean stunt, and the cap per race */
  fishPer: 1,
  fishMax: 6,
} as const;

export interface StuntCallout {
  /** English `t()` keys */
  text: string;
  tone: PopTone;
  sub?: string;
  /** values for the sub's `{n}` */
  n?: number;
}

export interface StuntSummary {
  /** clean stunts: loops ridden + wall lanes ridden clean + clean landings */
  clean: number;
  loops: number;
  walls: number;
  landings: number;
  /** gap jumps launched (clean or not) */
  jumps: number;
  nets: number;
  tunnels: number;
  bestCombo: number;
}

/** Fish for the stunts of one race (rewards only; never negative). */
export function stuntFish(s: Pick<StuntSummary, 'clean'>): number {
  return Math.max(0, Math.min(STUNT_BONUS.fishMax, Math.floor(s.clean) * STUNT_BONUS.fishPer));
}

export class StuntTally {
  private s: StuntSummary = StuntTally.empty();
  private combo = 0;
  private lastClean = -1e9;
  private tunnelSaid = false;

  static empty(): StuntSummary {
    return { clean: 0, loops: 0, walls: 0, landings: 0, jumps: 0, nets: 0, tunnels: 0, bestCombo: 0 };
  }

  reset(): void {
    this.s = StuntTally.empty();
    this.combo = 0;
    this.lastClean = -1e9;
    this.tunnelSaid = false;
  }

  get summary(): Readonly<StuntSummary> {
    return this.s;
  }

  /** The combo running now (0 or 1 = none). */
  comboAt(tick: number): number {
    return tick - this.lastClean <= STUNT_BONUS.comboTicks ? this.combo : 0;
  }

  /** A clean stunt: counts, extends the combo. Returns the combo length. */
  private landClean(tick: number): number {
    this.s.clean++;
    this.combo = tick - this.lastClean <= STUNT_BONUS.comboTicks ? this.combo + 1 : 1;
    this.lastClean = tick;
    this.s.bestCombo = Math.max(this.s.bestCombo, this.combo);
    return this.combo;
  }

  private comboCall(n: number): StuntCallout | null {
    return n >= 2 ? { text: 'STUNT COMBO ×{n}', tone: 'pink', n, sub: 'BOOST!' } : null;
  }

  /** The player's event → a callout (null = none). Rivals' events are ignored. */
  onEvent(e: RaceEvent, me: number): StuntCallout | null {
    if (e.kart !== me) return null;
    const a = e.a ?? 0;
    switch (e.type) {
      case 'stuntEnter':
        if (a === 0) return { text: 'LOOP-DE-MEOW!', tone: 'pink' };
        if (a === 1) return { text: 'WALL RIDE!', tone: 'cyan' };
        if (a === 2) {
          this.s.jumps++;
          return { text: 'BIG AIR!', tone: 'gold' };
        }
        return null;
      case 'stuntExit':
        if (e.b !== 1) return null;
        if (a === 0) {
          this.s.loops++;
          return this.comboCall(this.landClean(e.tick)) ?? { text: 'BOOST!', tone: 'pink' };
        }
        if (a === 1) {
          this.s.walls++;
          return this.comboCall(this.landClean(e.tick));
        }
        // a jump's clean exit comes with stuntLand (counted there)
        return null;
      case 'stuntLand': {
        this.s.landings++;
        const n = this.landClean(e.tick);
        return { text: 'NICE LANDING!', tone: 'green', sub: n >= 2 ? 'STUNT COMBO ×{n}' : 'BOOST!', n };
      }
      case 'netCatch':
        this.s.nets++;
        return { text: 'SAFETY NET!', tone: 'cyan', sub: 'back in the race' };
      default:
        return null;
    }
  }

  /** The player entered a tunnel (the juice install reads the tunnel mask). The first one of a race is called. */
  onTunnel(): StuntCallout | null {
    this.s.tunnels++;
    if (this.tunnelSaid) return null;
    this.tunnelSaid = true;
    return { text: 'TUNNEL RUN!', tone: 'pink' };
  }
}
