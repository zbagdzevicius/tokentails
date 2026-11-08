/**
 * Party play local settings (docs/plans/moba/MULTIPLAYER.md §7 M1): "Hide names" (friends read "Teammate 2" in the
 * lobby, the pick and the match; for streams and screenshots). Per device, never sent anywhere. Storage may be
 * blocked: reads fall back to off.
 */
const KEY = 'pl.party.hideNames';

export function hideNames(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setHideNames(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* blocked storage: this session only */
  }
}

/**
 * Quick Play (M1A-IMPL.md §6): the side this viewer last queued for (cats, dogs or either), the default of the next
 * "Play online". A per-viewer convenience only: blocked storage falls back to "either".
 */
export type QueueSide = 'cat' | 'dog' | 'any';
const SIDE_KEY = 'pl.party.queueSide';

export function lastQueueSide(): QueueSide {
  try {
    const v = localStorage.getItem(SIDE_KEY);
    return v === 'cat' || v === 'dog' ? v : 'any';
  } catch {
    return 'any';
  }
}

export function setLastQueueSide(side: QueueSide): void {
  try {
    if (side === 'any') localStorage.removeItem(SIDE_KEY);
    else localStorage.setItem(SIDE_KEY, side);
  } catch {
    /* blocked storage: this session only */
  }
}

/**
 * Casual PvP (docs/plans/moba/V16.md §5): the online mode this viewer last used (Co-op vs bots or PvP). The default is
 * Co-op until 5 completed matches, then the last one used. Blocked storage falls back to Co-op.
 */
export type OnlineMode = 'coop' | 'pvp';
const MODE_KEY = 'pl.party.onlineMode';

export function onlineMode(matches: number): OnlineMode {
  if (matches < 5) return 'coop';
  try {
    return localStorage.getItem(MODE_KEY) === 'pvp' ? 'pvp' : 'coop';
  } catch {
    return 'coop';
  }
}

export function setOnlineMode(mode: OnlineMode): void {
  try {
    if (mode === 'pvp') localStorage.setItem(MODE_KEY, 'pvp');
    else localStorage.removeItem(MODE_KEY);
  } catch {
    /* blocked storage: this session only */
  }
}
