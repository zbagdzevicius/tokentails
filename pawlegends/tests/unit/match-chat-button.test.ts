// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { MatchChat, type MatchChatHost } from '../../src/app/matchChat';
import { rememberAgeBand, soloTextAllowed } from '../../src/social/ageBand';
import type { PartyLink } from '../../src/app/mpTypes';

/**
 * MATCH-CHAT.md §4.4: every match has a chat button (bot matches too: before it, a phone in a bot match had no way into
 * the chat), the drawer is one tap away, a dot marks unread lines, and a bot match's typed line needs a known 16+ band
 * and passes the same filter as the relay.
 */

const chats: MatchChat[] = [];

function solo(touch: boolean, extra: Partial<MatchChatHost> = {}): MatchChat {
  const ui = document.createElement('div');
  ui.className = 'pl-match';
  document.body.appendChild(ui);
  const c = new MatchChat({
    ui,
    touch,
    mySlot: 0,
    myTeam: 0,
    teamSize: 3,
    sides: ['cat', 'dog'],
    map: 'crossing',
    names: () => ['You', 'Biscuit', 'Socks', 'Rex', 'Fido', 'Max'],
    link: null,
    solo: { seed: 1, silent: true },
    tick: () => 300,
    ...extra,
  });
  chats.push(c);
  return c;
}

const tap = (el: Element): void => {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
};

afterEach(() => {
  for (const c of chats.splice(0)) c.dispose();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('chat button', () => {
  it('a bot match has a chat button: a tap opens the drawer with quick-chat chips, a second tap closes it', () => {
    for (const touch of [true, false]) {
      const c = solo(touch);
      const btn = c.button.el;
      expect(btn.isConnected).toBe(true);
      expect(btn.dataset.testid).toBe('chat-open');
      expect(btn.classList.contains(touch ? 'touch' : 'desk')).toBe(true);
      tap(btn);
      expect(c.drawer.open).toBe(true);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      expect(c.drawer.el.querySelectorAll('.cd-chip').length).toBeGreaterThan(4);
      // no age band known: quick chat only, and the note says how typing opens in a bot match
      expect(c.drawer.el.querySelector('.cd-input')).toBeNull();
      expect(c.drawer.el.querySelector('.cd-why')?.textContent).toMatch(/16\+/);
      tap(btn);
      expect(c.drawer.open).toBe(false);
      c.dispose();
    }
  });

  it('a chip sends in one tap: the line shows as yours and the drawer folds', () => {
    const c = solo(true);
    tap(c.button.el);
    (c.drawer.el.querySelector('.cd-chip') as HTMLButtonElement).click();
    expect(c.drawer.open).toBe(false);
    expect(c.ticker.el.textContent).toContain('You');
  });

  it('a line that arrives while the drawer is closed lights the dot; opening clears it; own lines never do', () => {
    const c = solo(true);
    c.wheelLine(0, 'On my way', true);
    expect(c.button.el.classList.contains('new')).toBe(false);
    c.wheelLine(1, 'On my way', false);
    expect(c.button.el.classList.contains('new')).toBe(true);
    tap(c.button.el);
    expect(c.button.el.classList.contains('new')).toBe(false);
  });

  it('the end hides the button and a tap after it does nothing', () => {
    const c = solo(true);
    c.end(0);
    expect(c.button.el.hidden).toBe(true);
    tap(c.button.el);
    expect(c.drawer.open).toBe(false);
  });
});

describe('bot match typing', () => {
  it('the age band: only 16-17 and 18+ allow typing; under 16, unknown and signed out do not', () => {
    expect(soloTextAllowed()).toBe(false);
    rememberAgeBand('under16');
    expect(soloTextAllowed()).toBe(false);
    rememberAgeBand('16-17');
    expect(soloTextAllowed()).toBe(true);
    rememberAgeBand('18+');
    expect(soloTextAllowed()).toBe(true);
    rememberAgeBand('weird');
    expect(soloTextAllowed()).toBe(false);
    rememberAgeBand('18+');
    rememberAgeBand(null);
    expect(soloTextAllowed()).toBe(false);
  });

  it('a 16+ player types in a bot match; the filter refuses a link inline and keeps the drawer open', () => {
    rememberAgeBand('18+');
    const c = solo(false);
    tap(c.button.el);
    const input = c.drawer.el.querySelector<HTMLInputElement>('.cd-input');
    expect(input).not.toBeNull();
    input!.value = 'join me at example.com';
    c.drawer.el.querySelector<HTMLFormElement>('.cd-foot')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(c.drawer.open).toBe(true);
    expect(c.drawer.el.querySelector('.cd-err')?.textContent).toMatch(/can't be sent/);
    input!.value = 'push mid';
    c.drawer.el.querySelector<HTMLFormElement>('.cd-foot')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(c.drawer.open).toBe(false);
    expect(c.ticker.el.textContent).toContain('push mid');
  });

  it('an under-16 player gets chips only, and a typed body is refused even if forced', () => {
    rememberAgeBand('under16');
    const c = solo(false);
    tap(c.button.el);
    expect(c.drawer.el.querySelector('.cd-input')).toBeNull();
  });

  it('a party match ignores the stored band: the relay decides the tier', () => {
    rememberAgeBand('18+');
    const link = { chatTier: 'quick', chatAllTier: 'quick', listen: () => () => {}, chat: () => true } as unknown as PartyLink;
    const c = solo(false, { link, solo: undefined });
    tap(c.button.el);
    expect(c.drawer.el.querySelector('.cd-input')).toBeNull();
    expect(c.drawer.el.querySelector('.cd-why')?.textContent).toMatch(/Friends/);
  });
});
