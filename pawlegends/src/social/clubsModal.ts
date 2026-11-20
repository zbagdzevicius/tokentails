/**
 * The club window (CLUBS-KUDOS.md §6; friends panel Nov 20): the Clubs panel (clubs/clubsPanel.ts) in its own centred
 * window, opened from the Profile's "Your club" / "Find a club" (the old sidebar's Clubs tab is gone). Club chat opens
 * the DM thread sheet on the club's thread over it. Esc closes the top layer.
 */
import './social.css';
import './friendsSheet.css';
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { ChatSheet } from './chatSheet';
import { ClubsPanel } from './clubs/clubsPanel';
import { icon } from './socialIcons';

export interface ClubsModalDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  inMatch?(): boolean;
  onClose?(): void;
  track?(event: string, props?: Record<string, string | number | boolean>): void;
}

/** Rows a club page shows for a screen height (the Clubs panel pages its members). Pure. */
export function rowsForHeight(h: number): number {
  if (h <= 300) return 3;
  if (h <= 340) return 4;
  return 5;
}

export class ClubsModal {
  readonly root: HTMLElement;
  private readonly scrim: HTMLElement;
  private note = '';
  private chat: ChatSheet | null = null;
  private disposed = false;
  private readonly opener: HTMLElement | null;
  private readonly clubs: ClubsPanel;

  constructor(
    private readonly parent: HTMLElement,
    private readonly deps: ClubsModalDeps,
  ) {
    const doc = parent.ownerDocument;
    const was = doc.activeElement as HTMLElement | null;
    this.opener = was && was !== doc.body ? was : null;
    this.clubs = new ClubsPanel({
      api: (op, args) => this.deps.api(op, args),
      render: () => this.render(),
      note: (t) => {
        this.note = t;
      },
      openChat: (thread, title) => this.openChat(thread, title),
      track: (e, p) => this.deps.track?.(e, p),
    });
    this.scrim = doc.createElement('div');
    this.scrim.className = 'pl-fsheet-scrim';
    this.scrim.addEventListener('click', () => this.dispose());
    this.root = doc.createElement('aside');
    this.root.className = 'pl-social pl-fsheet is-clubs';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Club');
    this.root.dataset.testid = 'clubs-modal';
    this.root.dataset.view = 'clubs';
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-a="close"]')) return this.dispose();
      const club = t.closest<HTMLElement>('[data-club]');
      if (club && this.clubs.click(club)) return;
    });
    this.root.addEventListener('submit', (e) => {
      e.preventDefault();
      const club = (e.target as HTMLElement).closest?.('.pl-club-join');
      if (club) void this.clubs.join(club.querySelector<HTMLInputElement>('input[name="club"]')?.value ?? '');
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      this.dispose();
    });
    parent.append(this.scrim, this.root);
    this.render();
    this.root.querySelector<HTMLElement>('[data-a="close"]')?.focus({ preventScroll: true });
    void this.clubs.load().then(() => this.render());
  }

  get closed(): boolean {
    return this.disposed;
  }

  private get per(): number {
    return rowsForHeight(typeof window !== 'undefined' ? window.innerHeight : 640);
  }

  render(): void {
    if (this.disposed) return;
    const foot = this.clubs.footer(this.per);
    const note = this.note ? `<p class="pl-social-note" role="status">${this.note.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</p>` : '';
    this.root.innerHTML = `<header class="pl-social-head"><h2 class="pl-social-title">Club</h2><span class="pl-head-acts"><button type="button" class="pl-ico pl-social-x" data-a="close" aria-label="Close" title="Close (Esc)">${icon('close', 20)}</button></span></header><div class="pl-social-body">${this.clubs.body(this.per)}</div>${note}${foot ? `<footer class="pl-social-foot">${foot}</footer>` : ''}`;
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-name]')) el.textContent = el.dataset.name ?? '';
    this.note = '';
  }

  private openChat(thread: string, title: string): void {
    this.chat?.dispose();
    this.root.inert = true;
    this.chat = new ChatSheet(this.parent, {
      api: (op, args) => this.deps.api(op, args),
      friend: { code: '', name: title },
      thread,
      inMatch: () => this.deps.inMatch?.() ?? false,
      track: this.deps.track,
      autofocus: 'head',
      onClose: () => {
        this.chat = null;
        this.root.inert = false;
        this.root.querySelector<HTMLElement>('[data-a="close"]')?.focus({ preventScroll: true });
      },
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.chat?.dispose();
    this.root.remove();
    this.scrim.remove();
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.deps.onClose?.();
  }
}
