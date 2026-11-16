/**
 * End to end, in a real browser: the app's real sign-in code (src/host/auth.ts, the Firebase JS SDK with IndexedDB
 * persistence) signs in, the page is closed and opened again (what closing and reopening the app does to the
 * WebView), and the player is still the same account. The reopened page asks for a guest and a token at once, as
 * the host does on a cold start: before the fix that made a new anonymous user and the player was "logged out".
 *
 * Firebase's REST endpoints are answered by the test (nothing leaves the machine). Playwright comes from the game's
 * install (../pawlegends/node_modules, installed next to this app in CI); without it, a Chromium or this app's own
 * firebase install the test skips. PL_NODE_PATH adds a node_modules folder to look in (a worktree with a shared,
 * partial install).
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..');
const clientDir = resolve(appDir, '../pawlegends-web');
const ORIGIN = 'https://app.pawlegends.test';
const nodePaths = [join(appDir, 'node_modules'), ...(process.env.PL_NODE_PATH ? [process.env.PL_NODE_PATH] : [])];
const hasFirebase = nodePaths.some((dir) => {
  try {
    createRequire(join(dir, 'x.js'))('firebase/package.json');
    return true;
  } catch {
    return false;
  }
});

type Pw = { chromium: { launch(o?: object): Promise<any> } };
function loadPlaywright(): Pw | null {
  try {
    return createRequire(join(appDir, '../pawlegends/package.json'))('playwright-core') as Pw;
  } catch {
    return null;
  }
}

/** The page's script: the real `createFirebaseAuth` + `NativeAuth`, bundled as build-web.mjs bundles host.js. */
async function bundle(): Promise<string> {
  const out = await build({
    stdin: {
      contents: `
        import { signInWithEmailAndPassword } from "firebase/auth";
        import { createFirebaseAuth, NativeAuth } from "../src/host/auth";
        const auth = createFirebaseAuth();
        const host = new NativeAuth(auth, { apple: false, google: false });
        // what the host does on a cold start, at once: a token for a call, the lazy guest for a save
        const atStart = auth.currentUser ? auth.currentUser.uid : null;
        const boot = Promise.all([host.token(), host.ensureGuest(true)]).then(([token, guest]) => ({
          atStart, token, guest, uid: auth.currentUser && auth.currentUser.uid, anonymous: !!(auth.currentUser && auth.currentUser.isAnonymous),
        }));
        window.__t = { boot, signIn: (e, p) => signInWithEmailAndPassword(auth, e, p).then((c) => c.user.uid) };
      `,
      resolveDir: here,
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    write: false,
    nodePaths,
    target: ['es2020'],
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
    plugins: [
      {
        name: 'pl-client-modules',
        setup(b) {
          b.onResolve({ filter: /^@\// }, (args) => b.resolve(`./${args.path.slice(2)}`, { resolveDir: clientDir, kind: args.kind }));
          b.onResolve({ filter: /^(?:[^./@]|@[^/]+\/)/ }, (args) => {
            if (args.pluginData?.fromApp || !args.importer.startsWith(clientDir)) return undefined;
            return b.resolve(args.path, { resolveDir: appDir, kind: args.kind, pluginData: { fromApp: true } });
          });
        },
      },
    ],
  });
  return out.outputFiles[0].text;
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
const idToken = (uid: string, provider: string) =>
  `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ sub: uid, user_id: uid, iat: now(), exp: now() + 3600, auth_time: now(), firebase: { sign_in_provider: provider } })}.sig`;

const pw = loadPlaywright();

describe('session survives closing and reopening the app (real browser, real Firebase SDK)', () => {
  let browser: any = null;
  let script = '';
  const calls = { signUp: 0, lookup: 0 };

  beforeAll(async () => {
    if (!pw || !hasFirebase) return;
    try {
      browser = await pw.chromium.launch();
    } catch {
      browser = null;
      return;
    }
    script = await bundle();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  }, 60_000);

  it('a signed-in account is the same account after the page is closed and opened again', async (ctx) => {
    if (!browser) ctx.skip();
    // one context = one profile (its IndexedDB), like the app's WebView data across launches
    const context = await browser.newContext();
    try {
      await context.route(`${ORIGIN}/**`, (route: any) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/host.js') return route.fulfill({ contentType: 'text/javascript', body: script });
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><script src="/host.js"></script>' });
      });
      const account = { localId: 'acct-1', email: 'player@pawlegends.test' };
      await context.route('https://identitytoolkit.googleapis.com/**', (route: any) => {
        const path = new URL(route.request().url()).pathname;
        const json = (body: object) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        if (path.endsWith('accounts:signInWithPassword')) {
          return json({ kind: 'identitytoolkit#VerifyPasswordResponse', ...account, displayName: '', registered: true, idToken: idToken(account.localId, 'password'), refreshToken: 'refresh-acct-1', expiresIn: '3600' });
        }
        if (path.endsWith('accounts:lookup')) {
          calls.lookup++;
          return json({
            users: [{ ...account, emailVerified: true, providerUserInfo: [{ providerId: 'password', email: account.email, federatedId: account.email, rawId: account.email }], createdAt: '1', lastLoginAt: '1' }],
          });
        }
        if (path.endsWith('accounts:signUp')) {
          calls.signUp++;
          return json({ kind: 'identitytoolkit#SignupNewUserResponse', localId: `guest-${calls.signUp}`, idToken: idToken(`guest-${calls.signUp}`, 'anonymous'), refreshToken: 'refresh-guest', expiresIn: '3600' });
        }
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: `unexpected ${path}` } }) });
      });

      // first launch: sign in with email
      const first = await context.newPage();
      await first.goto(`${ORIGIN}/`);
      await first.evaluate(() => (window as any).__t.boot);
      const signUpsBefore = calls.signUp;
      expect(await first.evaluate(() => (window as any).__t.signIn('player@pawlegends.test', 'secret-password'))).toBe('acct-1');
      await first.close();

      // the app is closed and opened again, twice (a restart after the first reopen)
      for (let launch = 0; launch < 2; launch++) {
        const page = await context.newPage();
        await page.goto(`${ORIGIN}/`);
        const boot = await page.evaluate(() => (window as any).__t.boot);
        await page.close();
        // the race the fix closes: nothing is restored yet when the host starts asking
        expect(boot.atStart).toBeNull();
        expect(boot).toMatchObject({ uid: 'acct-1', anonymous: false, guest: true });
        expect(String(boot.token).startsWith('fb')).toBe(true);
        expect(calls.signUp).toBe(signUpsBefore);
      }
    } finally {
      await context.close();
    }
  }, 60_000);
});
