/**
 * Links the native app was opened with (docs/plans/moba/DEEP-LINKS.md). A QR scan or a tap on
 * `https://pawlegends.app/p/K7QX2M` on a phone with the app opens the app (iOS Universal Links, Android App Links);
 * the shell (pawlegends-app/src/shell/links.ts) puts the URL on `window.__PL_LINKS__` and fires `pl:link`, on a cold
 * start (the launch URL) and on a warm one (the app was in the background). This file takes them off the queue and
 * routes a party link to the party join: at once on the title or in a lobby, after the match when one is being played
 * (never mid-match), and only once the game is up. First-load code: no imports from the party chunk.
 */
import { partyFromLink } from '../share/partyLink';

/** The shell's queue of URLs, oldest first (the shell creates it; the game empties it). */
export const LINKS_GLOBAL = '__PL_LINKS__';
/** Fired by the shell after it queued a URL. */
export const LINK_EVENT = 'pl:link';

/** A link waits for the match on screen to end for this long at most; an older one is dropped. */
export const LINK_WAIT_MS = 30 * 60_000;
/** While a link waits, the game looks again this often. */
export const LINK_RETRY_MS = 1_000;

/**
 * Drain the shell's queue now and on every `pl:link`; `on` gets each URL once. Returns the unsubscribe.
 * Safe without a shell (the web): the queue is simply missing.
 */
export function listenLinks(w: Window, on: (url: string) => void): () => void {
  const drain = (): void => {
    const q = (w as unknown as Record<string, unknown>)[LINKS_GLOBAL];
    if (!Array.isArray(q)) return;
    while (q.length) {
      const u: unknown = q.shift();
      if (typeof u === 'string') on(u);
    }
  };
  w.addEventListener(LINK_EVENT, drain);
  drain();
  return () => w.removeEventListener(LINK_EVENT, drain);
}

/** What the router needs from the game. */
export interface LinkTarget {
  /** A match is on screen (solo or party), or the party chunk is still opening: wait. */
  busy(): boolean;
  /** The code of the party this player is in (or joining), or null. */
  currentCode(): string | null;
  /** Join that party now (leaving another lobby first). */
  join(code: string): void;
  /** The party this player is in already: bring its lobby to the front. */
  showParty(): void;
  /** A party link with a broken code: say so. */
  bad(): void;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(t: unknown): void;
}

export type LinkOutcome = 'ignored' | 'bad' | 'joined' | 'same' | 'waiting' | 'expired';

/** Routes party links to the join; the newest link wins over one still waiting. */
export class LinkRouter {
  private pending: { code: string; at: number } | null = null;
  private timer: unknown = null;

  constructor(private readonly t: LinkTarget) {}

  /** The code waiting for the match to end, or null. */
  get waiting(): string | null {
    return this.pending?.code ?? null;
  }

  open(url: string): LinkOutcome {
    const link = partyFromLink(url);
    if (!link) return 'ignored';
    if ('bad' in link) {
      this.t.bad();
      return 'bad';
    }
    this.pending = { code: link.code, at: this.t.now() };
    return this.flush();
  }

  /** Try the waiting link now (the router also retries on its own while one waits). */
  flush(): LinkOutcome {
    const p = this.pending;
    if (!p) return 'ignored';
    if (this.t.now() - p.at > LINK_WAIT_MS) {
      this.pending = null;
      this.stop();
      return 'expired';
    }
    if (this.t.busy()) {
      if (this.timer === null) this.timer = this.t.setTimeout(() => {
        this.timer = null;
        this.flush();
      }, LINK_RETRY_MS);
      return 'waiting';
    }
    this.pending = null;
    this.stop();
    if (this.t.currentCode() === p.code) {
      this.t.showParty();
      return 'same';
    }
    this.t.join(p.code);
    return 'joined';
  }

  dispose(): void {
    this.pending = null;
    this.stop();
  }

  private stop(): void {
    if (this.timer !== null) this.t.clearTimeout(this.timer);
    this.timer = null;
  }
}
