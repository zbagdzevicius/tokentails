/**
 * A DM thread with one friend (docs/plans/moba/CHAT-AVATARS.md §6.2): a right-side sheet over the Social sheet (phone
 * full width, desktop 420 px). The message list is the one scroll region (visible scrollbar, newest at the bottom,
 * "Load earlier" at the top); the composer is fixed. The server decides the tier: `text` threads (both friends are 16+)
 * get a one-line input with a 120-character cap plus the phrase tray; `quick` threads get the tray only, and nobody is
 * told the other player's age band. While the sheet is visible it polls `chat.since` every 4 s (never in a match or a
 * hidden tab, never two at once), and a relay `chat.notice` for this thread polls at once (`poke`). Renders morph the
 * DOM in place, so an arriving message never closes the phone keyboard, wipes the draft or yanks a player who scrolled
 * up. Every name and every message is set with textContent; the game never sees an account id.
 */
import './social.css';
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import {
  CHAT_LIMITS_CLIENT,
  CHAT_REPORT_KINDS,
  CHAT_REPORT_LABELS,
  CHAT_STICKERS,
  chatBodyText,
  chatErrorText,
  phrasesFor,
  type AvatarView,
  type ChatReportKind,
  type ChatTier,
} from '../data/chatPhrases';
import { avatarHtml } from '../ui/avatar';
import { morphHtml } from '../ui/morph';
import { icon } from './socialIcons';

export interface ChatMessage {
  mid: string;
  mine: boolean;
  k: 't' | 'q' | 's';
  text?: string;
  id?: number;
  at: string | number;
  /** A club line: the sender's display name (CLUBS-KUDOS.md; absent on DMs and own lines). */
  who?: string;
}

export interface ChatSheetDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  friend: { code: string; name: string; av?: AvatarView };
  /** A club chat (CLUBS-KUDOS.md §6): open this thread directly (no `chat.open`), lines name their sender, no Block. */
  thread?: string;
  /**
   * The sheet removed itself: 'back' (a phone's Back: the conversation stays as a tab), 'close' (a docked window's ×:
   * the conversation ends; the next open one takes its place) or 'esc' (Esc: the window goes and focus returns to the
   * list; a docked conversation ends, a phone's stays as a tab).
   */
  onClose(how?: 'back' | 'close' | 'esc'): void;
  /** The open conversations as tabs (LoL's chat tabs; empty: no strip), and a tab tapped. */
  tabs?(): ChatTab[];
  onTab?(code: string): void;
  /** A match is running: the poll pauses. */
  inMatch?(): boolean;
  /** The friend was blocked from the menu: the Social sheet reloads. */
  onBlocked?(): void;
  /** Analytics (no names, codes, ids or text in props). */
  track?(event: string, props?: Record<string, string | number | boolean>): void;
  /**
   * Docked beside the friends list (a wide screen, LoL style): the list stays usable, the head shows Close instead of
   * Back. Not docked, the thread covers the list at the list's own width.
   */
  docked?: boolean;
  /** The friend's presence for the head ("In match · Ranked · 12m") and its state for the dot. */
  status?(): { text: string; state: string } | null;
  /** Unread messages in other threads (a badge on Back, so they are not lost while this thread covers the list). */
  unreadElsewhere?(): number;
  /**
   * Where focus goes when the thread opens (round 7, LoL puts it in the chat input): 'input' (a keyboard or a mouse:
   * the composer once the thread is open, the head's first control meanwhile) or 'head' (touch: no keyboard pops up,
   * focus still moves into the thread). Absent: focus is left alone.
   */
  autofocus?: 'input' | 'head';
  /** Docked and minimised (round 8): the bar sits on the screen's bottom edge under the list, which keeps room for it. */
  onMinimise?(on: boolean): void;
}

/** One open conversation on the thread's tab strip. */
export interface ChatTab {
  code: string;
  name: string;
  av?: AvatarView;
  state: string;
  unread: number;
  active: boolean;
}

/** The text a bubble shows (phrases and stickers by id; '' for an unknown id). Pure. */
export function bubbleText(m: Pick<ChatMessage, 'k' | 'text' | 'id'>): string {
  if (m.k === 't') return m.text ?? '';
  return chatBodyText(m.k, m.id ?? -1);
}

/** Merge new messages into a list by id, oldest first, at most `cap` kept. Pure. */
export function mergeMessages(list: readonly ChatMessage[], add: readonly ChatMessage[], cap = 200): ChatMessage[] {
  const seen = new Set(list.map((m) => m.mid));
  const out = [...list];
  for (const m of add) if (!seen.has(m.mid)) out.push(m);
  out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime() || (a.mid < b.mid ? -1 : 1));
  return out.slice(-cap);
}

const PAGE = 6;

/** What a docked thread keeps clear of: the bottom menu bars of Home and the lobby (LoL docks above its own bar). */
const DOCK_AVOID = '.hm-nav, .lb-rail';

/** A new time line in the thread: the first message, a new day, or 15 minutes of quiet. */
const STAMP_GAP_MS = 15 * 60_000;

const hhmm = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A thread's time line: "Today 20:05", "Yesterday 09:12" or "Nov 12, 20:05" (local time). Pure. */
export function chatStamp(at: Date, now: Date = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(at)) / 86_400_000);
  if (diff === 0) return `Today ${hhmm(at)}`;
  if (diff === 1) return `Yesterday ${hhmm(at)}`;
  return `${MONTHS[at.getMonth()]} ${at.getDate()}, ${hhmm(at)}`;
}

/** A message's own time ("20:05", local). Pure. */
export const msgTime = (at: Date): string => hhmm(at);

/** A run of messages ends here (round 7): the next one is from the other side, 5 minutes later, or there is none. Its time shows under it. Pure. */
export function endsRun(list: readonly Pick<ChatMessage, 'at' | 'mine' | 'who'>[], i: number): boolean {
  const next = list[i + 1];
  if (!next) return true;
  const cur = list[i];
  if (next.mine !== cur.mine || (next.who ?? '') !== (cur.who ?? '')) return true;
  return new Date(next.at).getTime() - new Date(cur.at).getTime() >= RUN_GAP_MS;
}
const RUN_GAP_MS = 5 * 60_000;

/** A docked thread's size (resized by its corner grip), remembered on this device only. */
const DOCK_KEY = 'pl.chat.dock.v1';
export const DOCK_MIN = Object.freeze({ w: 320, h: 260 });
export function readDock(): { w: number; h: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(DOCK_KEY) ?? 'null') as { w?: unknown; h?: unknown } | null;
    return v && typeof v.w === 'number' && typeof v.h === 'number' ? { w: v.w, h: v.h } : null;
  } catch {
    return null;
  }
}

/** Does a time line go before message `i`? (the first one, a new day, or a 15-minute gap). Pure. */
export function needsStamp(list: readonly Pick<ChatMessage, 'at'>[], i: number): boolean {
  if (i === 0) return true;
  const a = new Date(list[i - 1].at);
  const b = new Date(list[i].at);
  return a.toDateString() !== b.toDateString() || b.getTime() - a.getTime() >= STAMP_GAP_MS;
}

export class ChatSheet {
  readonly root: HTMLElement;
  private thread: string | null = null;
  private tier: ChatTier = 'quick';
  private messages: ChatMessage[] = [];
  private more = false;
  private muted = false;
  private readOnly = false;
  private error = '';
  private errorTimer: ReturnType<typeof setTimeout> | null = null;
  private menu = false;
  private tray = false;
  private trayPage = 0;
  /** The friend's message whose menu is open (Copy, Report, Block), and whether it shows the report reasons. */
  private reporting: string | null = null;
  private reportStep = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private sending = false;
  private polling = false;
  /** The newest incoming line for screen readers (set once per poll that brought something). */
  private announce = '';
  private disposed = false;
  private loading = true;
  private readUpTo = '';
  /** Docked: folded to its head (LoL's minimised chat tab); `unseen` counts what arrived meanwhile. */
  private minimised = false;
  private unseen = 0;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  /** Touch: the friend's message whose "…" shows (a tap on it). */
  private picked: string | null = null;
  private readonly unwatchViewport: () => void;

  constructor(
    parent: HTMLElement,
    private readonly deps: ChatSheetDeps,
  ) {
    const doc = parent.ownerDocument;
    const win = doc.defaultView;
    this.root = doc.createElement('aside');
    this.root.className = deps.docked ? 'pl-chat is-docked' : 'pl-chat';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Chat');
    this.root.dataset.testid = 'chat-sheet';
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.sendText();
    });
    this.root.addEventListener('input', (e) => this.onInput(e));
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') return this.trapTab(e);
      if ((e.target as HTMLElement).classList?.contains('pl-chat-grip')) return this.gripKey(e);
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      if (this.reporting && this.reportStep) {
        // the reasons go back to the message's menu (one step at a time)
        this.reportStep = false;
        this.render();
        this.root.querySelector<HTMLElement>('.pl-chat-msgmenu [role="menuitem"]')?.focus({ preventScroll: true });
        return;
      }
      if (this.menu || this.reporting || this.tray) {
        const back = this.reporting;
        this.menu = false;
        this.reporting = null;
        this.tray = false;
        this.render();
        if (back) this.focusMore(back);
        return;
      }
      this.dispose();
      this.deps.onClose('esc');
    });
    // a long press (touch) or a right click on a friend's message opens Report (no "…" on every bubble)
    this.root.addEventListener('contextmenu', (e) => {
      const mid = this.theirMid(e.target);
      if (!mid) return;
      e.preventDefault();
      this.openReport(mid);
    });
    this.root.addEventListener('pointerdown', (e) => {
      const mid = e.pointerType === 'mouse' ? null : this.theirMid(e.target);
      if (!mid) return;
      this.cancelPress();
      this.pressTimer = setTimeout(() => this.openReport(mid), 500);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'scroll'] as const) this.root.addEventListener(ev, () => this.cancelPress(), true);
    // a message's menu follows its bubble while the thread scrolls
    this.root.addEventListener('scroll', () => this.placeMsgMenu(), true);
    // docked: the corner grip resizes the window (it grows up and to the left: the window sits on the bottom edge)
    this.root.addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement).closest?.('.pl-chat-grip')) return;
      e.preventDefault();
      const r = this.root.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
      const move = (ev: PointerEvent) => this.resizeTo(start.w + (start.x - ev.clientX), start.h + (start.y - ev.clientY));
      const up = () => {
        win?.removeEventListener('pointermove', move);
        win?.removeEventListener('pointerup', up);
        this.saveDock();
      };
      win?.addEventListener('pointermove', move);
      win?.addEventListener('pointerup', up);
    });
    parent.appendChild(this.root);
    // iOS: the keyboard shrinks the visual viewport; the sheet follows so the composer stays above it. A docked
    // thread keeps its own size and stays clear of the bottom menu bar instead.
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const fit = () => {
      if (this.deps.docked) this.fitDock();
      else if (vv) this.root.style.height = `${Math.round(vv.height)}px`;
    };
    vv?.addEventListener('resize', fit);
    win?.addEventListener('resize', fit);
    this.unwatchViewport = () => {
      vv?.removeEventListener('resize', fit);
      win?.removeEventListener('resize', fit);
    };
    this.deps.track?.('chat_open');
    if (this.deps.docked) {
      const saved = readDock();
      if (saved) this.resizeTo(saved.w, saved.h);
    }
    this.render();
    if (this.deps.docked) this.fitDock();
    // focus moves into the thread at once (never left behind on the list it covers); the composer takes it once open
    if (this.deps.autofocus) this.root.querySelector<HTMLElement>('[data-a="back"]')?.focus({ preventScroll: true });
    void this.open();
    this.pollTimer = setInterval(() => void this.poll(), CHAT_LIMITS_CLIENT.pollMs);
  }

  get closed(): boolean {
    return this.disposed;
  }

  /** Tab stays inside the thread (a dialog): from the last control back to the first and the other way. */
  private trapTab(e: KeyboardEvent): void {
    // input/tabGuard.ts cancelled it (focus is not in a text field): Tab moves no focus
    if (e.defaultPrevented) return;
    const all = [...this.root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
    if (!all.length) return;
    const t = e.target as HTMLElement;
    const i = all.indexOf(t);
    if (e.shiftKey && i <= 0) {
      e.preventDefault();
      all[all.length - 1].focus();
    } else if (!e.shiftKey && (i === all.length - 1 || i < 0)) {
      e.preventDefault();
      all[0].focus();
    }
  }

  /** The grip by keyboard: arrows grow (up, left) or shrink (down, right) the window by 24 px. */
  private gripKey(e: KeyboardEvent): void {
    const step = { ArrowLeft: [24, 0], ArrowRight: [-24, 0], ArrowUp: [0, 24], ArrowDown: [0, -24] }[e.key];
    if (!step) return;
    e.preventDefault();
    const r = this.root.getBoundingClientRect();
    this.resizeTo(r.width + step[0], r.height + step[1]);
    this.saveDock();
  }

  /** Set the docked window's size, kept between DOCK_MIN and what the screen beside the list can hold. */
  private resizeTo(w: number, h: number): void {
    const win = this.root.ownerDocument.defaultView;
    if (!win || !this.deps.docked) return;
    const list = this.root.ownerDocument.querySelector<HTMLElement>('.pl-social')?.getBoundingClientRect().width ?? 380;
    const maxW = Math.max(DOCK_MIN.w, win.innerWidth - list - 24);
    const maxH = Math.max(DOCK_MIN.h, win.innerHeight - 24);
    this.root.style.width = `${Math.round(Math.min(maxW, Math.max(DOCK_MIN.w, w)))}px`;
    this.root.style.height = `${Math.round(Math.min(maxH, Math.max(DOCK_MIN.h, h)))}px`;
    this.root.classList.add('is-sized');
  }

  private saveDock(): void {
    const r = this.root.getBoundingClientRect();
    try {
      localStorage.setItem(DOCK_KEY, JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) }));
    } catch {
      // private window or blocked storage: the size lasts while the window is open
    }
  }

  /** The thread is open: focus goes to the composer (the input, else the first quick phrase), if it was asked for. */
  private focusComposer(): void {
    if (this.deps.autofocus !== 'input' || this.disposed || this.minimised) return;
    const a = this.root.ownerDocument.activeElement;
    // only while focus is still where the thread put it (the player may have moved on)
    if (a && a !== this.root.ownerDocument.body && !this.root.contains(a)) return;
    this.root.querySelector<HTMLElement>('input[name="chat"], .pl-chat-chip')?.focus({ preventScroll: true });
  }

  /** The id of a friend's message under a pointer (never one of mine), or null. */
  private theirMid(target: EventTarget | null): string | null {
    const li = (target as HTMLElement | null)?.closest?.<HTMLElement>('.pl-chat-msg:not(.mine)');
    return li?.dataset.mid ?? null;
  }

  private cancelPress(): void {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
  }

  private openReport(mid: string): void {
    this.cancelPress();
    this.reporting = mid;
    this.reportStep = false;
    this.render();
    this.root.querySelector<HTMLElement>('.pl-chat-msgmenu [role="menuitem"]')?.focus({ preventScroll: true });
  }

  /** Focus a message's "…" (after its menu closes), or the composer when it has none in sight. */
  private focusMore(mid: string): void {
    const more = this.root.querySelector<HTMLElement>(`.pl-chat-msg[data-mid="${mid.replace(/["\\]/g, "\\$&")}"] .pl-chat-more`);
    (more ?? this.root.querySelector<HTMLElement>('input[name="chat"]'))?.focus({ preventScroll: true });
  }

  /**
   * Round 8: a message's menu is a small context menu (LoL) floating by its bubble, over the thread: it never pushes
   * the messages. Under the bubble, or above it when the composer is in the way; always inside the window.
   */
  private placeMsgMenu(): void {
    const pop = this.root.querySelector<HTMLElement>('.pl-chat-msgmenu');
    if (!pop || !this.reporting) return;
    const bubble = this.root.querySelector<HTMLElement>(`.pl-chat-msg[data-mid="${this.reporting.replace(/["\\]/g, "\\$&")}"] .pl-chat-bubble`);
    const list = this.root.querySelector<HTMLElement>('.pl-chat-list');
    if (!bubble || !list) return;
    const rr = this.root.getBoundingClientRect();
    const br = bubble.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    const h = pop.offsetHeight;
    const w = pop.offsetWidth;
    // inside the message list (never over the head's tabs and buttons, nor the composer): under the bubble, else
    // above it, else as close as the list allows
    const lo = lr.top - rr.top + 4;
    const hi = lr.bottom - rr.top - h - 4;
    let top = br.bottom + 4 - rr.top;
    if (top > hi) top = br.top - 4 - h - rr.top;
    top = Math.max(lo, Math.min(top, hi));
    if (hi < lo) top = Math.max(4, Math.min(lo, rr.height - h - 4));
    const left = Math.max(4, Math.min(br.left - rr.left, rr.width - w - 4));
    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(left)}px`;
  }

  /**
   * A docked thread sits on the bottom edge beside the list, like LoL's chat windows; where the screen's bottom menu
   * bar (Home, lobby) runs under it, it rises above the bar instead of covering it.
   */
  private fitDock(): void {
    const doc = this.root.ownerDocument;
    const win = doc.defaultView;
    if (!win || this.disposed) return;
    this.root.style.bottom = '';
    // minimised: a bar on the screen's bottom edge under the friends list (the list keeps room for it): no lift
    if (this.minimised) {
      this.root.style.maxHeight = '';
      return;
    }
    const r = this.root.getBoundingClientRect();
    let lift = 0;
    for (const nav of doc.querySelectorAll<HTMLElement>(DOCK_AVOID)) {
      const n = nav.getBoundingClientRect();
      if (!n.width || !n.height || n.top >= win.innerHeight) continue;
      if (n.left < r.right && n.right > r.left && n.bottom > r.top) lift = Math.max(lift, Math.ceil(win.innerHeight - n.top) + 8);
    }
    if (lift) this.root.style.bottom = `${lift}px`;
    // never taller than the room above the bar
    this.root.style.maxHeight = `${Math.max(DOCK_MIN.h, win.innerHeight - lift - 16)}px`;
  }

  get docked(): boolean {
    return !!this.deps.docked;
  }

  /** The opaque thread id once open (a relay `chat.notice` names it). */
  get threadId(): string | null {
    return this.thread;
  }

  private async open(): Promise<void> {
    if (this.deps.thread) {
      this.thread = this.deps.thread;
      await this.loadHistory();
      return;
    }
    const r = await this.deps.api('chat.open', { code: this.deps.friend.code });
    const body = r.body as { thread?: string; tier?: ChatTier; code?: string } | undefined;
    if (!r.ok || !body?.thread) {
      this.loading = false;
      this.showError(chatErrorText(body?.code ?? (r.status === 0 ? 'net' : 'PAWLEGENDS_CHAT_UNAVAILABLE')));
      this.render();
      return;
    }
    this.thread = body.thread;
    this.tier = body.tier === 'text' ? 'text' : 'quick';
    await this.loadHistory();
  }

  private async loadHistory(before?: string): Promise<void> {
    if (!this.thread) return;
    const r = await this.deps.api('chat.history', { thread: this.thread, ...(before ? { before } : {}) });
    this.loading = false;
    const body = r.body as { thread?: { tier?: ChatTier; muted?: boolean; readOnly?: boolean }; messages?: ChatMessage[]; more?: boolean } | undefined;
    if (!r.ok || !body) {
      this.showError(chatErrorText((r.body as { code?: string } | undefined)?.code));
      this.render();
      return;
    }
    this.tier = body.thread?.tier === 'text' ? 'text' : 'quick';
    this.muted = !!body.thread?.muted;
    this.readOnly = !!body.thread?.readOnly;
    this.messages = mergeMessages(this.messages, body.messages ?? []);
    this.more = !!body.more;
    // "Load earlier" keeps the player's place: the same distance from the bottom after the older page lands above
    const ul = this.root.querySelector<HTMLElement>('.pl-chat-list');
    const fromBottom = ul ? ul.scrollHeight - ul.scrollTop : 0;
    this.render(!before);
    if (before && ul) ul.scrollTop = ul.scrollHeight - fromBottom;
    else this.focusComposer();
    this.markRead();
  }

  /** The 4 s poll while the sheet is open, visible and no match runs; one request in flight at most (slow phones). */
  async poll(): Promise<void> {
    if (this.disposed || !this.thread || this.loading || this.polling) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (this.deps.inMatch?.()) return;
    this.polling = true;
    try {
      const last = this.messages[this.messages.length - 1]?.mid;
      if (!last) {
        await this.loadHistory();
        return;
      }
      const r = await this.deps.api('chat.since', { thread: this.thread, after: last });
      if (this.disposed || !r.ok || r.status === 204 || !r.body) return;
      const fresh = (r.body as { messages?: ChatMessage[] }).messages ?? [];
      if (!fresh.length) return;
      this.messages = mergeMessages(this.messages, fresh);
      const theirs = fresh.filter((m) => !m.mine);
      const newest = theirs[theirs.length - 1];
      if (newest) this.announce = `${newest.who || this.deps.friend.name}: ${bubbleText(newest)}`;
      if (this.minimised) this.unseen += theirs.length;
      // stays at the bottom only when the player was there (render keeps a scrolled-up reader in place)
      this.render();
      this.markRead();
    } finally {
      this.polling = false;
    }
  }

  /** A relay `chat.notice` for this thread: fetch now instead of waiting for the next tick. */
  poke(thread?: string): void {
    if (!thread || thread === this.thread) void this.poll();
  }

  private markRead(): void {
    // a minimised thread is not read yet: its head counts what came in
    if (this.minimised) return;
    // the cursor moves to the newest message; nothing to do while only own messages exist
    const last = this.messages[this.messages.length - 1];
    if (!this.thread || !last || !this.messages.some((m) => !m.mine)) return;
    if (last.mid === this.readUpTo) return;
    this.readUpTo = last.mid;
    void this.deps.api('chat.read', { thread: this.thread, upTo: last.mid });
  }

  private showError(text: string): void {
    this.error = text;
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => {
      this.errorTimer = null;
      this.error = '';
      this.root.querySelector('.pl-chat-err')?.remove();
    }, 3000);
  }

  private async send(args: ApiArgs): Promise<boolean> {
    if (!this.thread || this.sending || this.readOnly) return false;
    this.sending = true;
    try {
      const r = await this.deps.api('chat.send', { thread: this.thread, ...args });
      const body = r.body as { message?: ChatMessage; code?: string; why?: string; until?: string } | undefined;
      if (!r.ok || !body?.message) {
        this.showError(r.status === 0 ? 'No connection. Try again.' : chatErrorText(body?.code, body?.why, body?.until));
        // the server may have moved the thread to quick chat (a friend's band changed)
        if (body?.code === 'PAWLEGENDS_CHAT_QUICK_ONLY') this.tier = 'quick';
        this.render();
        return false;
      }
      this.messages = mergeMessages(this.messages, [body.message]);
      this.deps.track?.('chat_send', { k: String(args.k) });
      this.render(true);
      return true;
    } finally {
      this.sending = false;
    }
  }

  private async sendText(): Promise<void> {
    const input = this.root.querySelector<HTMLInputElement>('input[name="chat"]');
    const text = (input?.value ?? '').trim();
    if (!text) return;
    if (await this.send({ k: 't', text })) {
      const again = this.root.querySelector<HTMLInputElement>('input[name="chat"]');
      if (again) {
        again.value = '';
        again.focus();
      }
    }
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.name !== 'chat') return;
    const counter = this.root.querySelector<HTMLElement>('.pl-chat-count');
    if (!counter) return;
    const n = t.value.length;
    counter.textContent = n >= CHAT_LIMITS_CLIENT.counterFrom ? `${n}/${CHAT_LIMITS_CLIENT.textMax}` : '';
  }

  private esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  }

  private trayHtml(): string {
    const phrases = phrasesFor('dm');
    const pages = Math.ceil(phrases.length / PAGE) + 1;
    const page = Math.min(this.trayPage, pages - 1);
    const chips =
      page < pages - 1
        ? phrases
            .slice(page * PAGE, page * PAGE + PAGE)
            .map((p) => `<button type="button" class="pl-chat-chip" data-a="say" data-k="q" data-id="${p.id}">${this.esc(p.text)}</button>`)
            .join('')
        : CHAT_STICKERS.map((s, i) => `<button type="button" class="pl-chat-chip sticker" data-a="say" data-k="s" data-id="${i}" aria-label="Sticker ${i + 1}">${s}</button>`).join('');
    const dots = Array.from({ length: pages }, (_, i) => `<i class="pl-chat-dot"${i === page ? ' data-on="1"' : ''}></i>`).join('');
    return `<div class="pl-chat-tray" data-testid="chat-phrases"><div class="pl-chat-chips">${chips}</div><div class="pl-chat-pages"><button type="button" class="pl-btn ghost small" data-a="tray-prev" aria-label="Previous phrases"${page === 0 ? ' disabled' : ''}>&lsaquo;</button><span class="pl-chat-dots">${dots}</span><button type="button" class="pl-btn ghost small" data-a="tray-next" aria-label="More phrases"${page >= pages - 1 ? ' disabled' : ''}>&rsaquo;</button></div></div>`;
  }

  private composerHtml(): string {
    if (this.readOnly) return `<p class="pl-chat-line">You are no longer friends. This chat closes soon.</p>`;
    // round 7: while the thread opens, the composer already stands where it will be (disabled), so nothing jumps
    if (!this.thread) return this.loading ? `<form class="pl-chat-form is-wait"><input name="chat-wait" disabled placeholder="Opening chat…" aria-label="Message (opening chat)"><button type="button" class="pl-btn small" disabled>Send</button></form>` : '';
    if (this.tier === 'quick')
      return `${this.trayHtml()}<p class="pl-chat-line" data-testid="chat-quick-note">Quick chat keeps everyone safe 🐾</p>`;
    const input = `<form class="pl-chat-form"><button type="button" class="pl-btn ghost small pl-chat-phr" data-a="tray" aria-label="Quick phrases and stickers" aria-pressed="${this.tray}" title="Quick phrases and stickers">${icon('smile', 18)}<span>Phrases</span></button><input name="chat" maxlength="${CHAT_LIMITS_CLIENT.textMax}" autocomplete="off" enterkeyhint="send" placeholder="Message" aria-label="Message" data-testid="chat-input"><small class="pl-chat-count" aria-live="polite"></small><button type="submit" class="pl-btn small" data-testid="chat-send">Send</button></form>`;
    return `<div class="pl-chat-traywrap">${this.tray ? this.trayHtml() : ''}</div>${input}`;
  }

  /** Markup with `data-name` / `data-text` holes, filled by textContent, then morphed into the live DOM. */
  render(stickToBottom = false): void {
    if (this.disposed) return;
    const f = this.deps.friend;
    const list = this.root.querySelector<HTMLElement>('.pl-chat-list');
    const atBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const menu = this.menu
      ? `<div class="pl-chat-menu" role="menu"><button type="button" class="pl-btn ghost small" data-a="mute" role="menuitem">${this.muted ? 'Unmute' : 'Mute'}</button>${this.deps.thread ? '' : '<button type="button" class="pl-btn ghost small" data-a="block" role="menuitem">Block</button>'}</div>`
      : '';
    const now = new Date();
    const bubbles = this.messages
      .map((m, i) => {
        const at = new Date(m.at);
        const valid = !Number.isNaN(at.getTime());
        const stamp = valid && needsStamp(this.messages, i) ? `<li class="pl-chat-day" role="separator"><span>${this.esc(chatStamp(at, now))}</span></li>` : '';
        const cls = `pl-chat-msg${m.mine ? ' mine' : ''}${m.k === 's' ? ' sticker' : m.k === 'q' ? ' phrase' : ''}${this.reporting === m.mid ? ' is-reporting' : ''}${this.picked === m.mid ? ' is-picked' : ''}`;
        const more = m.mine ? '' : `<button type="button" class="pl-chat-more" data-a="report" data-mid="${this.esc(m.mid)}" aria-haspopup="menu" aria-expanded="${this.reporting === m.mid}" aria-label="Message options: copy, report">&hellip;</button>`;
        const who = m.who && !m.mine ? `<small class="pl-chat-who" data-name="${this.esc(m.who)}"></small>` : '';
        const title = valid ? ` title="${this.esc(chatStamp(at, now))}"` : '';
        const pick = m.mine ? '' : ' data-a="pick"';
        // round 7: every run of messages ends with its time (LoL stamps each line; a run keeps the thread calm)
        const time = valid && endsRun(this.messages, i) ? `<time class="pl-chat-time" datetime="${this.esc(at.toISOString())}" data-testid="chat-time">${msgTime(at)}</time>` : '';
        return `${stamp}<li class="${cls}${time ? ' ends-run' : ''}" data-mid="${this.esc(m.mid)}">${who}<span class="pl-chat-bubble"${title}${pick} data-text="${this.esc(bubbleText(m))}"></span>${more}${time}</li>`;
      })
      .join('');
    // loading: a skeleton of the thread (three bubbles, both sides), never a bare "Loading…"
    const empty = !this.messages.length
      ? this.loading
        ? `<li class="pl-chat-skel" aria-hidden="true"><i></i></li><li class="pl-chat-skel mine" aria-hidden="true"><i></i></li><li class="pl-chat-skel" aria-hidden="true"><i></i></li><li class="pl-sr" data-testid="chat-loading">Loading messages</li>`
        : `<li class="pl-chat-empty">Say hi! 👋</li>`
      : '';
    const earlier = this.more ? `<li><button type="button" class="pl-btn ghost small pl-chat-earlier" data-a="earlier">Load earlier</button></li>` : '';
    const st = this.deps.thread ? null : (this.deps.status?.() ?? null);
    // the open conversations (LoL's chat tabs): switch without going Back; unread ones carry their count
    const tabs = this.deps.thread ? [] : (this.deps.tabs?.() ?? []);
    // round 6: with tabs, the selected tab names the friend (avatar and name once); the head keeps the status and the
    // controls, and the tabs carry the other threads' counts (never a second count beside Back)
    const tabbed = tabs.length > 0 && !this.minimised;
    const others = this.deps.docked || tabbed ? 0 : (this.deps.unreadElsewhere?.() ?? 0);
    const back = this.deps.docked
      ? `<button type="button" class="pl-ico pl-chat-x" data-a="back" aria-label="Close chat" title="Close chat">${icon('close', 20)}</button>`
      : `<button type="button" class="pl-ico pl-chat-back${others ? ' has-n' : ''}" data-a="back" aria-label="${others ? `Back to friends, ${others} unread` : 'Back to friends'}" title="Back">${icon('chevron', 22)}${others ? `<b class="pl-back-n">${Math.min(99, others)}</b>` : ''}</button>`;
    const av = tabbed
      ? ''
      : this.deps.thread
        ? '<span class="pl-club-crest" aria-hidden="true">' + this.esc(f.name.slice(0, 1)) + '</span>'
        : `<span class="pl-fr-av"${st ? ` data-state="${this.esc(st.state)}"` : ''}>${avatarHtml(f.av, 40)}${st ? `<i class="pl-dot" data-state="${this.esc(st.state)}"></i>` : ''}</span>`;
    const sub = this.muted ? 'Muted' : (st?.text ?? '');
    const fresh = this.minimised && this.unseen ? `<b class="pl-chat-new">${this.unseen} new</b>` : '';
    const who = `<span class="pl-chat-who-h${tabbed ? ' is-tabbed pl-sr' : ''}"><span class="pl-social-name${tabbed ? ' pl-sr' : ''}" data-name="${this.esc(f.name)}"></span>${sub || fresh ? `<small class="pl-social-st"${st && !this.muted ? ` data-state="${this.esc(st.state)}"` : ''}>${fresh}${this.esc(sub)}</small>` : ''}</span>`;
    // docked: Minimise folds the window to its head (LoL's chat tab); the head then opens it again
    const min = this.deps.docked
      ? `<button type="button" class="pl-ico pl-chat-min" data-a="min" aria-expanded="${!this.minimised}" aria-label="${this.minimised ? 'Open chat' : 'Minimise chat'}" title="${this.minimised ? 'Open' : 'Minimise'}">${icon(this.minimised ? 'chevronUp' : 'minus', 20)}</button>`
      : '';
    const opts = this.minimised ? '' : `<button type="button" class="pl-ico" data-a="menu" aria-label="Chat options" aria-expanded="${this.menu}" title="Options">${icon('more', 20)}</button>`;
    this.root.classList.toggle('is-min', this.minimised);
    const strip = tabs.length
      ? `<nav class="pl-chat-tabs" role="tablist" aria-label="Conversations" data-testid="chat-tabs">${tabs
          .map(
            (t) =>
              `<button type="button" role="tab" class="pl-chat-tab${t.unread ? ' has-unread' : ''}" data-a="tab" data-code="${this.esc(t.code)}" aria-selected="${t.active}" aria-label="${this.esc(`${t.name}${t.unread ? `, ${t.unread} unread` : ''}`)}" title="${this.esc(t.name)}"><span class="pl-fr-av" data-state="${this.esc(t.state)}">${avatarHtml(t.av, 32)}<i class="pl-dot" data-state="${this.esc(t.state)}"></i></span>${t.active && st ? `<span class="pl-chat-tab-who"><span class="pl-chat-tab-n" data-name="${this.esc(t.name)}"></span><small class="pl-chat-tab-s pl-social-st" data-state="${this.esc(st.state)}">${this.esc(this.muted ? 'Muted' : st.text)}</small></span>` : `<span class="pl-chat-tab-n" data-name="${this.esc(t.name)}"></span>`}${t.unread ? `<b class="pl-chat-tab-u">${Math.min(99, t.unread)}</b>` : ''}</button>`,
          )
          .join('')}</nav>`
      : '';
    this.root.classList.toggle('has-tabs', !!strip);
    // round 7: docked with tabs, the tabs ARE the head (one row of chrome: tabs, then options, minimise, close; the
    // selected tab carries the friend's status), like LoL's chat window
    // round 8: a phone too (one row: Back, the tabs with the friend's status, options), never a second row of chrome
    const merged = tabbed;
    this.root.classList.toggle('is-merged', merged);
    const grip = this.deps.docked && !this.minimised ? `<span class="pl-chat-grip" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="Resize chat: drag, or use the arrow keys" title="Drag to resize" data-testid="chat-grip"></span>` : '';
    const head = merged
      ? `<header class="pl-chat-head is-strip">${this.deps.docked ? '' : back}${strip}${who}${opts}${min}${this.deps.docked ? back : ''}</header>`
      : `${this.minimised ? '' : strip}<header class="pl-chat-head"${this.minimised ? ' data-testid="chat-tray"' : ''}>${this.deps.docked ? '' : back}${av}${who}${opts}${min}${this.deps.docked ? back : ''}</header>`;
    const html = `${grip}${head}<div class="pl-chat-menuwrap">${menu}</div>${this.msgMenuHtml()}<ul class="pl-chat-list" data-testid="chat-list"${this.loading && !this.messages.length ? ' aria-busy="true"' : ''}>${earlier}${empty}${bubbles}</ul><p class="pl-sr" aria-live="polite" data-name="${this.esc(this.announce)}"></p><footer class="pl-chat-foot">${this.composerHtml()}${this.error ? `<p class="pl-chat-err" role="alert">${this.esc(this.error)}</p>` : ''}</footer>`;
    morphHtml(this.root, html, (tree) => {
      for (const el of tree.querySelectorAll<HTMLElement>('[data-name]')) {
        el.textContent = el.dataset.name ?? '';
        // a long name ends in "…" in the head: the tooltip holds it whole
        if (el.classList.contains('pl-social-name')) el.title = el.dataset.name ?? '';
      }
      for (const el of tree.querySelectorAll<HTMLElement>('[data-text]')) el.textContent = el.dataset.text ?? '';
    });
    const ul = this.root.querySelector<HTMLElement>('.pl-chat-list');
    if (ul && (stickToBottom || atBottom)) ul.scrollTop = ul.scrollHeight;
    this.placeMsgMenu();
  }

  /** The open message's menu: Copy text, Report message (then its reasons under a heading), Block (a DM only). */
  private msgMenuHtml(): string {
    const m = this.reporting ? this.messages.find((x) => x.mid === this.reporting && !x.mine) : null;
    if (!m) return '';
    const mid = this.esc(m.mid);
    const item = (a: string, ic: string, text: string, extra = '') => `<button type="button" role="menuitem" class="pl-mi" data-a="${a}" data-mid="${mid}"${extra}>${icon(ic, 18)}<span>${text}</span></button>`;
    const body = this.reportStep
      ? `<p class="pl-chat-msgmenu-h" id="pl-report-h">${icon('flag', 16)}<span>Report message</span></p><div role="group" aria-labelledby="pl-report-h">${CHAT_REPORT_KINDS.map((k) => `<button type="button" role="menuitem" class="pl-mi pl-report-chip" data-a="report-kind" data-kind="${k}" data-mid="${mid}"><span>${this.esc(CHAT_REPORT_LABELS[k])}</span></button>`).join('')}</div><button type="button" role="menuitem" class="pl-mi pl-mi-back" data-a="report-back" data-mid="${mid}">${icon('chevron', 18)}<span>Back</span></button>`
      : `${m.k === 't' ? item('msg-copy', 'copy', 'Copy text') : ''}${item('report-open', 'flag', 'Report message', ' aria-haspopup="menu"')}${this.deps.thread ? '' : item('block', 'block', `Block ${this.esc(this.deps.friend.name)}`).replace('class="pl-mi"', 'class="pl-mi danger"')}`;
    return `<div class="pl-chat-msgmenu" role="menu" aria-label="${this.reportStep ? 'Report message' : 'Message options'}" data-testid="chat-msg-menu">${body}</div>`;
  }

  private setMinimised(on: boolean): void {
    this.minimised = on;
    this.menu = false;
    this.tray = false;
    this.reporting = null;
    if (!on) this.unseen = 0;
    this.render(!on);
    this.fitDock();
    this.deps.onMinimise?.(on);
    if (!on) this.markRead();
    const to = on ? null : this.root.querySelector<HTMLElement>('input[name="chat"]');
    (to ?? this.root.querySelector<HTMLElement>('.pl-chat-min'))?.focus({ preventScroll: true });
  }

  private onClick(e: Event): void {
    // minimised: a click anywhere on the head opens the thread again
    if (this.minimised && !(e.target as HTMLElement).closest('[data-a="back"]')) {
      this.setMinimised(false);
      return;
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    const a = el?.dataset.a;
    if (!a || !el || el.hasAttribute('disabled')) return;
    switch (a) {
      case 'back':
        this.dispose();
        this.deps.onClose(this.deps.docked ? 'close' : 'back');
        return;
      case 'tab': {
        const code = el.dataset.code ?? '';
        if (!code || el.getAttribute('aria-selected') === 'true') return;
        this.dispose();
        this.deps.onTab?.(code);
        return;
      }
      case 'pick': {
        // touch: a tap on a friend's message shows its "…" (Report) beside it; a second tap hides it
        const mid = el.closest<HTMLElement>('.pl-chat-msg')?.dataset.mid ?? null;
        this.picked = this.picked === mid ? null : mid;
        this.render();
        return;
      }
      case 'menu':
        this.menu = !this.menu;
        this.render();
        return;
      case 'min':
        this.setMinimised(!this.minimised);
        return;
      case 'tray':
        this.tray = !this.tray;
        this.render();
        return;
      case 'tray-prev':
      case 'tray-next':
        this.trayPage = Math.max(0, this.trayPage + (a === 'tray-next' ? 1 : -1));
        this.render();
        return;
      case 'say': {
        const k = el.dataset.k === 's' ? 's' : 'q';
        void this.send({ k, pid: Number(el.dataset.id) });
        return;
      }
      case 'earlier':
        void this.loadHistory(this.messages[0]?.mid);
        return;
      case 'mute':
        if (!this.thread) return;
        this.menu = false;
        void this.deps.api('chat.mute', { thread: this.thread, muted: !this.muted }).then((r) => {
          if (r.ok) this.muted = !this.muted;
          this.render();
        });
        return;
      case 'block':
        this.menu = false;
        this.deps.track?.('friend_block', { from: 'chat' });
        void this.deps.api('block.add', { code: this.deps.friend.code }).then((r) => {
          if (!r.ok) {
            this.showError('Something went wrong. Try again.');
            this.render();
            return;
          }
          this.dispose();
          this.deps.onBlocked?.();
          this.deps.onClose('close');
        });
        return;
      case 'report':
        if (this.reporting === el.dataset.mid) {
          this.reporting = null;
          this.render();
          return;
        }
        this.openReport(el.dataset.mid ?? '');
        return;
      case 'report-open':
      case 'report-back':
        this.reportStep = a === 'report-open';
        this.render();
        this.root.querySelector<HTMLElement>('.pl-chat-msgmenu [role="menuitem"]')?.focus({ preventScroll: true });
        return;
      case 'msg-copy': {
        const m = this.messages.find((x) => x.mid === el.dataset.mid);
        const mid = this.reporting;
        this.reporting = null;
        const done = () => {
          this.render();
          if (mid) this.focusMore(mid);
        };
        if (!m) return done();
        void Promise.resolve(navigator.clipboard?.writeText(bubbleText(m)))
          .then(() => this.showError('Copied'))
          .catch(() => this.showError('Could not copy'))
          .finally(done);
        return;
      }
      case 'report-kind': {
        const msg = el.dataset.mid ?? '';
        const kind = el.dataset.kind as ChatReportKind;
        this.reporting = null;
        this.reportStep = false;
        this.deps.track?.('chat_report', { kind });
        void this.deps.api('chat.report', { msg, kind }).then((r) => {
          this.showError(r.ok ? 'Thanks. We review every report.' : r.status === 429 ? 'Too many reports. Try again later.' : 'Something went wrong. Try again.');
          this.render();
        });
        return;
      }
    }
  }

  /** Close the thread as its Back (or a docked window's ×) would: the host is told how. */
  close(how: 'back' | 'close' | 'esc' = 'back'): void {
    if (this.disposed) return;
    this.dispose();
    this.deps.onClose(how);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.cancelPress();
    this.unwatchViewport();
    this.root.remove();
    if (this.minimised) this.deps.onMinimise?.(false);
  }
}
