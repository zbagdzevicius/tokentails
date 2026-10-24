// The hype bus (INTEGRATOR-owned, pure: no DOM): the STYLE lane's HUD announces what it shows (tier stamps, trick
// popups, the combo count) so the CLIP lane can paint the same moments into a saved clip without reading the DOM.
// Cross-lane calls otherwise go through src/ugc/contract.ts; this is a one-way broadcast with no return value.
export type HypeKind = 'stamp' | 'rank' | 'pop' | 'combo';
export interface HypeEvent {
  kind: HypeKind;
  /** stamp / pop text ('' for combo) */
  text: string;
  /** stamp subtitle */
  sub: string;
  /** the combo tier 0..6 (stamp colour, combo pill colour) */
  tier: number;
  /** the combo length (combo) */
  n: number;
  /** popup tone: trick | bank | bad | style */
  tone: string;
}

const subs: ((e: HypeEvent) => void)[] = [];
const ev: HypeEvent = { kind: 'pop', text: '', sub: '', tier: 0, n: 0, tone: '' };

/** listen; returns an unsubscribe. The event object is reused: copy what you keep. */
export function onHype(fn: (e: HypeEvent) => void): () => void {
  subs.push(fn);
  return () => {
    const i = subs.indexOf(fn);
    if (i >= 0) subs.splice(i, 1);
  };
}

export function hype(kind: HypeKind, text = '', tier = 0, n = 0, tone = '', sub = ''): void {
  if (!subs.length) return;
  ev.kind = kind;
  ev.text = text;
  ev.sub = sub;
  ev.tier = tier;
  ev.n = n;
  ev.tone = tone;
  for (let i = 0; i < subs.length; i++) {
    try {
      subs[i](ev);
    } catch {
      /* a listener never breaks the HUD */
    }
  }
}
