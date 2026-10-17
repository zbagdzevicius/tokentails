// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { crashMessage, resetCrashForTests, showCrash } from '../../src/app/crash';
import { EMBED_NS, acceptOrigin, allowedOrigins, parseHostMessage, parseOrigins, withSameOrigin } from '../../src/embed/bridge';
import { FpsProbe, QualityGovernor, qualityOverride, tierSettings } from '../../src/render/quality';

describe('embed bridge (pure parts, §11.1)', () => {
  it('parses origin lists', () => {
    expect(parseOrigins('https://tokentails.com, https://www.tokentails.com/x ,junk,ftp://a.b')).toEqual([
      'https://tokentails.com',
      'https://www.tokentails.com',
    ]);
    expect(allowedOrigins({ DEV: true })).toContain('http://localhost:3000');
    expect(allowedOrigins({ DEV: false })).not.toContain('http://localhost:3000');
    expect(allowedOrigins({ VITE_EMBED_ORIGINS: 'https://a.example', DEV: false })).toEqual(['https://a.example']);
  });
  it('accepts only our namespace, version and host types', () => {
    expect(parseHostMessage({ ns: EMBED_NS, v: 1, type: 'hello' })).not.toBeNull();
    expect(parseHostMessage({ ns: EMBED_NS, v: 2, type: 'hello' })).toBeNull();
    expect(parseHostMessage({ ns: 'tt-swordcat', v: 1, type: 'hello' })).toBeNull();
    expect(parseHostMessage({ ns: EMBED_NS, v: 1, type: 'ready' })).toBeNull();
    expect(parseHostMessage('hello')).toBeNull();
  });
  it('fixes the host origin after the first hello', () => {
    const allow = ['https://tokentails.com', 'https://www.tokentails.com'];
    expect(acceptOrigin('https://evil.example', allow, null)).toBe(false);
    expect(acceptOrigin('https://www.tokentails.com', allow, null)).toBe(true);
    expect(acceptOrigin('https://www.tokentails.com', allow, 'https://tokentails.com')).toBe(false);
  });

  it('adds its own origin only when the parent is same-origin (preview and dev hosts)', () => {
    const allow = ['https://tokentails.com'];
    const preview = 'https://tokentails-git-x.vercel.app';
    expect(withSameOrigin(allow, { location: { origin: preview }, parent: { location: { origin: preview } } })).toEqual([...allow, preview]);
    const crossParent = { get location(): { origin: string } { throw new Error('cross-origin'); } };
    expect(withSameOrigin(allow, { location: { origin: preview }, parent: crossParent })).toEqual(allow);
    expect(withSameOrigin(allow, { location: { origin: preview }, parent: { location: { origin: 'https://evil.example' } } })).toEqual(allow);
    expect(withSameOrigin(allow, { location: { origin: 'null' }, parent: { location: { origin: 'null' } } })).toEqual(allow);
  });
});

describe('quality (§10)', () => {
  it('Low is DPR 1.25 with no shadows, bloom or outlines', () => {
    expect(tierSettings('low')).toMatchObject({ maxDpr: 1.25, shadows: false, bloom: false, outlines: false });
    expect(qualityOverride('?quality=med')).toBe('med');
    expect(qualityOverride('?quality=ultra')).toBeNull();
  });
  it('the probe drops to low under 42 fps and the governor steps down', () => {
    const slow = new FpsProbe();
    let r: string | null = null;
    for (let i = 0; i < 200 && !r; i++) r = slow.sample(1 / 30);
    expect(r).toBe('low');
    const fast = new FpsProbe();
    r = null;
    for (let i = 0; i < 400 && !r; i++) r = fast.sample(1 / 60);
    expect(r).toBe('ok');
    const g = new QualityGovernor(1);
    let next: string | null = null;
    for (let i = 0; i < 40 && !next; i++) next = g.sample(1 / 30, 'high');
    expect(next).toBe('med');
  });
});

describe('crash overlay', () => {
  it('shows one panel with a short message', () => {
    resetCrashForTests();
    expect(crashMessage(new Error('boom\nstack'))).toBe('boom');
    expect(crashMessage('x'.repeat(300)).length).toBe(160);
    const el = showCrash(new Error('kaput'));
    expect(el?.textContent).toContain('kaput');
    expect(showCrash(new Error('again'))).toBeNull();
    expect(document.querySelectorAll('#crash').length).toBe(1);
  });
});
