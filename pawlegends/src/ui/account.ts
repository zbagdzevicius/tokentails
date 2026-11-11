/**
 * The account chip (sign-in): one round button in the title's top-right corner, and an Account row in Settings.
 *
 * - Signed out: "Sign in" (`account{action:'sign-in'}`): the host opens its own sign-in (the Token Tails sheet on the
 *   web, the native sheet in the app). Playing never needs it.
 * - Signed in: the profile name and the sign-in method's icon; a tap opens a small panel with Sign out and, on the
 *   web, Manage account (the host's account sheet) or, in the app, Delete account (App Store 5.1.1(v); the host
 *   asks for the last confirmation itself).
 *
 * Shown only when a host answered (the Token Tails page or the app's in-page host): the plain standalone web game
 * has no accounts. The game never sees an email address or a token: only `signedIn`, the name and the method.
 */
import type { AccountAction, SignInProvider } from '../embed/bridge';
import './account.css';

export interface AccountModel {
  signedIn: boolean;
  name: string | null;
  provider: SignInProvider | null;
  /** The native app: Delete account instead of Manage account. */
  isApp: boolean;
}

export type AccountSend = (action: AccountAction) => void;

/** "Apple", "Google", "email": the method's name in a sentence. */
export const PROVIDER_LABEL: Readonly<Record<SignInProvider, string>> = Object.freeze({ google: 'Google', apple: 'Apple', email: 'email' });

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const USER = '<svg viewBox="0 0 24 24" aria-hidden="true" class="lb-ico"><circle cx="12" cy="8.5" r="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M4.5 20c.9-3.8 3.9-6 7.5-6s6.6 2.2 7.5 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const PROVIDER_ICON: Readonly<Record<SignInProvider, string>> = Object.freeze({
  apple:
    '<svg viewBox="0 0 24 24" aria-hidden="true" class="lb-ico pl-acct-ico"><path fill="currentColor" d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM14 5.1c.7-.9 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"/></svg>',
  google:
    '<svg viewBox="0 0 24 24" aria-hidden="true" class="lb-ico pl-acct-ico"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3zM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22zM6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9zM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.8 9.4 6 12 6z"/></svg>',
  email:
    '<svg viewBox="0 0 24 24" aria-hidden="true" class="lb-ico pl-acct-ico"><rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 7.5l8 6 8-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
});

/** The chip's short label: the name cut to 10 characters, "Account" without one, "Sign in" when signed out. */
export function chipLabel(m: Pick<AccountModel, 'signedIn' | 'name'>): string {
  if (!m.signedIn) return 'Sign in';
  if (!m.name) return 'Account';
  const chars = Array.from(m.name);
  return chars.length > 10 ? `${chars.slice(0, 9).join('')}…` : m.name;
}

/** "Signed in with Apple", or "Signed in" when the method is unknown. */
export function signedInLine(provider: SignInProvider | null): string {
  return provider ? `Signed in with ${PROVIDER_LABEL[provider]}` : 'Signed in';
}

/** The chip's markup. `lobby`: the round corner style of the lobby (`lb-icon`), else the classic title's small button. */
export function accountChipHtml(m: AccountModel, lobby: boolean): string {
  const icon = m.signedIn && m.provider ? PROVIDER_ICON[m.provider] : USER;
  const label = chipLabel(m);
  const aria = m.signedIn ? `${signedInLine(m.provider)}${m.name ? ` as ${m.name}` : ''}. Account` : 'Sign in to save your progress';
  const cls = lobby ? 'lb-icon wide pl-acct-chip' : 'pl-btn ghost small pl-acct-chip';
  return `<button type="button" class="${cls}" data-acct="chip" data-signed-in="${m.signedIn ? '1' : '0'}" data-testid="account-chip" aria-haspopup="${m.signedIn ? 'dialog' : 'false'}" aria-label="${esc(aria)}" title="${esc(aria)}">${icon}<span>${esc(label)}</span></button>`;
}

/** The signed-in panel's markup (also the Settings row's body). */
export function accountPanelHtml(m: AccountModel): string {
  if (!m.signedIn) {
    return `<p class="pl-acct-line">Play without an account. Sign in to keep your wins, unlocks and Treat Track on every device.</p>
      <div class="pl-acct-actions"><button type="button" class="pl-btn small" data-acct="sign-in" data-testid="account-sign-in">Sign in</button></div>`;
  }
  const who = m.name ? `<b class="pl-acct-name">${esc(m.name)}</b>` : '';
  const manage = m.isApp
    ? `<button type="button" class="pl-btn ghost small pl-acct-danger" data-acct="delete" data-testid="account-delete">Delete account</button>`
    : `<button type="button" class="pl-btn ghost small" data-acct="manage" data-testid="account-manage">Manage account</button>`;
  return `${who}<p class="pl-acct-line" data-testid="account-status">${esc(signedInLine(m.provider))}. Your wins save to your account.</p>
    <div class="pl-acct-actions"><button type="button" class="pl-btn small" data-acct="sign-out" data-testid="account-sign-out">Sign out</button>${manage}</div>`;
}

/** The action a click inside the chip, panel or Settings row asks for, or null. */
export function accountActionOf(target: EventTarget | null): AccountAction | 'chip' | null {
  const a = (target as HTMLElement | null)?.closest?.<HTMLElement>('[data-acct]')?.dataset.acct;
  return a === 'chip' || a === 'sign-in' || a === 'sign-out' || a === 'manage' || a === 'delete' ? a : null;
}

/** The open panel on this page (one at most). */
let openPanel: { el: HTMLElement; close(): void } | null = null;

export function closeAccountPanel(): void {
  openPanel?.close();
}

/** Open the signed-in panel under the chip, inside `scr`. A second tap on the chip closes it. */
export function openAccountPanel(scr: HTMLElement, m: AccountModel, send: AccountSend): HTMLElement {
  closeAccountPanel();
  const el = document.createElement('div');
  el.className = 'pl-acct-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Account');
  el.dataset.testid = 'account-panel';
  el.innerHTML = accountPanelHtml(m);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  const onDown = (e: Event): void => {
    const t = e.target as Node | null;
    if (t && (el.contains(t) || (t as HTMLElement).closest?.('[data-acct="chip"]'))) return;
    close();
  };
  const close = (): void => {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
    el.remove();
    if (openPanel?.el === el) openPanel = null;
  };
  el.addEventListener('click', (e) => {
    const a = accountActionOf(e.target);
    if (!a || a === 'chip') return;
    close();
    send(a);
  });
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onDown, true);
  scr.appendChild(el);
  openPanel = { el, close };
  el.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  return el;
}

/**
 * Put the chip into the screen's top-right corner (`.lb-corner` in the lobby, `.pl-corner` on the classic title),
 * before Settings; null when the screen has no corner. Replaces an older chip, so a redraw never doubles it.
 */
export function mountAccountChip(scr: HTMLElement, m: AccountModel, send: AccountSend): HTMLElement | null {
  const corner = scr.querySelector<HTMLElement>(':scope > .lb-corner, :scope > .pl-corner');
  if (!corner) return null;
  const lobby = corner.classList.contains('lb-corner');
  const wrap = document.createElement('span');
  wrap.innerHTML = accountChipHtml(m, lobby);
  const chip = wrap.firstElementChild as HTMLElement;
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!m.signedIn) {
      closeAccountPanel();
      send('sign-in');
      return;
    }
    if (openPanel && openPanel.el.isConnected && openPanel.el.parentElement === scr) {
      closeAccountPanel();
      return;
    }
    openAccountPanel(scr, m, send);
  });
  corner.querySelector('.pl-acct-chip')?.remove();
  const before = corner.querySelector('[data-a="settings"]') ?? corner.querySelector('[data-a="mute"]');
  if (before) corner.insertBefore(chip, before);
  else corner.appendChild(chip);
  return chip;
}

/** The Settings row (null: no host, no row). */
export function accountRowHtml(m: AccountModel | null): string {
  if (!m) return '';
  return `<div class="set-acct" data-testid="settings-account"><span class="set-acct-h">Account</span>${accountPanelHtml(m)}</div>`;
}
