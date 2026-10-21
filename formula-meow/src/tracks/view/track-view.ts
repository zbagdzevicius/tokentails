/**
 * The tracks lane's race view (render only, a JuiceBus listener): on every race start it adds the fish coins, the
 * hazards and the theme's dressing (a lazy chunk per theme, except Kitchen and Rooftops, which world-view.ts dresses
 * synchronously) to the race's world group, so they are disposed with the race. It never writes the sim.
 */
import type { Group } from 'three';
import type { RaceEvent } from '../../types';
import type { FrameInfo, JuiceListener } from '../../juice/bus';
import type { BuiltTrack } from '../../core/track/build';
import type { Theme } from '../../core/track/themes';
import { CoinView } from './coin-view';
import { HazardView } from './hazard-view';

/** What the view needs from the shell. */
export interface TrackViewHost {
  /** the current race's world group, built track and theme (null between races) */
  race(): { group: Group; track: BuiltTrack; theme: Theme } | null;
  /** spark burst at a kart */
  burst(kart: number, color: number, n: number, speed?: number): void;
  /** free a torn-down race's GPU resources a little later (the shell's B61 delay); missing: free them now */
  retire?(fn: () => void): void;
}

type Dress = (t: BuiltTrack, theme: Theme) => Group;

/** Lazy dressing per theme (themes 0 and 1 are dressed by world-view.ts). */
const DRESSING: Partial<Record<number, () => Promise<Dress>>> = {
  2: () => import('../../core/track/dressing/laundry').then((m) => m.dressLaundry),
  3: () => import('../../core/track/dressing/yarn').then((m) => m.dressYarn),
  4: () => import('../../core/track/dressing/cafe').then((m) => m.dressCafe),
  5: () => import('../../core/track/dressing/shelter').then((m) => m.dressShelter),
  6: () => import('../../core/track/dressing/rug').then((m) => m.dressRug),
};

export class TrackView implements JuiceListener {
  private coins: CoinView | null = null;
  private hazards: HazardView | null = null;
  private group: Group | null = null;
  /** the dressing that last loaded (tests and QA: `window.__fmTracks`) */
  dressed = '';

  constructor(private readonly host: TrackViewHost) {}

  onReset(): void {
    // the last race's hazards sit in its (hidden, retired) world group: free their materials with it, not under the
    // new race's shader compile (B61)
    const old = this.hazards;
    if (old) {
      if (this.host.retire) this.host.retire(() => old.dispose());
      else old.dispose();
    }
    this.coins = null;
    this.hazards = null;
    this.group = null;
    this.dressed = '';
    const r = this.host.race();
    if (!r) return;
    this.group = r.group;
    this.coins = new CoinView(r.group, r.track);
    this.hazards = new HazardView(r.group, r.track);
    const theme = r.track.def.theme;
    const load = DRESSING[theme];
    if (load) {
      const group = r.group;
      load()
        .then((dress) => {
          // the race may have ended while the chunk loaded
          if (this.group !== group) return;
          group.add(dress(r.track, r.theme));
          this.dressed = r.track.def.id;
        })
        .catch((err) => console.warn('[tracks] dressing failed to load', err));
    } else this.dressed = r.track.def.id;
  }

  onFrame(info: FrameInfo): void {
    if (!this.group) return;
    this.coins?.update(info.st, info.paused ? 0 : info.dt);
    // the sim stepped its hazards at tick st.tick - 1; interpolate like the karts
    this.hazards?.update(info.st.tick - 2 + info.alpha, info.paused ? 0 : info.dt);
  }

  onEvent(e: RaceEvent): void {
    if (!this.group) return;
    this.coins?.onEvent(e, (k, c, n, s) => this.host.burst(k, c, n, s));
    if (e.type === 'hazard') this.host.burst(e.kart, 0xfff3dc, 12, 5);
  }
}
