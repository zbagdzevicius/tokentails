// @vitest-environment happy-dom
/**
 * The update gate (src/shell/gate.ts, docs/plans/moba/FORCE-UPDATE.md §4) with a fake policy source, a fake OTA and
 * a fake clock: every outcome (ok, update with progress and apply, store, maintenance, offline accepted, offline
 * rejected, retry with backoff, a version that failed to boot, three failed downloads, a rollback), never mid-match,
 * and fail open.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ClientPolicyDecision } from '@/shared-contracts/client-policy';
import { BACKOFF_S, Gate, GATE_KEYS, type GateDeps, type GateOta } from '../src/shell/gate';
import type { PolicyOutcome } from '../src/shell/policy';
import type { KV } from '../src/shell/ota';

const LATEST = { version: '20261114000348-d4e754c', seq: 20261114000348, simVersion: 26, minNative: '1.0.0' };

function kv(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const api = (d: Partial<ClientPolicyDecision>): PolicyOutcome => ({
  source: 'api',
  decision: { action: 'ok', reason: 'current', latest: LATEST, ...d },
  answer: { schema: 1, action: 'ok', reason: 'current', latest: LATEST, minSim: 26, acceptedSims: [26], liveSim: 26, store: null, web: 'https://pawlegends.app/play', maintenance: null, retryAfterSec: 60, checkedAt: '', ...d },
  maintenance: null,
  retryAfterSec: 60,
});

class FakeOta implements GateOta {
  results: string[] = ['downloaded'];
  checks = 0;
  applied = 0;
  applyOk = true;
  failed: string[] = [];
  progress: ((p: number) => void) | null = null;
  async check(force: boolean) {
    expect(force).toBe(true);
    this.checks++;
    this.progress?.(50);
    return this.results.length > 1 ? this.results.shift()! : this.results[0];
  }
  async applyNow() {
    this.applied++;
    return this.applyOk;
  }
  failedVersions() {
    return this.failed;
  }
  forgetFailed(v: string) {
    this.failed = this.failed.filter((x) => x !== v);
  }
  onProgress(cb: (p: number) => void) {
    this.progress = cb;
    return () => void (this.progress = null);
  }
}

function setup(o: { outcomes?: PolicyOutcome[]; offline?: 'play' | 'block'; ota?: FakeOta | null; screen?: string; ready?: boolean } = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  document.documentElement.dataset.ready = o.ready === false ? '' : '1';
  let t = 1_000_000;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const outcomes = [...(o.outcomes ?? [api({})])];
  const ota = o.ota === undefined ? new FakeOta() : o.ota;
  const opened: string[] = [];
  const store = kv();
  const state = { screen: o.screen ?? 'title', offline: o.offline ?? 'play', policyCalls: 0, okCalls: 0, throwPolicy: false };
  let online: (() => void) | null = null;
  const d: GateDeps = {
    doc: document,
    policy: async () => {
      state.policyCalls++;
      if (state.throwPolicy) throw new Error('boom');
      return outcomes.length > 1 ? outcomes.shift()! : outcomes[0];
    },
    offline: () => state.offline,
    ota,
    ready: async () => undefined,
    atTitle: () => document.documentElement.dataset.ready !== '1' || state.screen === 'title',
    onOk: () => void state.okCalls++,
    kv: store,
    now: () => t,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: t + ms, fn, id });
      return id;
    },
    clearTimeout: (id) => {
      const i = timers.findIndex((x) => x.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    version: '20261113220028-f4b8472',
    platform: 'ios',
    storeUrl: 'https://apps.apple.com/app/id6832032981',
    webUrl: 'https://pawlegends.app/play',
    openUrl: (u) => void opened.push(u),
    onOnline: (cb) => {
      online = cb;
      return () => void (online = null);
    },
  };
  const gate = new Gate(d);
  const advance = async (ms: number) => {
    t += ms;
    for (const x of timers.filter((x) => x.at <= t)) {
      timers.splice(timers.indexOf(x), 1);
      x.fn();
    }
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  const el = () => document.getElementById('pl-gate');
  const buttons = () => [...(el()?.querySelectorAll('button') ?? [])].map((b) => b.textContent);
  const click = (label: string) => [...el()!.querySelectorAll('button')].find((b) => b.textContent === label)!.click();
  return { gate, ota, state, store, opened, advance, el, buttons, click, timers, goOnline: () => online?.(), outcomes };
}

describe('Gate', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('ok: the layer leaves and the old background flow runs (an optional newer bundle downloads there)', async () => {
    const s = setup();
    const p = s.gate.run('boot');
    // while it checks, the layer is up (transparent for 600 ms) and swallows input; the game is inert
    expect(s.el()?.dataset.gate).toBe('checking');
    expect(document.getElementById('app')!.hasAttribute('inert')).toBe(true);
    expect(await p).toBe('ok');
    expect(s.el()).toBeNull();
    expect(document.getElementById('app')!.hasAttribute('inert')).toBe(false);
    expect(s.state.okCalls).toBe(1);
  });

  it('update: "Updating Paw Legends" with progress, then the reload into the new bundle', async () => {
    const s = setup({ outcomes: [api({ action: 'update', reason: 'older-bundle' })] });
    const p = s.gate.run('boot');
    await Promise.resolve();
    expect(await p).toBe('applying');
    expect(s.ota!.checks).toBe(1);
    expect(s.ota!.applied).toBe(1);
    expect(s.el()?.dataset.gate).toBe('updating');
    expect(s.el()!.querySelector('h1')!.textContent).toBe('Updating Paw Legends');
    expect(s.el()!.querySelector('.plg-body')!.textContent).toBe('Starting…');
    expect((s.el()!.querySelector('.plg-bar i') as HTMLElement).style.width).toBe('100%');
    expect(s.state.okCalls).toBe(0);
  });

  it('rollback: a rollback answer is an update like any other (gated phones move down to it)', async () => {
    const s = setup({ outcomes: [api({ action: 'update', reason: 'rollback', latest: { ...LATEST, version: '20261110123949-cfc4fb7' } })] });
    expect(await s.gate.run('boot')).toBe('applying');
  });

  it('store: the store page and "Play in your browser"', async () => {
    const s = setup({ outcomes: [api({ action: 'store', reason: 'native-too-old' })] });
    expect(await s.gate.run('boot')).toBe('blocked:store');
    expect(s.buttons()).toEqual(['Open the App Store', 'Play in your browser', 'Try again']);
    s.click('Open the App Store');
    s.click('Play in your browser');
    expect(s.opened).toEqual(['https://apps.apple.com/app/id6832032981', 'https://pawlegends.app/play']);
    expect(s.ota!.checks).toBe(0);
  });

  it('maintenance: "Back soon" and an automatic retry; it leaves once the window ends', async () => {
    const s = setup({ outcomes: [{ ...api({ action: 'maintenance', reason: 'maintenance' }), maintenance: { message: 'Moving servers', until: null }, retryAfterSec: 30 } as PolicyOutcome, api({})] });
    expect(await s.gate.run('boot')).toBe('blocked:maintenance');
    expect(s.el()!.querySelector('.plg-body')!.textContent).toBe('Moving servers');
    await s.advance(30_000);
    expect(s.el()).toBeNull();
    expect(s.state.okCalls).toBe(1);
  });

  it('offline, accepted: play with a notice chip, never a blocking screen', async () => {
    const s = setup({ outcomes: [{ source: 'none' }], offline: 'play' });
    expect(await s.gate.run('boot')).toBe('offline-play');
    expect(s.el()).toBeNull();
    expect(document.getElementById('pl-gate-chip')!.textContent).toContain('Offline · playing f4b8472');
  });

  it('offline, rejected: a retry screen with backoff, and the `online` event retries at once', async () => {
    const s = setup({ outcomes: [{ source: 'none' }, { source: 'none' }, { source: 'none' }, api({})], offline: 'block' });
    expect(await s.gate.run('boot')).toBe('blocked:offline');
    expect(s.el()!.querySelector('h1')!.textContent).toBe("Can't reach the update server");
    expect(s.el()!.querySelector('.plg-foot')!.textContent).toBe(`Trying again in ${BACKOFF_S[0]} s`);
    await s.advance(BACKOFF_S[0] * 1000);
    expect(s.state.policyCalls).toBe(2);
    expect(s.el()!.querySelector('.plg-foot')!.textContent).toBe(`Trying again in ${BACKOFF_S[1]} s`);
    s.goOnline();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(s.state.policyCalls).toBe(3);
    // the next retry finds the API: the game starts
    await s.advance(BACKOFF_S[2] * 1000);
    expect(s.el()).toBeNull();
    expect(s.state.okCalls).toBe(1);
  });

  it('every retry re-reads the policy AND the manifest (a fix published meanwhile frees a stuck phone)', async () => {
    const ota = new FakeOta();
    ota.results = ['same', 'downloaded'];
    const s = setup({ ota, outcomes: [api({ action: 'update' })] });
    expect(await s.gate.run('boot')).toBe('blocked:retry');
    await s.advance(BACKOFF_S[0] * 1000);
    expect(s.state.policyCalls).toBe(2);
    expect(ota.checks).toBe(2);
    expect(ota.applied).toBe(1);
  });

  it('a version that failed to boot here is never downloaded again: play if still accepted, else a manual retry', async () => {
    const ota = new FakeOta();
    ota.failed = [LATEST.version];
    const a = setup({ ota, outcomes: [api({ action: 'update' })], offline: 'play' });
    expect(await a.gate.run('boot')).toBe('fallback-play');
    expect(ota.checks).toBe(0);
    expect(document.getElementById('pl-gate-chip')!.textContent).toContain("Couldn't update");

    const ota2 = new FakeOta();
    ota2.failed = [LATEST.version];
    const b = setup({ ota: ota2, outcomes: [api({ action: 'update' })], offline: 'block' });
    expect(await b.gate.run('boot')).toBe('blocked:failed');
    expect(b.timers.length).toBe(0); // no automatic retry: no loop
    expect(b.buttons()).toEqual(['Try again', 'Open the App Store', 'Play in your browser']);
    // the manual Try again forgets the failure once a day, then downloads
    b.click('Try again');
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(ota2.failed).toEqual([]);
    expect(ota2.checks).toBe(1);
    expect(b.store.m.get(GATE_KEYS.forgot)).toBeTruthy();
  });

  it('three failed downloads in 10 minutes stop the spinner', async () => {
    const ota = new FakeOta();
    ota.results = ['download-failed'];
    const s = setup({ ota, outcomes: [api({ action: 'update' })], offline: 'block' });
    expect(await s.gate.run('boot')).toBe('blocked:retry');
    await s.advance(BACKOFF_S[0] * 1000);
    expect(s.el()!.dataset.screen).toBe('retry');
    await s.advance(BACKOFF_S[1] * 1000);
    expect(s.el()!.dataset.screen).toBe('failed');
    expect(ota.checks).toBe(3);
    await s.advance(600_000);
    expect(ota.checks).toBe(3);
  });

  it('a failed apply counts as an attempt and retries', async () => {
    const ota = new FakeOta();
    ota.applyOk = false;
    const s = setup({ ota, outcomes: [api({ action: 'update' })] });
    expect(await s.gate.run('boot')).toBe('blocked:retry');
    expect(s.gate.attempts(LATEST.version)).toBe(1);
  });

  it('the download finds the phone offline: the offline rule decides', async () => {
    const ota = new FakeOta();
    ota.results = ['offline'];
    const s = setup({ ota, outcomes: [api({ action: 'update' })], offline: 'play' });
    expect(await s.gate.run('boot')).toBe('offline-play');
  });

  it('never mid-match: off the title the run is owed to the next title', async () => {
    const s = setup({ screen: 'match', outcomes: [api({ action: 'update' })] });
    expect(await s.gate.run('required')).toBe('deferred');
    expect(s.gate.owed).toBe(true);
    expect(s.el()).toBeNull();
    expect(s.state.policyCalls).toBe(0);
    s.state.screen = 'title';
    expect(await s.gate.run('title')).toBe('applying');
    expect(s.gate.owed).toBe(false);
  });

  it('while the game boots (no title yet) the gate may block: the boot check runs', async () => {
    const s = setup({ ready: false, screen: 'match', outcomes: [api({ action: 'store' })] });
    expect(await s.gate.run('boot')).toBe('blocked:store');
  });

  it('the Mac app (no OTA): an update answer lets it play; store and maintenance still block', async () => {
    const s = setup({ ota: null, outcomes: [api({ action: 'update' })] });
    expect(await s.gate.run('boot')).toBe('ok');
  });

  it('fails open: an exception in the gate removes it and the game starts', async () => {
    const s = setup();
    s.state.throwPolicy = true;
    expect(await s.gate.run('boot')).toBe('failed-open');
    expect(s.el()).toBeNull();
    expect(document.getElementById('app')!.hasAttribute('inert')).toBe(false);
  });

  it('one run at a time: a second call joins the running one', async () => {
    const s = setup();
    const a = s.gate.run('boot');
    const b = s.gate.run('resume');
    expect(a).toBe(b);
    await a;
    expect(s.state.policyCalls).toBe(1);
  });
});
