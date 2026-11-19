// @vitest-environment happy-dom
/**
 * What's New's comic page (ui/showcase/showcaseModal.ts): one page per item, Next / Got it, dots, arrows and swipe;
 * Esc, the X and a tap outside close it; the button closes it and hands the item to the caller; texts are escaped;
 * each page shown is reported once; the reduced-motion class.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openShowcase, pageHtml } from '../../src/ui/showcase/showcaseModal';
import type { ShowcaseItem } from '../../src/meta/showcase';
import { countdownText } from '../../src/ui/modeSelect/modes';

const NOW = Date.parse('2026-11-19T12:00:00Z');
const DAY = 86_400_000;
const item = (o: Partial<ShowcaseItem>): ShowcaseItem => ({
  id: 'x',
  type: 'generic',
  title: 'X',
  blurb: 'Short.',
  art: 'https://a/x.webp',
  startsAt: NOW - DAY,
  endsAt: NOW + 3 * DAY + 4 * 3_600_000,
  priority: 10,
  cta: { label: 'Go', target: { screen: 'pass' } },
  ...o,
});
const ITEMS = [
  item({ id: 'drop-2026-11', type: 'store-drop', title: 'November Drop', burst: 'NEW!', things: [{ id: 'a', label: 'Chairman', kind: 'coat' }], cta: { label: 'See the coats', target: { screen: 'store', tab: 'coats' } } }),
  item({ id: 'pass-s1', type: 'pass-season', title: 'Legends Pass' }),
  item({ id: 'nap', type: 'event', title: 'Winter Nap', cta: { label: 'Got it', target: { screen: 'none' } } }),
];
const open = (o: Partial<Parameters<typeof openShowcase>[1]> = {}) => {
  const onPage = vi.fn();
  const onCta = vi.fn();
  const onClose = vi.fn();
  const h = openShowcase(document.body, { items: ITEMS, now: () => NOW, countdown: countdownText, reduced: true, onPage, onCta, onClose, ...o });
  return { h, onPage, onCta, onClose, el: h.el };
};
const q = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;
const key = (k: string): void => void document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('What\'s New modal', () => {
  it('a dialog with the first page, the issue tab, a live clock; Next walks the pages and the last reads Got it', () => {
    const { onPage, onClose } = open();
    const dlg = q('.sc-book');
    expect(dlg.getAttribute('role')).toBe('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(q('.sc-dot[aria-selected="true"]').textContent).toBe('1');
    expect(q('.sc-page').dataset.type).toBe('store-drop');
    expect(q('.sc-title').textContent).toBe('November Drop');
    expect(q('.sc-burst').textContent).toBe('NEW!');
    expect(q('[data-testid="showcase-time"]').textContent).toBe('Ends in 3d 4h');
    expect(document.querySelectorAll('.sc-thing')).toHaveLength(1);
    expect(onPage).toHaveBeenCalledTimes(1);
    expect(onPage.mock.calls[0]![0].id).toBe('drop-2026-11');
    q('[data-testid="showcase-next"]').click();
    expect(q('.sc-dot[aria-selected="true"]').textContent).toBe('2');
    expect(q('.sc-page').dataset.type).toBe('pass-season');
    q('[data-testid="showcase-next"]').click();
    // an info-only page: no button, Next alone reads Got it
    expect(document.querySelector('[data-testid="showcase-cta"]')).toBeNull();
    expect(q('[data-testid="showcase-next"]').textContent).toBe('Got it');
    expect(onPage).toHaveBeenCalledTimes(3);
    q('[data-testid="showcase-next"]').click();
    expect(onClose).toHaveBeenCalledWith('done', 2);
    expect(document.querySelector('[data-testid="showcase"]')).toBeNull();
  });

  it('the button closes the page and hands the item over', () => {
    const { onCta, onClose } = open();
    q('[data-testid="showcase-cta"]').click();
    expect(onClose).toHaveBeenCalledWith('cta', 0);
    expect(onCta).toHaveBeenCalledTimes(1);
    expect(onCta.mock.calls[0]![0].cta.target).toEqual({ screen: 'store', tab: 'coats' });
  });

  it('Esc, the X and a tap outside close it; arrows and dots move between pages', () => {
    let r = open();
    key('ArrowRight');
    expect(q('.sc-dot[aria-selected="true"]').textContent).toBe('2');
    key('ArrowLeft');
    expect(q('.sc-dot[aria-selected="true"]').textContent).toBe('1');
    q('.sc-dot[data-i="2"]').click();
    expect(q('.sc-dot[data-i="2"]').getAttribute('aria-selected')).toBe('true');
    key('Escape');
    expect(r.onClose).toHaveBeenCalledWith('esc', 2);
    r = open();
    q('[data-testid="showcase-close"]').click();
    expect(r.onClose).toHaveBeenCalledWith('close', 0);
    r = open();
    r.el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(r.onClose).toHaveBeenCalledWith('outside', 0);
    // a click inside the page does not close it
    r = open();
    q('.sc-bubble').click();
    expect(r.onClose).not.toHaveBeenCalled();
  });

  it('Enter never reaches Home behind it (PLAY), and Tab stays inside', () => {
    open();
    const home = document.createElement('button');
    document.body.prepend(home);
    const seen = vi.fn();
    document.addEventListener('keydown', (e) => !e.defaultPrevented && e.key === 'Enter' && seen());
    home.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(seen).not.toHaveBeenCalled();
  });

  it('one page, no dots; reduced motion class; texts escaped; a failed picture keeps the panel', () => {
    open({ items: [item({ title: '<img src=x onerror=alert(1)>', blurb: '<b>hi</b>', kicker: '"k"' })], reduced: true });
    expect(document.querySelector('.sc-dots')).toBeNull();
    expect(q('.sc-ov').classList.contains('reduced')).toBe(true);
    expect(document.querySelector('.sc-title img')).toBeNull();
    expect(q('.sc-title').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(document.querySelector('.sc-bubble b')).toBeNull();
    q('.sc-art img').dispatchEvent(new Event('error'));
    expect(q('.sc-page').classList.contains('noart')).toBe(true);
  });

  it('each type draws its own effects (a ribbon, paws, speed lines); "Starts in" before the start', () => {
    const at = (t: ShowcaseItem['type']): string => pageHtml(item({ type: t }), 0, 1, NOW, countdownText);
    expect(at('pass-season')).toContain('sc-ribbon');
    expect(at('event')).toContain('sc-confetti');
    expect(at('champion')).toContain('sc-speed');
    expect(pageHtml(item({ type: 'event' }), 0, 1, NOW, countdownText, true)).not.toContain('sc-confetti');
    expect(pageHtml(item({ startsAt: NOW + 2 * DAY }), 0, 1, NOW, countdownText)).toContain('Starts in 2d 0h');
    expect(at('patch')).toContain('sc-curl');
  });

  it('notes: up to 3 numbered caption boxes, "Label: value" split, escaped; none when the page has things', () => {
    const h = pageHtml(item({ type: 'patch', things: [], notes: ['Passive: <Valor>', 'Plain line', 'Three', 'Four'] }), 0, 1, NOW, countdownText);
    document.body.innerHTML = h;
    const notes = Array.from(document.querySelectorAll('.sc-note'));
    expect(notes).toHaveLength(3);
    expect(notes[0]!.querySelector('small')!.textContent).toBe('Passive');
    expect(notes[0]!.querySelector('b')!.textContent).toBe('<Valor>');
    expect(notes[1]!.querySelector('small')).toBeNull();
    expect(notes[2]!.querySelector('i')!.textContent).toBe('3');
    expect(pageHtml(item({ notes: ['x'], things: [{ id: 'a', label: 'A' }] }), 0, 1, NOW, countdownText)).not.toContain('sc-note');
  });
});
