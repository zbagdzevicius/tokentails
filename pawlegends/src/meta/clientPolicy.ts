/**
 * Force update in the game (docs/plans/moba/FORCE-UPDATE.md §5): an outdated build never keeps playing.
 *
 * - Web (`/play` and the standalone page): at boot, on each return to the title, when the tab comes back, and every
 *   10 minutes on the title, it reads the live build's `version.json` (next to index.html, `no-store`) and asks
 *   `GET <api>/pawlegends/client-policy?platform=web&sim=…&bundle=<sha>`. An outdated sha, or an `update` answer,
 *   reloads to the latest build on the title with no party: a short "Updating Paw Legends" card first, so it is never
 *   a surprise, and never mid-match (an answer that arrives during a pick, a match or results waits for the title).
 *   When the backend no longer replays this sim the card blocks (no Play) until the reload. Framed by the host, the
 *   game asks the host to start the frame again (`reload-request`), and reloads its own frame if an older host does
 *   not. Offline or API down: nothing (the web build is the one the server just sent).
 * - App (the native shell): the shell's update gate does the work (a `location.reload()` there would reload the same
 *   bundle). The game only tells it, with `pl:update-required`, when the server refused this version.
 * - A save refused with PAWLEGENDS_SIM_VERSION (embed/integrate.ts) marks the build outdated either way.
 *
 * One reload per target build per 5 minutes at most (sessionStorage): a CDN that still serves the old build never
 * loops a tab. Everything is injected (UpdateWatchDeps) so tests/unit/clientPolicy.test.ts drives it.
 */

export type WatchMode = 'web' | 'frame' | 'app';
export type WatchTrigger = 'boot' | 'title' | 'visible' | 'timer' | 'rejected';
export type WatchVerdict = 'current' | 'outdated' | 'blocking' | 'skipped';

export interface UpdateCard {
  close(): void;
}

export interface UpdateWatchDeps {
  mode: WatchMode;
  /** The party/API origin (VITE_PAWLEGENDS_API, partyLink.ts), or null: then only version.json is read. */
  api: string | null;
  /** `<base>version.json` of this build's deploy. */
  versionUrl: string;
  own: { sha: string; sim: number };
  fetchJson(url: string): Promise<unknown>;
  /** On the title with no party open or resumable: the only time a reload may happen. */
  atTitle(): boolean;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(t: unknown): void;
  /** sessionStorage (the reload guard), or null. */
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Show the update card; `blocking` hides the way back to the game. */
  showCard(o: { blocking: boolean; seconds: number; onNow(): void }): UpdateCard;
  /** web: location.reload(); frame: ask the host (`reload-request`), then reload the frame. */
  reload(reason: 'outdated' | 'sim', version: string | null): void;
  /** app: hand over to the shell's update gate. */
  dispatch(type: 'pl:update-required' | 'pl:update-check'): void;
}

/** Re-checks on the title at most this often (a boot or a refused save is never throttled). */
export const WATCH_EVERY_MS = 60_000;
export const WATCH_TIMER_MS = 10 * 60_000;
/** The card's countdown before the reload (a blocking one is shorter: there is nothing to do but update). */
export const CARD_SECONDS = 5;
export const BLOCKING_SECONDS = 2;
const GUARD_KEY = 'pl.update.reloaded';
const GUARD_MS = 5 * 60_000;
const SHA = /^[0-9a-z]{4,40}$/;

interface Outdated {
  blocking: boolean;
  version: string | null;
  reason: 'outdated' | 'sim';
}

export class UpdateWatch {
  private lastCheck = -Infinity;
  private pending: Outdated | null = null;
  private card: UpdateCard | null = null;
  private timer: unknown = null;
  private checking: Promise<WatchVerdict> | null = null;

  constructor(private readonly d: UpdateWatchDeps) {}

  /** The build is outdated and waits for the title (for tests and the title screen). */
  get outdated(): Readonly<Outdated> | null {
    return this.pending;
  }

  /** Check now (throttled except at boot and after a refused save). Never throws. */
  check(trigger: WatchTrigger): Promise<WatchVerdict> {
    if (this.d.mode === 'app') {
      if (trigger === 'rejected') this.d.dispatch('pl:update-required');
      return Promise.resolve('skipped');
    }
    if (trigger === 'rejected') {
      this.mark({ blocking: true, version: null, reason: 'sim' });
      return Promise.resolve('blocking');
    }
    const now = this.d.now();
    if (trigger !== 'boot' && now - this.lastCheck < WATCH_EVERY_MS) {
      if (this.pending) this.act();
      return Promise.resolve(this.pending ? (this.pending.blocking ? 'blocking' : 'outdated') : 'skipped');
    }
    if (this.checking) return this.checking;
    this.lastCheck = now;
    this.checking = this.run().finally(() => (this.checking = null));
    return this.checking;
  }

  /** The game is on the title: an owed reload happens now; the 10-minute timer runs while it stays there. */
  onTitle(): void {
    if (this.d.mode === 'app') return;
    if (this.pending) this.act();
    else void this.check('title');
    this.armTimer();
  }

  /** The game left the title (a pick, a match): the card goes, the reload waits for the next title. */
  offTitle(): void {
    if (this.timer !== null) this.d.clearTimeout(this.timer);
    this.timer = null;
    if (this.card && !this.pending?.blocking) {
      this.card.close();
      this.card = null;
    }
  }

  private armTimer(): void {
    if (this.timer !== null) this.d.clearTimeout(this.timer);
    this.timer = this.d.setTimeout(() => {
      this.timer = null;
      if (!this.d.atTitle()) return;
      void this.check('timer');
      this.armTimer();
    }, WATCH_TIMER_MS);
  }

  private async run(): Promise<WatchVerdict> {
    const [live, answer] = await Promise.all([
      this.d.fetchJson(this.d.versionUrl).catch(() => null),
      this.d.api
        ? this.d
            .fetchJson(`${this.d.api.replace(/\/+$/, '')}/pawlegends/client-policy?platform=web&sim=${this.d.own.sim}${SHA.test(this.d.own.sha) ? `&bundle=${this.d.own.sha}` : ''}`)
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    const liveSha = live && typeof (live as { sha?: unknown }).sha === 'string' && SHA.test((live as { sha: string }).sha) ? (live as { sha: string }).sha : null;
    const a = answer && typeof answer === 'object' ? (answer as { action?: unknown; reason?: unknown }) : null;
    // a local build (sha "local") never reloads on a version mismatch; only on a refused sim
    const shaOutdated = !!liveSha && SHA.test(this.d.own.sha) && this.d.own.sha !== 'local' && liveSha !== this.d.own.sha;
    const simRefused = a?.action === 'update' && (a.reason === 'sim-not-accepted' || a.reason === 'sim-too-old');
    const apiUpdate = a?.action === 'update' && !!liveSha && liveSha !== this.d.own.sha;
    if (!shaOutdated && !simRefused && !apiUpdate) return 'current';
    this.mark({ blocking: simRefused, version: liveSha, reason: simRefused ? 'sim' : 'outdated' });
    return simRefused ? 'blocking' : 'outdated';
  }

  private mark(o: Outdated): void {
    // a blocking verdict is never downgraded by a later plain one
    this.pending = this.pending?.blocking && !o.blocking ? { ...this.pending, version: o.version ?? this.pending.version } : o;
    if (this.d.atTitle()) this.act();
  }

  /** Reloaded for this target in the last 5 minutes (a CDN still serving the old build): do not loop. */
  private guarded(target: string): boolean {
    try {
      const v = JSON.parse(this.d.storage?.getItem(GUARD_KEY) ?? 'null') as { t?: string; at?: number } | null;
      return !!v && v.t === target && typeof v.at === 'number' && this.d.now() - v.at < GUARD_MS;
    } catch {
      return false;
    }
  }

  private act(): void {
    const p = this.pending;
    if (!p || this.card || !this.d.atTitle()) return;
    const target = p.version ?? `sim${this.d.own.sim}`;
    const go = () => {
      try {
        this.d.storage?.setItem(GUARD_KEY, JSON.stringify({ t: target, at: this.d.now() }));
      } catch {
        /* blocked storage: the reload still happens */
      }
      this.d.reload(p.reason, p.version);
    };
    if (this.guarded(target)) {
      // the reload already happened and the server still sends this build: only a blocking card stays, with a
      // manual Reload (no automatic loop)
      if (p.blocking) this.card = this.d.showCard({ blocking: true, seconds: 0, onNow: go });
      return;
    }
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      go();
    };
    const seconds = p.blocking ? BLOCKING_SECONDS : CARD_SECONDS;
    this.card = this.d.showCard({ blocking: p.blocking, seconds, onNow: fire });
    this.d.setTimeout(() => {
      // the player left the title meanwhile (Play was faster than the countdown): wait for the next title
      if (!this.card || (!p.blocking && !this.d.atTitle())) return;
      fire();
    }, seconds * 1000);
  }
}

// ------------------------------------------------------------------------------------------------ the card

const CARD_STYLE = `
.pl-update{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(18,9,31,.72);pointer-events:all}
.pl-update.soft{inset:auto 0 max(16px,env(safe-area-inset-bottom)) 0;background:none;pointer-events:none}
.pl-update .plu-card{pointer-events:all;display:grid;gap:10px;justify-items:center;text-align:center;max-width:min(380px,calc(100% - 32px));
padding:16px 20px;border:2px solid var(--ink,#12091f);border-radius:8px;background:var(--bg,#12091f);color:var(--cream,#fff3e3);box-shadow:0 4px 0 var(--ink,#12091f)}
.pl-update h2{margin:0;font-size:18px;font-weight:800;font-style:italic;text-transform:uppercase}
.pl-update p{margin:0;font-size:14px;line-height:1.4;opacity:.86}
.pl-update button{min-height:44px;padding:0 18px;border:2px solid var(--ink,#12091f);border-radius:6px;background:var(--butter,#ffe14a);color:var(--ink,#12091f);
font:inherit;font-weight:800;cursor:pointer;box-shadow:0 3px 0 var(--ink,#12091f);transform:skewX(-6deg)}
`;

/** The game's update card (v6 look): "Updating Paw Legends", a countdown, and "Reload now". */
export function showUpdateCard(doc: Document, o: { blocking: boolean; seconds: number; onNow(): void }): UpdateCard {
  if (!doc.getElementById('pl-update-style')) {
    const st = doc.createElement('style');
    st.id = 'pl-update-style';
    st.textContent = CARD_STYLE;
    doc.head.appendChild(st);
  }
  doc.querySelector('.pl-update')?.remove();
  const root = doc.createElement('div');
  root.className = `pl-update${o.blocking ? '' : ' soft'}`;
  root.setAttribute('role', o.blocking ? 'alertdialog' : 'status');
  root.dataset.update = o.blocking ? 'blocking' : 'soft';
  const card = doc.createElement('div');
  card.className = 'plu-card';
  const h = doc.createElement('h2');
  h.textContent = o.blocking ? 'Update needed' : 'Updating Paw Legends';
  const p = doc.createElement('p');
  const b = doc.createElement('button');
  b.type = 'button';
  b.textContent = 'Reload now';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    o.onNow();
  });
  card.append(h, p, b);
  root.appendChild(card);
  doc.body.appendChild(root);
  let left = o.seconds;
  const line = () => {
    p.textContent = o.blocking
      ? left > 0
        ? `This version can't save matches any more. Getting the latest one in ${left} s.`
        : "This version can't save matches any more. Reload to get the latest one."
      : `A new version is ready. Reloading in ${left} s.`;
  };
  line();
  const tick = setInterval(() => {
    left = Math.max(0, left - 1);
    line();
  }, 1000);
  return {
    close() {
      clearInterval(tick);
      root.remove();
    },
  };
}
