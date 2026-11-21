/**
 * The account's progression as the game sees it (`store`: owned items, the Legends Pass row with its Season XP and
 * tier, the champions with their Yarn), kept fresh in one place for both hosts (PawlegendsHost on the web, the app's
 * nativeHost).
 *
 * Why (founder, Nov 16: "progression is not refreshed until app / web is restarted"): the hosts re-read
 * `GET /pawlegends/me` after a save only when that save's answer carried `season`. A save that ended any other way
 * (a 409 after a timed-out POST that the server finished anyway, a retry from the queue, a party result whose answer
 * did not parse) left the game on the boot-time numbers until the next page load or app start. Nothing re-read it
 * when the app came back from the background or the tab became visible either.
 *
 * The rules here:
 * - every save that ends `saved` refreshes, whatever its answer carried;
 * - the save's own answer goes to the game at once (`season.xp`, `season.tier`, `yarn.balance` are the new totals),
 *   and is kept as a floor until a read catches up, so a read that lags the write (a replica, a cache) never shows
 *   the old numbers again; a second read follows a few seconds later for the same reason;
 * - the page or app coming back to the foreground refreshes (at most every `VISIBLE_EVERY_MS`);
 * - reads never overlap: a refresh asked during one runs once more after it;
 * - a failed read (network, 429, 5xx) is retried after `STORE_RETRY_MS`, twice at most in a row, so one bad answer
 *   right after a save does not leave the game on the old numbers until the next foreground.
 * No React and no timers of its own beyond `schedule`, so every rule is unit-tested.
 */
import type { PawlegendsSaveSeason, PawlegendsStoreState } from "./bridge";

/** The read after a save is repeated once after this long (a lagging read is caught up). */
export const STORE_RECHECK_MS = 3_000;
/** A failed read is tried again after this long (times its place in the run of failures), at most STORE_RETRIES times. */
export const STORE_RETRY_MS = 5_000;
export const STORE_RETRIES = 2;
/** Foreground refreshes (tab visible, app resumed) at most this often. */
export const VISIBLE_EVERY_MS = 10_000;

export interface StoreSyncOptions {
  /** `GET /pawlegends/me` as a clean store state; null when it failed (the last state stays). */
  read(): Promise<PawlegendsStoreState | null>;
  /** Sends `store` to the game. */
  send(state: PawlegendsStoreState): void;
  /** A Firebase user exists (an account or a guest). Without one the game gets the empty store and nothing is read. */
  hasUser(): boolean;
  schedule?(fn: () => void, ms: number): void;
  now?(): number;
}

interface Floor {
  /** The pass season the floor belongs to (null: no season was known when the save landed). */
  season: string | null;
  xp: number;
  tier: number;
  yarn: number | null;
}

export const EMPTY_STORE: PawlegendsStoreState = Object.freeze({ items: [], season: null }) as PawlegendsStoreState;

/** `state` with the floor's totals where they are higher (same season only). Pure. */
export function withFloor(state: PawlegendsStoreState, floor: Floor | null): PawlegendsStoreState {
  if (!floor) return state;
  let out = state;
  const s = state.season;
  if (s && (floor.season === null || floor.season === s.id) && (floor.xp > s.xp || floor.tier > s.tier)) {
    out = { ...out, season: { ...s, xp: Math.max(s.xp, floor.xp), tier: Math.max(s.tier, floor.tier) } };
  }
  const c = state.champions;
  if (c && floor.yarn !== null && floor.yarn > c.yarn.balance) {
    out = { ...out, champions: { ...c, yarn: { ...c.yarn, balance: floor.yarn } } };
  }
  return out;
}

/** True once a read shows every total of the floor (it can be dropped). Pure. */
export function caughtUp(state: PawlegendsStoreState, floor: Floor): boolean {
  const s = state.season;
  if (s && (floor.season === null || floor.season === s.id) && (s.xp < floor.xp || s.tier < floor.tier)) return false;
  const c = state.champions;
  if (c && floor.yarn !== null && c.yarn.balance < floor.yarn) return false;
  return true;
}

export class StoreSync {
  private last: PawlegendsStoreState | null = null;
  private floor: Floor | null = null;
  private busy: Promise<void> | null = null;
  private again = false;
  private lastRead = -Infinity;
  /** Failed reads in a row (the retry budget). */
  private fails = 0;
  private readonly schedule: (fn: () => void, ms: number) => void;
  private readonly now: () => number;

  constructor(private readonly opts: StoreSyncOptions) {
    this.schedule = opts.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
    this.now = opts.now ?? (() => Date.now());
  }

  /** The last state sent to the game (the store sheet reads a champion bundle's price from it). */
  get state(): PawlegendsStoreState | null {
    return this.last;
  }

  /** Re-reads the store and sends it. Concurrent calls share one read, plus one more after it. */
  refresh(): Promise<void> {
    if (this.busy) {
      this.again = true;
      return this.busy;
    }
    this.busy = (async () => {
      this.lastRead = this.now();
      if (!this.opts.hasUser()) {
        this.floor = null;
        this.accept(EMPTY_STORE);
        return;
      }
      let read: PawlegendsStoreState | null = null;
      try {
        read = await this.opts.read();
      } catch {
        read = null;
      }
      if (read) {
        this.fails = 0;
        this.accept(read);
      } else if (this.fails < STORE_RETRIES) {
        this.fails++;
        this.schedule(() => void this.refresh(), STORE_RETRY_MS * this.fails);
      } else this.fails = 0;
    })().finally(() => {
      this.busy = null;
      if (this.again) {
        this.again = false;
        void this.refresh();
      }
    });
    return this.busy;
  }

  /**
   * A fresh state from elsewhere (a pass claim or a champion unlock answers the new `me`): sent as it is, under the
   * floor of a save it may not include yet.
   */
  accept(state: PawlegendsStoreState): void {
    if (this.floor && caughtUp(state, this.floor)) this.floor = null;
    const out = withFloor(state, this.floor);
    this.last = out;
    this.opts.send(out);
  }

  /**
   * A match save ended `saved` (solo or party, with or without an answer): the answer's totals go to the game now,
   * then the store is read now and once more after `STORE_RECHECK_MS`.
   */
  saved(season?: PawlegendsSaveSeason | null): void {
    if (season) {
      const prev = this.floor;
      const id = this.last?.season?.id ?? null;
      const yarn = season.yarn ? season.yarn.balance : null;
      this.floor = {
        season: id,
        xp: Math.max(season.xp, prev && prev.season === id ? prev.xp : 0),
        tier: Math.max(season.tier, prev && prev.season === id ? prev.tier : 0),
        yarn: yarn === null ? (prev?.yarn ?? null) : Math.max(yarn, prev?.yarn ?? 0),
      };
      if (this.last) this.accept(this.last);
    }
    void this.refresh();
    this.schedule(() => void this.refresh(), STORE_RECHECK_MS);
  }

  /**
   * The page or the app came back to the foreground: a refresh unless one ran in the last `VISIBLE_EVERY_MS`. True
   * when it refreshed (the host then re-reads the profile too).
   */
  visible(): boolean {
    if (this.now() - this.lastRead < VISIBLE_EVERY_MS) return false;
    void this.refresh();
    return true;
  }

  /** Another user signed in or out: the old account's floor and state are dropped. */
  reset(): void {
    this.floor = null;
    this.last = null;
  }
}
