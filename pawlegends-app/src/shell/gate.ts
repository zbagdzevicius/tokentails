/**
 * The update gate (docs/plans/moba/FORCE-UPDATE.md §4): the app does not start on an outdated bundle. Shipped inside
 * shell.js, so every compat-2 phone gets it with its next OTA bundle, no store release.
 *
 * - A full-screen layer (`#pl-gate`) over the game. The game keeps booting behind it, so the title, html[data-ready]
 *   and notifyAppReady() happen as before and the updater's rollback watchdog stays armed. While it only checks it is
 *   transparent for 600 ms (fast answers never show it) but already swallows input.
 * - `ok` → the layer leaves; the background OTA flow runs as before (onOk).
 * - `update` → "Updating Paw Legends" with the download progress, then a reload into the new bundle (applyNow).
 * - `store` → the store page and "Play in your browser". `maintenance` → "Back soon" with a countdown.
 * - Offline or every source down → the last kept answer decides (policy.ts offlineVerdict): play with a notice chip,
 *   or a retry screen with backoff (2, 4, 8, 16, 30, 60 s, and the `online` event). Every retry re-reads the policy
 *   AND the manifest, so publishing a fix or a rollback frees a phone that sits on a blocking screen.
 *
 * Never mid-match: a run that is not on the title (or still booting) is owed to the next title. No loop: a version
 * that failed to boot here is never downloaded again automatically, and three failed attempts in 10 minutes stop the
 * spinner (play with a notice if the bundle is still accepted, else a "Couldn't update" screen with a manual retry).
 * Fail open: any exception in the gate removes it and the game starts.
 */
import type { ClientPolicyLatest, PolicyMaintenance } from '@/shared-contracts/client-policy';
import type { KV } from './ota';
import type { PolicyOutcome } from './policy';

export interface GateOta {
  check(force: boolean): Promise<string>;
  applyNow(): Promise<boolean>;
  failedVersions(): string[];
  forgetFailed(version: string): void;
  onProgress(cb: (percent: number) => void): () => void;
}

export interface GateDeps {
  doc: Document;
  policy(): Promise<PolicyOutcome>;
  /** The offline rule over the kept answer (policy.ts offlineVerdict). */
  offline(): 'play' | 'block';
  /** The OTA flow, or null where the shell takes no OTA updates (the Mac app: store and maintenance only). */
  ota: GateOta | null;
  /** Resolves once the title is up and the boot is settled (ota.booted). */
  ready(): Promise<void>;
  /** Booting (the title is not up yet), or on the title with no party: the only times the gate may block. */
  atTitle(): boolean;
  /** `ok`: the old background flow (apply a downloaded bundle on the title, check for an optional newer one). */
  onOk(): void;
  kv: KV;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(t: unknown): void;
  /** The installed bundle version (for the notices). */
  version: string;
  platform: 'ios' | 'android' | 'mac';
  storeUrl: string;
  webUrl: string;
  openUrl(url: string): void;
  /** Subscribe to the network coming back; returns an unsubscribe. */
  onOnline?(cb: () => void): () => void;
  logoSrc?: string;
  log?(msg: string): void;
}

export type GateResult =
  | 'ok'
  | 'offline-play'
  | 'fallback-play'
  | 'applying'
  | 'deferred'
  | 'failed-open'
  | 'blocked:offline'
  | 'blocked:retry'
  | 'blocked:failed'
  | 'blocked:store'
  | 'blocked:maintenance';

export const GATE_KEYS = Object.freeze({ attempts: 'pl.gate.attempts', forgot: 'pl.gate.forgot' });
export const GATE_FADE_MS = 600;
export const BACKOFF_S = Object.freeze([2, 4, 8, 16, 30, 60]);
export const MAX_ATTEMPTS = 3;
export const ATTEMPT_WINDOW_MS = 10 * 60_000;
const CHIP_MS = 6000;

type Screen = 'checking' | 'updating' | 'offline' | 'retry' | 'failed' | 'store' | 'maintenance';

const STYLE = `
#pl-gate{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;pointer-events:all;touch-action:none;
background:radial-gradient(circle at 50% 42%,rgba(18,9,31,0) 30%,#12091f 72%),linear-gradient(118deg,#3a0f2a 0 49.6%,rgba(255,225,74,.55) 49.6% 50.4%,#0c1f4a 50.4%);
color:#fff3e3;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-user-select:none;user-select:none;
padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box}
#pl-gate[data-gate=checking]{opacity:0;animation:plg-in .25s ease-out ${GATE_FADE_MS}ms forwards}
@keyframes plg-in{to{opacity:1}}
#pl-gate .plg-card{display:grid;justify-items:center;gap:12px;max-width:min(420px,100%);text-align:center}
#pl-gate .plg-logo{width:min(240px,60vw);height:auto}
#pl-gate h1{margin:4px 0 0;font-size:22px;font-weight:800;letter-spacing:.01em;text-transform:uppercase;font-style:italic}
#pl-gate p{margin:0;font-size:15px;line-height:1.4;color:rgba(255,243,227,.86)}
#pl-gate .plg-bar{width:min(260px,70vw);height:8px;transform:skewX(-8deg);background:rgba(255,243,227,.16);overflow:hidden}
#pl-gate .plg-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff3d7f,#ffe14a 50%,#39a6ff);transition:width .2s}
#pl-gate[data-indeterminate] .plg-bar i{width:40%;animation:plg-bar 1.2s ease-in-out infinite}
@keyframes plg-bar{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
#pl-gate .plg-actions{display:grid;gap:10px;width:min(300px,100%);margin-top:6px}
#pl-gate button{min-height:48px;border:2px solid #12091f;border-radius:6px;font:inherit;font-weight:800;font-size:16px;cursor:pointer;
background:#ffe14a;color:#12091f;box-shadow:0 3px 0 #12091f;transform:skewX(-6deg)}
#pl-gate button.plg-ghost{background:transparent;color:#fff3e3;border-color:rgba(255,243,227,.5);box-shadow:none}
#pl-gate .plg-foot{font-size:13px;color:rgba(255,243,227,.6)}
#pl-gate-chip{position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483000;max-width:calc(100% - 32px);
padding:6px 12px;border-radius:6px;border:2px solid #12091f;background:rgba(18,9,31,.92);color:#fff3e3;font:700 13px system-ui,-apple-system,sans-serif;
pointer-events:none;transition:opacity .4s}
@media (prefers-reduced-motion:reduce){#pl-gate[data-gate=checking]{animation-duration:0s}#pl-gate .plg-bar i{animation:none!important}}
`;

const storeName = (p: GateDeps['platform']): string => (p === 'android' ? 'Google Play' : p === 'mac' ? 'the Mac App Store' : 'the App Store');
const shortVersion = (v: string): string => v.split('-').pop()?.slice(0, 7) || v;

interface Attempts {
  v: string | null;
  t: number[];
}

export class Gate {
  private running: Promise<GateResult> | null = null;
  private el: HTMLElement | null = null;
  private retryTimer: unknown = null;
  private retryN = 0;
  private unOnline: (() => void) | null = null;
  private owedRun = false;
  private target: string | null = null;
  /** When the last run started (resume re-checks are throttled on it). */
  lastRun = 0;

  constructor(private readonly d: GateDeps) {}

  private log(m: string): void {
    this.d.log?.(`[gate] ${m}`);
  }

  /** A check is owed to the next title (a run deferred off the title, or `pl:update-required`). */
  get owed(): boolean {
    return this.owedRun;
  }

  owe(): void {
    this.owedRun = true;
  }

  /** Whether the gate is showing a blocking screen now. */
  get blocking(): boolean {
    return !!this.el && this.el.dataset.gate !== 'checking';
  }

  /** Run the check (one at a time: a second call joins the running one). Never throws. */
  run(trigger: string): Promise<GateResult> {
    if (this.running) return this.running;
    const p = (async (): Promise<GateResult> => {
      try {
        return await this.runOnce(trigger);
      } catch (e) {
        this.failOpen(e);
        return 'failed-open';
      }
    })();
    this.running = p;
    void p.then(() => {
      if (this.running === p) this.running = null;
    });
    return p;
  }

  private async runOnce(trigger: string): Promise<GateResult> {
    this.clearRetry();
    if (!this.d.atTitle()) return this.defer();
    this.owedRun = false;
    this.lastRun = this.d.now();
    this.log(`check (${trigger})`);
    if (!this.blocking) this.show('checking');
    const out = await this.d.policy();
    // the game left the title while the policy was in flight (a party invite or a resumed seat needs no tap): the
    // answer waits for the next title, never a blocking screen or a reload over a pick or a match
    if (!this.d.atTitle()) return this.defer();
    if (out.source === 'none') return this.offline();
    const { action, latest } = out.decision;
    this.log(`${out.source}: ${action} (${out.decision.reason}${latest ? `, latest ${latest.version}` : ''})`);
    if (action === 'maintenance') return this.maintenance(out.maintenance, out.retryAfterSec);
    if (action === 'store') return this.store();
    if (action === 'update' && this.d.ota) return this.update(latest);
    this.retryN = 0;
    this.hide();
    this.d.onOk();
    return 'ok';
  }

  // ------------------------------------------------------------------------------------------------ outcomes

  /** Not on the title (or not any more): the check is owed to the next title, and the layer goes. */
  private defer(): GateResult {
    this.owedRun = true;
    this.hide();
    return 'deferred';
  }

  private offline(): GateResult {
    if (this.d.offline() === 'play') {
      this.retryN = 0;
      this.hide();
      this.chip(`Offline · playing ${shortVersion(this.d.version)}. Matches save when you're back online.`);
      return 'offline-play';
    }
    this.screen('offline', {
      title: "Can't reach the update server",
      body: 'Paw Legends needs the latest version to play online. Check your connection.',
      actions: [{ label: 'Try again', primary: true, act: () => void this.run('manual') }],
    });
    this.scheduleRetry();
    return 'blocked:offline';
  }

  private store(): GateResult {
    const where = storeName(this.d.platform);
    this.screen('store', {
      title: 'Update Paw Legends',
      body: `A new Paw Legends is on ${where}. Update to keep playing, or play in your browser.`,
      actions: [
        { label: this.d.platform === 'android' ? 'Open Google Play' : 'Open the App Store', primary: true, act: () => this.d.openUrl(this.d.storeUrl) },
        { label: 'Play in your browser', act: () => this.d.openUrl(this.d.webUrl) },
        { label: 'Try again', act: () => void this.run('manual') },
      ],
    });
    return 'blocked:store';
  }

  private maintenance(m: PolicyMaintenance | null, retryAfterSec: number): GateResult {
    this.screen('maintenance', {
      title: 'Back soon',
      body: m?.message || 'Paw Legends is being updated. Try again in a few minutes.',
      actions: [{ label: 'Try again', primary: true, act: () => void this.run('manual') }],
    });
    this.scheduleRetry(Math.max(5, Math.min(600, retryAfterSec)));
    return 'blocked:maintenance';
  }

  private async update(latest: ClientPolicyLatest | null): Promise<GateResult> {
    const ota = this.d.ota!;
    const target = latest?.version ?? null;
    this.target = target;
    if (target && ota.failedVersions().includes(target)) return this.cannotUpdate('it did not start on this device');
    if (this.attempts(target) >= MAX_ATTEMPTS) return this.cannotUpdate('the download kept failing');
    this.screen('updating', { title: 'Updating Paw Legends', body: 'Getting the latest version…', progress: true });
    const off = ota.onProgress((p) => this.setProgress(p));
    let r = 'busy';
    try {
      for (let i = 0; i < 40 && r === 'busy'; i++) {
        r = await ota.check(true);
        if (r === 'busy') await new Promise<void>((res) => this.d.setTimeout(res, 500));
      }
    } finally {
      off();
    }
    this.log(`download: ${r}`);
    if (r === 'offline') return this.offline();
    if (r === 'native-too-old') return this.store();
    if (r === 'failed-before') return this.cannotUpdate('it did not start on this device');
    if (r === 'downloaded' || r === 'already-downloaded') {
      this.setProgress(100);
      this.setText('Starting…');
      await this.d.ready();
      // applyNow skips the title check (the layer covers the game): check here, after the download and the boot
      if (!this.d.atTitle()) return this.defer();
      if (await ota.applyNow()) return 'applying';
      this.bump(target);
      return this.retrying();
    }
    // same / older (the manifest has not caught up yet), no-manifest, bad-signature, download-failed, busy
    this.bump(target);
    if (this.attempts(target) >= MAX_ATTEMPTS) return this.cannotUpdate('the download kept failing');
    return this.retrying();
  }

  private retrying(): GateResult {
    this.screen('retry', {
      title: "Couldn't download the update",
      body: 'Paw Legends will try again in a moment.',
      actions: [{ label: 'Try again', primary: true, act: () => void this.run('manual') }],
    });
    this.scheduleRetry();
    return 'blocked:retry';
  }

  /** No more automatic attempts for this target: play if the bundle is still accepted, else a manual retry. */
  private cannotUpdate(why: string): GateResult {
    this.log(`cannot update (${why})`);
    if (this.d.offline() === 'play') {
      this.hide();
      this.chip(`Couldn't update. Playing ${shortVersion(this.d.version)}.`);
      return 'fallback-play';
    }
    this.screen('failed', {
      title: "Couldn't update",
      body: `This version can't play online any more and the update didn't install. Try again, or get Paw Legends from ${storeName(this.d.platform)}.`,
      actions: [
        { label: 'Try again', primary: true, act: () => this.manualRetry() },
        { label: this.d.platform === 'android' ? 'Open Google Play' : 'Open the App Store', act: () => this.d.openUrl(this.d.storeUrl) },
        { label: 'Play in your browser', act: () => this.d.openUrl(this.d.webUrl) },
      ],
    });
    return 'blocked:failed';
  }

  /** The "Couldn't update" Try again: once a day it also forgets that the target failed here and the attempt count. */
  private manualRetry(): void {
    const day = new Date(this.d.now()).toISOString().slice(0, 10);
    if (this.target && this.d.kv.getItem(GATE_KEYS.forgot) !== day && this.d.ota) {
      this.d.kv.setItem(GATE_KEYS.forgot, day);
      this.d.ota.forgetFailed(this.target);
      this.d.kv.removeItem(GATE_KEYS.attempts);
    }
    void this.run('manual');
  }

  // ------------------------------------------------------------------------------------------------ attempts

  private readAttempts(): Attempts {
    try {
      const v = JSON.parse(this.d.kv.getItem(GATE_KEYS.attempts) ?? 'null') as Attempts | null;
      return v && Array.isArray(v.t) ? v : { v: null, t: [] };
    } catch {
      return { v: null, t: [] };
    }
  }

  /** Failed download or apply attempts for this target in the last 10 minutes. */
  attempts(target: string | null): number {
    const a = this.readAttempts();
    if (a.v !== target) return 0;
    const since = this.d.now() - ATTEMPT_WINDOW_MS;
    return a.t.filter((t) => t >= since).length;
  }

  private bump(target: string | null): void {
    const a = this.readAttempts();
    const since = this.d.now() - ATTEMPT_WINDOW_MS;
    const t = a.v === target ? a.t.filter((x) => x >= since) : [];
    try {
      this.d.kv.setItem(GATE_KEYS.attempts, JSON.stringify({ v: target, t: [...t, this.d.now()] }));
    } catch {
      /* blocked storage: the window still caps it per session */
    }
  }

  // ------------------------------------------------------------------------------------------------ retries

  private scheduleRetry(seconds?: number): void {
    this.clearRetry();
    const s = seconds ?? BACKOFF_S[Math.min(this.retryN, BACKOFF_S.length - 1)];
    this.retryN++;
    this.setFoot(`Trying again in ${s} s`);
    this.retryTimer = this.d.setTimeout(() => {
      this.retryTimer = null;
      void this.run('retry');
    }, s * 1000);
    this.unOnline = this.d.onOnline?.(() => void this.run('online')) ?? null;
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) this.d.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.unOnline?.();
    this.unOnline = null;
  }

  // ------------------------------------------------------------------------------------------------ DOM

  private failOpen(e: unknown): void {
    console.warn('[gate] failed open', e);
    this.clearRetry();
    try {
      this.hide();
    } catch {
      /* nothing left to remove */
    }
  }

  private ensure(): HTMLElement {
    const doc = this.d.doc;
    this.ensureStyle();
    if (this.el && this.el.isConnected) return this.el;
    const el = doc.createElement('div');
    el.id = 'pl-gate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-live', 'polite');
    const card = doc.createElement('div');
    card.className = 'plg-card';
    const logo = doc.createElement('img');
    logo.className = 'plg-logo';
    logo.alt = 'Paw Legends';
    logo.src = this.d.logoSrc ?? './assets/brand/logo-720.webp';
    const title = doc.createElement('h1');
    const body = doc.createElement('p');
    body.className = 'plg-body';
    const bar = doc.createElement('div');
    bar.className = 'plg-bar';
    bar.appendChild(doc.createElement('i'));
    const actions = doc.createElement('div');
    actions.className = 'plg-actions';
    const foot = doc.createElement('p');
    foot.className = 'plg-foot';
    card.append(logo, title, body, bar, actions, foot);
    el.appendChild(card);
    // swallow input on the layer (the game below never sees a tap while the gate is up)
    for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'click', 'keydown']) el.addEventListener(ev, (e) => e.stopPropagation());
    (doc.body ?? doc.documentElement).appendChild(el);
    this.el = el;
    return el;
  }

  private show(s: Screen): void {
    const el = this.ensure();
    el.dataset.gate = s;
    el.dataset.indeterminate = '1';
    this.part('h1').textContent = 'Checking for updates…';
    this.part('.plg-body').textContent = '';
    this.part('.plg-actions').replaceChildren();
    this.part('.plg-foot').textContent = '';
    this.d.doc.getElementById('app')?.setAttribute('inert', '');
  }

  private screen(s: Screen, o: { title: string; body: string; progress?: boolean; actions?: { label: string; primary?: boolean; act: () => void }[] }): void {
    this.show(s);
    const el = this.el!;
    this.part('h1').textContent = o.title;
    this.part('.plg-body').textContent = o.body;
    (this.part('.plg-bar') as HTMLElement).style.display = o.progress ? '' : 'none';
    const actions = this.part('.plg-actions');
    for (const a of o.actions ?? []) {
      const b = this.d.doc.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      if (!a.primary) b.className = 'plg-ghost';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        a.act();
      });
      actions.appendChild(b);
    }
    el.dataset.screen = s;
  }

  private part(sel: string): Element {
    return this.el!.querySelector(sel)!;
  }

  private setProgress(p: number): void {
    if (!this.el) return;
    delete this.el.dataset.indeterminate;
    (this.part('.plg-bar i') as HTMLElement).style.width = `${Math.round(p)}%`;
    this.setFoot(`${Math.round(p)}%`);
  }

  private setText(t: string): void {
    if (this.el) this.part('.plg-body').textContent = t;
  }

  private setFoot(t: string): void {
    if (this.el) this.part('.plg-foot').textContent = t;
  }

  private hide(): void {
    this.el?.remove();
    this.el = null;
    this.d.doc.getElementById('app')?.removeAttribute('inert');
  }

  private chip(text: string): void {
    const doc = this.d.doc;
    this.ensureStyle();
    doc.getElementById('pl-gate-chip')?.remove();
    const c = doc.createElement('div');
    c.id = 'pl-gate-chip';
    c.setAttribute('role', 'status');
    c.textContent = text;
    (doc.body ?? doc.documentElement).appendChild(c);
    this.d.setTimeout(() => c.remove(), CHIP_MS);
  }

  private ensureStyle(): void {
    if (this.d.doc.getElementById('pl-gate-style')) return;
    const st = this.d.doc.createElement('style');
    st.id = 'pl-gate-style';
    st.textContent = STYLE;
    (this.d.doc.head ?? this.d.doc.documentElement).appendChild(st);
  }
}
