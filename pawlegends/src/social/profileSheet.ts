/**
 * The Profile sheet (docs/plans/moba/SOCIAL-RANKED.md §2.3): opened by tapping the Home profile chip. The player's
 * avatar and border, an owned title, the nickname (the first change free, then Yarn, with a confirm step) and the
 * country flag (a link to Settings, which owns that switch). No bio: free text to strangers. Every call goes through the
 * host (`name.get`, `name.set`, `social.get`, `social.me`); the server decides the price, the cooldown and the name.
 * Names are set with `textContent`. Guests see one line: sign in to choose a name.
 */
import './profile.css';
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { HERO_IDS } from '../data/heroes';
import { avatarHtml, titleText } from '../ui/avatar';
import { ccHtml, flagHidden, myCountry } from './flags';

export interface NameInfo {
  name: string;
  nick: string | null;
  changes: number;
  free: boolean;
  price: number;
  cost: number;
  cooldownDays: number;
  nextAt: number | null;
  yarn: number;
}

interface Me {
  code: string;
  name: string;
  av?: unknown;
  avatar?: { kind: string; hero?: string; icon?: string } | null;
  frame?: string | null;
  title?: string | null;
}

export interface ProfileSheetDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  signedIn(): boolean;
  signIn(): void;
  /** Settings (the country flag switch lives there). */
  openSettings(): void;
  /** Owned store and pass items: the borders and titles offered. */
  ownedItems(): readonly string[];
  /** The public name changed (Home, the HUD and the results follow). */
  onName(name: string): void;
  track?(event: string, props?: Record<string, string | number | boolean>): void;
  /** A name to suggest for the first change (the account's profile name), or null. */
  suggest?(): string | null;
  now?(): number;
}

const NAME_MIN = 2;
const NAME_MAX = 16;
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ0-9' -]+$/;

/** The quick client check (the server's shared/name.ts check is the real one): an error line or null. Pure. */
export function nameProblem(raw: string): string | null {
  const v = raw.trim().replace(/\s+/g, ' ');
  if (v.length < NAME_MIN) return `Use at least ${NAME_MIN} characters.`;
  if (v.length > NAME_MAX) return `Use at most ${NAME_MAX} characters.`;
  if (!NAME_RE.test(v)) return 'Use letters, numbers, spaces, apostrophes or hyphens.';
  return null;
}

const yarnText = (n: number): string => `${Math.max(0, Math.floor(n)).toLocaleString('en-US')} Yarn`;

/** Days until `at` (at least 1 while it is in the future). Pure. */
export const daysLeft = (at: number, now: number): number => Math.max(1, Math.ceil((at - now) / 86_400_000));

/** What the next change costs, as one line. Pure. */
export function priceLine(i: NameInfo, now: number): string {
  if (i.free) return i.changes === 0 ? 'First change free' : 'Your next change is free';
  if (i.nextAt && i.nextAt > now) {
    const d = daysLeft(i.nextAt, now);
    return `Next change in ${d} ${d === 1 ? 'day' : 'days'}`;
  }
  return `Change: ${yarnText(i.price)} · you have ${yarnText(i.yarn)}`;
}

/** The player-facing line for a refused change. Pure. */
export function nameErrorText(r: ApiResult, info: NameInfo | null, now: number): string {
  const b = (r.body ?? {}) as { code?: string; message?: string; nextAt?: number };
  if (r.status === 0) return 'No connection. Try again';
  switch (b.code) {
    case 'PAWLEGENDS_NAME_TAKEN':
      return 'That name is taken. Try another one.';
    case 'PAWLEGENDS_NAME_INVALID':
      return typeof b.message === 'string' && b.message.length < 80 ? b.message : 'That name is not allowed.';
    case 'PAWLEGENDS_NAME_SAME':
      return 'That is already your name.';
    case 'PAWLEGENDS_NAME_YARN':
      return info ? `Not enough Yarn: you need ${yarnText(info.cost)}, you have ${yarnText(info.yarn)}.` : 'Not enough Yarn.';
    case 'PAWLEGENDS_NAME_COOLDOWN': {
      const d = typeof b.nextAt === 'number' ? daysLeft(b.nextAt, now) : 7;
      return `You can change your name again in ${d} ${d === 1 ? 'day' : 'days'}.`;
    }
    case 'PAWLEGENDS_NEED_ACCOUNT':
      return 'Sign in to choose your name.';
    case 'PAWLEGENDS_NAME_BUSY':
    case 'PAWLEGENDS_NAME_CHANGED':
      return 'Your name just changed. Try again.';
  }
  if (r.status === 429) return 'Too many tries. Wait a minute';
  return 'Something went wrong. Try again';
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export class ProfileSheet {
  readonly root: HTMLElement;
  private info: NameInfo | null = null;
  private me: Me | null = null;
  private draft = '';
  /** The confirm step: the checked name waiting for Confirm. */
  private confirm: string | null = null;
  private busy = false;
  private note = '';
  private noteBad = false;
  private picking: { kind: string; ref: string; frame: string } | null = null;
  private disposed = false;
  private failed = false;

  constructor(
    parent: HTMLElement,
    private readonly deps: ProfileSheetDeps,
  ) {
    this.root = parent.ownerDocument.createElement('aside');
    this.root.className = 'pl-social pl-profile';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Profile');
    this.root.dataset.testid = 'profile-sheet';
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name === 'nick') {
        this.draft = t.value;
        const err = this.draft.trim() ? nameProblem(this.draft) : null;
        const hint = this.root.querySelector<HTMLElement>('.pl-pf-hint');
        if (hint) hint.textContent = err ?? '';
      }
    });
    this.root.addEventListener('submit', (e) => {
      e.preventDefault();
      this.ask();
    });
    this.root.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') this.dispose();
    });
    parent.appendChild(this.root);
    this.deps.track?.('profile_open');
    this.render();
    void this.load();
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private async load(): Promise<void> {
    if (!this.deps.signedIn()) return this.render();
    const [n, s] = await Promise.all([this.deps.api('name.get'), this.deps.api('social.get')]);
    if (this.disposed) return;
    if (n.ok && n.body) {
      this.info = n.body as NameInfo;
      if (!this.draft) this.draft = this.info.nick ?? (this.info.changes === 0 ? (this.deps.suggest?.() ?? '') : '');
      this.deps.onName(this.info.name);
    } else this.failed = true;
    if (s.ok && s.body) this.me = (s.body as { me?: Me }).me ?? null;
    this.render();
  }

  private say(text: string, bad = false): void {
    this.note = text;
    this.noteBad = bad;
  }

  render(): void {
    if (this.disposed) return;
    const focusNick = this.root.ownerDocument.activeElement?.getAttribute('name') === 'nick';
    this.root.innerHTML = `<header class="pl-social-head pl-pf-head"><b class="pl-pf-h">Profile</b><button type="button" class="pl-social-x" data-a="close" aria-label="Close">&times;</button></header><div class="pl-social-body pl-pf-body">${this.body()}</div>${this.note ? `<p class="pl-social-note${this.noteBad ? ' bad' : ''}" role="status" data-testid="profile-note">${esc(this.note)}</p>` : ''}`;
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-name]')) el.textContent = el.dataset.name ?? '';
    const input = this.root.querySelector<HTMLInputElement>('input[name="nick"]');
    if (input) {
      input.value = this.draft;
      if (focusNick) input.focus();
    }
  }

  private body(): string {
    if (!this.deps.signedIn())
      return `<div class="pl-social-empty" data-testid="profile-guest"><p>Sign in to choose your name, avatar and title. Guests play with a generated name.</p><button type="button" class="pl-btn small" data-a="signin">Sign in</button></div>`;
    if (this.failed && !this.info) return `<div class="pl-social-empty"><p>Couldn't load your profile.</p><button type="button" class="pl-btn small" data-a="retry">Try again</button></div>`;
    if (!this.info) return `<p class="pl-social-empty">Loading…</p>`;
    if (this.picking) return this.pickerBody();
    const i = this.info;
    const me = this.me;
    const title = me?.title ? `<small class="pl-pf-title">${esc(titleText(me.title))}</small>` : '';
    const top = `<div class="pl-pf-top"><button type="button" class="pl-me-av" data-a="avatar" aria-label="Change avatar and border" data-testid="profile-avatar"${me ? '' : ' disabled'}>${avatarHtml(me?.av, 56)}</button><span class="pl-pf-who"><b class="pl-pf-name" data-name="${esc(i.name)}" data-testid="profile-name"></b>${title}${me?.code ? `<small class="pl-social-st">${esc(me.code)}</small>` : ''}</span></div>`;
    return `${top}${this.nameBody(i)}${this.titleRow()}${this.flagRow()}`;
  }

  private nameBody(i: NameInfo): string {
    const now = this.now();
    if (this.confirm) {
      const cost = i.free ? 'Free' : yarnText(i.price);
      return `<div class="pl-pf-box" data-testid="profile-confirm"><p>Change your name to</p><b class="pl-pf-preview" data-name="${esc(this.confirm)}"></b><small class="pl-social-st">${i.free ? 'This change is free. Later changes cost ' + esc(yarnText(i.cost)) + '.' : 'Others see your new name everywhere.'}</small><div class="pl-pf-act"><button type="button" class="pl-btn ghost small" data-a="back">Back</button><button type="button" class="pl-btn small" data-a="confirm" data-testid="profile-confirm-btn"${this.busy ? ' disabled' : ''}>Confirm · ${esc(cost)}</button></div></div>`;
    }
    const wait = !i.free && !!i.nextAt && i.nextAt > now;
    const short = !i.free && !wait && i.yarn < i.price;
    const line = priceLine(i, now);
    return `<form class="pl-pf-box pl-pf-nick" data-testid="profile-nick"><label for="pl-pf-nick">Name others see</label><div class="pl-pf-row"><input id="pl-pf-nick" name="nick" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Your name" data-testid="profile-nick-input"${wait ? ' disabled' : ''}><button type="submit" class="pl-btn small" data-testid="profile-nick-change"${wait || this.busy ? ' disabled' : ''}>Change</button></div><small class="pl-pf-price${i.free ? ' free' : ''}${short ? ' short' : ''}" data-testid="profile-price">${esc(line)}</small><small class="pl-pf-hint" aria-live="polite"></small></form>`;
  }

  private ownedTitles(): string[] {
    return this.deps.ownedItems().filter((x) => /^title\.[a-z0-9._-]{1,48}$/.test(x));
  }

  private titleRow(): string {
    const titles = this.ownedTitles().slice(0, 6);
    if (!titles.length || !this.me) return '';
    const cur = this.me.title ?? 'none';
    const chip = (id: string, label: string) => `<button type="button" class="pl-pf-chip" data-a="title" data-title="${esc(id)}" aria-pressed="${cur === id}">${esc(label)}</button>`;
    return `<div class="pl-pf-line"><span>Title</span><div class="pl-pf-chips">${chip('none', 'None')}${titles.map((t) => chip(t, titleText(t))).join('')}</div></div>`;
  }

  private flagRow(): string {
    const cc = myCountry();
    const state = flagHidden() ? 'Hidden' : cc ? 'Shown' : 'Not known yet';
    return `<div class="pl-pf-line"><span>Country flag</span><span class="pl-pf-flag">${flagHidden() ? '' : ccHtml(cc)}${state}</span><button type="button" class="pl-btn ghost small" data-a="settings">Settings</button></div>`;
  }

  private pickerBody(): string {
    const p = this.picking!;
    const tiles = HERO_IDS.map((h) => `<button type="button" class="pl-av-tile" data-a="pick-icon" data-ref="${h}" aria-pressed="${p.kind === 'hero' && p.ref === h}" aria-label="${esc(h)}">${avatarHtml({ i: `h:${h}` }, 40)}</button>`).join('');
    const frames = ['none', ...this.deps.ownedItems().filter((i) => /^frame\.(store|s1)\.[a-z0-9._-]+$|^frame\.(legend|founder)$/.test(i))].slice(0, 7);
    const hero = p.kind === 'hero' ? p.ref || 'clem' : 'clem';
    const ring = frames.map((f) => `<button type="button" class="pl-av-tile" data-a="pick-frame" data-frame="${esc(f)}" aria-pressed="${p.frame === f}" aria-label="${f === 'none' ? 'No border' : esc(f)}">${avatarHtml({ i: `h:${hero}`, ...(f !== 'none' ? { f } : {}) }, 32)}</button>`).join('');
    const view = p.kind === 'hero' ? { i: `h:${hero}`, ...(p.frame !== 'none' ? { f: p.frame } : {}) } : this.me?.av;
    return `<div class="pl-av-pick" data-testid="profile-picker"><div class="pl-av-preview">${avatarHtml(view, 56)}</div><div class="pl-av-grid">${tiles}</div><div class="pl-av-frames" aria-label="Border">${ring}</div><div class="pl-pf-act"><button type="button" class="pl-btn ghost small" data-a="pick-cancel">Cancel</button><button type="button" class="pl-btn small" data-a="pick-save">Save</button></div></div>`;
  }

  /** Change → the confirm step (after the quick check). */
  private ask(): void {
    const i = this.info;
    if (!i || this.busy) return;
    const v = this.draft.trim().replace(/\s+/g, ' ');
    const err = nameProblem(v);
    if (err) {
      this.say(err, true);
      return this.render();
    }
    if (i.nick === v) {
      this.say('That is already your name.', true);
      return this.render();
    }
    if (!i.free && i.yarn < i.price) {
      this.say(`Not enough Yarn: you need ${yarnText(i.price)}, you have ${yarnText(i.yarn)}. Play matches to earn more.`, true);
      return this.render();
    }
    this.confirm = v;
    this.say('');
    this.render();
  }

  private async change(): Promise<void> {
    const name = this.confirm;
    if (!name || this.busy) return;
    this.busy = true;
    this.render();
    const r = await this.deps.api('name.set', { name });
    this.busy = false;
    if (this.disposed) return;
    if (r.ok && r.body) {
      const paid = Number((r.body as { paid?: number }).paid) || 0;
      this.info = r.body as NameInfo;
      this.draft = this.info.nick ?? name;
      this.confirm = null;
      this.say(`You are ${this.info.name} now.`);
      this.deps.onName(this.info.name);
      this.deps.track?.('name_change', { paid: paid > 0, changes: this.info.changes });
    } else {
      this.confirm = null;
      this.say(nameErrorText(r, this.info, this.now()), true);
      // the price, cooldown or Yarn may have moved: read them again
      const n = await this.deps.api('name.get');
      if (n.ok && n.body && !this.disposed) this.info = n.body as NameInfo;
    }
    this.render();
  }

  private async saveMe(args: ApiArgs, ok: string): Promise<void> {
    const r = await this.deps.api('social.me', args);
    if (this.disposed) return;
    if (r.ok) {
      const me = (r.body as { me?: Me } | undefined)?.me;
      if (me) this.me = me;
      this.picking = null;
      this.say(ok);
    } else this.say("Couldn't save that. Try again", true);
    this.render();
  }

  private onClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    const a = el?.dataset.a;
    if (!a || !el || el.hasAttribute('disabled')) return;
    switch (a) {
      case 'close':
        return this.dispose();
      case 'signin':
        this.dispose();
        return this.deps.signIn();
      case 'retry':
        this.failed = false;
        this.render();
        return void this.load();
      case 'settings':
        this.dispose();
        return this.deps.openSettings();
      case 'back':
        this.confirm = null;
        return this.render();
      case 'confirm':
        return void this.change();
      case 'avatar': {
        const av = this.me?.avatar;
        const cur = (this.me?.av as { i?: string } | undefined)?.i ?? '';
        this.picking = { kind: 'hero', ref: av?.kind === 'hero' && av.hero ? av.hero : cur.startsWith('h:') ? cur.slice(2) : 'clem', frame: this.me?.frame ?? 'none' };
        return this.render();
      }
      case 'pick-icon':
        if (this.picking) this.picking = { ...this.picking, kind: 'hero', ref: el.dataset.ref ?? 'clem' };
        return this.render();
      case 'pick-frame':
        if (this.picking) this.picking.frame = el.dataset.frame ?? 'none';
        return this.render();
      case 'pick-cancel':
        this.picking = null;
        return this.render();
      case 'pick-save':
        if (this.picking) void this.saveMe({ avatarKind: 'hero', avatarRef: this.picking.ref, frame: this.picking.frame }, 'Avatar saved');
        return;
      case 'title':
        return void this.saveMe({ title: el.dataset.title ?? 'none' }, 'Title saved');
    }
  }

  get closed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.remove();
  }
}
