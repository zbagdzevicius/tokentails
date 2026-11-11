/**
 * Quick chat and emotes (docs/plans/moba/MULTIPLAYER.md §7 M3): a speech-bubble button under the paw button (touch;
 * a chip over the minimap on desktop) opens a wheel of the 8 quick lines (outer ring) and the 4 emotes (inner ring).
 * Desktop: hold T, point at a slice, release T (like the ping wheel's G). Touch: tap the bubble, tap a slice; a tap
 * anywhere else closes it. Enumerated ids only: the wheel never carries typed text.
 *
 * MATCH-CHAT.md §4.1: the dead centre is a "Type" button (a text-tier team) or "More" (phrases only) that opens the
 * chat drawer, and a small "All" chip at the top sends the next pick to both teams; while it is on, only the lines
 * that have an all-chat phrase (`WHEEL_ALL`) are enabled. Emotes always reach everyone.
 *
 * The wheel names a line; the party HUD sends it (rate-limited, src/net/proto.ts SocialLimiter) and draws it.
 */
import { CHAT_LINES, EMOTES } from '../../data/social';

/** `all`: the pick goes to all chat (an all-scope phrase, PROTO 6). */
export type ChatPick = { kind: 'chat' | 'emote'; id: number; all?: boolean };

/** Wheel lines that have an all-chat phrase (MATCH-CHAT.md §2.1): 0 Nice! → 28, 7 GG → 25. */
export const WHEEL_ALL: Readonly<Record<number, number>> = Object.freeze({ 0: 28, 7: 25 });

/** Ring radii (px): emotes inside, lines outside; the dead zone in the middle sends nothing. */
export const CHAT_RING = Object.freeze({ dead: 22, inner: 50, split: 80, outer: 112 });

/** The slice a pointer offset from the wheel's centre points at (desktop aim). 0 = straight up, clockwise. Pure. */
export function chatSlice(dx: number, dy: number): ChatPick | null {
  const r = Math.hypot(dx, dy);
  if (r < CHAT_RING.dead) return null;
  const inner = r < CHAT_RING.split;
  const n = inner ? EMOTES.length : CHAT_LINES.length;
  const a = (Math.atan2(dx, -dy) + Math.PI * 2 + Math.PI / n) % (Math.PI * 2);
  const id = Math.floor(a / ((Math.PI * 2) / n)) % n;
  return { kind: inner ? 'emote' : 'chat', id };
}

const BUBBLE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 6.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm5 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm5 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/></svg>';

export class QuickChat {
  readonly button: HTMLButtonElement;
  readonly wheel: HTMLElement;
  private cx = 0;
  private cy = 0;
  private hot: ChatPick | null = null;
  private readonly items: { el: HTMLButtonElement; pick: ChatPick }[] = [];
  private readonly offKey: () => void;
  /** A slice was chosen. */
  onPick: ((p: ChatPick) => void) | null = null;
  /** The centre (Type / More): open the chat drawer. Absent: no centre button (PROTO 5 relays). */
  onType: (() => void) | null = null;
  private readonly centre: HTMLButtonElement;
  private readonly allChip: HTMLButtonElement;
  private all = false;
  /** 'Type' for a text-tier team, 'More' for phrases only. */
  set centreLabel(t: 'Type' | 'More') {
    this.centre.textContent = t;
    this.centre.setAttribute('aria-label', t === 'Type' ? 'Type a message' : 'More chat');
  }
  /** The cooldown look (the HUD greys the button while the rate limit holds). */
  set cool(on: boolean) {
    this.button.classList.toggle('cool', on);
  }

  constructor(parent: HTMLElement, opts: { enabled: () => boolean }) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'pl-chatbtn';
    this.button.dataset.testid = 'quick-chat';
    this.button.setAttribute('aria-label', 'Quick chat');
    this.button.title = 'Quick chat (hold T)';
    this.button.innerHTML = `${BUBBLE}<span>Chat</span><kbd>T</kbd>`;
    this.button.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.open) this.close();
      else if (opts.enabled()) this.openAt(window.innerWidth / 2, window.innerHeight / 2);
    });
    parent.appendChild(this.button);

    this.wheel = document.createElement('div');
    this.wheel.className = 'pl-chatwheel';
    this.wheel.setAttribute('role', 'menu');
    this.wheel.setAttribute('aria-label', 'Quick chat');
    const add = (pick: ChatPick, label: string, angle: number, r: number, cls: string): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `cw ${cls}`;
      b.dataset.kind = pick.kind;
      b.dataset.id = String(pick.id);
      b.setAttribute('role', 'menuitem');
      b.style.setProperty('--a', `${angle}deg`);
      b.style.setProperty('--r', `${-r}px`);
      b.textContent = label;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.pick(pick);
      });
      this.wheel.appendChild(b);
      this.items.push({ el: b, pick });
    };
    CHAT_LINES.forEach((line, id) => add({ kind: 'chat', id }, line, (360 / CHAT_LINES.length) * id, CHAT_RING.outer, 'line'));
    EMOTES.forEach((em, id) => add({ kind: 'emote', id }, em.glyph, (360 / EMOTES.length) * id, CHAT_RING.inner, 'emote'));
    // MATCH-CHAT.md §4.1: the centre opens the drawer, the All chip routes the next pick to both teams
    this.centre = document.createElement('button');
    this.centre.type = 'button';
    this.centre.className = 'cw centre';
    this.centre.dataset.testid = 'quick-chat-type';
    this.centre.style.setProperty('--a', '0deg');
    this.centre.style.setProperty('--r', '0px');
    this.centre.textContent = 'More';
    this.centre.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.close();
      this.onType?.();
    });
    this.wheel.appendChild(this.centre);
    this.allChip = document.createElement('button');
    this.allChip.type = 'button';
    this.allChip.className = 'cw allchip';
    this.allChip.dataset.testid = 'quick-chat-all';
    this.allChip.style.setProperty('--a', '0deg');
    this.allChip.style.setProperty('--r', `${-(CHAT_RING.outer + 46)}px`);
    this.allChip.textContent = 'All';
    this.allChip.setAttribute('aria-pressed', 'false');
    this.allChip.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.setAll(!this.all);
    });
    this.wheel.appendChild(this.allChip);
    // a tap outside the slices closes it
    this.wheel.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.close();
    });
    parent.appendChild(this.wheel);

    // desktop: hold T to open at the cursor, aim, release to send
    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    const move = (e: PointerEvent): void => {
      mx = e.clientX;
      my = e.clientY;
      if (this.open && this.held) this.aim(mx, my);
    };
    const down = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!opts.enabled()) return;
      this.held = true;
      this.openAt(mx, my);
    };
    const up = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyT' || !this.held) return;
      this.held = false;
      this.commit();
    };
    addEventListener('pointermove', move);
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    this.offKey = () => {
      removeEventListener('pointermove', move);
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
    };
  }

  private held = false;

  get open(): boolean {
    return this.wheel.classList.contains('on');
  }

  /** All chat for the next pick: only lines with an all-chat phrase stay enabled. */
  private setAll(on: boolean): void {
    this.all = on;
    this.allChip.setAttribute('aria-pressed', String(on));
    this.allChip.classList.toggle('on', on);
    for (const it of this.items) {
      const off = on && it.pick.kind === 'chat' && WHEEL_ALL[it.pick.id] === undefined;
      it.el.disabled = off;
      it.el.classList.toggle('off', off);
    }
  }

  openAt(x: number, y: number): void {
    const pad = CHAT_RING.outer + 30;
    this.cx = Math.max(pad, Math.min(window.innerWidth - pad, x));
    this.cy = Math.max(pad - 6, Math.min(window.innerHeight - pad + 6, y));
    this.wheel.style.setProperty('--x', `${this.cx}px`);
    this.wheel.style.setProperty('--y', `${this.cy}px`);
    this.setHot(null);
    this.centre.hidden = !this.onType;
    this.allChip.hidden = !this.onType;
    this.wheel.classList.add('on');
    document.documentElement.dataset.chatWheel = '1';
  }

  aim(x: number, y: number): void {
    this.setHot(chatSlice(x - this.cx, y - this.cy));
  }

  commit(): void {
    const p = this.hot;
    const all = this.all;
    this.close();
    if (p && !(all && p.kind === 'chat' && WHEEL_ALL[p.id] === undefined)) this.onPick?.(all ? { ...p, all: true } : p);
  }

  close(): void {
    if (this.all) this.setAll(false);
    this.wheel.classList.remove('on');
    this.setHot(null);
    delete document.documentElement.dataset.chatWheel;
  }

  private pick(p: ChatPick): void {
    const all = this.all;
    this.close();
    if (all && p.kind === 'chat' && WHEEL_ALL[p.id] === undefined) return;
    this.onPick?.(all ? { ...p, all: true } : p);
  }

  private setHot(p: ChatPick | null): void {
    this.hot = p;
    for (const it of this.items) it.el.classList.toggle('hot', !!p && it.pick.kind === p.kind && it.pick.id === p.id);
  }

  dispose(): void {
    this.offKey();
    this.button.remove();
    this.wheel.remove();
    delete document.documentElement.dataset.chatWheel;
  }
}
