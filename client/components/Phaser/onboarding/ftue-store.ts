/**
 * First-run state per browser (plan G10): which start gates and hints were seen and the assists
 * (per device), plus the local clears cache and the hard deaths per level (per player).
 *
 * Pure (no Phaser, no React). Stored as one versioned JSON blob in `localStorage`. Every read and
 * write is wrapped: with storage blocked (private mode, Safari ITP, a full quota) the store keeps
 * working from memory for this page, so a first-run flow never throws and never repeats within the
 * page. A blob that does not parse is dropped; a v1 blob keeps its gates, hints and assists and
 * drops its clears and hard deaths (v1 did not record whose they were).
 *
 * Clears and hard deaths are kept per player (`setOwner`, the profile id), so a shared device or a
 * guest who becomes a new account never inherits another player's progress (5a review #1).
 *
 * Local clears are a cache only: the server's cleared arrays (`catnipChaosCleared` and friends) are
 * the truth (decision #67). A clear stays "pending" from the won run until its `/live` save answers
 * (`settleClear`) or `PENDING_CLEAR_TTL_MS` passes; `progress.clearedFlags` honours only pending
 * clears over a server array. Without a server array (a signed-out run, an older backend) every
 * local clear counts.
 */

export const FTUE_STORE_KEY = "tt.ftue";
export const FTUE_STORE_VERSION = 2;
/** How long a won run's clear counts over the server array while its save is in flight. */
export const PENDING_CLEAR_TTL_MS = 2 * 60 * 1000;
/** The owner used while no profile is loaded (signed out, or before the profile answers). */
export const ANON_OWNER = "anon";

/** Assists (plan G10, decision #71: they do not flag runs while Purrsuit has no ranked board). */
export interface FtueAssists {
  /** "Slow-mo on every hazard": every spike run gets the slow-motion teach, not just the first. */
  slowMo: boolean;
  /** "Extra guards": more Paw Guards per attempt (see `pawGuardAllowance`). */
  extraGuards: boolean;
}

export type FtueAssistName = keyof FtueAssists;

export interface FtueData {
  v: typeof FTUE_STORE_VERSION;
  /** `${mode}:${level}` -> first time the full gate was shown (ms). */
  gates: Record<string, number>;
  /** `${mode}:${hint}` -> when the hint was done (ms). */
  hints: Record<string, number>;
  assists: FtueAssists;
  /** owner (profile id) -> that player's clears and hard deaths on this device. */
  players: Record<string, FtuePlayerData>;
}

export interface FtuePlayerData {
  /** mode -> level keys cleared on this device. */
  clears: Record<string, string[]>;
  /** `${mode}:${level}` -> when the won run happened, while its save has not answered. */
  pending: Record<string, number>;
  /** `${mode}:${level}` -> hard deaths since the last clear of that level. */
  hardDeaths: Record<string, number>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface FtueStoreOptions {
  storage?: () => StorageLike | null;
  now?: () => number;
}

const emptyData = (): FtueData => ({
  v: FTUE_STORE_VERSION,
  gates: {},
  hints: {},
  assists: { slowMo: false, extraGuards: false },
  players: {},
});

const emptyPlayer = (): FtuePlayerData => ({ clears: {}, pending: {}, hardDeaths: {} });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const numberRecord = (value: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!isRecord(value)) return out;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number" && Number.isFinite(entry)) out[key] = entry;
  }
  return out;
};

const stringListRecord = (value: unknown): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  if (!isRecord(value)) return out;
  for (const [mode, levels] of Object.entries(value)) {
    if (Array.isArray(levels)) out[mode] = levels.filter((level): level is string => typeof level === "string");
  }
  return out;
};

/**
 * Parses a stored blob. Anything that does not parse, or is from an unknown version, gives `null`.
 * A v1 blob keeps its device-level state (gates, hints, assists) and drops its clears and hard
 * deaths, which had no owner.
 */
export function parseFtueData(raw: string | null): FtueData | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || (parsed.v !== FTUE_STORE_VERSION && parsed.v !== 1)) return null;
  const players: Record<string, FtuePlayerData> = {};
  if (parsed.v === FTUE_STORE_VERSION && isRecord(parsed.players)) {
    for (const [owner, player] of Object.entries(parsed.players)) {
      if (!isRecord(player)) continue;
      players[owner] = {
        clears: stringListRecord(player.clears),
        pending: numberRecord(player.pending),
        hardDeaths: numberRecord(player.hardDeaths),
      };
    }
  }
  const assists = isRecord(parsed.assists) ? parsed.assists : {};
  return {
    v: FTUE_STORE_VERSION,
    gates: numberRecord(parsed.gates),
    hints: numberRecord(parsed.hints),
    assists: { slowMo: assists.slowMo === true, extraGuards: assists.extraGuards === true },
    players,
  };
}

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

const key = (mode: string, sub: string | null | undefined) => `${mode}:${sub ?? ""}`;

export interface FtueStore {
  /** Whether the full start gate was shown for this mode and level. */
  gateSeen(mode: string, level: string | null | undefined): boolean;
  markGateSeen(mode: string, level: string | null | undefined): void;
  hintDone(mode: string, hint: string): boolean;
  markHintDone(mode: string, hint: string): void;
  /**
   * Whose clears and hard deaths the store reads and writes: the profile id, or null while no
   * profile is loaded. Silent (no notification), so it is safe to call during a render.
   */
  setOwner(owner: string | null | undefined): void;
  owner(): string;
  /** The current player's clears on this device (the cache). */
  localClears(mode: string): string[];
  /** The current player's clears whose save has not answered yet (within the TTL). */
  pendingClears(mode: string): string[];
  /** Records a won run's clear, pending until `settleClear`. */
  addLocalClear(mode: string, level: string): void;
  /** The save for that clear answered (either way): the server's array is the truth again. */
  settleClear(mode: string, level: string): void;
  assists(): FtueAssists;
  setAssist(name: FtueAssistName, on: boolean): void;
  hardDeaths(mode: string, level: string | null | undefined): number;
  /** Counts one hard death and returns the new count. */
  addHardDeath(mode: string, level: string | null | undefined): number;
  resetHardDeaths(mode: string, level: string | null | undefined): void;
  /** The whole state (a copy). */
  snapshot(): FtueData;
  subscribe(listener: () => void): () => void;
  /** Forgets one player's clears and hard deaths on this device. */
  forgetOwner(owner: string): void;
  /** Forgets everything (tests, sign-out of a shared device). */
  reset(): void;
}

export function createFtueStore(options: FtueStoreOptions = {}): FtueStore {
  const getStorage = options.storage ?? defaultStorage;
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<() => void>();
  let memory: FtueData | null = null;
  let currentOwner = ANON_OWNER;

  const load = (): FtueData => {
    if (memory) return memory;
    let raw: string | null = null;
    try {
      raw = getStorage()?.getItem(FTUE_STORE_KEY) ?? null;
    } catch {
      raw = null;
    }
    memory = parseFtueData(raw) ?? emptyData();
    return memory;
  };

  const save = (next: FtueData) => {
    memory = next;
    try {
      getStorage()?.setItem(FTUE_STORE_KEY, JSON.stringify(next));
    } catch {
      // Blocked or full: the in-memory copy holds for this page.
    }
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // A listener never breaks the store.
      }
    });
  };

  const update = (fn: (data: FtueData) => FtueData) => save(fn(load()));
  const player = (): FtuePlayerData => load().players[currentOwner] ?? emptyPlayer();
  const updatePlayer = (fn: (data: FtuePlayerData) => FtuePlayerData) =>
    update((data) => ({ ...data, players: { ...data.players, [currentOwner]: fn(data.players[currentOwner] ?? emptyPlayer()) } }));

  return {
    gateSeen: (mode, level) => key(mode, level) in load().gates,
    markGateSeen(mode, level) {
      if (key(mode, level) in load().gates) return;
      update((data) => ({ ...data, gates: { ...data.gates, [key(mode, level)]: now() } }));
    },
    hintDone: (mode, hint) => key(mode, hint) in load().hints,
    markHintDone(mode, hint) {
      if (key(mode, hint) in load().hints) return;
      update((data) => ({ ...data, hints: { ...data.hints, [key(mode, hint)]: now() } }));
    },
    setOwner(owner) {
      currentOwner = owner ? String(owner) : ANON_OWNER;
    },
    owner: () => currentOwner,
    localClears: (mode) => [...(player().clears[mode] ?? [])],
    pendingClears(mode) {
      const cutoff = now() - PENDING_CLEAR_TTL_MS;
      const prefix = `${mode}:`;
      return Object.entries(player().pending)
        .filter(([entry, at]) => entry.startsWith(prefix) && at >= cutoff)
        .map(([entry]) => entry.slice(prefix.length));
    },
    addLocalClear(mode, level) {
      const at = now();
      updatePlayer((data) => {
        const current = data.clears[mode] ?? [];
        return {
          ...data,
          clears: current.includes(level) ? data.clears : { ...data.clears, [mode]: [...current, level] },
          pending: { ...data.pending, [key(mode, level)]: at },
        };
      });
    },
    settleClear(mode, level) {
      if (!(key(mode, level) in player().pending)) return;
      updatePlayer((data) => {
        const pending = { ...data.pending };
        delete pending[key(mode, level)];
        return { ...data, pending };
      });
    },
    assists: () => ({ ...load().assists }),
    setAssist(name, on) {
      if (load().assists[name] === on) return;
      update((data) => ({ ...data, assists: { ...data.assists, [name]: on } }));
    },
    hardDeaths: (mode, level) => player().hardDeaths[key(mode, level)] ?? 0,
    addHardDeath(mode, level) {
      const next = (player().hardDeaths[key(mode, level)] ?? 0) + 1;
      updatePlayer((data) => ({ ...data, hardDeaths: { ...data.hardDeaths, [key(mode, level)]: next } }));
      return next;
    },
    resetHardDeaths(mode, level) {
      if (!(key(mode, level) in player().hardDeaths)) return;
      updatePlayer((data) => {
        const hardDeaths = { ...data.hardDeaths };
        delete hardDeaths[key(mode, level)];
        return { ...data, hardDeaths };
      });
    },
    forgetOwner(owner) {
      if (!(owner in load().players)) return;
      update((data) => {
        const players = { ...data.players };
        delete players[owner];
        return { ...data, players };
      });
    },
    snapshot: () => JSON.parse(JSON.stringify(load())) as FtueData,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      memory = emptyData();
      try {
        getStorage()?.removeItem?.(FTUE_STORE_KEY);
      } catch {
        // Nothing stored or storage blocked.
      }
      listeners.forEach((listener) => listener());
    },
  };
}

/** The app-wide store. */
export const ftueStore = createFtueStore();

/**
 * Test hook for client/e2e/purrsuit-ftue.spec.ts: with the e2e flag set before boot, the store is
 * reachable as `window.__ttFtue` so a trial can reset the first-run state without a reload. Dev
 * and E2E builds only; `process.env.NODE_ENV` is inlined, so production drops the branch.
 */
if (
  typeof window !== "undefined" &&
  (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_E2E === "1") &&
  (window as unknown as Record<string, unknown>).__TT_E2E__ === true
) {
  (window as unknown as Record<string, unknown>).__ttFtue = ftueStore;
}
