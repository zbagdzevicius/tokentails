// One comic callout at a time (META-UI). Pure: node-importable.
// Priority: chase instructions > hits / last life > set-piece results > pickups and near misses. A callout that
// arrives while a higher one is still showing is dropped; an equal or higher one replaces it. Some texts have a
// cooldown so they keep their punch, and pickup chatter is muted while a chase is on.

export const CALLOUT_MS = 1300;

const PRIO: Record<string, number> = {
  'GO LEFT!': 4,
  'GO RIGHT!': 4,
  'WOOF!': 4,
  'WOOF WOOF!': 4,
  'GIANT YARN!': 4,
  'OUCH!': 3,
  'LAST LIFE!': 3,
  'TRY AGAIN!': 3,
  'SPLASH!': 3,
  'HOME!': 3,
  'ALL 7 BELLS!': 3,
  '+1 HEART!': 3,
  'NOM NOM!': 1,
  'CLOSE ONE!': 1,
  'WHOOSH!': 1,
  'PUFF READY!': 1,
  'TAIL READY!': 1,
};
/** seconds before the same text may show again */
const COOLDOWN: Record<string, number> = {
  'PURRFECT!': 4,
  'WHOOSH!': 30,
  'NOM NOM!': 2,
  'CLOSE ONE!': 2.5,
  'PUFF READY!': 20,
  'TAIL READY!': 6,
  'PHEW!': 3,
};
/** muted while a chase is on (they would hide the chase instructions) */
const CHASE_MUTED = new Set(['NOM NOM!', 'CLOSE ONE!', 'PUFF READY!', 'WHOOSH!']);

export const calloutPriority = (text: string): number => PRIO[text] ?? 2;

export class CalloutQueue {
  private shownText = '';
  private shownPrio = 0;
  private shownAt = -1e9;
  private last = new Map<string, number>();

  /** true = show `text` now (replacing whatever is up); false = drop it. now in ms. */
  offer(text: string, now: number, chase: boolean): boolean {
    if (chase && CHASE_MUTED.has(text)) return false;
    const cd = COOLDOWN[text];
    const prev = this.last.get(text);
    if (cd !== undefined && prev !== undefined && now - prev < cd * 1000) return false;
    const prio = calloutPriority(text);
    const busy = now - this.shownAt < CALLOUT_MS;
    if (busy && prio < this.shownPrio) return false;
    if (busy && text === this.shownText && now - this.shownAt < 400) return false;
    this.shownText = text;
    this.shownPrio = prio;
    this.shownAt = now;
    this.last.set(text, now);
    return true;
  }
  reset(): void {
    this.shownText = '';
    this.shownPrio = 0;
    this.shownAt = -1e9;
    this.last.clear();
  }
}
