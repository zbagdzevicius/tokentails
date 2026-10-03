/**
 * First-run (FTUE) memory for the Heist (plan G10 "Heist"): which level briefs this player has seen
 * and whether the route hint and rewind have ever been used. Versioned, one JSON value in
 * localStorage, every read and write in try/catch. When storage is blocked (private mode, sandboxed
 * frames) the store keeps the answers in memory for the page, so a brief still shows only once per
 * visit.
 *
 * This is a convenience only: losing it means a brief shows again, never lost progress.
 */

export const FTUE_KEY = 'catnip-heist.ftue.v1';
export const FTUE_VERSION = 1;

export interface FtueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface FtueData {
  v: number;
  /** Level ids whose brief card the player has dismissed. */
  briefs: string[];
  /** Times the player opened the route hint themselves (tap or H). */
  routeTaps: number;
  /** Times the player used Rewind 5 s. */
  rewinds: number;
}

const empty = (): FtueData => ({ v: FTUE_VERSION, briefs: [], routeTaps: 0, rewinds: 0 });

/** Parses a stored value; anything malformed or from another version starts fresh. */
export function parseFtue(raw: string | null | undefined): FtueData {
  if (!raw) return empty();
  try {
    const d = JSON.parse(raw) as Partial<FtueData> | null;
    if (!d || typeof d !== 'object' || d.v !== FTUE_VERSION) return empty();
    const briefs = Array.isArray(d.briefs) ? d.briefs.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length < 64) : [];
    const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
    return { v: FTUE_VERSION, briefs: [...new Set(briefs)], routeTaps: count(d.routeTaps), rewinds: count(d.rewinds) };
  } catch {
    return empty();
  }
}

function defaultStorage(): FtueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export class FtueStore {
  private data: FtueData;
  private readonly storage: FtueStorage | null;

  constructor(storage: FtueStorage | null = defaultStorage()) {
    this.storage = storage;
    let raw: string | null = null;
    try {
      raw = storage?.getItem(FTUE_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.data = parseFtue(raw);
  }

  /** True once the brief of `levelId` was dismissed (on this device). */
  briefSeen(levelId: string): boolean {
    return this.data.briefs.includes(levelId);
  }

  markBriefSeen(levelId: string): void {
    if (this.briefSeen(levelId)) return;
    this.data = { ...this.data, briefs: [...this.data.briefs, levelId] };
    this.save();
  }

  noteRouteTap(): void {
    this.data = { ...this.data, routeTaps: this.data.routeTaps + 1 };
    this.save();
  }

  noteRewind(): void {
    this.data = { ...this.data, rewinds: this.data.rewinds + 1 };
    this.save();
  }

  /** True when the player has never opened the route hint or rewound (first-run tips show). */
  get novice(): boolean {
    return this.data.routeTaps === 0 && this.data.rewinds === 0;
  }

  toJSON(): FtueData {
    return { ...this.data, briefs: [...this.data.briefs] };
  }

  /** Forget everything (QA). */
  reset(): void {
    this.data = empty();
    this.save();
  }

  private save(): void {
    try {
      this.storage?.setItem(FTUE_KEY, JSON.stringify(this.data));
    } catch {
      /* storage blocked: keep the in-memory copy */
    }
  }
}
