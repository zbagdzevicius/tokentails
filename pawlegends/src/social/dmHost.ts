/**
 * Direct messages without a friends sidebar (friends panel, Nov 20; CHAT-AVATARS.md §6). One DM thread sheet at a time
 * (chatSheet.ts), opened from a friend's Player Card ("Message"), from Home's friends panel chat button (the newest
 * unread conversation) and from a DM toast. Its tab strip lists the conversations opened this session plus every
 * unread, unmuted thread, so the next unread one is one tap away. The unread total feeds the panel's chat badge.
 */
import './social.css';
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { ChatSheet, type ChatTab } from './chatSheet';
import { presenceText, shownState, type FriendRow } from './presence';
import type { ChatThreadRow } from './socialState';

export interface DmHostDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  /** The friends as Home last heard them (names, avatars, presence for the head and the tabs). */
  friends(): readonly FriendRow[] | null;
  inMatch?(): boolean;
  /** The unread DM total changed (the panel's chat badge). */
  onUnread?(n: number): void;
  /** A friend was blocked from the thread's menu (Home's list reloads). */
  onBlocked?(): void;
  track?(event: string, props?: Record<string, string | number | boolean>): void;
}

/** At most this many conversations on the tab strip (the oldest other one goes). */
const MAX_CONVOS = 5;

export class DmHost {
  private chat: ChatSheet | null = null;
  private code: string | null = null;
  private convos: string[] = [];
  private threads = new Map<string, ChatThreadRow>();
  private unread = 0;

  constructor(
    private readonly parent: HTMLElement,
    private readonly deps: DmHostDeps,
  ) {}

  get open(): boolean {
    return !!this.chat && !this.chat.closed;
  }

  /** `chat.list`: the threads (unread counts, the friend's name for one not in the friends list). */
  async loadThreads(): Promise<readonly ChatThreadRow[]> {
    const r = await this.deps.api('chat.list');
    if (!r.ok) return [...this.threads.values()];
    const rows = ((r.body as { threads?: ChatThreadRow[] } | undefined)?.threads ?? []).filter((t) => t && t.with && typeof t.with.code === 'string');
    this.threads = new Map(rows.map((t) => [t.with.code, t]));
    this.recount();
    return rows;
  }

  private recount(): void {
    let n = 0;
    for (const [c, t] of this.threads) if (!t.muted && !(this.open && c === this.code)) n += t.unread;
    if (n !== this.unread) {
      this.unread = n;
      this.deps.onUnread?.(n);
    }
  }

  private who(code: string): { code: string; name: string; av?: FriendRow['av'] } | null {
    const f = this.deps.friends()?.find((x) => x.code === code);
    if (f) return { code, name: f.name, av: f.av };
    const t = this.threads.get(code);
    return t ? { code, name: t.with.name, av: t.with.av } : null;
  }

  private tabs(active: string): ChatTab[] {
    const codes = [...this.convos];
    for (const [c, t] of this.threads) if (t.unread && !t.muted && !codes.includes(c)) codes.push(c);
    const out: ChatTab[] = [];
    for (const c of codes) {
      const w = this.who(c);
      if (!w) continue;
      const f = this.deps.friends()?.find((x) => x.code === c);
      const t = this.threads.get(c);
      out.push({ code: c, name: w.name, av: w.av, state: f ? shownState(f.presence) : 'offline', unread: c === active || !t || t.muted ? 0 : t.unread, active: c === active });
    }
    return out.length > 1 ? out : [];
  }

  /** The newest unread conversation (the panel's chat button); none unread: the newest thread. */
  async openUnread(): Promise<boolean> {
    const rows = await this.loadThreads();
    const pick = rows.find((t) => t.unread > 0 && !t.muted) ?? rows[0];
    if (!pick) return false;
    this.openWith({ code: pick.with.code, name: pick.with.name, av: pick.with.av });
    return true;
  }

  /** Open the thread with a friend (the Player Card's Message, a DM toast). */
  openWith(friend: { code: string; name: string; av?: unknown }, focus: 'input' | 'head' = this.fine ? 'input' : 'head'): void {
    const known = this.who(friend.code);
    const f = { code: friend.code, name: known?.name ?? friend.name, av: (known?.av ?? friend.av) as FriendRow['av'] };
    this.chat?.dispose();
    this.code = f.code;
    if (!this.convos.includes(f.code)) {
      this.convos.push(f.code);
      if (this.convos.length > MAX_CONVOS) this.convos.splice(this.convos.findIndex((c) => c !== f.code), 1);
    }
    const t = this.threads.get(f.code);
    if (t) t.unread = 0;
    this.recount();
    const code = f.code;
    this.chat = new ChatSheet(this.parent, {
      api: (op, args) => this.deps.api(op, args),
      friend: f,
      inMatch: () => this.deps.inMatch?.() ?? false,
      track: this.deps.track,
      status: () => {
        const now = this.deps.friends()?.find((x) => x.code === code);
        return now ? { text: presenceText(now.presence), state: shownState(now.presence) } : null;
      },
      unreadElsewhere: () => {
        let n = 0;
        for (const [c, x] of this.threads) if (c !== code && !x.muted) n += x.unread;
        return n;
      },
      tabs: () => this.tabs(code),
      autofocus: focus,
      onTab: (c) => {
        const w = this.who(c);
        if (c !== code && w) this.openWith(w, focus);
      },
      onClose: (how) => {
        this.chat = null;
        this.code = null;
        if (how === 'close' || how === 'esc') this.convos = this.convos.filter((c) => c !== code);
        void this.loadThreads();
      },
      onBlocked: () => this.deps.onBlocked?.(),
    });
  }

  /** A relay `chat.notice`: the open thread fetches now; otherwise the unread counts refresh. */
  dmNotice(thread: string): void {
    if (this.chat && !this.chat.closed) {
      if (!thread || this.chat.threadId === thread) this.chat.poke(thread);
      else void this.loadThreads();
      return;
    }
    void this.loadThreads();
  }

  /** The pulse's unread total (no `chat.list` needed while nothing is open). */
  setUnread(n: number): void {
    if (this.open) return;
    this.unread = Math.max(0, n);
  }

  private get fine(): boolean {
    return !!this.parent.ownerDocument.defaultView?.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  }

  dispose(): void {
    this.chat?.dispose();
    this.chat = null;
    this.code = null;
  }
}
