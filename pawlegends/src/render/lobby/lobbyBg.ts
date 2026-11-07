/**
 * UX pass 2: which painted lobby scene shows, and at what size (public/assets/lobby/, Gemini art; LICENSES.md).
 *
 * - `meadow`: the game's own world at dusk (the river, the paw-print bridge, the cat castle and the dog fort). The
 *   first visit always gets it: it tells the cats-vs-dogs story and its hero zone is the darkest (pale heroes read).
 * - `arena`: a cosy tournament stadium at sunset (paw pennants left, bone pennants right). Every third visit.
 *
 * Sizes: 1280 px wide for phones and Low tier, 1920 px when the drawing buffer is wider than ~1400 px. WebP only
 * (every browser the game supports decodes it; the soft paintings are 20–45 KB, so AVIF would save a few KB).
 * Pure apart from `lobbyBgVisit` (a per-device counter in localStorage, guarded).
 */
export const LOBBY_BGS = ['meadow', 'arena'] as const;
export type LobbyBg = (typeof LOBBY_BGS)[number];

const VISIT_KEY = 'tt.pawlegends.lobbybg.v1';

/** The scene for the n-th visit (1-based): the meadow, with the arena on every third visit. */
export function lobbyBgFor(visit: number): LobbyBg {
  return visit > 0 && visit % 3 === 0 ? 'arena' : 'meadow';
}

/** The file for a scene: the 1920 px one on a wide, not-Low screen. */
export function lobbyBgUrl(bg: LobbyBg, o: { base: string; bufferWidth: number; low: boolean }): string {
  const w = !o.low && o.bufferWidth > 1400 ? 1920 : 1280;
  return `${o.base}assets/lobby/${bg}-${w}.webp`;
}

/** Counts this page load as one visit and returns its number (1 when storage is blocked). */
export function lobbyBgVisit(store: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): number {
  try {
    const n = Math.max(0, Math.floor(Number(store?.getItem(VISIT_KEY) ?? 0)) || 0) + 1;
    store?.setItem(VISIT_KEY, String(n));
    return n;
  } catch {
    return 1;
  }
}

/** `?lobbybg=arena` (e2e, screenshots) picks a scene outright. */
export function lobbyBgOverride(search: string): LobbyBg | null {
  const v = new URLSearchParams(search).get('lobbybg');
  return (LOBBY_BGS as readonly string[]).includes(v ?? '') ? (v as LobbyBg) : null;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
