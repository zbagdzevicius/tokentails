/**
 * Photo finish and the winning margin (iteration 4, F4; juice lane). Pure: the race result's places in, one call out.
 * Every number comes from `finishMargin` (core/app/finish.ts, the sim's sub-tick finish times), the same call the
 * results headline, the share caption and the clip sticker read, so they always agree.
 *
 * The judge starts on the player's own finish and decides once:
 * - **photo**: another cat that really finished (never a projection, never a lapped cat) crossed within 0.3 s.
 *   It is *certain* as soon as such a cat has a time (the freeze and the shutter fire then); the stamp waits until
 *   no cat still racing could be closer: a cat that has not crossed `n` ticks after the player is at least `n` ticks
 *   behind, so the decision comes as soon as the nearest finished cat is within the elapsed time, and never later
 *   than `PHOTO_WAIT_TICKS` (18 ticks, 0.3 s) after the player's finish.
 * - **won**: the player won and nobody was within 0.3 s: "WON BY 1.8 s" (when the runner-up is still racing, the
 *   sim's projection with "≈").
 * - **none**: anything else (a normal finish behind someone, a battle, a solo time trial).
 */
import { finishMargin, PHOTO_FINISH_S, type FinishMargin } from '../core/app/finish';
import type { RaceResult } from '../types';

/** The longest the judge waits for the nearest finisher after the player's own finish (0.3 s). */
export const PHOTO_WAIT_TICKS = 18;

export type FinishCall =
  | { kind: 'photo'; margin: FinishMargin }
  | { kind: 'won'; margin: FinishMargin }
  | { kind: 'none' };

export interface JudgeStep {
  /** true once, the first frame a photo finish is certain (freeze, flash, shutter) */
  certain: boolean;
  /** the decision, once */
  decided: FinishCall | null;
}

type Places = Pick<RaceResult, 'places'>;

/** The nearest cat that really finished (a lapped or still-racing cat has no time and never counts). */
function nearestFinished(r: Places, me: number): FinishMargin | null {
  return finishMargin({ places: r.places.filter((p) => p.time != null || p.kart === me) }, me);
}

export class PhotoFinishJudge {
  private start = -1;
  private certainSaid = false;
  private done = false;

  reset(): void {
    this.start = -1;
    this.certainSaid = false;
    this.done = false;
  }

  /** The player crossed the line on `tick` (the finish event). */
  begin(tick: number): void {
    if (this.start >= 0) return;
    this.start = tick;
  }

  get active(): boolean {
    return this.start >= 0 && !this.done;
  }

  /** Call every frame with the live result (`world.result()`) until it has decided. */
  step(tick: number, r: Places, me: number, place: number): JudgeStep {
    const out: JudgeStep = { certain: false, decided: null };
    if (!this.active) return out;
    const mine = r.places.find((p) => p.kart === me);
    if (!mine || mine.time == null) {
      this.done = true;
      out.decided = { kind: 'none' };
      return out;
    }
    const real = nearestFinished(r, me);
    const photo = !!real && real.margin <= PHOTO_FINISH_S;
    if (photo && !this.certainSaid) {
      this.certainSaid = true;
      out.certain = true;
    }
    const elapsed = (tick - this.start) / 60;
    if (!(real && real.margin <= elapsed) && tick - this.start < PHOTO_WAIT_TICKS) return out;
    this.done = true;
    if (photo && real) out.decided = { kind: 'photo', margin: real };
    else if (place === 1) {
      const m = real ?? finishMargin(r, me);
      out.decided = m && m.won ? { kind: 'won', margin: m } : { kind: 'none' };
    } else out.decided = { kind: 'none' };
    return out;
  }
}

/** "0.07" under a second, "1.8" from one second (the stamp, the banner). */
export function fmtMargin(s: number): string {
  return s < 1 ? s.toFixed(2) : s.toFixed(1);
}
