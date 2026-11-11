/**
 * A DM thread with one friend (docs/plans/moba/CHAT-AVATARS.md §6.2): a right-side sheet over the Social sheet (phone
 * full width, desktop 420 px). The message list is the one scroll region (visible scrollbar, newest at the bottom,
 * "Load earlier" at the top); the composer is fixed. The server decides the tier: `text` threads (both friends are 16+)
 * get a one-line input with a 120-character cap plus the phrase tray; `quick` threads get the tray only, and nobody is
 * told the other player's age band. While the sheet is visible it polls `chat.since` every 4 s (never in a match or a
 * hidden tab). Every name and every message is set with textContent; the game never sees an account id.
 */
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

export interface ChatMessage {
  mid: string;
  mine: boolean;
  k: 't' | 'q' | 's';
  text?: string;
  id?: number;
  at: string | number;
}

export interface ChatSheetDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  friend: { code: string; name: string; av?: AvatarView };
  /** Back to the Social sheet (the sheet removed itself). */
  onClose(): void;
  /** A match is running: the poll pauses. */
  inMatch?(): boolean;
  /** The friend was blocked from the menu: the Social sheet reloads. */
  onBlocked?(): void;
  /** Analytics (no names, codes, ids or text in props). */
  track?(event: string, props?: Record<string, string | number | boolean>): void;
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
  private reporting: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private sending = false;
  private disposed = false;
  private loading = true;
  private readUpTo = '';
  private readonly unwatchViewport: () => void;

  constructor(
    parent: HTMLElement,
    private readonly deps: ChatSheetDeps,
  ) {
    const doc = parent.ownerDocument;
    this.root = doc.createElement('aside');
    this.root.className = 'pl-chat';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Chat');
    this.root.dataset.testid = 'chat-sheet';
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.sendText();
    });
    this.root.addEventListener('input', (e) => this.onInput(e));
    parent.appendChild(this.root);
    // iOS: the keyboard shrinks the visual viewport; the sheet follows so the composer stays above it
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const fit = () => {
      if (vv) this.root.style.height = `${Math.round(vv.height)}px`;
    };
    vv?.addEventListener('resize', fit);
    this.unwatchViewport = () => vv?.removeEventListener('resize', fit);
    this.deps.track?.('chat_open');
    this.render();
    void this.open();
    this.pollTimer = setInterval(() => void this.poll(), CHAT_LIMITS_CLIENT.pollMs);
  }

  get closed(): boolean {
    return this.disposed;
  }

  private async open(): Promise<void> {
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
    this.render(!before);
    this.markRead();
  }

  /** The 4 s poll while the sheet is open, visible and no match runs. */
  async poll(): Promise<void> {
    if (this.disposed || !this.thread || this.loading) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (this.deps.inMatch?.()) return;
    const last = this.messages[this.messages.length - 1]?.mid;
    if (!last) {
      await this.loadHistory();
      return;
    }
    const r = await this.deps.api('chat.since', { thread: this.thread, after: last });
    if (!r.ok || r.status === 204 || !r.body) return;
    const fresh = (r.body as { messages?: ChatMessage[] }).messages ?? [];
    if (!fresh.length) return;
    this.messages = mergeMessages(this.messages, fresh);
    this.render(true);
    this.markRead();
  }

  private markRead(): void {
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
        this.showError(r.status === 0 ? 'No connection. Try again' : chatErrorText(body?.code, body?.why, body?.until));
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
    return `<div class="pl-chat-tray" data-testid="chat-tray"><div class="pl-chat-chips">${chips}</div><div class="pl-chat-pages"><button type="button" class="pl-btn ghost small" data-a="tray-prev" aria-label="Previous phrases"${page === 0 ? ' disabled' : ''}>&lsaquo;</button><span class="pl-chat-dots">${dots}</span><button type="button" class="pl-btn ghost small" data-a="tray-next" aria-label="More phrases"${page >= pages - 1 ? ' disabled' : ''}>&rsaquo;</button></div></div>`;
  }

  private composerHtml(): string {
    if (this.readOnly) return `<p class="pl-chat-line">You are no longer friends. This chat closes soon.</p>`;
    if (!this.thread) return '';
    if (this.tier === 'quick')
      return `${this.trayHtml()}<p class="pl-chat-line" data-testid="chat-quick-note">Quick chat keeps everyone safe 🐾</p>`;
    const input = `<form class="pl-chat-form"><button type="button" class="pl-btn ghost small" data-a="tray" aria-label="Quick phrases" aria-pressed="${this.tray}">💬</button><input name="chat" maxlength="${CHAT_LIMITS_CLIENT.textMax}" autocomplete="off" enterkeyhint="send" placeholder="Message" aria-label="Message" data-testid="chat-input"><small class="pl-chat-count" aria-live="polite"></small><button type="submit" class="pl-btn small" data-testid="chat-send">Send</button></form>`;
    return `${this.tray ? this.trayHtml() : ''}${input}`;
  }

  /** Markup with `data-name` / `data-text` holes, filled by textContent after. */
  render(stickToBottom = false): void {
    if (this.disposed) return;
    const f = this.deps.friend;
    const list = this.root.querySelector<HTMLElement>('.pl-chat-list');
    const atBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const typing = this.root.querySelector<HTMLInputElement>('input[name="chat"]');
    const draft = typing?.value ?? '';
    const focused = !!typing && typing.ownerDocument.activeElement === typing;
    const menu = this.menu
      ? `<div class="pl-chat-menu" role="menu"><button type="button" class="pl-btn ghost small" data-a="mute" role="menuitem">${this.muted ? 'Unmute' : 'Mute'}</button><button type="button" class="pl-btn ghost small" data-a="block" role="menuitem">Block</button></div>`
      : '';
    const bubbles = this.messages
      .map((m) => {
        const cls = `pl-chat-msg${m.mine ? ' mine' : ''}${m.k === 's' ? ' sticker' : m.k === 'q' ? ' phrase' : ''}`;
        const report =
          !m.mine && this.reporting === m.mid
            ? `<span class="pl-chat-report">${CHAT_REPORT_KINDS.map((k) => `<button type="button" class="pl-report-chip" data-a="report-kind" data-kind="${k}" data-mid="${this.esc(m.mid)}">${this.esc(CHAT_REPORT_LABELS[k])}</button>`).join('')}</span>`
            : '';
        const more = m.mine ? '' : `<button type="button" class="pl-chat-more" data-a="report" data-mid="${this.esc(m.mid)}" aria-label="Report this message">&hellip;</button>`;
        return `<li class="${cls}" data-mid="${this.esc(m.mid)}"><span class="pl-chat-bubble" data-text="${this.esc(bubbleText(m))}"></span>${more}${report}</li>`;
      })
      .join('');
    const empty = !this.messages.length ? `<li class="pl-chat-empty">${this.loading ? 'Loading…' : 'Say hi! 👋'}</li>` : '';
    const earlier = this.more ? `<li><button type="button" class="pl-btn ghost small pl-chat-earlier" data-a="earlier">Load earlier</button></li>` : '';
    this.root.innerHTML = `<header class="pl-chat-head"><button type="button" class="pl-social-x" data-a="back" aria-label="Back">&lsaquo;</button>${avatarHtml(f.av, 40)}<span class="pl-social-name" data-name="${this.esc(f.name)}"></span>${this.muted ? '<small class="pl-social-st">Muted</small>' : ''}<button type="button" class="pl-social-x" data-a="menu" aria-label="More" aria-expanded="${this.menu}">&hellip;</button></header>${menu}<ul class="pl-chat-list" data-testid="chat-list">${earlier}${empty}${bubbles}</ul><footer class="pl-chat-foot">${this.composerHtml()}${this.error ? `<p class="pl-chat-err" role="alert">${this.esc(this.error)}</p>` : ''}</footer>`;
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-name]')) el.textContent = el.dataset.name ?? '';
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-text]')) el.textContent = el.dataset.text ?? '';
    const input = this.root.querySelector<HTMLInputElement>('input[name="chat"]');
    if (input && draft) input.value = draft;
    if (input && focused) input.focus();
    const ul = this.root.querySelector<HTMLElement>('.pl-chat-list');
    if (ul && (stickToBottom || atBottom)) ul.scrollTop = ul.scrollHeight;
  }

  private onClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    const a = el?.dataset.a;
    if (!a || !el || el.hasAttribute('disabled')) return;
    switch (a) {
      case 'back':
        this.dispose();
        this.deps.onClose();
        return;
      case 'menu':
        this.menu = !this.menu;
        this.render();
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
            this.showError('Something went wrong. Try again');
            this.render();
            return;
          }
          this.dispose();
          this.deps.onBlocked?.();
          this.deps.onClose();
        });
        return;
      case 'report':
        this.reporting = this.reporting === el.dataset.mid ? null : (el.dataset.mid ?? null);
        this.render();
        return;
      case 'report-kind': {
        const msg = el.dataset.mid ?? '';
        const kind = el.dataset.kind as ChatReportKind;
        this.reporting = null;
        this.deps.track?.('chat_report', { kind });
        void this.deps.api('chat.report', { msg, kind }).then((r) => {
          this.showError(r.ok ? 'Thanks. We review every report.' : r.status === 429 ? 'Too many reports. Try later' : 'Something went wrong. Try again');
          this.render();
        });
        return;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.unwatchViewport();
    this.root.remove();
  }
}
