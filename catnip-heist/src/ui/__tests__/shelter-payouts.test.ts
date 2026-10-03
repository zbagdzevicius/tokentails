// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISBURSED_TOPIC, NATIVE_DISBURSED_TOPIC, fetchShelterPayouts, memoOf, type ShelterPayouts } from '../payouts';
import { amountsText, createPayoutsModal, timeAgo, wantsPayoutsDeepLink, type PayoutsModal } from '../shelter-payouts';
import { createUI, type UI } from '../ui';

const SPLIT = '0x' + 'ab'.repeat(20);
const SHELTER_TOPIC = '0x' + '0'.repeat(24) + 'e299299b846ba629f5a591dbf4f562bcc07a0f37';
const hex64 = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0');
/** ABI data for (uint256 amount, string memo). */
const payoutData = (amount: bigint, memo: string) => {
  const bytes = Buffer.from(memo, 'utf8').toString('hex');
  return '0x' + hex64(amount) + hex64(64) + hex64(bytes.length / 2) + bytes.padEnd(Math.ceil(bytes.length / 64) * 64, '0');
};
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
const empty = (): ShelterPayouts => ({ status: 'empty', totals: new Map(), chains: [], payouts: [] });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('deep link', () => {
  it('opens on ?payouts and #payouts, not otherwise', () => {
    expect(wantsPayoutsDeepLink({ search: '?payouts' })).toBe(true);
    expect(wantsPayoutsDeepLink({ search: '?level=heist-02&payouts=1' })).toBe(true);
    expect(wantsPayoutsDeepLink({ hash: '#payouts' })).toBe(true);
    expect(wantsPayoutsDeepLink({ search: '?payouts=0' })).toBe(false);
    expect(wantsPayoutsDeepLink({ search: '?qa=1', hash: '#top' })).toBe(false);
    expect(wantsPayoutsDeepLink(undefined)).toBe(false);
  });
});

describe('formatting helpers', () => {
  it('joins totals and hides zero', () => {
    expect(amountsText(new Map())).toBe('');
    expect(amountsText(new Map([['USDC', 0n]]))).toBe('');
    expect(amountsText(new Map([['USDC', 125n * 10n ** 17n], ['EURC', 10n ** 18n]]))).toBe('12.5 USDC + 1 EURC');
  });
  it('says how long ago', () => {
    const now = Date.UTC(2026, 9, 2, 12);
    const s = now / 1000;
    expect(timeAgo(s - 10, now)).toBe('just now');
    expect(timeAgo(s - 5 * 60, now)).toBe('5 min ago');
    expect(timeAgo(s - 3 * 3600, now)).toBe('3 h ago');
    expect(timeAgo(s - 2 * 86400, now)).toBe('2 d ago');
    expect(timeAgo(Date.UTC(2026, 8, 1) / 1000, now)).toBe('1 Sep 2026');
  });
  it('decodes the payout memo, and never throws on junk', () => {
    expect(memoOf(payoutData(1n, 'Pink Paw rescue treat · Luna'))).toBe('Pink Paw rescue treat · Luna');
    expect(memoOf(payoutData(1n, ''))).toBe('');
    expect(memoOf('0x' + hex64(1))).toBe('');
    expect(memoOf('0xzz')).toBe('');
  });
});

describe('fetchShelterPayouts', () => {
  it('lists chains and the newest payouts with block times', async () => {
    const deployments = [
      { chainId: 5042, address: SPLIT, fromBlock: 10 },
      { chainId: 43114, address: SPLIT },
    ];
    const f = (async (url: string, init?: RequestInit) => {
      if (url === '/d.json') return json(deployments);
      if (url.includes('avax')) return new Response('down', { status: 503 });
      const body = JSON.parse(String(init?.body));
      if (body.method === 'eth_getBlockByNumber') return json({ result: { timestamp: '0x' + (1_790_000_000 + parseInt(body.params[0], 16)).toString(16) } });
      return json({
        result: [
          { topics: [DISBURSED_TOPIC, SHELTER_TOPIC], data: payoutData(1_000_000n, 'first'), blockNumber: '0x20', transactionHash: '0x' + '01'.repeat(32) },
          { topics: [NATIVE_DISBURSED_TOPIC, SHELTER_TOPIC], data: payoutData(10n ** 16n, 'treat for Luna'), blockNumber: '0x30', transactionHash: '0x' + '02'.repeat(32) },
          { topics: ['0x' + '00'.repeat(32)], data: payoutData(5n, 'not a payout'), blockNumber: '0x31' },
        ],
      });
    }) as typeof fetch;
    const r = await fetchShelterPayouts('/d.json', f, 8000, { times: true });
    expect(r.status).toBe('ok');
    expect(amountsText(r.totals)).toBe('1.01 USDC');
    expect(r.chains.map((c) => [c.name, c.ok, c.count])).toEqual([['Arc', true, 2], ['Avalanche C-Chain', false, 0]]);
    expect(r.payouts.map((p) => p.memo)).toEqual(['treat for Luna', 'first']);
    expect(r.payouts[0]).toMatchObject({ chainName: 'Arc', explorer: 'https://explorer.arc.io', block: 0x30, time: 1_790_000_000 + 0x30, shelter: '0xe299299b846ba629f5a591dbf4f562bcc07a0f37' });
  });
  it('is empty for an empty list, and an error when nothing can be read', async () => {
    expect((await fetchShelterPayouts('/d.json', (async () => json([])) as unknown as typeof fetch)).status).toBe('empty');
    expect((await fetchShelterPayouts('/d.json', (async () => new Response('', { status: 404 })) as unknown as typeof fetch)).status).toBe('error');
    const down = (async (url: string) => (url === '/d.json' ? json([{ chainId: 5042, address: SPLIT }]) : new Response('', { status: 502 }))) as unknown as typeof fetch;
    expect((await fetchShelterPayouts('/d.json', down)).status).toBe('error');
  });
});

describe('payouts modal', () => {
  let root: HTMLElement;
  let modal: PayoutsModal | null = null;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => modal?.dispose());

  const make = (load: () => Promise<ShelterPayouts>, extra: Partial<Parameters<typeof createPayoutsModal>[1]> = {}) =>
    (modal = createPayoutsModal(root, { deploymentsUrl: '/d.json', base: '/a/', payoutsUrl: '/shelter-payouts', load, ...extra }));

  it('opens as a dialog, shows the friendly empty state, and closes on Escape with focus returned', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const m = make(async () => empty());
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    await m.show();
    expect(m.isOpen).toBe(true);
    expect(m.el.classList.contains('ch-on')).toBe(true);
    expect(m.el.getAttribute('role')).toBe('dialog');
    expect(m.el.getAttribute('aria-modal')).toBe('true');
    expect(m.el.dataset.state).toBe('empty');
    expect(m.el.textContent).toContain('First payouts land soon');
    expect(m.el.textContent).toContain('Pink Paw');
    expect(m.el.querySelector('[data-testid="payouts-how"]')).not.toBeNull();
    expect(m.el.querySelector('[data-testid="payouts-full-page"]')?.getAttribute('href')).toBe('/shelter-payouts');
    expect(m.el.contains(document.activeElement)).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(m.isOpen).toBe(false);
    expect(m.el.classList.contains('ch-on')).toBe(false);
    expect(document.activeElement).toBe(opener);
    // The game (and the UI's own Escape handler) never saw it.
    expect(behind).not.toHaveBeenCalled();
    window.removeEventListener('keydown', behind);
  });

  it('renders the total, the latest payouts and a row per chain', async () => {
    const now = Date.UTC(2026, 9, 2, 12);
    const m = make(
      async () => ({
        status: 'ok',
        totals: new Map([['USDC', 125n * 10n ** 17n]]),
        chains: [{ chainId: 5042, name: 'Arc', explorer: 'https://explorer.arc.io', address: SPLIT, totals: new Map([['USDC', 125n * 10n ** 17n]]), count: 2, ok: true }],
        payouts: [
          { chainId: 5042, chainName: 'Arc', explorer: 'https://explorer.arc.io', symbol: 'USDC', amount18: 10n ** 16n, shelter: '', memo: 'Rescue treat for Luna', tx: '0x' + '02'.repeat(32), block: 48, time: now / 1000 - 120 },
          { chainId: 5042, chainName: 'Arc', explorer: 'https://explorer.arc.io', symbol: 'USDC', amount18: 1249n * 10n ** 16n, shelter: '0xe299299b846ba629f5a591dbf4f562bcc07a0f37', memo: '', tx: '', block: 32 },
        ],
      }),
      { now: () => now },
    );
    await m.show();
    expect(m.el.dataset.state).toBe('ok');
    expect(m.el.querySelector('[data-testid="payouts-amount"]')?.textContent).toBe('12.5 USDC');
    const rows = [...m.el.querySelectorAll('[data-testid="payout-row"]')].map((r) => r.textContent);
    expect(rows[0]).toContain('Rescue treat for Luna');
    expect(rows[0]).toContain('2 min ago');
    expect(rows[0]).toContain('0.01 USDC');
    expect(rows[1]).toContain('To 0xe299…0f37');
    expect(m.el.querySelector('[data-testid="payout-row"] a')?.getAttribute('href')).toBe(`https://explorer.arc.io/tx/0x${'02'.repeat(32)}`);
    const chain = m.el.querySelector('[data-testid="chain-row"]')!;
    expect(chain.textContent).toContain('Arc');
    expect(chain.textContent).toContain('2 payouts');
    expect(chain.querySelector('a')?.getAttribute('href')).toBe(`https://explorer.arc.io/address/${SPLIT}`);
    expect(m.el.querySelector('[data-testid="payouts-how"]')).toBeNull();
  });

  it('retries once quietly, then shows a retry on RPC failure, and retrying reads again', async () => {
    let calls = 0;
    const m = make(async () => (++calls <= 2 ? { ...empty(), status: 'error' } : { ...empty(), status: 'ok', totals: new Map([['USDC', 10n ** 18n]]) }));
    await m.show();
    expect(calls).toBe(2);
    expect(m.el.dataset.state).toBe('error');
    expect(m.el.textContent).toContain("Can't reach the chain");
    const retry = m.el.querySelector('[data-testid="payouts-retry"]') as HTMLButtonElement;
    retry.focus();
    retry.click();
    // The retry button is replaced by the loading state: focus stays inside the dialog.
    expect(m.el.contains(document.activeElement)).toBe(true);
    await tick();
    expect(calls).toBe(3);
    expect(m.el.querySelector('[data-testid="payouts-amount"]')?.textContent).toBe('1 USDC');
  });

  it('shows the loading state until the read settles, and a thrown loader is an error', async () => {
    let resolve!: (v: ShelterPayouts) => void;
    const m = make(() => new Promise<ShelterPayouts>((r) => (resolve = r)));
    const done = m.show();
    expect(m.el.dataset.state).toBe('loading');
    expect(m.el.querySelector('.ch-pay-skel')).not.toBeNull();
    resolve(empty());
    await done;
    expect(m.el.dataset.state).toBe('empty');
    m.hide();
    const m2 = createPayoutsModal(root, { deploymentsUrl: '/d.json', base: '/a/', load: async () => { throw new Error('boom'); } });
    await m2.show();
    expect(m2.el.dataset.state).toBe('error');
    m2.dispose();
  });

  it('shows the give CTA and repaints it when the rail state changes', async () => {
    let live = false;
    const m = make(async () => empty(), {
      giveCta: () => {
        const el = document.createElement(live ? 'a' : 'span');
        el.textContent = live ? 'Send Pink Paw a rescue treat' : 'Opens soon';
        return el;
      },
    });
    await m.show();
    expect(m.el.querySelector('[data-testid="payouts-shelter"]')?.textContent).toContain('Opens soon');
    live = true;
    m.refreshShelter();
    expect(m.el.querySelector('[data-testid="payouts-shelter"]')?.textContent).toContain('Send Pink Paw a rescue treat');
  });

  it('keeps Tab inside the dialog and closes from the backdrop', async () => {
    const m = make(async () => empty());
    await m.show();
    const items = [...m.el.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    expect(items.length).toBeGreaterThan(1);
    items[items.length - 1].focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(items[0]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(items[items.length - 1]);
    m.el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(m.isOpen).toBe(false);
  });
});

describe('UI entry points', () => {
  let ui: UI | null = null;
  afterEach(() => {
    ui?.dispose();
    ui = null;
  });
  const manifest = { version: 1, frame: 48, cats: [], dogs: [], images: { coin: 'c.png', catnip: 'n.png', heart: 'h.png', paw: 'p.png', logo: 'l.png' } };
  const makeUI = (handlers: Record<string, () => void> = {}) => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    ui = createUI(document.getElementById('app')!, { manifest, base: '/a/', rail: false, deploymentsUrl: '/d.json', loadPayouts: async () => empty(), handlers: { onStart() {}, ...handlers } });
    return ui;
  };

  it('the title offers "Sent to shelters", which opens the modal', async () => {
    const u = makeUI();
    u.showTitle();
    const open = u.root.querySelector<HTMLButtonElement>('[data-testid="open-payouts"]')!;
    expect(open.textContent).toContain('Sent to shelters');
    open.focus();
    open.click();
    await tick();
    expect(u.payoutsOpen).toBe(true);
    expect(u.root.querySelector('[data-testid="payouts-modal"]')?.textContent).toContain('First payouts land soon');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(u.payoutsOpen).toBe(false);
    expect(document.activeElement).toBe(open);
  });

  it('showPayouts (the deep link) pauses a running heist first; Escape then leaves the pause menu up', async () => {
    const onPause = vi.fn();
    const u = makeUI({ onPause });
    u.showPayouts();
    expect(u.payoutsOpen).toBe(true);
    expect(onPause).not.toHaveBeenCalled();
    u.hidePayouts();
    // A heist screen that is not paused: the UI asks the app to pause before opening.
    u.showHUD({ meta: { title: 'T', parTicks: 0 }, coins: [], crate: { catName: 'Luna', catId: 'x' }, doors: [] } as never, ['a', 'b']);
    u.showPayouts();
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('the pause menu opens it; Escape closes only the modal and the run stays paused', async () => {
    const onResume = vi.fn();
    const u = makeUI({ onResume });
    u.showHUD({ meta: { title: 'T', parTicks: 0 }, coins: [], crate: { catName: 'Luna', catId: 'x' }, doors: [] } as never, ['a', 'b']);
    u.showPause();
    const btn = u.root.querySelector<HTMLButtonElement>('[data-testid="pause-payouts"]')!;
    expect(btn.textContent).toContain('Sent to shelters');
    btn.focus();
    btn.click();
    await tick();
    expect(u.payoutsOpen).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(u.payoutsOpen).toBe(false);
    expect(u.paused).toBe(true);
    expect(onResume).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(btn);
    // Resuming (e.g. gamepad Start) closes the modal with the pause menu.
    u.showPayouts();
    u.hidePause();
    expect(u.payoutsOpen).toBe(false);
  });

  it('the app build (not a web host) shows no entry point', () => {
    (window as unknown as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    try {
      const u = makeUI();
      u.showTitle();
      expect(u.root.querySelector('[data-testid="open-payouts"]')).toBeNull();
      u.showPayouts();
      expect(u.payoutsOpen).toBe(false);
    } finally {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }
  });
});
