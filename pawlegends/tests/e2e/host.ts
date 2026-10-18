/**
 * A mock Token Tails host for the embed and store specs (POC.md §15 items 21–22). The real host lives in
 * `client/components/pawlegends/` (its own tests); here a tiny page plays its part of the `tt-pawlegends` v1 bridge
 * so the standalone game build can be tested framed, same-origin, exactly as on tokentails.com.
 *
 * Routing: `https://tokentails.com/e2e-host` is the mock host page, `https://tokentails.com/pawlegends-game/**` is
 * proxied to the e2e preview server, `/user/catbassadors/live` is captured, and everything else off-box is aborted.
 */
import type { BrowserContext, Frame, Page } from '@playwright/test';

export const SITE = 'https://tokentails.com';
/** A cat art URL the bridge accepts (embed/bridge.ts ART_HOST); the mock serves a 1×1 PNG for it. */
export const art = (name: string): string => `https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/tokentails-nfts/e2e/${name}.png`;
export const EVIL = 'https://evil.example';

export interface HostConfig {
  /** `app{isApp, store, notify}` sent on every ready. Omit to send no `app` message. */
  app?: { isApp: boolean; store: boolean; notify?: boolean };
  signedIn?: boolean;
  token?: string | null;
  roster?: unknown[];
  /** Answer each purchase intent with `purchase-result{ok:true}` and this token (a Stripe test checkout return). */
  buyGrants?: Record<string, string>;
  /** `featured{cats}` sent on every ready (unowned direct-purchase cats). */
  featured?: unknown[];
  /** `offer{offer}` sent on every ready (the server Meet answer). */
  offer?: unknown;
  /** Answer `open-cat{catalogId}` with `purchase-result{catalogId, ok:true}` and then this roster (a test checkout). */
  catGrants?: Record<string, unknown[]>;
  /** localStorage profile written before the game loads (same origin as the game). */
  profile?: Record<string, unknown>;
  /** Extra game query (e.g. `&speed=64`). */
  query?: string;
  /** Where the game is served from (default: the host's own origin). */
  gameOrigin?: string;
  /** Target origin of host posts (default: our own origin). The wrong-origin test uses '*' so the post arrives. */
  sendTarget?: string;
}

const b64url = (s: string): string => Buffer.from(s).toString('base64url');
/** A token in the backend format with a dummy signature (the game reads, never verifies). */
export const fakeToken = (items: string[], skus: string[]): string =>
  `${b64url(JSON.stringify({ items, skus, expiresAt: Date.now() + 86_400_000 }))}.${'x'.repeat(43)}`;

function hostHtml(cfg: HostConfig): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#111}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style></head><body>
<script>
  (function () {
    var cfg = ${JSON.stringify(cfg)};
    try { if (cfg.profile) localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(cfg.profile)); } catch (e) {}
    window.received = [];
    var ready = false, token = cfg.token === undefined ? null : cfg.token;
    var f = document.createElement('iframe');
    f.id = 'g';
    var send = window.send = function (type, p) {
      var m = Object.assign({}, p || {}, { ns: 'tt-pawlegends', v: 1, type: type });
      f.contentWindow && f.contentWindow.postMessage(m, cfg.sendTarget || location.origin);
    };
    var sticky = function () {
      if (cfg.app) send('app', cfg.app);
      send('session', { signedIn: !!cfg.signedIn });
      if (cfg.roster) send('roster', { cats: cfg.roster });
      if (token) send('entitlements', { token: token });
      if (cfg.featured) send('featured', { cats: cfg.featured });
      if (cfg.offer !== undefined) send('offer', { offer: cfg.offer });
    };
    addEventListener('message', function (e) {
      if (e.source !== f.contentWindow) return;
      var m = e.data;
      if (!m || m.ns !== 'tt-pawlegends' || m.v !== 1) return;
      window.received.push(m);
      if (m.type === 'ready') { ready = true; sticky(); }
      if (m.type === 'purchase-intent' && cfg.buyGrants && cfg.buyGrants[m.sku]) {
        token = cfg.buyGrants[m.sku];
        setTimeout(function () { send('purchase-result', { sku: m.sku, ok: true }); send('entitlements', { token: token }); }, 50);
      }
      if (m.type === 'open-cat' && cfg.catGrants && cfg.catGrants[m.catalogId]) {
        var cats = cfg.catGrants[m.catalogId];
        setTimeout(function () { send('purchase-result', { catalogId: m.catalogId, ok: true }); send('roster', { cats: cats }); }, 50);
      }
      if (m.type === 'match-result') {
        fetch('/user/catbassadors/live', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'PAWLEGENDS', pawlegends: m.replay }) });
      }
    });
    var hello = function () { if (ready) return; send('hello'); setTimeout(hello, 250); };
    f.addEventListener('load', hello);
    f.src = (cfg.gameOrigin || '') + '/pawlegends-game/index.html?embed=1&e2e=1' + (cfg.query || '');
    document.body.appendChild(f);
  })();
</script></body></html>`;
}

/**
 * Record the target origin of every post the game frame makes to its parent (catches a '*' post). The wrapper is
 * created in the game's own realm, so the message still arrives with `event.source` = the game window. Only a
 * same-origin parent can be wrapped; the list stays empty otherwise.
 */
export async function recordPostTargets(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __targets: string[] };
    w.__targets = [];
    if (window.parent === window) return;
    try {
      const p = window.parent;
      const orig = p.postMessage.bind(p);
      p.postMessage = ((msg: unknown, target: string) => {
        w.__targets.push(String(target));
        return orig(msg, target);
      }) as Window['postMessage'];
    } catch {
      /* cross-origin parent */
    }
  });
}

export interface Mock {
  game: () => Frame;
  lives: unknown[];
}

/** Install the routes; `origin` is where the mock host page lives (SITE or EVIL). */
export async function mockHost(context: BrowserContext, baseURL: string, cfg: HostConfig, origin = SITE): Promise<Mock> {
  const lives: unknown[] = [];
  await context.route(/.*/, async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    if (url.origin === origin && url.pathname === '/e2e-host') return route.fulfill({ contentType: 'text/html', body: hostHtml(cfg) });
    if (url.origin === SITE && url.pathname.startsWith('/pawlegends-game/')) {
      const rest = url.pathname.slice('/pawlegends-game/'.length) || 'index.html';
      const res = await route.fetch({ url: `${baseURL}/${rest}${url.search}` });
      return route.fulfill({ response: res });
    }
    // cat art from the Token Tails bucket (round 1: Meet cards need art): a 1×1 PNG
    if (url.hostname === 'tokentails-nfts.fra1.cdn.digitaloceanspaces.com') {
      return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64') });
    }
    if (url.origin === origin && url.pathname === '/user/catbassadors/live') {
      lives.push(route.request().postDataJSON());
      return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    }
    return route.abort();
  });
  return { game: () => context.pages()[0].frames().find((f) => f.url().includes('/pawlegends-game/')) as Frame, lives };
}

export async function openHost(page: Page, origin = SITE): Promise<Frame> {
  await page.goto(`${origin}/e2e-host`);
  await page.waitForFunction(() => !!document.querySelector('iframe'));
  let frame: Frame | undefined;
  for (let i = 0; i < 100 && !frame; i++) {
    frame = page.frames().find((f) => f.url().includes('/pawlegends-game/'));
    if (!frame) await page.waitForTimeout(100);
  }
  if (!frame) throw new Error('game frame missing');
  await frame.waitForSelector('html[data-ready="1"]');
  return frame;
}

export const gattr = (f: Frame, name: string): Promise<string> => f.evaluate((n) => document.documentElement.dataset[n] ?? '', name);
export const received = (page: Page): Promise<{ type: string; [k: string]: unknown }[]> =>
  page.evaluate(() => (window as unknown as { received: { type: string }[] }).received);
