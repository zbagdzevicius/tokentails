/**
 * Haptics in the app (iPhone and Android). WKWebView has no `navigator.vibrate`, so the game's haptics (pawlegends/src/ui/haptics.ts,
 * input/Input.js, the party nudge) were silent on iPhone. The shell installs a `navigator.vibrate` that maps the
 * game's patterns to the native Taptic Engine (@capacitor/haptics). The game needs no change, and the web build keeps
 * using the real Vibration API.
 */

export type ImpactStyle = 'LIGHT' | 'MEDIUM' | 'HEAVY';

export interface HapticsLike {
  impact(o: { style: ImpactStyle }): Promise<void>;
}

/** The impact for one buzz of `ms` milliseconds (the game's buzzes are 8 to 25 ms; a nudge is 200). */
export function styleFor(ms: number): ImpactStyle | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  if (ms <= 10) return 'LIGHT';
  if (ms <= 20) return 'MEDIUM';
  return 'HEAVY';
}

/** The impacts (and when, in ms) for a vibrate pattern: odd entries are pauses. */
export function impactsFor(p: number | readonly number[]): { at: number; style: ImpactStyle }[] {
  const list = typeof p === 'number' ? [p] : [...p];
  const out: { at: number; style: ImpactStyle }[] = [];
  let t = 0;
  for (let i = 0; i < list.length && i < 16; i++) {
    const ms = Math.max(0, Number(list[i]) || 0);
    if (i % 2 === 0) {
      const style = styleFor(ms);
      if (style) out.push({ at: t, style });
    }
    t += ms;
  }
  return out;
}

/**
 * Install the bridge on `nav`. Without `force` only when it has no vibrate of its own (iPhone). With `force` it
 * replaces the WebView's own vibrate: on Android the WebView's Vibration API turns the game's 8 to 12 ms buzzes into
 * motor pulses too short to feel on many phones, while @capacitor/haptics plays the system's tuned click effects.
 * Returns whether it was installed.
 */
export function installVibrate(nav: Navigator, haptics: HapticsLike, schedule: (fn: () => void, ms: number) => unknown = setTimeout, force = false): boolean {
  if (!force && typeof (nav as { vibrate?: unknown }).vibrate === 'function') return false;
  const vibrate = (p: number | number[]): boolean => {
    const hits = impactsFor(p);
    for (const h of hits) {
      const fire = () => void haptics.impact({ style: h.style }).catch(() => undefined);
      if (h.at === 0) fire();
      else schedule(fire, h.at);
    }
    return hits.length > 0;
  };
  try {
    Object.defineProperty(nav, 'vibrate', { value: vibrate, configurable: true, writable: true });
    return true;
  } catch {
    return false;
  }
}
