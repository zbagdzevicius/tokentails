// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAT_TTL, ChatTicker, lineTtl, tickerRows, type ChatLineView } from '../../src/ui/chatTicker';
import { ChatDrawer } from '../../src/ui/chatDrawer';
import { typingTarget } from '../../src/input/desktop';
import { QuickChat, WHEEL_ALL } from '../../src/party/ui/quickChat';

/** In-match chat UI (docs/plans/moba/MATCH-CHAT.md §4): fades, the drawer's tier swap, the keys and the wheel. */

const line = (o: Partial<ChatLineView> = {}): ChatLineView => ({ slot: 1, name: 'Mira', color: '#4da0ff', text: 'nice', ch: 'team', kind: 'text', mine: false, ...o });

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('chat ticker', () => {
  it('text 8 s, phrases 5 s, own lines 4 s, then a 600 ms fade; one new row per 400 ms; nothing painted when empty', () => {
    expect(lineTtl({ kind: 'text', mine: false })).toBe(8000);
    expect(lineTtl({ kind: 'phrase', mine: false })).toBe(5000);
    expect(lineTtl({ kind: 'text', mine: true })).toBe(4000);
    expect(tickerRows(true, 375)).toBe(1);
    expect(tickerRows(true, 414)).toBe(2);
    expect(tickerRows(false, 900)).toBe(6);
    let now = 0;
    const t = new ChatTicker(document.body, { touch: true, now: () => now, height: () => 420 });
    t.tick(0);
    expect(t.el.classList.contains('empty')).toBe(true);
    t.push(line({ text: 'a' }));
    t.push(line({ text: 'b', kind: 'phrase' }));
    expect(t.shown).toBe(1);
    now = 399;
    t.tick(now);
    expect(t.shown).toBe(1);
    now = 400;
    t.tick(now);
    expect(t.shown).toBe(2);
    expect(t.el.classList.contains('empty')).toBe(false);
    // the phrase (shown at 400) fades at 5,400 and is gone at 6,000
    now = 5400;
    t.tick(now);
    expect(t.el.querySelectorAll('.cl-row.out')).toHaveLength(1);
    now = 6000;
    t.tick(now);
    expect(t.shown).toBe(1);
    now = 8000 + CHAT_TTL.fade;
    t.tick(now);
    expect(t.shown).toBe(0);
    expect(t.el.classList.contains('empty')).toBe(true);
    // two rows at most on a tall phone, one under 400 px
    const short = new ChatTicker(document.body, { touch: true, now: () => now, height: () => 375 });
    short.push(line());
    now += 500;
    short.push(line({ text: 'second' }));
    expect(short.shown).toBe(1);
    expect(short.el.textContent).toContain('second');
  });

  it('all chat rows carry [All]; text is set as text (no markup)', () => {
    const t = new ChatTicker(document.body, { touch: false, now: () => 0 });
    t.push(line({ ch: 'all', text: '<b>x</b>' }));
    expect(t.el.querySelector('.cl-row i')?.textContent).toBe('[All]');
    expect(t.el.querySelector('.cl-row span')?.textContent).toBe('<b>x</b>');
    expect(t.el.querySelector('.cl-row span b')).toBeNull();
  });
});

describe('chat drawer', () => {
  const make = (send = vi.fn(() => null as string | null)) => ({ d: new ChatDrawer(document.body, { touch: true, side: 'dog', send }), send });

  it('a text-tier team gets the input on Team; quick tiers and All get phrase chips only', () => {
    const { d } = make();
    d.openOn('team');
    expect(d.el.querySelector('.cd-input')).toBeNull();
    expect(d.el.querySelectorAll('.cd-chip').length).toBeGreaterThan(8);
    d.tier = 'text';
    expect(d.el.querySelector('.cd-input')).not.toBeNull();
    d.openOn('all');
    expect(d.el.querySelector('.cd-input')).toBeNull();
    // all chat: only all-scope phrases (no Thanks!, no On my way)
    const texts = [...d.el.querySelectorAll('.cd-chip')].map((b) => b.textContent);
    expect(texts).toContain('gl hf');
    expect(texts).not.toContain('Thanks!');
    // the side face: a dog sees 🐶
    expect(texts).toContain('🐶');
    // no Cannon! on a map without one
    d.openOn('team');
    expect([...d.el.querySelectorAll('.cd-chip')].map((b) => b.textContent)).not.toContain('Cannon!');
  });

  it('a send folds the drawer; a refusal shows inline and keeps it open; Esc cancels; Up recalls', () => {
    const send = vi.fn((_ch: string, body: { k: string; text?: string }) => (body.k === 't' && body.text === 'bad' ? 'Slow down a little' : null));
    const d = new ChatDrawer(document.body, { touch: false, side: 'cat', send });
    d.tier = 'text';
    d.openOn('team', true);
    const input = d.el.querySelector<HTMLInputElement>('.cd-input')!;
    expect(d.isTyping()).toBe(true);
    input.value = 'bad';
    d.el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(d.open).toBe(true);
    expect(d.el.querySelector('.cd-err')!.textContent).toBe('Slow down a little');
    input.value = 'push mid';
    d.el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(send).toHaveBeenLastCalledWith('team', { k: 't', text: 'push mid' });
    expect(d.open).toBe(false);
    d.openOn('team', true);
    const again = d.el.querySelector<HTMLInputElement>('.cd-input')!;
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(again.value).toBe('push mid');
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(d.open).toBe(false);
    // a phrase chip sends its id
    d.openOn('all');
    (d.el.querySelector('.cd-chip[data-id="24"]') as HTMLButtonElement).click();
    expect(send).toHaveBeenLastCalledWith('all', { k: 'q', id: 24 });
  });

  it('a long-press on someone else line offers Mute (and Report when the host can)', () => {
    vi.useFakeTimers();
    const mute = vi.fn();
    const d = new ChatDrawer(document.body, { touch: true, side: 'cat', send: () => null, mute, report: async () => true });
    d.add({ mid: 'a'.repeat(24), slot: 4, name: 'Rex', color: '#f00', text: 'gg', ch: 'all', kind: 'phrase', mine: false });
    d.add({ slot: 0, name: 'Me', color: '#ff0', text: 'hi', ch: 'team', kind: 'text', mine: true });
    d.openOn('team');
    const li = d.el.querySelector('li[data-i="0"] span')!;
    li.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(600);
    expect(d.el.querySelector('[data-a="mute"]')).not.toBeNull();
    expect(d.el.querySelector('[data-a="report"]')).not.toBeNull();
    (d.el.querySelector('[data-a="mute"]') as HTMLButtonElement).click();
    expect(mute).toHaveBeenCalledWith(4);
    // own lines have no menu
    d.el.querySelector('li[data-i="1"] span')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(600);
    expect(d.el.querySelector('[data-a="mute"]')).toBeNull();
  });
});

describe('keys and the wheel', () => {
  it('isTyping: a key typed into the composer is never a game key', () => {
    const input = document.createElement('input');
    expect(typingTarget(input)).toBe(true);
    expect(typingTarget(document.createElement('textarea'))).toBe(true);
    expect(typingTarget(document.body)).toBe(false);
    expect(typingTarget(null)).toBe(false);
  });

  it('the wheel: the centre opens the drawer, All sends the next pick to all chat and disables lines without an all phrase', () => {
    const q = new QuickChat(document.body, { enabled: () => true });
    const picks: unknown[] = [];
    let typed = 0;
    q.onPick = (p) => picks.push(p);
    q.onType = () => typed++;
    q.centreLabel = 'Type';
    q.openAt(300, 300);
    const centre = q.wheel.querySelector<HTMLButtonElement>('[data-testid="quick-chat-type"]')!;
    expect(centre.hidden).toBe(false);
    expect(centre.textContent).toBe('Type');
    centre.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(typed).toBe(1);
    expect(q.open).toBe(false);
    q.openAt(300, 300);
    q.wheel.querySelector('[data-testid="quick-chat-all"]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const lines = [...q.wheel.querySelectorAll<HTMLButtonElement>('.cw.line')];
    expect(lines.filter((b) => !b.disabled).map((b) => Number(b.dataset.id)).sort()).toEqual(Object.keys(WHEEL_ALL).map(Number).sort());
    lines.find((b) => b.dataset.id === '7')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(picks.at(-1)).toEqual({ kind: 'chat', id: 7, all: true });
    // the All chip is one pick only
    q.openAt(300, 300);
    expect([...q.wheel.querySelectorAll<HTMLButtonElement>('.cw.line')].every((b) => !b.disabled)).toBe(true);
    q.dispose();
  });
});
