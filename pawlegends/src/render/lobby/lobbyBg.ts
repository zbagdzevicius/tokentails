/**
 * UX pass 2: which painted lobby scene shows, and at what size (public/assets/lobby/, Gemini art; LICENSES.md).
 *
 * - `meadow`: the game's own world at dusk (the river, the paw-print bridge, the cat castle and the dog fort). The
 *   first visit always gets it: it tells the cats-vs-dogs story and its hero zone is the darkest (pale heroes read).
 * - `arena`: a cosy tournament stadium at sunset (paw pennants left, bone pennants right). Every third visit.
 *
 * - `castles` (feel pass A1): the same story in daylight (cat castle left, dog fort right, a diagonal river). The
 *   first visit and every visit that is not the meadow's or the arena's turn.
 *
 * Feel pass (A2, A4): the pick and results screens swap in their own painted scene (public/assets/screens/): a
 * spotlight stage while picking, and a victory or rainy-porch defeat scene for the hero's species on the results.
 *
 * Sizes: 1280 px wide for phones and Low tier, 1920 px when the drawing buffer is wider than ~1400 px. WebP only
 * (every browser the game supports decodes it; the soft paintings are 20–45 KB, so AVIF would save a few KB).
 * Pure apart from `lobbyBgVisit` (a per-device counter in localStorage, guarded).
 */
export const LOBBY_BGS = ['castles', 'meadow', 'arena'] as const;
/** Scenes tied to a screen (public/assets/screens/), not to the visit. */
export const SCREEN_BGS = ['stage', 'win-cat', 'win-dog', 'lose-cat', 'lose-dog'] as const;
export type LobbyBg = (typeof LOBBY_BGS)[number] | (typeof SCREEN_BGS)[number];

const VISIT_KEY = 'tt.pawlegends.lobbybg.v1';

/** The scene for the n-th visit (1-based): the daylight castles, the dusk meadow on 2, 5, 8…, the arena on 3, 6, 9…. */
export function lobbyBgFor(visit: number): (typeof LOBBY_BGS)[number] {
  if (visit > 0 && visit % 3 === 0) return 'arena';
  return visit > 0 && visit % 3 === 2 ? 'meadow' : 'castles';
}

/** The screen's own scene (`data-screen` on <html>), or null to keep the visit's scene. */
export function screenBg(screen: string | undefined, o: { won: boolean; side: 'cat' | 'dog' }): LobbyBg | null {
  if (screen === 'pick') return 'stage';
  if (screen === 'results') return `${o.won ? 'win' : 'lose'}-${o.side}`;
  return null;
}

/** The file for a scene: the 1920 px one on a wide, not-Low screen. */
export function lobbyBgUrl(bg: LobbyBg, o: { base: string; bufferWidth: number; low: boolean }): string {
  const w = !o.low && o.bufferWidth > 1400 ? 1920 : 1280;
  if (bg === 'stage') return `${o.base}assets/screens/pick-stage-${w}.webp`;
  const dir = (SCREEN_BGS as readonly string[]).includes(bg) ? 'screens' : 'lobby';
  return `${o.base}assets/${dir}/${bg}-${w}.webp`;
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
export function lobbyBgOverride(search: string): (typeof LOBBY_BGS)[number] | null {
  const v = new URLSearchParams(search).get('lobbybg');
  return (LOBBY_BGS as readonly string[]).includes(v ?? '') ? (v as (typeof LOBBY_BGS)[number]) : null;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
