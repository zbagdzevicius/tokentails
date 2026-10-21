// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  CRASH_REPORT_MAX,
  crashCode,
  crashMessage,
  crashSender,
  installCrashOverlay,
  reportCrash,
  resetCrashForTests,
  setCrashHook,
  showCrash,
  type CrashSource,
} from '../../src/app/crash';
import { cleanProps } from '../../src/analytics/posthog';
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

describe('crash reports (launch finding R1)', () => {
  const sink = () => {
    const got: [CrashSource, string][] = [];
    setCrashHook((source, msg) => got.push([source, msg]));
    return got;
  };

  it('cuts a message to lower-case [a-z0-9_ ], one line, at most 80 characters', () => {
    expect(crashCode(new Error('Cannot read properties of undefined (reading "x")\n at a.js:1'))).toBe('cannot read properties of undefined reading x');
    expect(crashCode(new Error('token eyJ.abc at https://x.example/?uid=7'))).toBe('token eyj abc at https x example uid 7');
    expect(crashCode('A'.repeat(300))).toBe('a'.repeat(80));
    expect(crashCode('!!!')).toBe('unknown error');
    expect(crashCode({})).toBe('unknown error');
    expect(/^[a-z0-9_ ]{1,80}$/.test(crashCode(new Error('sim: worker died — 💥 <script>')))).toBe(true);
  });

  it('sends at most CRASH_REPORT_MAX a page, and holds early crashes until the hook is set', () => {
    resetCrashForTests();
    reportCrash('boot', new Error('first'));
    const got = sink();
    expect(got).toEqual([['boot', 'first']]);
    for (let i = 0; i < 10; i++) reportCrash('window', new Error(`e${i}`));
    expect(got.length).toBe(CRASH_REPORT_MAX);
    expect(got[1]).toEqual(['window', 'e0']);
  });

  it('reports an error once: the worker report wins over the window listener', () => {
    resetCrashForTests();
    const got = sink();
    const err = new Error('sim: bad input');
    expect(reportCrash('worker', err)).toBe(true);
    expect(reportCrash('window', err)).toBe(false);
    expect(got).toEqual([['worker', 'sim bad input']]);
  });

  it('the overlay listeners report window errors and rejections, and a throwing hook never throws', () => {
    resetCrashForTests();
    const target = new EventTarget() as unknown as Window;
    const got: [CrashSource, string][] = [];
    installCrashOverlay(target, (source, msg) => {
      got.push([source, msg]);
      throw new Error('hook broke');
    });
    const err = new Error('Kaput');
    target.dispatchEvent(Object.assign(new Event('error'), { error: err, message: 'Kaput' }));
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'nope' }));
    expect(got).toEqual([
      ['window', 'kaput'],
      ['rejection', 'nope'],
    ]);
    resetCrashForTests();
  });

  it('analytics keeps an 80-character msg (other strings stay at 64)', () => {
    expect(cleanProps({ msg: 'a'.repeat(100), hero: 'b'.repeat(100) })).toEqual({ msg: 'a'.repeat(80), hero: 'b'.repeat(64) });
  });

  it('the App hook posts to the host when embedded, else tracks and flushes, and never after a no', () => {
    const log: string[] = [];
    let consent: 'granted' | 'denied' | 'unset' = 'unset';
    let embedded = true;
    const hook = crashSender({
      consent: () => consent,
      post: (p) => (embedded ? (log.push(`post ${p.source} ${p.msg} ${p.screen} ${p.tier} ${p.sim}`), true) : false),
      track: (p) => log.push(`track ${p.source} ${p.msg}`),
      flush: () => log.push('flush'),
      context: () => ({ screen: 'match', tier: 'high', sim: 10 }),
    });
    hook('worker', 'sim bad input');
    embedded = false;
    hook('window', 'boom');
    consent = 'denied';
    hook('window', 'again');
    expect(log).toEqual(['post worker sim bad input match high 10', 'track window boom', 'flush']);
  });
});
