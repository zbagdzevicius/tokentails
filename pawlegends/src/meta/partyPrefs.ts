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
