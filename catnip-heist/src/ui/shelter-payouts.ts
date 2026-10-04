/**
 * "Sent to shelters": the in-game shelter payouts modal (a DOM overlay like Pause and Results).
 *
 * It reads ShelterSplit's payout events with the same read-only RPC code as the win-screen total
 * (payouts.ts: public/payouts/deployments.json, then eth_getLogs per chain) and shows the total, a
 * row per deployment, the latest payouts, the showcase shelter and the give button. It opens from
 * the title, the pause menu and the win screen, and on load with `?payouts` or `#payouts`.
 *
 * Styled after the tokentails.com landing: the hero sky, Passion One headlines with the gold glow,
 * cream-rimmed cards on night, the gold pill.
 *
 * Keyboard: Escape closes it (and never reaches the game, so it cannot resume a paused run), Tab
 * stays inside it, and focus goes back to the button that opened it.
 */
// copy-lint: web-only the modal and its entry points render only on web hosts (ui.ts checks isWebHost), never in app builds
import { FACTS, PUBLIC_FACTS_PATH } from '../facts.generated';
import { parseShelterGoalView, shelterGoalPath, sourcesFor, type GoalSource, type GoalWallet } from '../shared-contracts/shelter-goal';
import { h } from './dom';
import { HEIST_BODY_FONT } from './fonts.generated';
import { icon } from './icons';
import { PAYOUT_CHAINS, formatAmount, isRateLimitAnswer, loadShelterPayouts, loadTestnetPayouts, retryRateLimited, type ChainRow, type PayoutRow, type ShelterPayouts } from './payouts';
import { PINK_PAW_CSS, PINK_PAW_LOGO_ALT, loadPinkPawCats, pinkPawCats, pinkPawLogoSrc, type PinkPawCatList } from './pink-paw';
import { heistRuntimeConfig } from './rail';
import { PAYOUT_CHAIN_META, TESTNET_CHAIN_IDS, payoutChainRole, receiptHref } from './shelter-payouts-chains';

/** `?payouts` (any value but 0) or `#payouts` on the page URL opens the modal on load. */
export function wantsPayoutsDeepLink(loc: { search?: string; hash?: string } | undefined): boolean {
  if (!loc) return false;
  try {
    const q = new URLSearchParams(loc.search ?? '');
    if (q.has('payouts') && q.get('payouts') !== '0' && q.get('payouts') !== 'false') return true;
  } catch {
    /* bad query: ignore */
  }
  return /^#payouts$/i.test(loc.hash ?? '');
}

/** Stablecoins first, in this order; the RPCs answer in any order, so the line never reshuffles. */
const TOKEN_ORDER = ['USDC', 'USDC.e', 'EURC', 'USDG', 'pathUSD', 'mUSDC'].map((t) => t.toUpperCase());
/** Native gas coins (a native payout on a chain whose coin is not a stablecoin): never in the headline. */
const GAS_COINS = new Set(['ETH', 'AVAX', 'MON']);
const isGas = (symbol: string) => GAS_COINS.has(symbol.toUpperCase());

/** Non-zero totals in a fixed order: stablecoins (TOKEN_ORDER), other tokens, then gas coins. */
function orderedTotals(totals: Map<string, bigint>): [string, bigint][] {
  const rank = (s: string) => {
    const i = TOKEN_ORDER.indexOf(s.toUpperCase());
    return i >= 0 ? i : isGas(s) ? 200 : 100;
  };
  return [...totals].filter(([, v]) => v > 0n).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

/** "12.5 USDC + 1 EURC", or '' when nothing has been paid yet. Always in the same token order. */
export function amountsText(totals: Map<string, bigint>): string {
  return orderedTotals(totals).map(([s, v]) => formatAmount(v, s)).join(' + ');
}

export const shortAddress = (a: string): string => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** One testnet in the testnet proof: every contract on that chain, with totals for this chain only. */
export interface TestnetCard {
  chainId: number;
  name: string;
  explorer: string;
  /** What the chain is used for (PAYOUT_CHAIN_ROLES), or ''. */
  role: string;
  /** The coins its contracts pay in, in list order ("USDC", "EURC"). */
  symbols: string[];
  contracts: ChainRow[];
  /** Test payouts on this chain only, per coin: never summed across chains or with the mainnet totals. */
  totals: Map<string, bigint>;
  count: number;
  /** Contracts on this chain whose payouts could not be read. */
  unread: number;
  /** This chain's test payouts, newest first. */
  payouts: PayoutRow[];
  /** The deploy wave's recorded proof payouts on this chain (links when the chain cannot be read). */
  proofTxs: string[];
}

/** The testnet read grouped into one card per chain, in TESTNET_CHAIN_IDS order. */
export function testnetCards(data: ShelterPayouts): TestnetCard[] {
  const by = new Map<number, TestnetCard>();
  for (const c of data.chains) {
    if (!TESTNET_CHAIN_IDS.includes(c.chainId)) continue;
    let card = by.get(c.chainId);
    if (!card) {
      const meta = PAYOUT_CHAIN_META[c.chainId];
      card = { chainId: c.chainId, name: meta?.name ?? c.name, explorer: meta?.explorer ?? c.explorer, role: payoutChainRole(c.chainId), symbols: [], contracts: [], totals: new Map(), count: 0, unread: 0, payouts: [], proofTxs: [] };
      by.set(c.chainId, card);
    }
    card.contracts.push(c);
    if (c.symbol && !card.symbols.includes(c.symbol)) card.symbols.push(c.symbol);
    if (!c.ok) card.unread++;
    for (const [sym, v] of c.totals) card.totals.set(sym, (card.totals.get(sym) ?? 0n) + v);
    card.count += c.count;
    for (const t of c.proofTxs ?? []) if (!card.proofTxs.includes(t)) card.proofTxs.push(t);
  }
  for (const p of data.payouts) by.get(p.chainId)?.payouts.push(p);
  return TESTNET_CHAIN_IDS.filter((id) => by.has(id)).map((id) => by.get(id)!);
}

/** "2027-09-30" -> "30 Sep 2027" (UTC); null for anything else. */
export function goalDateLabel(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date ("2 Oct 2026"). */
export function timeAgo(unixSec: number, nowMs: number = Date.now()): string {
  const s = Math.max(0, Math.round(nowMs / 1000 - unixSec));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  const d = new Date(unixSec * 1000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The showcase shelter (client/public/shelter-payouts/campaign.json). */
const SHELTER_NAME = 'Pink Paw (Rožinė pėdutė)';
/** Display headings carry the English name only; the Lithuanian name sits under it in the body face. */
const SHELTER_SHORT = 'Pink Paw';
const SHELTER_LOCAL = 'Rožinė pėdutė';
const LATEST = 8;

// ---------- the Pink Paw goal meter (fact C-001) ----------

/**
 * The shelter wallet as the goal meter reads it (the same reading as the web meter,
 * client/components/shelter-payouts/goal.ts), all in 18-decimal USDC.
 */
export interface GoalReading {
  balance: bigint;
  start: bigint;
  nonce: number;
}

const usdc18 = (amount: string): bigint => {
  const [w, f = ''] = amount.split('.');
  return BigInt((w || '0') + f.padEnd(18, '0').slice(0, 18));
};

type GoalFetch = (input: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

/**
 * Reads the goal's wallet from the chain: its USDC balance now and just before the campaign's first
 * block (the baked start balance when the RPC keeps no history), and its nonce. Null when the goal
 * has no wallet yet or the chain cannot be read.
 */
export async function readGoalWallet(f: GoalFetch | undefined = globalThis.fetch as unknown as GoalFetch, timeoutMs = 8000, campaign: GoalCampaign | null | undefined = FACTS['C-001'].campaign): Promise<GoalReading | null> {
  const c = campaign;
  const rpcUrl = c ? PAYOUT_CHAINS[c.chainId]?.rpc : undefined;
  if (!c?.wallet || !c.token || !rpcUrl || !f) return null;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  const signal = ctl?.signal ?? ({ aborted: false } as AbortSignal);
  // A 429 (the payout reads hit the same RPC at the same moment) is retried with backoff, as on the web meter.
  const call = (method: string, params: unknown[]): Promise<string> =>
    retryRateLimited(async (rateLimited) => {
      const res = await f(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: ctl?.signal });
      if (isRateLimitAnswer(res.status)) throw rateLimited(`${method}: HTTP 429`);
      if (!res.ok) throw new Error(`${method}: HTTP error`);
      const body = (await res.json()) as { result?: unknown; error?: { code?: number; message?: string } };
      if (body.error && isRateLimitAnswer(undefined, body.error)) throw rateLimited(`${method}: rate limited`);
      if (body.error || typeof body.result !== 'string') throw new Error(`${method}: RPC error`);
      return body.result;
    }, signal);
  const scale = 10n ** BigInt(18 - c.token.decimals);
  const data = '0x70a08231' + c.wallet.slice(2).toLowerCase().padStart(64, '0');
  const balanceAt = async (tag: string) => BigInt(await call('eth_call', [{ to: c.token!.address, data }, tag])) * scale;
  try {
    const balance = await balanceAt('latest');
    let start = usdc18(c.startBalance);
    if (c.fromBlock) {
      try {
        start = await balanceAt('0x' + (c.fromBlock - 1).toString(16));
      } catch {
        /* no archive state: keep the baked start balance */
      }
    }
    const nonce = parseInt(await call('eth_getTransactionCount', [c.wallet, 'latest']), 16);
    return { balance, start, nonce: Number.isFinite(nonce) ? nonce : 1 };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** "12.34", "50,000": thousands separators, at most two decimals (rounded down). */
export function goalFigure(v18: bigint): string {
  const cents = v18 / 10n ** 16n;
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (cents % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

/** The C-001 campaign as the facts carry it (wallets, inflow log, the balance fallback's token). */
export type GoalCampaign = NonNullable<(typeof FACTS)['C-001']['campaign']>;

/**
 * What came in to the campaign wallets, as the meter shows it: from the backend's count of the
 * Transfer logs (GET /shelter/goal/C-001), or from the balance while that is exact.
 */
export interface GoalCount {
  /** 18-decimal USDC that came in since the start. */
  raised: bigint;
  /** False while the backend is still counting older blocks: the figure is then "at least". */
  exact: boolean;
  /** What can reach the open wallet today: the only sources the line may name as counting. */
  sources: GoalSource[];
  /**
   * The backend's per-chain breakdown (18-decimal USD per chain, and the coins counted there: USDC,
   * USDC.e, USDG). Absent for the balance fallback, which reads the campaign chain only.
   */
  chains?: { chainId: number; raised: bigint; symbols: string[] }[];
  /** True for the balance fallback: only the campaign chain was read, so the figure is "at least". */
  partial?: boolean;
}

/** The holder of the wallet money reaches today. */
const openHolder = (c: GoalCampaign | null | undefined) =>
  ((c as { wallets?: GoalWallet[] } | null | undefined)?.wallets ?? []).find((w) => w.toBlock === null)?.holder ??
  ((c as { handover?: string } | null | undefined)?.handover === 'handed-over' ? 'shelter' : 'token-tails');

/**
 * The balance fallback, only while it is exact: one campaign wallet that has never sent a
 * transaction (its growth is then exactly what came in). Anything else proves nothing: null.
 */
export function countFromReading(campaign: GoalCampaign | null | undefined, reading: GoalReading | null, sources: GoalSource[] = sourcesFor(openHolder(campaign))): GoalCount | null {
  if (!reading || reading.nonce !== 0 || ((campaign as { wallets?: unknown[] } | null | undefined)?.wallets ?? []).length > 1) return null;
  const grown = reading.balance - reading.start;
  // The goal counts every chain the backend reads; this reads the campaign chain only: "at least".
  return { raised: grown > 0n ? grown : 0n, exact: false, sources, partial: true };
}

const isCampaign = (c: unknown): c is GoalCampaign =>
  !!c && typeof c === 'object' && typeof (c as { chainId?: unknown }).chainId === 'number' && Array.isArray((c as { wallets?: unknown }).wallets);

type JsonFetch = (input: string, init?: { signal?: AbortSignal; cache?: 'no-store'; credentials?: 'omit' }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

async function getJson(f: JsonFetch, url: string, timeoutMs: number): Promise<unknown> {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    const res = await f(url, { signal: ctl?.signal, cache: 'no-store', credentials: 'omit' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The campaign from the runtime facts (`factsUrl`, the same file the rail reads), so a wallet
 * change (the handover) reaches the modal without a Heist rebuild; the baked copy only when the
 * facts cannot be read.
 */
export async function loadGoalCampaign(factsUrl: string, f: JsonFetch | undefined = globalThis.fetch as unknown as JsonFetch, timeoutMs = 4000): Promise<GoalCampaign | null> {
  const baked = FACTS['C-001'].campaign ?? null;
  if (!factsUrl || !f) return baked;
  const body = (await getJson(f, factsUrl, timeoutMs)) as { facts?: { id?: string; campaign?: unknown }[] } | null;
  const live = Array.isArray(body?.facts) ? body!.facts.find((x) => x?.id === 'C-001')?.campaign : undefined;
  return isCampaign(live) ? live : baked;
}

/**
 * The meter's count: the backend's count of what came in (GET {api}/shelter/goal/C-001) first;
 * else the balance of the runtime campaign's wallet, only while that is exact. Null: unreadable.
 */
export async function readGoalCount({ apiUrl = '', factsUrl = PUBLIC_FACTS_PATH, f = globalThis.fetch as unknown, timeoutMs = 6000 }: { apiUrl?: string; factsUrl?: string; f?: unknown; timeoutMs?: number } = {}): Promise<GoalCount | null> {
  const fetcher = f as JsonFetch | undefined;
  const view = apiUrl && fetcher ? parseShelterGoalView(await getJson(fetcher, `${apiUrl.replace(/\/+$/, '')}${shelterGoalPath('C-001')}`, timeoutMs)) : null;
  if (view && view.scannedTo !== null) {
    const chains = (view.chains ?? []).map((c) => ({ chainId: c.chainId, raised: usdc18(c.raised), symbols: c.symbols }));
    return { raised: usdc18(view.raised), exact: view.upToDate, sources: view.liveSources, ...(chains.length ? { chains } : {}) };
  }
  const campaign = await loadGoalCampaign(factsUrl, fetcher);
  if (!campaign || ((campaign as { wallets?: unknown[] }).wallets ?? []).length > 1) return null;
  const reading = await readGoalWallet(f as GoalFetch | undefined, 8000, campaign);
  return countFromReading(campaign, reading, view ? view.liveSources : undefined);
}

export interface GoalView {
  raised: bigint;
  goal: bigint;
  /** 0..100, two decimals. */
  percent: number;
  /** "0.02%", "<0.01%", "0%". */
  percentText: string;
  /** False while the count does not reach the chain head yet: the figure is then "at least". */
  exact: boolean;
}

/** "Arc: 3 USDC · Robinhood Chain: 1.5 USDG": the chains where something came in, or '' with one chain. */
export function goalChainsLine(chains: GoalCount['chains']): string {
  if (!chains || chains.length < 2) return '';
  return chains
    .filter((c) => c.raised > 0n)
    .map((c) => `${PAYOUT_CHAIN_META[c.chainId]?.name ?? `chain ${c.chainId}`}: ${goalFigure(c.raised)} ${c.symbols.join(', ') || 'USDC'}`)
    .join(' · ');
}

/** Progress toward C-001 from a count of what came in. */
export function goalView(count: Pick<GoalCount, 'raised' | 'exact'>): GoalView {
  const goal = usdc18(String(FACTS['C-001'].value ?? '0'));
  const raised = count.raised > 0n ? count.raised : 0n;
  const bp = goal > 0n ? (raised * 10000n) / goal : 0n;
  const percent = Math.min(100, Number(bp) / 100);
  const percentText = raised <= 0n ? '0%' : bp >= 10000n ? '100%' : bp === 0n ? '<0.01%' : `${percent.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
  return { raised, goal, percent, percentText, exact: count.exact };
}

const SOURCE_WORDS: Record<GoalSource, string> = {
  gifts: 'gifts',
  match: "Token Tails' match",
  treats: 'treats',
  x402: 'x402 payments',
  'purchase-shares': 'shop shares',
};

const listWords = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * The meter's sources line: only what can reach the open wallet today. While Token Tails holds the
 * wallet that is sponsored treats (custody rules), plus shop shares only while the backend reports
 * them settled through the split.
 */
export function goalSourcesLine(sources: GoalSource[], chainCount = 1): string {
  const where = chainCount > 1 ? ` on ${chainCount} chains` : '';
  // claim: C-001 (the goal counts the USD stablecoins that come in to the campaign wallets), C-004 (treats)
  if (!sources.includes('gifts')) {
    const today = listWords(sources.map((x) => (x === 'treats' ? 'sponsored treats' : SOURCE_WORDS[x])));
    return `Counts what comes in to the wallet Token Tails holds for Pink Paw${where}: today, ${today || 'nothing yet'}. Gifts, the match and x402 payments count once Pink Paw holds its own wallet.`;
  }
  return `Counts the ${listWords(sources.map((x) => SOURCE_WORDS[x]))} that come in to Pink Paw's wallets${where}, read from the chain${chainCount > 1 ? 's' : ''}.`;
}

export interface PayoutsModalOptions {
  /** Deployment list (DEPLOYMENTS_URL). */
  deploymentsUrl: string;
  /** Asset base (ASSET_BASE): the hero sky, the display face and the brand images live under it. */
  base: string;
  /** The full payouts page, linked small in the footer; '' hides the link. */
  payoutsUrl?: string;
  /** The give button (or the rail's "Opens soon" badge) for the shelter card; null shows none. */
  giveCta?: () => HTMLElement | null;
  /** The rail's small print under the shelter goal (railCopy().line), cited at the call site. */
  railLine?: () => string;
  /** The heart image for the shelter card (the manifest's brand heart). Unused since the card shows the shelter's own logo; kept for callers. */
  heartSrc?: string;
  /** Show the shelter's real logo and cats on the shelter card. Default true. */
  pinkPaw?: boolean;
  /** The backend for the shelter's cats (GET {api}/cat/sale). Default: the Heist's runtime config ('' with a `load` override). */
  catsApi?: string;
  /** Cats source. Default loadPinkPawCats (live storefront, bundled copies as the fallback). */
  loadCats?: (apiUrl: string, base: string) => Promise<PinkPawCatList>;
  /** Goal meter source. Default readGoalCount (the backend's count, else the exact balance); none with a `load` override. */
  readGoal?: () => Promise<GoalCount | null>;
  /** Data source. Default loadShelterPayouts (cached per page load). */
  load?: (deploymentsUrl: string) => Promise<ShelterPayouts>;
  /** Testnet list (TESTNET_DEPLOYMENTS_URL) for the "Testnet proof" section; '' or unset hides it. */
  testnetUrl?: string;
  /** Testnet data source. Default loadTestnetPayouts; nothing (the section hides) with a `load` override. */
  loadTestnet?: (testnetUrl: string) => Promise<ShelterPayouts>;
  onClick?(): void;
  onOpen?(): void;
  onClose?(): void;
  now?: () => number;
}

export interface PayoutsModal {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  /** Open it (focus moves in) and read the chain; resolves once the data is painted. */
  show(): Promise<void>;
  hide(): void;
  /** Repaint the shelter card (the rail state changed: the give link or its badge). */
  refreshShelter(): void;
  dispose(): void;
}

const STYLE_ID = 'ch-pay-styles';
const DISPLAY = "'Passion One', 'Cat Paw', ui-rounded, system-ui, sans-serif";
const GLOW = '0 0 5px #ffe89a, 0 0 12px #ffcf66, 0 0 25px #ffb84d';

function css(base: string): string {
  return /* copy-lint-ignore R2 a stylesheet, not visible copy */ `
@font-face { font-family: 'Passion One'; font-style: normal; font-weight: 700; font-display: swap; src: url('${base}fonts/passion-one-latin-700-normal.woff2') format('woff2');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
@font-face { font-family: 'Passion One'; font-style: normal; font-weight: 700; font-display: swap; src: url('${base}fonts/passion-one-latin-ext-700-normal.woff2') format('woff2');
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
.ch-ui { --tt-night: #0b0820; --tt-night-950: #07051a; --tt-night-700: #1e1633; --tt-night-600: #2a1f45; --tt-night-500: #3a2d5c;
  --tt-gold: #ffcc55; --tt-cream: #fcecbb; --tt-lilac: #f0c5fd; --tt-muted: #9a88c9; --tt-pink: #ff7aa2; --tt-mint: #7fd66b; }
.ch-pay { z-index: 40; align-items: center; justify-content: center; user-select: text; -webkit-user-select: text;
  padding: calc(var(--ch-sat) + 10px) calc(var(--ch-sar) + 10px) calc(var(--ch-sab) + 10px) calc(var(--ch-sal) + 10px);
  background: radial-gradient(ellipse at 50% 40%, rgba(30,22,51,.55), rgba(7,5,26,.9) 75%); }
.ch-pay.ch-on { animation: ch-screen-in .22s ease-out both; }
.ch-pay-card { position: relative; width: min(800px, 100%); max-height: 100%; display: flex; flex-direction: column; overflow: hidden; outline: none;
  border: 4px solid var(--tt-cream); border-radius: 22px; background: var(--tt-night); color: var(--tt-cream);
  box-shadow: 0 0 0 3px var(--tt-night-950), 0 8px 0 var(--tt-night-950), 0 26px 60px rgba(0,0,0,.6), 0 0 28px rgba(255,204,85,.22);
  animation: ch-dialog-in .4s var(--ch-ease-pop) both; }
.ch-pay-scroll { overflow-y: auto; overscroll-behavior: contain; min-height: 0; flex: 1 1 auto; -webkit-overflow-scrolling: touch; }
.ch-pay-hero { position: relative; text-align: center; padding: 18px 56px 22px; overflow: hidden;
  background: #1a1030 url('${base}images/payouts-hero.webp') center 70% / cover no-repeat; image-rendering: pixelated; }
.ch-pay-hero::before { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg, rgba(11,8,32,.35) 0%, rgba(11,8,32,.1) 40%, rgba(11,8,32,.55) 75%, var(--tt-night) 100%); }
.ch-pay-hero > * { position: relative; }
.ch-pay-close { position: absolute; top: 10px; right: 10px; width: 44px; height: 44px; min-width: 44px; min-height: 44px; font-size: 18px; z-index: 2;
  background: var(--tt-night); box-shadow: 0 0 0 2px var(--tt-night-950); }
.ch-pay-title:focus { outline: none; }
.ch-pay-pill, .ch-pay-open { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; border: 1px solid rgba(255,204,85,.55); background: rgba(11,8,32,.72);
  padding: 6px 14px; font-family: ${DISPLAY}; font-weight: 700; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--tt-gold);
  box-shadow: 0 0 18px rgba(255,204,85,.25); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
.ch-pay-pill i, .ch-pay-open i { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--tt-gold); box-shadow: 0 0 8px var(--tt-gold); }
.ch-pay-title { margin: 10px 0 2px; font-family: ${DISPLAY}; font-weight: 700; text-transform: uppercase; letter-spacing: .01em;
  font-size: clamp(30px, 5vw + 12px, 54px); line-height: .92; color: #fff; text-shadow: 0 3px 0 var(--tt-night-950), 0 8px 22px rgba(0,0,0,.65); }
.ch-pay-total { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 8px; min-height: 96px; justify-content: center; }
.ch-pay-amount { font-family: ${DISPLAY}; font-weight: 700; font-size: clamp(46px, 9vw + 18px, 104px); line-height: .9; color: var(--tt-cream); text-shadow: ${GLOW}; text-wrap: balance; }
.ch-pay-amount.ch-pay-many { font-size: clamp(32px, 4vw + 18px, 60px); line-height: 1; }
.ch-pay-amount > span { white-space: nowrap; }
.ch-pay-amount.ch-soon { font-size: clamp(28px, 4vw + 14px, 46px); line-height: 1; }
.ch-pay-amount.ch-pay-err { color: var(--tt-lilac); text-shadow: 0 3px 0 var(--tt-night-950), 0 6px 16px rgba(0,0,0,.6); }
.ch-pay-caption { margin: 0; max-width: 34em; font-family: ${DISPLAY}; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; font-size: clamp(14px, 1vw + 11px, 19px); color: rgba(252,236,187,.92); text-shadow: 0 2px 6px rgba(0,0,0,.7); }
.ch-pay-note { margin: 0; max-width: 32em; font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 14px; line-height: 1.35; color: var(--tt-lilac); letter-spacing: 0; text-shadow: 0 1px 4px rgba(0,0,0,.8); }
.ch-pay-skel { display: inline-block; width: 4.2em; height: .85em; border-radius: 14px; font-size: clamp(46px, 9vw + 18px, 104px);
  background: linear-gradient(90deg, rgba(252,236,187,.1) 0%, rgba(252,236,187,.32) 50%, rgba(252,236,187,.1) 100%); background-size: 200% 100%; animation: ch-pay-shimmer 1.2s linear infinite; }
@keyframes ch-pay-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
.ch-pay-retry { min-height: 44px; padding: 8px 18px; font-size: 18px; margin-top: 4px; }
.ch-pay-body { padding: 4px 14px 16px; display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr); }
.ch-pay-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ch-pay-side { order: -1; }
.ch-pay-box { border-radius: 16px; border: 3px solid rgba(252,236,187,.6); background: rgba(0,0,0,.35); padding: 12px 14px; }
.ch-pay-box h3 { margin: 0 0 4px; font-family: ${DISPLAY}; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; font-size: 19px; color: var(--tt-gold); }
.ch-pay-list { list-style: none; margin: 0; padding: 0; }
.ch-pay-list li { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid rgba(154,136,201,.28); }
.ch-pay-list li:first-child { border-top: 0; }
.ch-pay-badge { flex: none; display: inline-block; vertical-align: 1px; margin-right: 6px; white-space: nowrap; padding: 2px 7px; border-radius: 999px; background: var(--tt-night-600); border: 1px solid var(--tt-night-500);
  font-family: ${HEIST_BODY_FONT}; font-weight: 800; font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: var(--tt-lilac); }
.ch-pay-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ch-pay-main b { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; line-height: 1.25; font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 15px; color: var(--tt-cream); letter-spacing: 0; }
.ch-pay-line { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 0; }
.ch-pay-tok { text-transform: none; color: var(--tt-gold); }
.ch-pay-when { white-space: nowrap; }
.ch-pay-main small, .ch-pay-main a { font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 12px; color: var(--tt-muted); letter-spacing: 0; }
.ch-pay-ui a { color: var(--tt-lilac); text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px; pointer-events: auto; }
.ch-pay-ui a:hover, .ch-pay-ui a:focus-visible { color: var(--tt-cream); }
.ch-pay-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important; }
.ch-pay-amt { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: right; }
.ch-pay-amt b { font-family: ${DISPLAY}; font-weight: 700; font-size: 21px; line-height: 1; color: var(--tt-gold); letter-spacing: .01em; white-space: nowrap; }
.ch-pay-amt small, .ch-pay-amt a { font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 12px; letter-spacing: 0; }
.ch-pay-amt small { color: var(--tt-muted); }
.ch-pay-amt .ch-pay-down { color: #ee642a; }
.ch-pay-empty { margin: 6px 0 2px; font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 14px; line-height: 1.4; color: var(--tt-lilac); letter-spacing: 0; }
.ch-pay-steps { margin: 6px 0 0; padding: 0; list-style: none; counter-reset: ch-pay; display: flex; flex-direction: column; gap: 8px; }
.ch-pay-steps li { counter-increment: ch-pay; position: relative; padding-left: 34px; font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 14px; line-height: 1.35; color: var(--tt-cream); letter-spacing: 0; }
.ch-pay-steps li::before { content: counter(ch-pay); position: absolute; left: 0; top: -1px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
  font-family: ${DISPLAY}; font-weight: 700; font-size: 15px; color: #4a1d08; background: var(--tt-gold); box-shadow: 0 0 10px rgba(255,204,85,.45); }
.ch-pay-shelter { position: relative; border-color: rgba(255,122,162,.8); background: linear-gradient(180deg, rgba(255,122,162,.24), rgba(255,122,162,.07) 70%), rgba(0,0,0,.35); text-align: left; }
.ch-pay-shelter .ch-pay-kicker { margin: 0; font-family: ${DISPLAY}; font-weight: 700; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; color: var(--tt-pink); }
.ch-pay-shelter h3 { display: flex; align-items: center; gap: 8px; margin: 2px 0 6px; font-size: 24px; line-height: 1; letter-spacing: .02em; color: var(--tt-cream); text-shadow: 0 2px 0 var(--tt-night-950); }
.ch-pay-shelter h3 img { width: 26px; height: 26px; object-fit: contain; flex: none; filter: drop-shadow(0 2px 0 var(--tt-night-950)); }
.ch-goal { margin: 8px 0 2px; display: flex; flex-direction: column; gap: 6px; }
.ch-goal-value { margin: 0; font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 14px; line-height: 1.3; color: var(--tt-cream); letter-spacing: 0; }
/* A soft glow only: the headline GLOW fills the counters of a 28px figure ("0" read as a gold blob). */
.ch-goal-value b { font-family: ${DISPLAY}; font-weight: 700; font-size: 28px; line-height: 1; color: var(--tt-gold); text-shadow: 0 2px 0 var(--tt-night-950), 0 0 8px rgba(255,204,85,.45); margin-right: 4px; }
.ch-goal-bar { height: 18px; border: 3px solid var(--tt-cream); border-radius: 9px; background: var(--tt-night-950); overflow: hidden; }
.ch-goal-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--tt-pink), var(--tt-gold)); box-shadow: 0 0 12px rgba(255,204,85,.6); transition: width .7s ease; }
.ch-goal .ch-pay-small { margin: 0 !important; }
@media (prefers-reduced-motion: reduce) { .ch-goal-bar i { transition: none; } }
.ch-pay-shelter p.ch-pay-small { margin: 6px 0 0; font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 13px; line-height: 1.4; color: var(--tt-lilac); letter-spacing: 0; }
.ch-pay-cta { margin-top: 12px; display: flex; flex-direction: column; align-items: stretch; gap: 6px; }
.ch-pay .ch-give { display: flex; align-items: center; justify-content: center; min-height: 50px; padding: 12px 16px; border: 3px solid var(--ch-ol); border-radius: 14px; background: var(--tt-pink); color: var(--ch-ol);
  font-family: ${HEIST_BODY_FONT}; font-weight: 800; font-size: 16px; letter-spacing: 0; text-decoration: none; text-align: center; text-wrap: balance; box-shadow: 0 4px 0 var(--ch-ol), inset 0 2px 0 rgba(255,255,255,.45); pointer-events: auto; }
.ch-pay .ch-give:hover, .ch-pay .ch-give:focus-visible { background: #ffb3cf; color: var(--ch-ol); transform: translateY(-1px); }
.ch-pay .ch-give:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--ch-ol); }
.ch-pay .ch-rail-chip { align-self: flex-start; display: inline-block; padding: 4px 10px; border: 1px dashed var(--tt-lilac); border-radius: 6px; color: var(--tt-lilac);
  font-family: ${HEIST_BODY_FONT}; font-weight: 800; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
.ch-pay-foot { display: flex; flex-direction: column; align-items: center; gap: 10px; padding-top: 2px; }
.ch-pay-foot .ch-btn { width: min(360px, 100%); }
.ch-pay-foot a { font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 13px; letter-spacing: 0; }
/* Entry points: the gold pill on the title (the landing's HeistPill), a plain button elsewhere. */
.ch-pay-open { align-self: center; min-height: 44px; cursor: pointer; pointer-events: auto; transition: background .15s ease, color .15s ease, transform .1s ease; }
.ch-pay-open:hover, .ch-pay-open:focus-visible { background: rgba(11,8,32,.92); color: var(--tt-cream); }
.ch-pay-open:active { transform: translateY(2px); }
.ch-pay-open img { width: 18px; height: 18px; object-fit: contain; }
.ch-rescue .ch-pay-open-sm { display: flex; width: fit-content; margin-top: 8px; min-height: 40px; padding: 6px 14px; font-size: 12px; align-self: flex-start; }
/* Testnet proof: mint-rimmed, apart from the real payouts above it. */
.ch-pay-test { border-color: rgba(127,214,107,.6); }
.ch-pay-thead { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 4px; }
.ch-pay-thead h3 { margin: 0; }
.ch-pay-testchip { display: inline-block; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--tt-mint); color: var(--tt-mint); white-space: nowrap;
  font-family: ${HEIST_BODY_FONT}; font-weight: 800; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; }
.ch-pay-tstatus { margin: 8px 0 0; font-family: ${DISPLAY}; font-weight: 700; font-size: 15px; letter-spacing: .04em; text-transform: uppercase; color: var(--tt-cream); }
.ch-pay-tcards { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr); }
.ch-pay-tcard { min-width: 0; border: 2px solid rgba(154,136,201,.45); border-radius: 12px; background: rgba(11,8,32,.55); padding: 10px 12px; }
.ch-pay-tcard h4 { margin: 0; font-family: ${DISPLAY}; font-weight: 700; font-size: 18px; line-height: 1.1; letter-spacing: .02em; color: var(--tt-cream); overflow-wrap: anywhere; }
.ch-pay-role { margin: 3px 0 6px; font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 13px; line-height: 1.35; color: var(--tt-lilac); letter-spacing: 0; }
.ch-pay-tsum { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; }
.ch-pay-tsum b { font-family: ${DISPLAY}; font-weight: 700; font-size: 20px; line-height: 1.1; color: var(--tt-gold); overflow-wrap: anywhere; }
.ch-pay-tsum small { font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 12px; color: var(--tt-muted); letter-spacing: 0; }
.ch-pay-tsum .ch-pay-down { color: #ee642a; }
.ch-pay-tlinks { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ch-pay-tlinks li { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; min-width: 0; font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 12px; color: var(--tt-muted); letter-spacing: 0; }
.ch-pay-tlinks li > b { font-family: ${HEIST_BODY_FONT}; font-weight: 800; font-size: 13px; color: var(--tt-cream); }
.ch-pay-tlinks .ch-pay-badge { margin-right: 0; }
/* Explorer and Receipt wrap together, never one link alone on a line. */
.ch-pay-txl { display: inline-flex; flex-wrap: nowrap; gap: 10px; white-space: nowrap; }
/* Phones: Close gets its own row above the scroller, so it never covers the right edge of a row. */
@media (max-width: 719px) {
  .ch-pay-close { position: relative; top: auto; right: auto; flex: none; align-self: flex-end; margin: 6px 6px 0; }
  .ch-pay-hero { padding: 6px 16px 22px; }
}
@media (min-width: 720px) {
  .ch-pay-hero { padding: 22px 64px 26px; }
  .ch-pay-body { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); padding: 4px 22px 20px; align-items: start; gap: 16px; }
  /* The shelter card stays in view while the payouts and cats scroll past it. */
  /* Below the Close button, which sits over the card's top-right corner. */
  .ch-pay-side { order: 0; position: sticky; top: 64px; }
  .ch-pay-foot { grid-column: 1 / -1; flex-direction: row-reverse; justify-content: space-between; }
  .ch-pay-foot .ch-btn { width: auto; min-width: 260px; }
}
@media (max-height: 560px) and (min-width: 600px) {
  .ch-pay-hero { padding: 10px 60px 12px; }
  .ch-pay-title { font-size: 30px; margin-top: 6px; }
  .ch-pay-total { min-height: 0; }
  .ch-pay-amount { font-size: 54px; }
}
@media (prefers-reduced-motion: reduce) { .ch-pay-skel { animation: none; } }
${PINK_PAW_CSS}`;
}

function ensureStyles(base: string): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css(base);
  document.head.appendChild(el);
}

const ext = (href: string, text: string, attrs: Record<string, string> = {}) =>
  h('a', { href, target: '_blank', rel: 'noopener noreferrer', ...attrs }, text);

export function createPayoutsModal(root: HTMLElement, opts: PayoutsModalOptions): PayoutsModal {
  ensureStyles(opts.base);
  const load = opts.load ?? loadShelterPayouts;
  const now = opts.now ?? (() => Date.now());
  const pinkPaw = opts.pinkPaw ?? true;
  const loadCats = opts.loadCats ?? loadPinkPawCats;
  const testnetUrl = opts.testnetUrl ?? '';
  // A caller that brings its own payouts (`load`: tests, the UI bench) reads nothing live by default:
  // no wallet read and the bundled cats, unless it passes readGoal or catsApi too.
  const live = !opts.load;
  const runtime = live && typeof window !== 'undefined' ? heistRuntimeConfig(window as never, document) : null;
  // The backend's count first (it reads the runtime campaign, so a handover needs no Heist rebuild).
  const readGoal = opts.readGoal ?? (runtime ? () => readGoalCount({ apiUrl: runtime.apiUrl, factsUrl: runtime.factsUrl }) : async () => null);
  const catsApi = opts.catsApi ?? (runtime ? runtime.apiUrl : '');
  const loadTestnet = opts.loadTestnet ?? (live ? loadTestnetPayouts : null);
  /** The live cats once loaded (kept across repaints and opens; a bundled fallback is retried on the next open); the goal count of this open. */
  let cats: PinkPawCatList | null = null;
  let goal: { state: 'loading' | 'ok' | 'error'; count: GoalCount | null } = { state: 'loading', count: null };
  let open = false;
  let opener: HTMLElement | null = null;
  let run = 0;

  const close = h('button.ch-btn.ch-icon.ch-ghost.ch-pay-close', { type: 'button', 'aria-label': 'Close', 'data-testid': 'payouts-close' }, icon('close'));
  close.addEventListener('click', () => {
    opts.onClick?.();
    hide();
  });
  // claim: L-disbursed (the modal shows the live on-chain payouts)
  const title = h('h2.ch-pay-title#ch-pay-title', { tabindex: '-1' }, 'Sent to shelters');
  const total = h('div.ch-pay-total', { 'aria-live': 'polite', 'data-testid': 'payouts-total' });
  const hero = h(
    'header.ch-pay-hero',
    null,
    h('p.ch-pay-pill', { style: 'margin:0' }, h('i', { 'aria-hidden': 'true' }), 'Public, on-chain'),
    title,
    total,
  );
  const lists = h('div.ch-pay-col');
  const side = h('div.ch-pay-col.ch-pay-side');
  const back = h('button.ch-btn.ch-primary', { type: 'button', 'data-testid': 'payouts-back' }, h('span', null, 'Back to the heist'));
  back.addEventListener('click', () => {
    opts.onClick?.();
    hide();
  });
  const fullPage = opts.payoutsUrl ? ext(opts.payoutsUrl, 'Open the full payouts page ↗', { 'data-testid': 'payouts-full-page' }) : null;
  const body = h('div.ch-pay-body', null, lists, side, h('div.ch-pay-foot', null, back, fullPage));
  // One scroller for the hero and the lists (the hero scrolls away on a phone); Close stays put.
  const scroller = h('div.ch-pay-scroll', null, hero, body);
  const card = h('div.ch-pay-card', null, close, scroller);
  const el = h(
    'section.ch-screen.ch-modal.ch-pay.ch-pay-ui',
    { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ch-pay-title', 'data-testid': 'payouts-modal' },
    card,
  );
  el.addEventListener('pointerdown', (e) => {
    if (e.target === el) {
      e.preventDefault();
      hide();
    }
  });
  root.appendChild(el);

  /** The live goal meter: what came in to Pink Paw's campaign wallets, against the goal (fact C-001). */
  function goalMeter(): HTMLElement {
    const view = goal.count ? goalView(goal.count) : null;
    const fill = h('i', { style: `width:${view ? Math.max(view.raised > 0n ? 2 : 1.5, view.percent) : 1.5}%` });
    const bar = h('div.ch-goal-bar', {
      role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100',
      'aria-label': 'Pink Paw goal progress',
      ...(view ? { 'aria-valuenow': String(view.percent), 'aria-valuetext': `${view.percentText} of the goal` } : { 'aria-valuetext': goal.state === 'loading' ? 'Counting' : 'Not read' }),
    }, fill);
    const target = goalFigure(view?.goal ?? usdc18(String(FACTS['C-001'].value ?? '0')));
    const value = view
      ? h('p.ch-goal-value', { 'data-testid': 'payouts-goal-value' }, h('b', null, `${view.exact ? '' : 'at least '}${goalFigure(view.raised)}`), ` of the ${target} USDC goal for Pink Paw`)
      : h('p.ch-goal-value', { 'data-testid': 'payouts-goal-value' }, h('b', null, goal.state === 'loading' ? '…' : '?'), ` of the ${target} USDC goal for Pink Paw`);
    // claim: C-001 (the goal counts the USDC that comes in to the campaign wallets; only today's sources are named)
    const line = view && goal.count
      ? `${view.percentText} of the goal${view.exact ? '' : goal.count.partial ? ' (read from one chain only right now)' : ' (still counting older blocks)'}. ${goalSourcesLine(goal.count.sources, (goal.count.chains ?? []).length)}`
      : goal.state === 'loading'
        ? 'Counting what came in to Pink Paw…'
        : "Can't read the count right now. Try again in a minute.";
    // The goal is said once (the value line names it); the date sits under the bar, as on the web meter.
    const by = goalDateLabel(FACTS['C-001'].goal?.endDate);
    return h(
      'div.ch-goal',
      { 'data-testid': 'payouts-goal', 'data-claim': 'C-001', 'data-state': goal.state },
      value,
      bar,
      goal.count && goalChainsLine(goal.count.chains) ? h('p.ch-pay-small', { 'data-testid': 'payouts-goal-chains' }, goalChainsLine(goal.count.chains)) : null,
      h('p.ch-pay-small', null, line),
      by ? h('p.ch-pay-small', { 'data-testid': 'payouts-goal-date' }, `Goal date: ${by}`) : null,
    );
  }

  let goalRun = 0;
  async function refreshGoal() {
    const mine = ++goalRun;
    goal = { state: 'loading', count: null };
    let count: GoalCount | null = null;
    try {
      count = await readGoal();
    } catch {
      count = null;
    }
    if (mine !== goalRun || !open) return;
    goal = count ? { state: 'ok', count } : { state: 'error', count: null };
    // Only the meter is repainted: the give button keeps its node, so keyboard focus stays on it.
    const meter = side.querySelector('[data-testid=payouts-goal]');
    if (meter) meter.replaceWith(goalMeter());
    else side.replaceChildren(shelterCard());
  }

  function shelterCard(): HTMLElement {
    const cta = opts.giveCta?.() ?? null;
    const line = opts.railLine?.() ?? '';
    return h(
      'section.ch-pay-box.ch-pay-shelter',
      { 'data-testid': 'payouts-shelter' },
      h('p.ch-pay-kicker', null, 'Showcase shelter'),
      pinkPaw
        ? h(
            'div.ch-pp-head',
            null,
            h('img.ch-pp-logo', { src: pinkPawLogoSrc(opts.base), alt: PINK_PAW_LOGO_ALT, 'data-testid': 'pink-paw-logo' }),
            h('div', null, h('h3', null, SHELTER_SHORT), h('p.ch-pp-local', { lang: 'lt' }, SHELTER_LOCAL)),
          )
        : h('h3', null, h('img', { src: opts.heartSrc ?? `${opts.base}images/heart.webp`, alt: '' }), SHELTER_NAME),
      // claim: C-001 (the goal and its date are in the meter: "… of the 50,000 USDC goal for Pink Paw", "Goal date")
      goalMeter(),
      // claim: C-004, L-rail (the rail line from railCopy)
      line ? h('p.ch-pay-small', { 'data-claim': 'L-rail' }, line) : null,
      h('p.ch-pay-small', null, "Token Tails holds this shelter's wallet on its behalf until handover. Every payout is listed here."),
      cta ? h('div.ch-pay-cta', null, cta) : null,
    );
  }

  /** The shelter's real cats: card art with the shelter's photo of each cat. */
  function catsBox(shown: PinkPawCatList | null = cats): HTMLElement {
    const box = h('section.ch-pay-box', { 'data-testid': 'payouts-pink-paw' }, h('h3', null, "Pink Paw's cats"));
    if (shown) {
      box.append(pinkPawCats(opts.base, shown.cats, opts.payoutsUrl, undefined, shown.complete !== false));
      box.dataset.source = shown.source;
      return box;
    }
    box.append(h('p.ch-pay-empty', { 'data-testid': 'pink-paw-loading' }, "Loading the shelter's cats…"));
    void loadCats(catsApi, opts.base).then((list) => {
      // Only a live list is kept: the bundled fallback is shown now and the live read retried on the next open.
      if (list.source === 'live') cats = list;
      // A repaint may have replaced this box already; the new one renders the cats itself.
      if (box.isConnected) box.replaceWith(catsBox(list));
    });
    return box;
  }

  function paintLoading() {
    total.setAttribute('aria-busy', 'true');
    total.replaceChildren(h('span.ch-pay-skel', { 'aria-hidden': 'true' }), h('p.ch-pay-note', null, 'Reading the chain…'));
    const loading = h('section.ch-pay-box', null, h('h3', null, 'Latest payouts'), h('p.ch-pay-empty', null, 'Loading the latest payouts…'));
    lists.replaceChildren(...(pinkPaw ? [loading, catsBox()] : [loading]), testSection);
  }

  function payoutItem(p: PayoutRow): HTMLElement {
    // The deploy wave's proof payouts carry an internal memo ("verify arbitrum native"): name them plainly.
    const memo = /^verify\s/i.test(p.memo) ? 'Network check payout' : p.memo;
    const label = memo || (p.shelter ? `To ${shortAddress(p.shelter)}` : 'Payout');
    const when = p.time !== undefined ? timeAgo(p.time, now()) : p.block ? `block ${p.block.toLocaleString('en-US')}` : '';
    return h(
      'li',
      { 'data-testid': 'payout-row' },
      h('span.ch-pay-main', null, h('b', { title: label }, label), h('small', null, h('span.ch-pay-badge', null, p.chainName), when ? h('span.ch-pay-when', null, when) : null)),
      h(
        'span.ch-pay-amt',
        null,
        h('b', null, formatAmount(p.amount18, p.symbol)),
        p.tx && p.explorer ? ext(`${p.explorer}/tx/${p.tx}`, 'View tx ↗', { 'aria-label': `View transaction on ${p.chainName}` }) : null,
      ),
    );
  }

  function chainItem(c: ChainRow): HTMLElement {
    const amount = amountsText(c.totals);
    return h(
      'li',
      { 'data-testid': 'chain-row' },
      h(
        'span.ch-pay-main',
        null,
        h('b', null, c.name),
        h(
          'span.ch-pay-line',
          null,
          c.symbol ? h('span.ch-pay-badge.ch-pay-tok', { 'data-testid': 'chain-token', title: `Pays out in ${c.symbol}` }, c.symbol) : null,
          c.explorer ? ext(`${c.explorer}/address/${c.address}`, shortAddress(c.address), { class: 'ch-pay-mono', 'aria-label': `Contract ${c.address} on ${c.name}` }) : h('small.ch-pay-mono', null, shortAddress(c.address)),
        ),
      ),
      h(
        'span.ch-pay-amt',
        null,
        !c.ok ? h('small.ch-pay-down', null, 'Could not read') : amount ? h('b', null, amount) : h('small', null, 'No payouts yet'),
        c.ok && c.count ? h('small', null, `${c.count} payout${c.count === 1 ? '' : 's'}`) : null,
      ),
    );
  }

  // ---------- testnet proof (its own list and totals, never in the real figures above) ----------

  /** Stays in the list column, after the real payouts and the cats; repainted when its read lands. */
  const testSection = h('section.ch-pay-box.ch-pay-test', { 'data-testid': 'payouts-testnet', 'aria-labelledby': 'ch-pay-test-title' });
  testSection.hidden = !(testnetUrl && loadTestnet);
  let testRun = 0;

  /** "Explorer ↗ · Receipt ↗" for one transaction: the chain's explorer and the website receipt. */
  function txLinks(chainId: number, chainName: string, explorer: string, tx: string): (HTMLElement | null)[] {
    const receipt = receiptHref(opts.payoutsUrl ?? '', chainId, tx);
    return [
      explorer ? ext(`${explorer}/tx/${tx}`, 'Explorer ↗', { 'aria-label': `View the test transaction on ${chainName}` }) : null,
      receipt ? ext(receipt, 'Receipt ↗', { 'data-testid': 'testnet-receipt', 'aria-label': `Receipt for the test payout on ${chainName}` }) : null,
    ];
  }

  function testnetCard(c: TestnetCard): HTMLElement {
    const amount = amountsText(c.totals);
    const allDown = c.unread === c.contracts.length;
    const sum = allDown
      ? [h('small.ch-pay-down', null, 'Could not read right now')]
      : [
          amount ? h('b', { 'data-testid': 'testnet-total' }, amount) : h('small', { 'data-testid': 'testnet-total' }, 'No test payouts yet'),
          c.count ? h('small', null, `${c.count} test payout${c.count === 1 ? '' : 's'}`) : null,
          c.unread ? h('small.ch-pay-down', null, `${c.unread} contract${c.unread === 1 ? '' : 's'} not read`) : null,
        ];
    const contracts = c.contracts.map((k) =>
      h(
        'li',
        null,
        k.symbol ? h('span.ch-pay-badge.ch-pay-tok', { 'data-testid': 'testnet-token', title: `Pays out in ${k.symbol}` }, k.symbol) : null,
        c.explorer ? ext(`${c.explorer}/address/${k.address}`, shortAddress(k.address), { class: 'ch-pay-mono', 'aria-label': `Test contract ${k.address} on ${c.name}` }) : h('span.ch-pay-mono', null, shortAddress(k.address)),
      ),
    );
    // The newest test payouts read from the chain; when none could be read, the recorded proof payouts.
    const shown = c.payouts.slice(0, 2).map((p) =>
      h(
        'li',
        { 'data-testid': 'testnet-payout' },
        h('b', null, formatAmount(p.amount18, p.symbol)),
        p.time !== undefined ? h('span.ch-pay-when', null, timeAgo(p.time, now())) : null,
        p.tx ? h('span.ch-pay-txl', null, ...txLinks(c.chainId, c.name, c.explorer, p.tx)) : null,
      ),
    );
    const proofs = c.payouts.length ? [] : c.proofTxs.slice(0, 2).map((tx) => h('li', { 'data-testid': 'testnet-proof-tx' }, h('span', null, 'Proof payout'), h('span.ch-pay-txl', null, ...txLinks(c.chainId, c.name, c.explorer, tx))));
    return h(
      'li.ch-pay-tcard',
      { 'data-testid': 'testnet-card', 'data-chain': String(c.chainId) },
      h('h4', null, c.name),
      c.role ? h('p.ch-pay-role', null, c.role) : null,
      h('div.ch-pay-tsum', null, ...sum),
      h('ul.ch-pay-tlinks', { 'aria-label': `Test contracts on ${c.name}` }, ...contracts),
      shown.length || proofs.length ? h('ul.ch-pay-tlinks', { 'aria-label': `Test payouts on ${c.name}` }, ...shown, ...proofs) : null,
    );
  }

  function paintTestnet(state: 'loading' | ShelterPayouts) {
    const head = h(
      'div.ch-pay-thead',
      null,
      h('h3#ch-pay-test-title', null, 'Testnet proof'),
      h('span.ch-pay-testchip', { 'data-testid': 'testnet-label' }, 'Test coins · no real money'),
    );
    const intro = h(
      'p.ch-pay-empty',
      null,
      'Before the mainnet launch, the same payout contract runs on the test network of each chain below. These payouts use test coins with no value, so they never count toward the total above.',
    );
    if (state === 'loading') {
      testSection.hidden = false;
      testSection.replaceChildren(head, intro, h('p.ch-pay-tstatus', { 'aria-live': 'polite' }, 'Reading the test networks…'));
      return;
    }
    const cards = testnetCards(state);
    // Nothing deployed on a testnet (or no list in this build): no section.
    if (!cards.length && state.status !== 'error') {
      testSection.hidden = true;
      testSection.replaceChildren();
      return;
    }
    testSection.hidden = false;
    if (!cards.length) {
      const retry = h('button.ch-btn.ch-ghost.ch-pay-retry', { type: 'button', 'data-testid': 'testnet-retry' }, h('span', null, 'Try again'));
      retry.addEventListener('click', () => {
        opts.onClick?.();
        title.focus({ preventScroll: true });
        void refreshTestnet();
      });
      testSection.replaceChildren(head, intro, h('p.ch-pay-empty', null, "Can't read the test networks right now."), retry);
      return;
    }
    const count = cards.reduce((n, c) => n + c.count, 0);
    const contracts = cards.reduce((n, c) => n + c.contracts.length, 0);
    // A contract that could not be read hides its payouts: say the count is a floor and how many were read.
    const unread = cards.reduce((n, c) => n + c.unread, 0);
    const payouts = `${unread ? 'at least ' : ''}${count} test payout${count === 1 ? '' : 's'}`;
    const read = unread ? ` · ${contracts - unread} of ${contracts} contracts read` : '';
    testSection.replaceChildren(
      head,
      intro,
      h(
        'p.ch-pay-tstatus',
        { 'aria-live': 'polite', 'data-testid': 'testnet-status' },
        `Live on ${cards.length} testnet${cards.length === 1 ? '' : 's'} · ${payouts} on ${contracts} contract${contracts === 1 ? '' : 's'}${read}`,
      ),
      h('ul.ch-pay-tcards', null, ...cards.map(testnetCard)),
    );
  }

  async function refreshTestnet(): Promise<void> {
    if (!testnetUrl || !loadTestnet) return;
    const mine = ++testRun;
    paintTestnet('loading');
    let data: ShelterPayouts;
    try {
      data = await loadTestnet(testnetUrl);
    } catch {
      data = { status: 'error', totals: new Map(), chains: [], payouts: [] };
    }
    if (mine !== testRun || !open) return;
    paintTestnet(data);
  }

  function howItWorks(): HTMLElement {
    return h(
      'section.ch-pay-box',
      { 'data-testid': 'payouts-how' },
      h('h3', null, 'How it works'),
      h(
        'ol.ch-pay-steps',
        null,
        // claim:fiction the first step is the in-game rescue, no money moves in the game itself
        h('li', null, 'Free the shelter cat in a heist.'),
        // claim: C-004, L-rail (the treat is Token Tails' own, and only while the rail is open)
        h('li', null, 'Tap the rescue treat: while treats are open, Token Tails sends Pink Paw a small treat.'),
        // claim: L-disbursed (every payout is a public chain event, listed here)
        h('li', null, 'Every payout shows up right here, with a link to check it on the chain.'),
      ),
    );
  }

  function retryButton(): HTMLElement {
    const retry = h('button.ch-btn.ch-ghost.ch-pay-retry', { type: 'button', 'data-testid': 'payouts-retry' }, h('span', null, 'Try again'));
    retry.addEventListener('click', () => {
      opts.onClick?.();
      // The button is about to be replaced: keep focus inside the dialog.
      title.focus({ preventScroll: true });
      void refresh();
    });
    return retry;
  }

  function paint(data: ShelterPayouts) {
    total.removeAttribute('aria-busy');
    const amount = amountsText(data.totals);
    // Networks whose RPC could not be read: their payouts are missing from the total, so say so.
    const down = data.status === 'error' ? 0 : data.chains.filter((c) => !c.ok).length;
    const downNote = down
      ? [h('p.ch-pay-note', { 'data-testid': 'payouts-partial' }, `${down} payout contract${down === 1 ? '' : 's'} could not be read right now, so ${down === 1 ? 'its' : 'their'} payouts are not counted yet.`), retryButton()]
      : [];
    if (data.status === 'error') {
      total.replaceChildren(
        h('b.ch-pay-amount.ch-soon.ch-pay-err', null, "Can't reach the chain"),
        h('p.ch-pay-note', null, "We couldn't read the payouts just now. Check your connection and try again."),
        retryButton(),
      );
    } else if (amount) {
      // Stablecoins make the headline; a native gas coin (ETH, AVAX) goes on a smaller line under it.
      const sorted = orderedTotals(data.totals);
      const stable = sorted.filter(([s]) => !isGas(s));
      const head = stable.length ? stable : sorted;
      const gas = stable.length ? sorted.filter(([s]) => isGas(s)) : [];
      const parts = head.flatMap(([s, v], i) => [i ? ' + ' : null, h('span', null, formatAmount(v, s))]);
      total.replaceChildren(
        h(head.length > 2 ? 'b.ch-pay-amount.ch-pay-many' : 'b.ch-pay-amount', { 'data-testid': 'payouts-amount' }, ...parts),
        ...(gas.length ? [h('p.ch-pay-note', { 'data-testid': 'payouts-gas' }, `Plus ${gas.map(([s, v]) => formatAmount(v, s)).join(' and ')} in network coins`)] : []),
        // claim: L-disbursed (the live on-chain total; "Token Tails has sent {amount} to shelters")
        h('p.ch-pay-caption', { 'data-claim': 'L-disbursed' }, down ? 'Token Tails has sent at least this to shelters so far' : 'Token Tails has sent this to shelters so far'),
        ...downNote,
      );
    } else {
      total.replaceChildren(
        h('b.ch-pay-amount.ch-soon', { 'data-testid': 'payouts-soon' }, 'First payouts land soon'),
        // claim: L-disbursed (future tense: nothing has been paid out yet)
        h('p.ch-pay-note', null, 'Each one will show up here the moment it happens, with a link to check it on the chain.'),
        ...downNote,
      );
    }

    const sections: HTMLElement[] = [];
    if (data.payouts.length) {
      sections.push(h('section.ch-pay-box', { 'data-testid': 'payouts-latest' }, h('h3', null, 'Latest payouts'), h('ul.ch-pay-list', null, ...data.payouts.slice(0, LATEST).map(payoutItem))));
    }
    if (data.chains.length) {
      sections.push(h(
          'section.ch-pay-box',
          { 'data-testid': 'payouts-chains' },
          h('h3', null, 'Payout contracts by network'),
          h('p.ch-pay-empty', null, 'Each network runs its own open payout contract, labelled with the coin it pays in. Tap an address to check it on that network\'s explorer.'),
          h('ul.ch-pay-list', null, ...data.chains.map(chainItem)),
        ));
    }
    if (!data.payouts.length && data.status !== 'error') sections.unshift(howItWorks());
    if (!sections.length) sections.push(howItWorks());
    if (pinkPaw) sections.push(catsBox());
    // The testnet proof always comes after the real payouts.
    lists.replaceChildren(...sections, testSection);
    el.dataset.state = data.status === 'ok' && !amount ? 'empty' : data.status;
  }

  async function refresh(): Promise<void> {
    const mine = ++run;
    paintLoading();
    el.dataset.state = 'loading';
    const attempt = async (): Promise<ShelterPayouts> => {
      try {
        return await load(opts.deploymentsUrl);
      } catch {
        return { status: 'error', totals: new Map(), chains: [], payouts: [] };
      }
    };
    // One quiet retry before showing the error (a slow first load at boot can time out).
    let data = await attempt();
    if (data.status === 'error' && mine === run) data = await attempt();
    if (mine !== run) return;
    paint(data);
  }

  const focusables = () =>
    Array.from(card.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter((n) => !n.closest('[hidden]'));

  // Capture on window: runs before the input controller (Escape = pause/resume) and the UI's own
  // Escape handler, so no key reaches the game while the modal is open.
  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) hide();
      return;
    }
    e.stopImmediatePropagation();
    if (e.key === 'Tab') {
      const items = focusables();
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && card.contains(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (open) e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  function show(): Promise<void> {
    if (!open) {
      open = true;
      const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
      opener = active && active !== document.body ? active : null;
      goal = { state: 'loading', count: null };
      side.replaceChildren(shelterCard());
      el.classList.add('ch-on');
      scroller.scrollTop = 0;
      // The heading takes focus (the dialog is announced by name); Tab moves on from there.
      title.focus({ preventScroll: true });
      opts.onOpen?.();
    }
    void refreshGoal();
    void refreshTestnet();
    return refresh();
  }

  function hide() {
    if (!open) return;
    open = false;
    run++;
    testRun++;
    el.classList.remove('ch-on');
    const back = opener;
    opener = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
    opts.onClose?.();
  }

  return {
    el,
    get isOpen() {
      return open;
    },
    show,
    hide,
    refreshShelter() {
      if (open) side.replaceChildren(shelterCard());
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      el.remove();
    },
  };
}
