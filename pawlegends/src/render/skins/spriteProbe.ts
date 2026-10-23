/**
 * Runtime sprite probe (GDD §7.2 card skins): for a family missing from the generated table, and for a variant's
 * accent colour (a hat, a bow tie), read IDLE frame 0 of the cat's sprite sheet.
 *
 * - `fetch(url, {mode:'cors', credentials:'omit'})`: the CDN answers CORS only to requests that carry an Origin,
 *   so a plain or no-cors `<img>` load is never reused
 * - `createImageBitmap(blob, 0, 192, 48, 48)` decodes only that frame; one shared 48 × 48 canvas; `close()` after
 * - lazy (a tile on screen, a skin worn), at most 2 at a time, 4 s timeout, never during a match (`setProbeBlocked`)
 * - cached in memory and in localStorage `tt.pawlegends.skinprobe.v1` by an FNV hash of the URL: at most 64
 *   entries; failures (403, timeout) are kept 24 h so missing files are not fetched on every visit. Every storage
 *   access is in try/catch.
 */
import { accentOf, classifySprite, rowOf, type SkinRow, type SpriteFrame } from './classify';

export const PROBE_KEY = 'tt.pawlegends.skinprobe.v1';
export const PROBE_MAX = 64;
export const PROBE_CONCURRENCY = 2;
export const PROBE_TIMEOUT_MS = 4000;
export const NEGATIVE_TTL_MS = 24 * 3600 * 1000;

export interface ProbeEntry {
  /** ms when it was stored (LRU and the negative TTL). */
  t: number;
  ok: boolean;
  row?: SkinRow;
  accent?: number | null;
}

export function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

let mem: Map<string, ProbeEntry> | null = null;
let blocked = false;
let running = 0;
const queue: { url: string; family: readonly number[]; done: (e: ProbeEntry) => void }[] = [];
const pending = new Set<string>();
let now = (): number => Date.now();

function load(): Map<string, ProbeEntry> {
  if (mem) return mem;
  mem = new Map();
  try {
    const raw = localStorage.getItem(PROBE_KEY);
    const o = raw ? (JSON.parse(raw) as Record<string, ProbeEntry>) : {};
    for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object' && typeof v.t === 'number' && typeof v.ok === 'boolean') mem.set(k, v);
  } catch {
    /* blocked or corrupt: memory only */
  }
  return mem;
}

function save(): void {
  const m = load();
  while (m.size > PROBE_MAX) {
    let oldest: string | null = null;
    let t = Infinity;
    for (const [k, v] of m) if (v.t < t) {
      t = v.t;
      oldest = k;
    }
    if (oldest === null) break;
    m.delete(oldest);
  }
  try {
    localStorage.setItem(PROBE_KEY, JSON.stringify(Object.fromEntries(m)));
  } catch {
    /* storage blocked */
  }
}

/** The cached result for a sprite URL (expired failures count as unknown). */
export function probeResult(url: string): ProbeEntry | undefined {
  const e = load().get(fnv(url));
  if (!e) return undefined;
  if (!e.ok && now() - e.t > NEGATIVE_TTL_MS) return undefined;
  return e;
}

/** Probes that finished while blocked: stored and reported only when the block lifts. */
const held: { url: string; e: ProbeEntry; done: (e: ProbeEntry) => void }[] = [];

function land(url: string, e: ProbeEntry, done: (e: ProbeEntry) => void): void {
  load().set(fnv(url), e);
  save();
  done(e);
}

/**
 * Matches block probes (a match uses what was cached at its start): no new job starts, and a probe already in flight
 * when the match began is neither cached nor reported (no rev bump, no palette change) until the block lifts.
 */
export function setProbeBlocked(on: boolean): void {
  blocked = on;
  if (on) return;
  for (const h of held.splice(0)) {
    pending.delete(h.url);
    land(h.url, h.e, h.done);
  }
  pump();
}

/**
 * Probe a sprite (no-op when cached, queued or blocked); `done` gets the entry. `family` are the family palette
 * colours the accent must differ from (empty: none known).
 */
export function requestProbe(url: string, family: readonly number[], done: (e: ProbeEntry) => void): boolean {
  if (probeResult(url) || pending.has(url) || typeof fetch !== 'function' || typeof createImageBitmap !== 'function') return false;
  pending.add(url);
  queue.push({ url, family, done });
  pump();
  return true;
}

let canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
function ctx2d(): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
  if (!canvas) {
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(48, 48);
    else if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 48;
      c.height = 48;
      canvas = c;
    } else return null;
  }
  return canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
}

function pump(): void {
  while (!blocked && running < PROBE_CONCURRENCY && queue.length) {
    const job = queue.shift() as (typeof queue)[number];
    running++;
    void run(job.url, job.family)
      .then((e) => {
        if (blocked) held.push({ url: job.url, e, done: job.done });
        else land(job.url, e, job.done);
      })
      .finally(() => {
        running--;
        if (!held.some((h) => h.url === job.url)) pending.delete(job.url);
        pump();
      });
  }
}

async function run(url: string, family: readonly number[]): Promise<ProbeEntry> {
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ac?.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ac?.signal });
    if (!res.ok) return { t: now(), ok: false };
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob, 0, 4 * 48, 48, 48);
    try {
      const g = ctx2d();
      if (!g) return { t: now(), ok: false };
      g.clearRect(0, 0, 48, 48);
      g.drawImage(bmp, 0, 0);
      const img = g.getImageData(0, 0, 48, 48);
      const frame: SpriteFrame = { data: img.data, width: 48, height: 48, kind: 'idle' };
      const row = rowOf(classifySprite([frame]));
      const accent = family.length ? accentOf([frame], family) : null;
      return { t: now(), ok: true, row, accent };
    } finally {
      bmp.close();
    }
  } catch {
    return { t: now(), ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Tests only. */
export function resetProbe(clock?: () => number): void {
  mem = null;
  blocked = false;
  running = 0;
  queue.length = 0;
  held.length = 0;
  pending.clear();
  canvas = null;
  now = clock ?? (() => Date.now());
}
