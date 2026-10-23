// @vitest-environment happy-dom
/** PUB-09: the Settings card links the privacy policy, and the host's terms when the game runs inside Token Tails. */
import { describe, expect, it } from 'vitest';
import { PRIVACY_URL, settingsPanel } from '../../src/ui/settings';

const open = (termsUrl?: string | null): HTMLElement => {
  document.body.innerHTML = '';
  return settingsPanel(document.body, { state: { muted: false, tier: 'med', tipsOn: true, stats: null }, onMute() {}, onTier() {}, onTips() {}, onStats() {}, onClose() {}, termsUrl });
};
const links = (root: HTMLElement): string[] => Array.from(root.querySelectorAll('[data-testid="settings-legal"] a')).map((a) => `${a.textContent} ${a.getAttribute('href')}`);

describe('Settings: privacy and terms links', () => {
  it('always shows Privacy; Terms only with the host terms page', () => {
    expect(links(open())).toEqual([`Privacy ${PRIVACY_URL}`]);
    expect(links(open('https://tokentails.com/pawlegends/terms'))).toEqual([`Privacy ${PRIVACY_URL}`, 'Terms https://tokentails.com/pawlegends/terms']);
  });

  it('escapes the terms URL', () => {
    const root = open('https://x.test/t?a="b"&c');
    expect(root.querySelector('[data-testid="settings-legal"] a:last-child')?.getAttribute('href')).toBe('https://x.test/t?a="b"&c');
  });
});
