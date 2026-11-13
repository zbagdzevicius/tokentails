/**
 * Whether a Paw Legends match is running in the game frame, for the page chrome that must never sit over the match HUD
 * (the analytics consent bar: gaps.md F1, "the cookie banner covers the ability buttons in the first match").
 *
 * Two sources, either one is enough:
 * - the bridge: the game's own relayed events (`match_start` / `mp_match_start` start a match; `match_end`,
 *   `mp_match_end`, `title_view`, a `match-result`, a `party-result` or a fresh `ready` end it). PawlegendsHost feeds
 *   them in with `noteGameEvent` / `setInMatch`;
 * - a probe the host registers: the game frame's `html[data-match="live"]` (same origin), for a player who turned the
 *   game's own stats off in Settings (the game then relays no events).
 *
 * No React here: a tiny external store (`subscribeMatch`, `isInMatch`) for `useSyncExternalStore`, unit-tested.
 */

const STARTS: ReadonlySet<string> = new Set(["match_start", "mp_match_start"]);
const ENDS: ReadonlySet<string> = new Set(["match_end", "mp_match_end", "title_view"]);

let fromEvents = false;
let probe: (() => boolean) | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

/** The bridge says a match started or ended. */
export function setInMatch(value: boolean): void {
  if (fromEvents === value) return;
  fromEvents = value;
  emit();
}

/** One of the game's relayed analytics events (`analytics {event}`): only the match start and end ones matter. */
export function noteGameEvent(name: string): void {
  if (STARTS.has(name)) setInMatch(true);
  else if (ENDS.has(name)) setInMatch(false);
}

/** The host's look into its own frame (null removes it). Must never throw out: errors read as "no match". */
export function registerMatchProbe(next: (() => boolean) | null): void {
  probe = next;
  emit();
}

export function isInMatch(): boolean {
  if (fromEvents) return true;
  try {
    return probe?.() === true;
  } catch {
    return false;
  }
}

/** Subscribe (useSyncExternalStore). A listener is called on every change of the bridge state or the probe. */
export function subscribeMatch(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-read the probe (the consent bar calls this on a short timer while it is open). */
export function pokeMatch(): void {
  emit();
}

/** The game frame's own flag: `html[data-match="live"]` while a match runs (pawlegends/src/app). */
export function frameMatchProbe(frame: () => HTMLIFrameElement | null): () => boolean {
  return () => {
    try {
      return frame()?.contentDocument?.documentElement?.dataset?.match === "live";
    } catch {
      // another origin (a preview host): the bridge events decide alone
      return false;
    }
  };
}

/** Tests only. */
export function resetMatchPresence(): void {
  fromEvents = false;
  probe = null;
  listeners.clear();
}
