// @vitest-environment happy-dom
/**
 * Party links into the app (docs/plans/moba/DEEP-LINKS.md): the shell queues each link for the game exactly once
 * (cold start, warm start, an OTA reload in the same process), and the native projects claim pawlegends.app/p/*.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { DUP_MS, installLinks, LINK_EVENT, LINKS_GLOBAL, SEEN_KEY, type LinkApp } from '../src/shell/links';

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeApp(launch: string | null) {
  let listener: ((e: { url?: string }) => void) | null = null;
  const app: LinkApp = {
    getLaunchUrl: async () => (launch ? { url: launch } : undefined),
    addListener: (_e, fn) => {
      listener = fn;
      return { remove: async () => undefined };
    },
  };
  return { app, open: (url: string) => listener?.({ url }) };
}

function queue(): string[] {
  return ((window as unknown as Record<string, unknown>)[LINKS_GLOBAL] as string[] | undefined) ?? [];
}

describe('shell links', () => {
  let events = 0;
  let clock = 1_000_000;
  const now = () => clock;
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>)[LINKS_GLOBAL];
    sessionStorage.clear();
    events = 0;
    window.addEventListener(LINK_EVENT, () => events++);
  });

  it('cold start: the launch URL is queued once, even when iOS also delivers it as appUrlOpen', async () => {
    const f = fakeApp('https://pawlegends.app/p/K7QX2M');
    installLinks(f.app, window, now);
    f.open('https://pawlegends.app/p/K7QX2M'); // the retained appUrlOpen of the same launch
    await flush();
    expect(queue()).toEqual(['https://pawlegends.app/p/K7QX2M']);
    expect(events).toBeGreaterThanOrEqual(1);
  });

  it('warm start: each appUrlOpen is queued; the same QR scanned again later counts again', async () => {
    const f = fakeApp(null);
    installLinks(f.app, window, now);
    await flush();
    f.open('https://pawlegends.app/p/AAAAAA');
    f.open('https://pawlegends.app/p/AAAAAA'); // a duplicate delivery
    clock += DUP_MS + 1;
    f.open('https://pawlegends.app/p/AAAAAA'); // a second scan
    f.open('https://pawlegends.app/p/BBBBBB');
    expect(queue()).toEqual(['https://pawlegends.app/p/AAAAAA', 'https://pawlegends.app/p/AAAAAA', 'https://pawlegends.app/p/BBBBBB']);
  });

  it('an OTA reload in the same process does not hand the old launch URL over again', async () => {
    const first = fakeApp('https://pawlegends.app/p/K7QX2M');
    installLinks(first.app, window, now);
    await flush();
    expect(queue()).toHaveLength(1);
    expect(sessionStorage.getItem(SEEN_KEY)).toContain('K7QX2M');
    // the page reloads: a new shell, the same process (sessionStorage kept), iOS still reports the last URL
    delete (window as unknown as Record<string, unknown>)[LINKS_GLOBAL];
    const second = fakeApp('https://pawlegends.app/p/K7QX2M');
    installLinks(second.app, window, now);
    await flush();
    expect(queue()).toEqual([]);
  });

  it('hands over only https URLs of bounded length (the game decides what they mean)', async () => {
    const f = fakeApp('pawlegends://party/K7QX2M');
    installLinks(f.app, window, now);
    await flush();
    f.open('javascript:alert(1)');
    f.open(`https://pawlegends.app/p/${'x'.repeat(600)}`);
    expect(queue()).toEqual([]);
  });

  it('a broken plugin never stops the shell', async () => {
    const app: LinkApp = {
      getLaunchUrl: () => Promise.reject(new Error('no plugin')),
      addListener: () => {
        throw new Error('no plugin');
      },
    };
    expect(() => installLinks(app, window, now)).not.toThrow();
    await flush();
    expect(queue()).toEqual([]);
  });
});

describe('native projects claim pawlegends.app/p/*', () => {
  const app = join(__dirname, '..');
  it('iOS: Associated Domains for the apex (and www) in the iPhone entitlements; AppDelegate forwards the activity', () => {
    const ent = readFileSync(join(app, 'ios/App/App/App-iOS.entitlements'), 'utf8');
    expect(ent).toContain('com.apple.developer.associated-domains');
    expect(ent).toContain('<string>applinks:pawlegends.app</string>');
    const delegate = readFileSync(join(app, 'ios/App/App/AppDelegate.swift'), 'utf8');
    expect(delegate).toMatch(/continue userActivity[\s\S]*ApplicationDelegateProxy\.shared\.application\(application, continue: userActivity/);
    expect(readFileSync(join(app, 'fastlane/Fastfile'), 'utf8')).toContain('ASSOCIATED_DOMAINS');
  });
  it('Android: a verified https intent filter for pawlegends.app/p/ on the singleTask activity', () => {
    const m = readFileSync(join(app, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    expect(m).toContain('android:launchMode="singleTask"');
    const filter = /<intent-filter android:autoVerify="true">([\s\S]*?)<\/intent-filter>/.exec(m)?.[1] ?? '';
    expect(filter).toContain('android.intent.action.VIEW');
    expect(filter).toContain('android.intent.category.BROWSABLE');
    expect(filter).toContain('android:scheme="https"');
    expect(filter).toContain('android:host="pawlegends.app"');
    expect(filter).toContain('android:pathPrefix="/p/"');
    // www has no DNS: before Android 12 one unverifiable host fails every host of the app
    expect(filter).not.toContain('www.pawlegends.app');
  });
  it('the shell and the game agree on the queue name and the event', () => {
    const game = readFileSync(join(app, '../pawlegends/src/app/links.ts'), 'utf8');
    expect(game).toContain(`LINKS_GLOBAL = '${LINKS_GLOBAL}'`);
    expect(game).toContain(`LINK_EVENT = '${LINK_EVENT}'`);
  });
});
