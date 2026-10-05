/**
 * The Cat Yard as Token Tails' HOME: the same garden, light and camera, with the player's own cats
 * (their client spritesheets, hats and all) instead of the 58 manifest breeds.
 *
 * Built by `npm run build:client` as a second entry next to the game (`build/home-<hash>.js`,
 * sharing the three.js chunk) and imported by the client at runtime. The contract lives in
 * shared/home-yard.ts. No sim, no audio, no scores: feeding resolves here and the client saves the
 * cat's status itself.
 */
import { CAT_ROWS, type SheetEntry } from '../types';
import { loadVoxelSheet, type VoxelSheet } from '../render/voxel/sheets';
import { createYard, type YardAPI, type YardCardInfo } from '../yard/Yard';
import {
  HOME_YARD_API_VERSION,
  HOME_YARD_MAX_CATS,
  pickHomeYardCats,
  sameHomeYardIds,
  type HomeYardAPI,
  type HomeYardCat,
  type HomeYardOptions,
  type HomeYardReady,
} from '../shared-contracts/home-yard';

export { HOME_YARD_API_VERSION };
export type { HomeYardAPI, HomeYardCat, HomeYardOptions, HomeYardReady };

/** Client sheets: 48 px frames, 15 columns, rows in CAT_ROWS order (same as the yard's breeds). */
export const CLIENT_SHEET_COLS = 15;

/** Stand-in for an active cat whose own sheet fails, so HOME is never empty (relative to assetBase). */
export const FALLBACK_SHEET = 'cats/grey.png';

/** Glow colour per ability type (the client's card colours, brightened for an additive glow). */
export const AURA_COLORS: Readonly<Record<string, number>> = {
  DARK: 0xc89be0,
  ELECTRIC: 0xfdf06a,
  FIRE: 0xff7f5f,
  ICE: 0xbfe4ff,
  SAND: 0xf5e6a0,
  WATER: 0x7fdcff,
  WIND: 0xf6c7ba,
};

/** Where a small crew spawns: in front of the fountain, by the food bowls. */
export const HOME_SPAWN = { x: -2.2, z: 4.2, r: 3.4 } as const;

/** Start zoom: closer for a few cats so they read as "my cats", wider for a crowd. */
export function homeZoom(count: number): number {
  if (count <= 1) return 1.7;
  if (count < 6) return 1.45;
  if (count < 12) return 1.2;
  return 1;
}

/** The card's fact line, e.g. "Rare fire cat · Hungry". */
export function homeFact(cat: HomeYardCat): string {
  const words = [cat.tier, cat.type].filter((w): w is string => !!w).map((w) => w.charAt(0) + w.slice(1).toLowerCase());
  const kind = words.length ? `${words.join(' ')} cat` : 'Your cat';
  const fed = cat.hungry ? 'Hungry' : 'Well fed';
  return `${kind} · ${fed}${cat.blessed ? ' · Blessed' : ''}`;
}

export function homeCard(cat: HomeYardCat | undefined): YardCardInfo | undefined {
  if (!cat) return undefined;
  return { fact: homeFact(cat), chooseLabel: cat.active ? 'ACTIVE' : 'SELECT', chooseDisabled: cat.active };
}

/** The always-on tag over the active cat. */
export function homeTag(cat: HomeYardCat | undefined): string {
  if (!cat) return '';
  return cat.hungry ? `${cat.name} · hungry` : cat.name;
}

/** A sheet source for loadVoxelSheet: rows are detected and named in CAT_ROWS order. */
export function sheetSource(cat: HomeYardCat, sheet = cat.sheetUrl) {
  return { id: cat.id, name: cat.name, sheet, cols: CLIENT_SHEET_COLS, rowNames: CAT_ROWS };
}

/** The yard entry for a loaded sheet (its detected rows, its resolved URL). */
export function entryFor(cat: HomeYardCat, sheet: VoxelSheet): SheetEntry {
  return { id: cat.id, name: cat.name, sheet: sheet.url, cols: sheet.cols, rows: sheet.rows };
}

export interface HomeYardDeps {
  loadSheet: typeof loadVoxelSheet;
  createYard: typeof createYard;
}

const DEFAULT_DEPS: HomeYardDeps = { loadSheet: loadVoxelSheet, createYard };

/**
 * Loads every sheet, keeps the ones that work (the active cat falls back to a stand-in sheet), and
 * reports the failures. Exported for tests.
 */
export async function loadHomeEntries(
  cats: HomeYardCat[],
  assetBase: string,
  loadSheet: HomeYardDeps['loadSheet'] = loadVoxelSheet,
): Promise<{ entries: SheetEntry[]; failed: string[] }> {
  const results = await Promise.allSettled(cats.map((c) => loadSheet(sheetSource(c), assetBase)));
  const entries: SheetEntry[] = [];
  const failed: string[] = [];
  for (let i = 0; i < cats.length; i++) {
    const cat = cats[i];
    const r = results[i];
    if (r.status === 'fulfilled') {
      entries.push(entryFor(cat, r.value));
      continue;
    }
    failed.push(cat.id);
    if (!cat.active) continue;
    try {
      const stand = await loadSheet(sheetSource(cat, FALLBACK_SHEET), assetBase);
      entries.unshift(entryFor(cat, stand));
    } catch {
      /* not even the stand-in: the yard shows the other cats */
    }
  }
  return { entries, failed };
}

/**
 * An active cat without a sheet gets the stand-in up front: pickHomeYardCats drops cats with no
 * sheet, and HOME must still show (and feed) the player's own cat.
 */
export function withActiveSheet(cats: readonly HomeYardCat[]): HomeYardCat[] {
  return cats.map((c) => (c && c.active && !c.sheetUrl ? { ...c, sheetUrl: FALLBACK_SHEET } : c));
}

export function createHomeYard(el: HTMLElement, options: HomeYardOptions, deps: HomeYardDeps = DEFAULT_DEPS): HomeYardAPI {
  const max = options.maxCats ?? HOME_YARD_MAX_CATS;
  let cats = pickHomeYardCats(withActiveSheet(options.cats), max);
  let byId = new Map(cats.map((c) => [c.id, c]));
  let yard: YardAPI | null = null;
  let generation = 0;
  let running = true;
  let disposed = false;
  let current: Promise<YardAPI | null> = Promise.resolve(null);
  let latest: Promise<{ yard: YardAPI | null; ready: HomeYardReady }> | null = null;

  const active = () => cats.find((c) => c.active);
  const tier = options.quality === 'low' || options.quality === 'high' ? options.quality : undefined;

  function build(): Promise<{ yard: YardAPI | null; ready: HomeYardReady }> {
    const gen = ++generation;
    const list = cats;
    const p = loadHomeEntries(list, options.assetBase, deps.loadSheet).then(async ({ entries, failed }) => {
      for (const id of failed) options.onSheetError?.(id);
      if (gen !== generation || disposed) return { yard: null, ready: { loaded: 0, failed } };
      const me = list.find((c) => c.active);
      yard?.dispose();
      yard = deps.createYard(el, null, {
        base: options.assetBase,
        entries,
        highlight: me?.id ?? null,
        highlightLabel: homeTag(me),
        describe: (id) => homeCard(byId.get(id)),
        aura: (id) => {
          const c = byId.get(id);
          return c?.blessed ? (AURA_COLORS[c.type ?? ''] ?? 0xffc93c) : null;
        },
        spawnNear: entries.length <= 12 ? HOME_SPAWN : undefined,
        initialFocus: me?.id ?? null,
        initialZoom: homeZoom(entries.length),
        tier,
        reducedMotion: options.reducedMotion,
        cardBottomPx: options.cardBottomPx,
        autoStart: running,
        chooseLabel: 'SELECT',
        onSelect: (id) => options.onSelect?.(id),
        onChoose: (id) => {
          if (!byId.get(id)?.active) options.onChoose?.(id);
        },
        onSheetError: (id) => options.onSheetError?.(id),
        onEat: (id) => options.onEating?.(id),
        onContextLost: () => options.onContextLost?.(),
        // Token Tails serves Nunito itself.
        nunitoFace: false,
      });
      const built = yard;
      await built.ready;
      return { yard: built, ready: { loaded: entries.length, failed } };
    });
    current = p.then((r) => r.yard).catch(() => null);
    latest = p;
    return p;
  }

  // A setCats() rebuild before the first build finished: ready waits for the newest build.
  const first = build();
  const ready = first.then((r) => (r.yard || disposed || !latest || latest === first ? r.ready : latest.then((n) => n.ready)));

  const api: HomeYardAPI = {
    ready,
    setCats(next) {
      if (disposed) return;
      const picked = pickHomeYardCats(withActiveSheet(next), max);
      const same = sameHomeYardIds(cats, picked);
      cats = picked;
      byId = new Map(cats.map((c) => [c.id, c]));
      if (same && yard) {
        const me = active();
        yard.setHighlight(me?.id ?? null, homeTag(me));
        yard.refreshCard();
        return;
      }
      void build();
    },
    async feed(id) {
      const y = await current;
      if (!y || disposed) return;
      await y.feed(id);
      // A rebuild (new cats) or dispose ended the meal early: no onFed, so no EAT save for a meal
      // that never finished; the caller's FEED button comes back.
      if (disposed || y !== yard) return;
      options.onFed?.(id);
    },
    select(id) {
      yard?.select(id);
    },
    focus(id) {
      yard?.focus(id);
    },
    start() {
      running = true;
      yard?.start();
    },
    stop() {
      running = false;
      yard?.stop();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      yard?.dispose();
      yard = null;
    },
    stats() {
      return yard?.stats() ?? null;
    },
    screenPositions() {
      return yard?.screenPositions() ?? [];
    },
  };
  return api;
}
