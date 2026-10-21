/**
 * Hardware / browser Back inside the game. The page keeps one extra history entry while there is something to step
 * back from (a menu layer, a race in progress); a Back pops that entry and becomes a game Back instead of leaving
 * the page (a single race, time trial or Daily run in progress used to be lost to one Back on Android):
 * - a dialog answers "no" (Esc), a menu layer goes back, a running race pauses; the entry is pushed again;
 * - on the title it leaves the game, as it would without the guard.
 */
export interface BackGuardHost {
  /** something to step back from right now (the guard keeps its history entry) */
  wanted(): boolean;
  /** handle one Back; false lets it leave the game */
  handle(): boolean;
}

interface Win {
  readonly history: Pick<History, 'pushState' | 'replaceState' | 'back'>;
  readonly location: { readonly href: string };
  addEventListener(type: 'popstate', fn: () => void): void;
}

export class BackGuard {
  private armed = false;
  /** the address of the guarded entry: the entry under it may still carry the route that started the session */
  private href: string;

  constructor(
    private readonly win: Win,
    private readonly host: BackGuardHost,
  ) {
    this.href = win.location.href;
    win.addEventListener('popstate', () => this.onPop());
  }

  /** Push the guard entry when it is wanted and not up yet (call on every screen change and race start). */
  sync(): void {
    this.href = this.win.location.href;
    if (this.armed || !this.host.wanted()) return;
    try {
      this.win.history.pushState({ fmBack: 1 }, '', this.href);
      this.armed = true;
    } catch {
      /* sandboxed frames */
    }
  }

  get isArmed(): boolean {
    return this.armed;
  }

  private onPop(): void {
    if (!this.armed) return;
    this.armed = false;
    const href = this.href;
    if (!this.host.handle()) {
      // nothing to step back from: this Back leaves the game, as it would without the guard
      try {
        this.win.history.back();
      } catch {
        /* sandboxed frames */
      }
      return;
    }
    try {
      // the entry we are on now is the one under the guard: give it the current address, then guard it again
      this.win.history.replaceState(null, '', href);
    } catch {
      /* sandboxed frames */
    }
    this.sync();
  }
}
