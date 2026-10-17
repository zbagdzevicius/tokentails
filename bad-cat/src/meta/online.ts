/**
 * Settings → Online (GDD 10 Phase 2): the Token Tails account (sign in / out), "Claim my purchases" by the verified
 * email, streak emails, the daily push reminder with its hour, "Import my cat from /yourcat", the room feed and the
 * creator dashboard. A row shows only when the server reports its feature on; offline builds never mount this.
 */
import type { AccountResponse, OnlineSettingsProps } from '../types';
import { h } from '../ui/dom';
import type { Scope } from './shared';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const hourLabel = (hr: number): string => `${String(hr).padStart(2, '0')}:00`;

export function onlineSection(p: OnlineSettingsProps, s: Scope): HTMLElement {
  const f = p.features;
  const sess = p.session;
  const signedIn = !!sess?.signedIn;
  const rows: (HTMLElement | null)[] = [];

  const action = (icon: string, label: string, onClick: () => void, sub?: string): HTMLElement => {
    const b = h(
      'button',
      { class: 'bmt-action', type: 'button' },
      h('span', { class: 'bmt-action-ico', 'aria-hidden': 'true' }, icon),
      h('span', { class: 'bmt-action-txt' }, h('strong', {}, label), sub ? h('small', { class: 'bc-muted' }, sub) : null),
      h('span', { class: 'bmt-action-go', 'aria-hidden': 'true' }, '›'),
    );
    b.addEventListener('click', onClick);
    return b;
  };

  // ----- account -----
  if (f.accounts) {
    if (signedIn) {
      const stats = h('small', { class: 'bc-muted bmt-sub', 'aria-live': 'polite' }, 'Signed in to Token Tails.');
      rows.push(h('div', { class: 'bmt-online-acct' }, h('strong', {}, '🐾 Signed in'), stats));
      void p.account
        ?.then((a: AccountResponse | null) => {
          if (s.dead || !a) return;
          const r = a.ranked;
          stats.textContent = r.days
            ? `${r.days} ranked ${r.days === 1 ? 'day' : 'days'} saved · best ${r.best.toLocaleString('en-US')}${r.streak > 1 ? ` · ${r.streak}-day streak` : ''}`
            : 'No ranked runs saved yet. Your next one goes on the board.';
        })
        .catch(() => undefined);
      if (sess?.verified) rows.push(action('🎟️', 'Claim my purchases', p.onClaim, 'Club and cat things bought with your account email.'));
      rows.push(action('👋', 'Sign out', p.onSignOut));
    } else {
      rows.push(action('🔑', 'Sign in to rank', p.onSignIn, 'Put your ranked runs on the daily board. Your cat stays on this device.'));
    }
  }

  // ----- streak emails -----
  if (f.streakEmail && signedIn && sess?.verified && p.onStreakEmail) {
    const box = h('input', { type: 'checkbox', 'data-k': 'streakEmail' }) as HTMLInputElement;
    const sub = h('small', { class: 'bc-muted bmt-sub' }, 'One email the evening your streak would end. Nothing else.');
    void p.account?.then((a) => {
      if (!s.dead && a) box.checked = a.streakEmail;
    });
    box.addEventListener('change', () => {
      const want = box.checked;
      box.disabled = true;
      void p.onStreakEmail!(want).then((ok) => {
        box.disabled = false;
        if (!ok) box.checked = !want;
        sub.textContent = ok ? (want ? 'On. One email the evening your streak would end.' : 'Off.') : 'Could not save. Try again.';
      });
    });
    rows.push(h('label', { class: 'bc-toggle bmt-toggle' }, box, h('span', { class: 'bmt-toggle-txt' }, h('span', {}, 'Streak emails'), sub)));
  }

  // ----- push reminder -----
  if (f.push && p.push) {
    const box = h('input', { type: 'checkbox', 'data-k': 'push' }) as HTMLInputElement;
    const sel = h('select', { class: 'bmt-hour', 'aria-label': 'Reminder hour' }, ...HOURS.map((hr) => h('option', { value: String(hr) }, hourLabel(hr)))) as HTMLSelectElement;
    sel.value = String(p.push.hour);
    const sub = h('small', { class: 'bc-muted bmt-sub' }, "A nudge when today's room opens.");
    box.disabled = true;
    void p.push.state.then((st) => {
      if (s.dead) return;
      box.checked = st === 'on';
      box.disabled = st === 'unsupported' || st === 'denied';
      if (st === 'unsupported') sub.textContent = 'Add the game to your home screen first (iPhone), or use Chrome or Firefox.';
      if (st === 'denied') sub.textContent = 'Notifications are blocked for this site in your browser settings.';
    });
    const apply = (on: boolean): void => {
      box.disabled = true;
      void p.push!.onToggle(on, Number(sel.value)).then((ok) => {
        box.disabled = false;
        if (!ok) box.checked = !on;
        sub.textContent = ok ? (on ? `On, at ${hourLabel(Number(sel.value))} your time.` : 'Off.') : 'Could not change the reminder.';
      });
    };
    box.addEventListener('change', () => apply(box.checked));
    sel.addEventListener('change', () => {
      if (box.checked) apply(true);
    });
    rows.push(h('label', { class: 'bc-toggle bmt-toggle' }, box, h('span', { class: 'bmt-toggle-txt' }, h('span', {}, 'Daily reminder'), sub)), h('div', { class: 'bmt-hour-row' }, h('span', { class: 'bc-muted' }, 'At'), sel));
  }

  if (f.yourcat && signedIn && p.onYourcat) rows.push(action('🖼️', 'Import my cat from /yourcat', p.onYourcat, 'Your /yourcat cat’s coat on your game cat.'));
  if (f.feed && p.onFeed) rows.push(action('🧱', 'Room feed', p.onFeed, 'Rooms built by other players.'));
  if (f.creatorDashboard && signedIn && p.onCreator) rows.push(action('📈', 'Creator dashboard', p.onCreator, 'Purchases from your creator code.'));

  return h('section', { class: 'bc-card bmt-set bmt-set-online', 'aria-label': 'Online' }, h('div', { class: 'bc-kicker' }, 'Online'), ...rows, rows.length ? null : h('small', { class: 'bc-muted' }, 'Nothing online here yet.'));
}
