// Stage 1 tutorial: a pure step machine (node-importable, tested). The view lives in tutorial.ts. META-UI lane.
// Steps run in order; each one appears on its trigger and completes when the player performs the move
// (or times out, so the coach never nags). Steer -> jump -> slide -> pounce -> vault. Cards tied to a set-piece
// prompt (jump, slide, vault) show only while Mochi is near that set piece: once its prompt has been gone for
// AWAY_S the card hides and waits for the next one (the time it was up still counts toward its timeout).
export type TutStep = 'steer' | 'jump' | 'slide' | 'pounce' | 'vault';
export const TUT_STEPS: readonly TutStep[] = ['steer', 'jump', 'slide', 'pounce', 'vault'];

export interface TutInput {
  /** seconds since the run started */
  time: number;
  /** current steer axis -1..1 */
  steer: number;
  /** active HUD prompt, if any */
  promptAction: string | null;
  promptText: string;
  /** 0..1 stage progress */
  progress: number;
  /** player is airborne */
  airborne: boolean;
}

/** max seconds a coach card stays up without the move being done */
export const TUT_TIMEOUT: Record<TutStep, number> = { steer: 7, jump: 6, slide: 6, pounce: 5, vault: 6 };
/** a prompt-driven card hides this long after its set piece's prompt went away */
export const AWAY_S = 0.9;
const PROMPTED = new Set<TutStep>(['jump', 'slide', 'vault']);

export class TutorialMachine {
  /** steps already done (or skipped) */
  readonly done = new Set<TutStep>();
  /** the coach card showing now */
  active: TutStep | null = null;
  private shownFor = 0;
  private away = 0;
  private steerHeld = 0;
  /** seconds each card has been up so far (across showings) */
  private upFor: Partial<Record<TutStep, number>> = {};

  /** a gameplay event arrived: 'jump' | 'slide' | 'pounce' | 'abilityStart' */
  event(name: string): void {
    const a = this.active;
    if (!a) {
      // doing a move before its card appears still counts (no pointless lesson later)
      if (name === 'pounce') this.done.add('pounce');
      return;
    }
    if ((a === 'jump' && name === 'jump') || (a === 'slide' && name === 'slide') || (a === 'pounce' && name === 'pounce') || (a === 'vault' && name === 'abilityStart')) this.finish();
  }

  private finish(): void {
    if (this.active) this.done.add(this.active);
    this.active = null;
    this.shownFor = 0;
  }

  private start(s: TutStep): void {
    this.active = s;
    this.shownFor = this.upFor[s] ?? 0;
    this.away = 0;
  }

  private want(s: TutStep, inp: TutInput): boolean {
    switch (s) {
      case 'steer':
        return inp.time > 0.6;
      case 'jump':
        return inp.promptAction === 'jump';
      case 'slide':
        return inp.promptAction === 'slide';
      case 'pounce':
        return /POUNCE/i.test(inp.promptText) || (this.done.has('slide') && inp.progress > 0.62 && inp.airborne);
      case 'vault':
        // only the tail-vault prompt (a full PUFF meter also shows an ability prompt, "PUFF HOVER!")
        return inp.promptAction === 'ability' && /VAULT/i.test(inp.promptText);
    }
  }

  /** advance; returns the active step (or null) */
  update(dt: number, inp: TutInput): TutStep | null {
    if (this.active) {
      this.shownFor += dt;
      if (this.active === 'steer') {
        if (Math.abs(inp.steer) > 0.5) this.steerHeld += dt;
        if (this.steerHeld > 0.35) this.finish();
      }
      if (this.active && this.shownFor > TUT_TIMEOUT[this.active]) this.finish();
      const a = this.active;
      if (a && PROMPTED.has(a)) {
        this.away = this.want(a, inp) ? 0 : this.away + dt;
        if (this.away > AWAY_S) {
          // past the set piece: hide, keep the lesson for the next one
          this.upFor[a] = this.shownFor;
          this.active = null;
          this.shownFor = 0;
        }
      }
      return this.active;
    }
    for (const s of TUT_STEPS) {
      if (this.done.has(s)) continue;
      if (this.want(s, inp)) this.start(s);
      break; // strictly in order, except later steps fire on their own prompt (below)
    }
    if (!this.active) {
      // a set piece prompt for a later move (the player skipped ahead with dev.jump or out-ran the steer card)
      for (const s of TUT_STEPS) if (!this.done.has(s) && s !== 'steer' && s !== 'pounce' && this.want(s, inp)) {
        this.start(s);
        break;
      }
    }
    return this.active;
  }

  get finished(): boolean {
    return this.done.size === TUT_STEPS.length;
  }
}
