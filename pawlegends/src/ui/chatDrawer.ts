/**
 * The in-match chat drawer (docs/plans/moba/MATCH-CHAT.md §4.1, §4.2): this match's last 50 lines and the composer.
 *
 * - Phones: a right-side overlay under the minimap, `min(360px, 46vw)` wide and at most 58% of the visual viewport
 *   tall (it follows the keyboard), never over the ability cluster or the joystick half. Opened by a tap on the ticker
 *   or by Type/More in the quick-chat wheel; a send, a tap outside, a death or the end closes it again. The game never
 *   pauses.
 * - Desktop: Enter opens the composer on Team (All when the team is phrases only), Shift+Enter on All; Enter sends,
 *   Esc cancels, Up recalls the last line. While the input has focus no game key fires (input/desktop.ts `isTyping`).
 *
 * Header: a Team | All toggle and ✕. Footer: one text input (120 characters, `enterkeyhint="send"`) plus the phrase
 * chips when this team is `text` and the channel is Team; phrase chips only otherwise ("Quick chat keeps everyone
 * safe" is never said: the tray simply has no input). A long-press (or right-click) on someone else's line offers Mute
 * player and Report.
 */
import { CHAT_LIMITS_CLIENT, CHAT_REPORT_KINDS, CHAT_REPORT_LABELS, matchPhraseText, phrasesFor, type ChatReportKind } from '../data/chatPhrases';
import type { ChatLineView } from './chatTicker';

export type MatchChannel = 'team' | 'all';
export type ChatSend = { k: 't'; text: string } | { k: 'q'; id: number };

export interface ChatDrawerDeps {
  touch: boolean;
  /** This player's side (phrase 38 shows its face). */
  side: 'cat' | 'dog';
  /** The map has a Kibble Cannon (phrase 36). */
  cannon?: boolean;
  /** Send a line; returns an error line to show, or null when it went out. */
  send(ch: MatchChannel, body: ChatSend): string | null;
  /** Mute a player's chat for this match (the scoreboard 🔇). */
  mute?(slot: number): void;
  /** Report a line (the host's `chat.report`); absent: no Report (a solo match). */
  report?(mid: string, kind: ChatReportKind): Promise<boolean>;
  /** The drawer opened or closed (the session hides the wheel, tests). */
  onToggle?(open: boolean): void;
}

const KEEP = 50;
const LONG_PRESS_MS = 500;

export class ChatDrawer {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly err: HTMLElement;
  private readonly lines: ChatLineView[] = [];
  private ch: MatchChannel = 'team';
  private tierNow: 'text' | 'quick' = 'quick';
  private lastSent = '';
  private errTimer: ReturnType<typeof setTimeout> | null = null;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private menuFor: number | null = null;
  private reportingIdx: number | null = null;
  private readonly offDoc: () => void;

  constructor(
    parent: HTMLElement,
    private readonly deps: ChatDrawerDeps,
  ) {
    this.el = document.createElement('div');
    this.el.className = `pl-chatdrawer${deps.touch ? ' touch' : ' desk'}`;
    this.el.hidden = true;
    this.el.dataset.testid = 'chat-drawer';
    this.el.innerHTML = `
      <div class="cd-head">
        <div class="cd-seg" role="tablist" aria-label="Chat channel">
          <button type="button" role="tab" data-ch="team" aria-selected="true">Team</button>
          <button type="button" role="tab" data-ch="all" aria-selected="false">All</button>
        </div>
        <button type="button" class="cd-x" data-a="close" aria-label="Close chat">✕</button>
      </div>
      <ol class="cd-list" aria-live="polite"></ol>
      <div class="cd-err" role="status"></div>
      <form class="cd-foot"></form>`;
    this.list = this.el.querySelector('.cd-list')!;
    this.foot = this.el.querySelector('.cd-foot')!;
    this.err = this.el.querySelector('.cd-err')!;
    this.el.addEventListener('pointerdown', (e) => {
      // the drawer takes its own taps: nothing under it moves the hero
      e.stopPropagation();
      this.pressStart(e);
    });
    this.el.addEventListener('pointerup', () => this.pressEnd());
    this.el.addEventListener('pointercancel', () => this.pressEnd());
    this.el.addEventListener('contextmenu', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
      if (!li) return;
      e.preventDefault();
      this.openMenu(Number(li.dataset.i));
    });
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.foot.addEventListener('submit', (e) => {
      e.preventDefault();
      this.sendText();
    });
    this.el.addEventListener('keydown', (e) => this.onKey(e));
    // a tap outside closes it (phones); the composer on desktop closes on Esc or a send
    const outside = (e: PointerEvent): void => {
      if (this.el.hidden || this.el.contains(e.target as Node)) return;
      if ((e.target as HTMLElement | null)?.closest('.pl-chatline, .pl-chatwheel, .pl-chatbtn')) return;
      this.close();
    };
    document.addEventListener('pointerdown', outside, true);
    this.offDoc = () => document.removeEventListener('pointerdown', outside, true);
    const vv = typeof visualViewport !== 'undefined' ? visualViewport : null;
    const fit = (): void => {
      if (vv && !this.el.hidden) this.el.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    };
    vv?.addEventListener('resize', fit);
    this.fit = fit;
    parent.appendChild(this.el);
    this.renderFoot();
  }

  private readonly fit: () => void;

  get open(): boolean {
    return !this.el.hidden;
  }

  get channel(): MatchChannel {
    return this.ch;
  }

  /** This team's tier: 'text' shows the input on Team. */
  set tier(t: 'text' | 'quick') {
    if (t === this.tierNow) return;
    this.tierNow = t;
    this.renderFoot();
  }

  get tier(): 'text' | 'quick' {
    return this.tierNow;
  }

  /** Is the composer's input focused (the game ignores its keys then)? */
  isTyping(): boolean {
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    return !!a && this.el.contains(a) && a.tagName === 'INPUT';
  }

  /** Open on `ch` (default Team); `focus` puts the caret in the input when there is one (desktop, "Type"). */
  openOn(ch: MatchChannel = 'team', focus = false): void {
    this.setChannel(ch);
    const was = this.open;
    this.el.hidden = false;
    this.fit();
    this.renderList();
    if (!was) this.deps.onToggle?.(true);
    if (focus) this.el.querySelector<HTMLInputElement>('.cd-input')?.focus({ preventScroll: true });
  }

  close(): void {
    if (this.el.hidden) return;
    const input = this.el.querySelector<HTMLInputElement>('.cd-input');
    if (input && document.activeElement === input) input.blur();
    this.el.hidden = true;
    this.menuFor = null;
    this.reportingIdx = null;
    this.deps.onToggle?.(false);
  }

  /** A line arrived (or was sent): kept for the list (50 newest). */
  add(line: ChatLineView): void {
    this.lines.push(line);
    if (this.lines.length > KEEP) this.lines.shift();
    if (this.open) this.renderList();
  }

  /** An inline error for 3 s (CHAT-AVATARS §6.2 wording). */
  error(text: string): void {
    this.err.textContent = text;
    this.err.classList.add('on');
    if (this.errTimer) clearTimeout(this.errTimer);
    this.errTimer = setTimeout(() => this.err.classList.remove('on'), 3000);
  }

  private setChannel(ch: MatchChannel): void {
    this.ch = ch;
    for (const b of this.el.querySelectorAll<HTMLElement>('.cd-seg [data-ch]')) b.setAttribute('aria-selected', String(b.dataset.ch === ch));
    this.renderFoot();
  }

  private phrases(): { id: number; text: string }[] {
    return phrasesFor(this.ch === 'all' ? 'all' : 'match')
      .filter((p) => p.id !== 36 || this.deps.cannon)
      .map((p) => ({ id: p.id, text: matchPhraseText(p.id, this.deps.side) }));
  }

  private renderFoot(): void {
    const typed = this.ch === 'team' && this.tierNow === 'text';
    const chips = this.phrases()
      .map((p) => `<button type="button" class="cd-chip" data-a="phrase" data-id="${p.id}">${esc(p.text)}</button>`)
      .join('');
    this.foot.innerHTML = `${
      typed
        ? `<div class="cd-row"><input class="cd-input" type="text" maxlength="${CHAT_LIMITS_CLIENT.textMax}" enterkeyhint="send" autocomplete="off" autocapitalize="sentences" spellcheck="true" aria-label="Team message" placeholder="Message your team"><button type="submit" class="cd-send" aria-label="Send">Send</button></div>`
        : ''
    }<div class="cd-chips" role="group" aria-label="Quick chat">${chips}</div>`;
    this.el.classList.toggle('typed', typed);
  }

  private renderList(): void {
    const html = this.lines
      .map((l, i) => {
        const menu =
          this.menuFor === i && !l.mine
            ? this.reportingIdx === i
              ? `<span class="cd-menu">${CHAT_REPORT_KINDS.map((k) => `<button type="button" data-a="report-kind" data-kind="${k}" data-i="${i}">${esc(CHAT_REPORT_LABELS[k])}</button>`).join('')}</span>`
              : `<span class="cd-menu">${this.deps.mute ? `<button type="button" data-a="mute" data-i="${i}">Mute player</button>` : ''}${this.deps.report && l.mid ? `<button type="button" data-a="report" data-i="${i}">Report</button>` : ''}</span>`
            : '';
        return `<li data-i="${i}" class="${l.ch}${l.mine ? ' mine' : ''}">${l.ch === 'all' ? '<i>[All]</i>' : ''}<b style="color:${esc(l.color)}">${esc(l.name)}:</b> <span>${esc(l.text)}</span>${menu}</li>`;
      })
      .join('');
    this.list.innerHTML = html;
    this.list.scrollTop = this.list.scrollHeight;
  }

  private openMenu(i: number): void {
    const l = this.lines[i];
    if (!l || l.mine) return;
    this.menuFor = i;
    this.reportingIdx = null;
    this.renderList();
  }

  private pressStart(e: PointerEvent): void {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
    if (!li || (e.target as HTMLElement).closest('button')) return;
    this.pressEnd();
    const i = Number(li.dataset.i);
    this.pressTimer = setTimeout(() => this.openMenu(i), LONG_PRESS_MS);
  }

  private pressEnd(): void {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a], [data-ch]');
    if (!t) return;
    if (t.dataset.ch) return this.setChannel(t.dataset.ch as MatchChannel);
    const i = Number(t.dataset.i);
    switch (t.dataset.a) {
      case 'close':
        return this.close();
      case 'phrase':
        this.deliver({ k: 'q', id: Number(t.dataset.id) });
        return;
      case 'mute': {
        const l = this.lines[i];
        if (l) this.deps.mute?.(l.slot);
        this.menuFor = null;
        return this.renderList();
      }
      case 'report':
        this.reportingIdx = i;
        return this.renderList();
      case 'report-kind': {
        const l = this.lines[i];
        if (l?.mid && this.deps.report)
          void this.deps.report(l.mid, t.dataset.kind as ChatReportKind).then((ok) => this.error(ok ? 'Thanks. Our team will look at it' : 'Report not sent. Try again'));
        this.menuFor = null;
        this.reportingIdx = null;
        return this.renderList();
      }
    }
  }

  private onKey(e: KeyboardEvent): void {
    const input = e.target as HTMLInputElement;
    if (!input.classList?.contains('cd-input')) return;
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      input.value = '';
      this.close();
    } else if (e.key === 'ArrowUp' && !input.value && this.lastSent) {
      e.preventDefault();
      input.value = this.lastSent;
    }
  }

  private sendText(): void {
    const input = this.el.querySelector<HTMLInputElement>('.cd-input');
    const text = input?.value.trim() ?? '';
    if (!text) return;
    if (this.deliver({ k: 't', text }) && input) {
      this.lastSent = text;
      input.value = '';
    }
  }

  private deliver(body: ChatSend): boolean {
    const err = this.deps.send(this.ch, body);
    if (err) {
      this.error(err);
      return false;
    }
    // Wild Rift style: after a send the drawer folds back to the ticker
    this.close();
    return true;
  }

  dispose(): void {
    this.offDoc();
    if (this.errTimer) clearTimeout(this.errTimer);
    this.pressEnd();
    this.el.remove();
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
