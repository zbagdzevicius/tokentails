/**
 * Party and team chat (docs/plans/moba/CHAT-AVATARS.md §6.3, PROTO 5): a strip in the party lobby, the champion pick and
 * results. Collapsed (the phone default) it is one 36 px line, the last message and an unread count; tapped it opens a
 * drawer (at most half the height) with the last 30 lines and the phrase tray, plus a text input only when the relay
 * says the party's tier is `text` (every member a registered 16+ account, no strangers). Matchmade parties say "Team"
 * and offer team phrases only. Lines from members the player blocked are hidden (`PartyView.blocks`). The relay checks
 * everything again; this only mirrors it. Names and text go in with textContent. Nothing runs in a match.
 */
import type { ClientJson, PartyView } from '../../net/proto';
import { CHAT_LIMITS_CLIENT, CHAT_REPORT_KINDS, CHAT_REPORT_LABELS, CHAT_STICKERS, chatBodyText, chatErrorText, phrasesFor, type ChatReportKind } from '../../data/chatPhrases';
import { avatarHtml } from '../../ui/avatar';
import { shownName } from './partyLobby';

export interface PartyLine {
  mid: string;
  from: string;
  k: 't' | 'q' | 's';
  text?: string;
  id?: number;
  at: number;
}

export interface PartyChatDeps {
  send(msg: ClientJson): void;
  /** Report a line (the host's `chat.report`); absent: no Report button (standalone). */
  report?(mid: string, kind: ChatReportKind): Promise<boolean>;
  hideNames(): boolean;
  /** Start expanded (desktop). */
  wide?(): boolean;
}

const KEEP = 30;
const PAGE = 6;
const SHOWN_PHASES = new Set(['lobby', 'pick', 'results']);

/** The strip's scope: team phrases with strangers, party phrases with friends. Pure. */
export const chatScopeOf = (v: PartyView): 'team' | 'party' => (v.mm?.strangers ? 'team' : 'party');

/** Free text is offered only when the relay said `text` and no stranger is in the party. Pure. */
export const textAllowed = (v: PartyView): boolean => v.chat?.tier === 'text' && !v.mm?.strangers;

/** The relay's `chat.reject.why` as an error code of chatErrorText. Pure. */
export function rejectCode(why: string): string {
  if (why === 'words' || why === 'contact' || why === 'link' || why === 'charset') return 'chat_rejected';
  if (why === 'long') return 'chat_too_long';
  if (why === 'rate' || why === 'quick_only' || why === 'phase' || why === 'muted' || why === 'cooldown') return `chat_${why}`;
  return '';
}

/** The line as display text. Pure. */
export const lineText = (l: Pick<PartyLine, 'k' | 'text' | 'id'>): string => (l.k === 't' ? (l.text ?? '') : chatBodyText(l.k, l.id ?? -1));

export class PartyChat {
  readonly el: HTMLElement;
  private view: PartyView | null = null;
  private lines: PartyLine[] = [];
  private open: boolean;
  private unread = 0;
  private error = '';
  private errorTimer: ReturnType<typeof setTimeout> | null = null;
  private page = 0;
  private reporting: string | null = null;
  private visible = false;
  private disposed = false;

  constructor(
    parent: HTMLElement,
    private readonly deps: PartyChatDeps,
  ) {
    this.el = parent.ownerDocument.createElement('div');
    this.el.className = 'pp-chat';
    this.el.dataset.testid = 'party-chat';
    this.el.hidden = true;
    this.open = !!deps.wide?.();
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('submit', (e) => {
      e.preventDefault();
      this.sendText();
    });
    parent.appendChild(this.el);
  }

  /** A `chat.*` frame from the relay. Returns true when it was one. */
  onFrame(m: { t: string } & Record<string, unknown>): boolean {
    if (m.t === 'chat.msg') {
      const line: PartyLine = {
        mid: String(m.mid ?? ''),
        from: String(m.from ?? ''),
        k: m.k === 't' || m.k === 's' ? m.k : 'q',
        ...(typeof m.text === 'string' ? { text: m.text } : {}),
        ...(typeof m.id === 'number' ? { id: m.id } : {}),
        at: Number(m.at) || Date.now(),
      };
      if (this.view?.blocks?.includes(line.from)) return true;
      this.lines = [...this.lines.filter((l) => l.mid !== line.mid), line].slice(-KEEP);
      if (!this.open && line.from !== this.view?.you) this.unread++;
      this.render();
      return true;
    }
    if (m.t === 'chat.reject') {
      const why = String(m.why ?? '');
      const until = typeof m.until === 'number' ? new Date(m.until).toISOString() : null;
      this.flash(chatErrorText(rejectCode(why), why, until));
      return true;
    }
    return m.t.startsWith('chat.');
  }

  /** The party view and the screen changed: show on the lobby, the pick and results (PROTO 5 relays only). */
  sync(view: PartyView | null, screen: string): void {
    const show = !!view && !!view.chat && SHOWN_PHASES.has(view.phase) && (screen === 'lobby' || screen === 'pick');
    // a new party (another thread) starts empty
    if (view?.chat?.thread && this.view?.chat?.thread && view.chat.thread !== this.view.chat.thread) {
      this.lines = [];
      this.unread = 0;
    }
    this.view = view;
    if (view?.blocks?.length) this.lines = this.lines.filter((l) => !view.blocks!.includes(l.from));
    if (show !== this.visible) {
      this.visible = show;
      this.el.hidden = !show;
    }
    if (show) this.render();
  }

  private flash(text: string): void {
    this.error = text;
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => {
      this.errorTimer = null;
      this.error = '';
      this.render();
    }, 3000);
    this.render();
  }

  private say(k: 'q' | 's', id: number): void {
    this.deps.send({ t: 'chat.say', k, id });
  }

  private sendText(): void {
    const input = this.el.querySelector<HTMLInputElement>('input[name="pchat"]');
    const text = (input?.value ?? '').trim();
    if (!text || !this.view || !textAllowed(this.view)) return;
    this.deps.send({ t: 'chat.say', k: 't', text: text.slice(0, 240) });
    if (input) input.value = '';
  }

  private esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  }

  private nameOf(id: string): string {
    const v = this.view;
    const m = v?.members.find((x) => x.id === id);
    return m && v ? shownName(v, m, this.deps.hideNames()) : 'A player';
  }

  render(): void {
    if (this.disposed || !this.visible || !this.view) return;
    const v = this.view;
    const scope = chatScopeOf(v);
    const head = scope === 'team' ? 'Team' : 'Party';
    const last = this.lines[this.lines.length - 1];
    if (!this.open) {
      const preview = last ? `<span class="pp-chat-who" data-name="${this.esc(this.nameOf(last.from))}"></span><span class="pp-chat-said" data-name="${this.esc(lineText(last))}"></span>` : `<span class="pp-chat-said">${head} chat</span>`;
      this.el.innerHTML = `<button type="button" class="pp-chat-strip" data-a="toggle" aria-expanded="false" data-testid="party-chat-strip">💬 ${preview}${this.unread ? `<i class="pl-chat-unread">${Math.min(99, this.unread)}</i>` : ''}</button>${this.error ? `<p class="pl-chat-err" role="alert">${this.esc(this.error)}</p>` : ''}`;
    } else {
      const phrases = phrasesFor(scope);
      const pages = Math.ceil(phrases.length / PAGE) + 1;
      const page = Math.min(this.page, pages - 1);
      const chips =
        page < pages - 1
          ? phrases
              .slice(page * PAGE, page * PAGE + PAGE)
              .map((p) => `<button type="button" class="pl-chat-chip" data-a="say" data-k="q" data-id="${p.id}">${this.esc(p.text)}</button>`)
              .join('')
          : CHAT_STICKERS.map((s, i) => `<button type="button" class="pl-chat-chip sticker" data-a="say" data-k="s" data-id="${i}" aria-label="Sticker ${i + 1}">${s}</button>`).join('');
      const lines = this.lines
        .map((l) => {
          const m = v.members.find((x) => x.id === l.from);
          const mine = l.from === v.you;
          const report =
            !mine && this.deps.report
              ? this.reporting === l.mid
                ? `<span class="pl-chat-report">${CHAT_REPORT_KINDS.map((k) => `<button type="button" class="pl-report-chip" data-a="report-kind" data-kind="${k}" data-mid="${this.esc(l.mid)}">${this.esc(CHAT_REPORT_LABELS[k])}</button>`).join('')}</span>`
                : `<button type="button" class="pl-chat-more" data-a="report" data-mid="${this.esc(l.mid)}" aria-label="Report this message">&hellip;</button>`
              : '';
          return `<li class="pp-chat-line${mine ? ' mine' : ''}${l.k === 's' ? ' sticker' : ''}">${avatarHtml(m?.av, 24, { guest: !!m?.guest && !m?.av })}<b class="pp-chat-name" data-name="${this.esc(this.nameOf(l.from))}"></b><span data-name="${this.esc(lineText(l))}"></span>${report}</li>`;
        })
        .join('');
      const input = textAllowed(v)
        ? `<form class="pl-chat-form"><input name="pchat" maxlength="${CHAT_LIMITS_CLIENT.textMax}" autocomplete="off" enterkeyhint="send" placeholder="Message your party" aria-label="Message your party" data-testid="party-chat-input"><button type="submit" class="pl-btn small">Send</button></form>`
        : `<p class="pl-chat-line">Quick chat keeps everyone safe 🐾</p>`;
      this.el.innerHTML = `<div class="pp-chat-drawer" role="region" aria-label="${head} chat"><header class="pp-chat-head"><b>${head} chat</b><button type="button" class="pl-social-x" data-a="toggle" aria-label="Close chat" aria-expanded="true">&times;</button></header><ul class="pp-chat-lines">${lines || '<li class="pl-chat-empty">Say hi to your party!</li>'}</ul><div class="pl-chat-tray"><div class="pl-chat-chips">${chips}</div><div class="pl-chat-pages"><button type="button" class="pl-btn ghost small" data-a="prev" aria-label="Previous phrases"${page === 0 ? ' disabled' : ''}>&lsaquo;</button><button type="button" class="pl-btn ghost small" data-a="next" aria-label="More phrases"${page >= pages - 1 ? ' disabled' : ''}>&rsaquo;</button></div></div>${input}${this.error ? `<p class="pl-chat-err" role="alert">${this.esc(this.error)}</p>` : ''}</div>`;
      const ul = this.el.querySelector<HTMLElement>('.pp-chat-lines');
      if (ul) ul.scrollTop = ul.scrollHeight;
    }
    for (const el of this.el.querySelectorAll<HTMLElement>('[data-name]')) el.textContent = el.dataset.name ?? '';
  }

  private onClick(e: Event): void {
    e.stopPropagation();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    const a = el?.dataset.a;
    if (!a || !el || el.hasAttribute('disabled')) return;
    switch (a) {
      case 'toggle':
        this.open = !this.open;
        if (this.open) this.unread = 0;
        this.render();
        return;
      case 'say':
        this.say(el.dataset.k === 's' ? 's' : 'q', Number(el.dataset.id));
        return;
      case 'prev':
      case 'next':
        this.page = Math.max(0, this.page + (a === 'next' ? 1 : -1));
        this.render();
        return;
      case 'report':
        this.reporting = this.reporting === el.dataset.mid ? null : (el.dataset.mid ?? null);
        this.render();
        return;
      case 'report-kind': {
        const mid = el.dataset.mid ?? '';
        this.reporting = null;
        void this.deps.report?.(mid, el.dataset.kind as ChatReportKind).then((ok) => this.flash(ok ? 'Thanks. We review every report.' : 'Something went wrong. Try again'));
        return;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.el.remove();
  }
}
