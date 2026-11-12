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
  /** UX pass 2: `session.name` (the profile name) sent with a signed-in session. */
  name?: string;
  token?: string | null;
  roster?: unknown[];
  /** Answer each purchase intent with `purchase-result{ok:true}` and this token (a Stripe test checkout return). */
  buyGrants?: Record<string, string>;
  /** `featured{cats}` sent on every ready (unowned direct-purchase cats). */
  featured?: unknown[];
  /** `offer{offer}` sent on every ready (the server Meet answer). */
  offer?: unknown;
  /** Sim v9: `champions{cats}` sent on every ready (the shelter champions' cards). */
  champions?: unknown[];
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
  /** Party play (P9): answer `party-ticket-request{id}` with this ticket (null: answer `ticket: null`). */
  partyTicket?: string | null;
  /** STORE-PASS.md: `store{items, season}` sent on every ready (GET /pawlegends/me). */
  store?: { items: string[]; season: unknown };
  /** STORE-PASS.md: answer `purchase-intent{sku}` for a store SKU with `purchase-result{sku, ok:true}` and this store state (a Stripe test-mode return). */
  storeGrants?: Record<string, { items: string[]; season: unknown }>;
  /** STORE-PASS.md: answer a match's save with `save-result{season}` and then this store state (Season XP paid by /live). */
  seasonOnSave?: { season: { gained: number; xp: number; tier: number; prevTier: number }; store: { items: string[]; season: unknown } };
  /** STORE-PASS.md: answer `pass-claim` with this store state (POST /pawlegends/pass/claim). */
  passClaim?: { items: string[]; season: unknown };
  /** SOCIAL-RANKED.md §13: answer `api-request{op}` with this status and body (unlisted ops: status 0). */
  api?: Record<string, { status: number; body?: unknown }>;
  /**
   * CHAMPION-STORE.md: `store.champions` sent with every `store`. Default: every champion owned (a Founders roster),
   * so the older specs pick any hero in any week; null sends none (the starters and the week's rotation only).
   */
  champState?: unknown;
  /**
   * CHAT-AVATARS.md §8: answer every `api-request` from `window.plApi(op, args)` (the test's `context.exposeFunction`), a
   * stateful fake server two players share. `api` is ignored then.
   */
  liveApi?: boolean;
}

/** Every champion owned (the Founders roster), the e2e host's default `store.champions`. */
export const ALL_CHAMPS = {
  owned: ['clem', 'sage', 'pixel', 'lambo', 'meatball', 'aviete', 'stilts', 'bengas', 'duchess', 'gabe', 'howler', 'chili', 'rocket', 'brutus', 'bravo', 'cacklejaw', 'frankie', 'marshmallow', 'domino', 'nugget'].map((hero) => ({ hero, source: 'founders' })),
  founders: true,
  rotation: { week: 0 },
  yarn: { balance: 0, matches: 0, picksLeft: 0, nextPickAt: 5 },
  bundles: [],
};

const b64url = (s: string): string => Buffer.from(s).toString('base64url');
/** A token in the backend format with a dummy signature (the game reads, never verifies). */
export const fakeToken = (items: string[], skus: string[]): string =>
  `${b64url(JSON.stringify({ items, skus, expiresAt: Date.now() + 86_400_000 }))}.${'x'.repeat(43)}`;

function hostHtml(cfg: HostConfig): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#111}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style></head><body>
<script>
  (function () {
    var cfg = ${JSON.stringify({ ...cfg, champState: cfg.champState === undefined ? ALL_CHAMPS : cfg.champState })};
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
      send('session', cfg.name ? { signedIn: !!cfg.signedIn, name: cfg.name } : { signedIn: !!cfg.signedIn });
      if (cfg.roster) send('roster', { cats: cfg.roster });
      if (token) send('entitlements', { token: token });
      if (cfg.featured) send('featured', { cats: cfg.featured });
      if (cfg.champions) send('champions', { cats: cfg.champions });
      if (cfg.offer !== undefined) send('offer', { offer: cfg.offer });
      if (store || cfg.champState) send('store', withChamps(store || { items: [], season: null }));
    };
    var withChamps = function (st) { return cfg.champState ? Object.assign({}, st, { champions: cfg.champState }) : st; };
    var store = cfg.store || null;
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
      if (m.type === 'purchase-intent' && cfg.storeGrants && cfg.storeGrants[m.sku]) {
        store = cfg.storeGrants[m.sku];
        setTimeout(function () { send('purchase-result', { sku: m.sku, ok: true }); send('store', withChamps(store)); }, 50);
      }
      if (m.type === 'pass-claim' && cfg.passClaim) {
        store = cfg.passClaim;
        setTimeout(function () { send('store', withChamps(store)); }, 50);
      }
      if (m.type === 'match-result' && cfg.seasonOnSave) {
        var so = cfg.seasonOnSave;
        setTimeout(function () {
          send('save-result', { matchId: m.matchId, status: 'saved', catnipPaid: 0, catnipTotal: null, fastestWin: null, season: so.season });
          store = so.store;
          send('store', withChamps(store));
        }, 50);
      }
      if (m.type === 'party-ticket-request' && cfg.partyTicket !== undefined) {
        send('party-ticket', cfg.partyTicket ? { id: m.id, ticket: cfg.partyTicket } : { id: m.id, ticket: null, error: 'PAWLEGENDS_PARTY_TICKET_UNAVAILABLE' });
      }
      if (m.type === 'api-request' && cfg.liveApi && window.plApi) {
        // CHAT-AVATARS e2e: a stateful server in the test (context.exposeFunction('plApi')) shared by two players
        window.plApi(m.op, m.args || {}).then(function (r) {
          send('api-result', Object.assign({ id: m.id, ok: r.status >= 200 && r.status < 300, status: r.status }, r.body ? { body: r.body } : {}));
        });
        return;
      }
      if (m.type === 'api-request') {
        var a = (cfg.api || {})[m.op];
        setTimeout(function () {
          send('api-result', a ? Object.assign({ id: m.id, ok: a.status >= 200 && a.status < 300, status: a.status }, a.body ? { body: a.body } : {}) : { id: m.id, ok: false, status: 0 });
        }, 20);
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
      // a background fetch (the match chunk's prefetch) can still be in flight when the test closes the page
      try {
        const res = await route.fetch({ url: `${baseURL}/${rest}${url.search}` });
        return await route.fulfill({ response: res });
      } catch (err) {
        // only a page or context closed under the fetch is expected; a real proxy failure must fail the test
        const msg = err instanceof Error ? err.message : String(err);
        let closed = false;
        try {
          closed = route.request().frame().page().isClosed();
        } catch {
          closed = true;
        }
        if (closed || /Target.*closed|has been closed|has been disposed/i.test(msg)) return route.abort().catch(() => undefined);
        throw err;
      }
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
