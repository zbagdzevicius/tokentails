/**
 * The in-match chat ticker (docs/plans/moba/MATCH-CHAT.md §4.1, §4.2): the newest chat lines of a match, each one
 * fading out a few seconds after it arrives.
 *
 * - Phones: a right-aligned column right under the kill feed's box, as wide as the feed: 2 rows (1 under 400 px tall).
 *   A tap on a row opens the drawer (ui/chatDrawer.ts). Nothing is painted while there is no line, so the persistent
 *   HUD budget (tests/e2e/hud-area.spec.ts) does not move. `aria-hidden`: the drawer's list is the live region.
 * - Desktop: a log of the 6 newest lines, bottom left, above the left end of the bottom HUD bar.
 *
 * Text lines show 8 s, phrases 5 s, your own line 4 s, then fade over 600 ms; at most one new row every 400 ms.
 * DOM only, nothing per frame: `tick(now)` runs from the session's 4 Hz chat clock.
 */

export interface ChatLineView {
  /** The relay's message id (a report names it); absent for a solo bot line. */
  mid?: string;
  slot: number;
  name: string;
  /** The sender's relation colour (ally, enemy, self). */
  color: string;
  text: string;
  ch: 'team' | 'all';
  kind: 'text' | 'phrase';
  mine: boolean;
}

export const CHAT_TTL = Object.freeze({ text: 8000, phrase: 5000, mine: 4000, fade: 600, gapMs: 400 });

/** How long a line stays before it fades (ms). Pure. */
export const lineTtl = (l: Pick<ChatLineView, 'kind' | 'mine'>): number => (l.mine ? CHAT_TTL.mine : l.kind === 'text' ? CHAT_TTL.text : CHAT_TTL.phrase);

/** Rows the ticker shows: phones 2 (1 under 400 px tall), desktop 6. Pure. */
export const tickerRows = (touch: boolean, height: number): number => (touch ? (height >= 400 ? 2 : 1) : 6);

interface Row {
  el: HTMLElement;
  bornAt: number;
  ttl: number;
}

export class ChatTicker {
  readonly el: HTMLElement;
  private readonly rows: Row[] = [];
  private readonly queue: { line: ChatLineView; at: number }[] = [];
  private lastShownAt = -Infinity;
  /** A tap on the ticker (phones: opens the drawer). */
  onOpen: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly opts: { touch: boolean; now?: () => number; height?: () => number },
  ) {
    this.el = document.createElement('div');
    this.el.className = `pl-chatline${opts.touch ? ' touch' : ' desk'}`;
    this.el.setAttribute('aria-hidden', 'true');
    this.el.dataset.testid = 'chat-ticker';
    this.el.addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement | null)?.closest('.cl-row')) return;
      e.stopPropagation();
      e.preventDefault();
      this.onOpen?.();
    });
    parent.appendChild(this.el);
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : performance.now();
  }

  /** The layout's cap (rows that fit above the ability cluster), else the size rule. */
  rowsCap = Infinity;

  private get maxRows(): number {
    return Math.max(1, Math.min(this.rowsCap, tickerRows(this.opts.touch, this.opts.height ? this.opts.height() : typeof innerHeight === 'number' ? innerHeight : 400)));
  }

  /** A new line: shown now, or queued behind a row shown less than 400 ms ago. */
  push(line: ChatLineView): void {
    this.queue.push({ line, at: this.now() });
    this.tick();
  }

  /** Fades and the queue (the session's chat clock, 4 Hz, and every push). */
  tick(now = this.now()): void {
    if (this.queue.length && now - this.lastShownAt >= CHAT_TTL.gapMs) {
      const { line } = this.queue.shift()!;
      this.show(line, now);
    }
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const r = this.rows[i];
      const age = now - r.bornAt;
      if (age >= r.ttl + CHAT_TTL.fade) {
        r.el.remove();
        this.rows.splice(i, 1);
      } else if (age >= r.ttl) r.el.classList.add('out');
    }
    this.el.classList.toggle('empty', this.rows.length === 0);
  }

  private show(line: ChatLineView, now: number): void {
    this.lastShownAt = now;
    const row = document.createElement('div');
    row.className = `cl-row ${line.ch}${line.mine ? ' mine' : ''}`;
    if (line.ch === 'all') {
      const tag = document.createElement('i');
      tag.textContent = '[All]';
      row.appendChild(tag);
    }
    const name = document.createElement('b');
    name.textContent = `${line.name}:`;
    name.style.color = line.color;
    const text = document.createElement('span');
    text.textContent = line.text;
    row.append(name, text);
    this.el.appendChild(row);
    this.rows.push({ el: row, bornAt: now, ttl: lineTtl(line) });
    while (this.rows.length > this.maxRows) this.rows.shift()!.el.remove();
    this.el.classList.remove('empty');
  }

  /** Lines on screen now (tests). */
  get shown(): number {
    return this.rows.length;
  }

  clear(): void {
    for (const r of this.rows) r.el.remove();
    this.rows.length = 0;
    this.queue.length = 0;
    this.el.classList.add('empty');
  }

  dispose(): void {
    this.el.remove();
  }
}
