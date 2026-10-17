/** L-UI: pure text formatting for the HUD, cat card and share text (tested in ui.test.ts). */
import { CHAINS, MICRO } from '../config';
import type { PayoutSnapshot, PayoutSource, RaveCat } from '../types';

/** "$9.99" for 9,995,000 micro-USD: truncated to the cent (never rounds up past the cat count). */
export const formatUsd = (micro: number) =>
  `$${(Math.floor(micro / 10_000) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Money still needed for the next cat: "3¢", "<1¢", "$0.40" stays "40¢", a full dollar "$1". */
export function formatToNext(micro: number): string {
  if (micro <= 0) return '0¢';
  if (micro >= MICRO) return '$1';
  if (micro < 10_000) return '<1¢';
  return `${Math.ceil(micro / 10_000)}¢`;
}

export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** "a wallet gift": used in shout-outs and the cat card. */
export const SOURCE_LABEL: Readonly<Record<PayoutSource, string>> = Object.freeze({
  treat: 'a free treat',
  heist: 'a Catnip Heist treat',
  wallet: 'a wallet gift',
  adoption: 'a shelter-cat adoption',
  match: 'a sponsor match',
  paws: 'a paw settlement',
  partner: 'a partner campaign',
  proof: 'a proof payout',
  campaign: 'a campaign gift',
  rave: 'a Moon Rave cat',
  gift: 'a gift',
});

export const chainShort = (chainId: number) => CHAINS[chainId]?.short ?? `chain ${chainId}`;

/** "Oct 16, 2026" in UTC, so every viewer sees the same date as the explorer. */
export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "Oct 16, 15:33 UTC" */
export function formatAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return `${day}, ${time} UTC`;
}

/**
 * Big counter lines. Always the REAL count: a `?cats=N` demo never reaches the counter, the share
 * text or the saved picture (the HUD shows the demo number separately, labelled).
 */
export function counterText(s: Pick<PayoutSnapshot, 'totalUsdMicro' | 'realCats'>): { amount: string; cats: string } {
  return { amount: formatUsd(s.totalUsdMicro), cats: `${plural(s.realCats, 'cat', 'cats')} dancing` };
}

/**
 * Demo mode (`?cats=N`) headline: the demo crowd is the big number, plainly marked, and the real
 * total moves to the small line under it, so a demo sea is never read as real money.
 */
export function demoHeadline(s: Pick<PayoutSnapshot, 'cats' | 'totalUsdMicro' | 'realCats'>): { headline: string; tag: string; real: string } {
  return {
    headline: plural(s.cats, 'cat', 'cats'),
    tag: '(demo)',
    real: `real: ${formatUsd(s.totalUsdMicro)} raised · ${plural(s.realCats, 'cat', 'cats')} dancing`,
  };
}

/** The DEMO banner: "DEMO · 2,000", or "DEMO · 10,000 (2,500 drawn)" above what this device draws. */
export function demoLine(s: Pick<PayoutSnapshot, 'demo' | 'cats'>, capacity = Infinity): string | null {
  if (!s.demo) return null;
  const drawn = s.cats > capacity ? ` (${capacity.toLocaleString('en-US')} drawn)` : '';
  return `DEMO · ${s.cats.toLocaleString('en-US')}${drawn}`;
}

/** Shelter share of a $5 shelter-cat adoption (50%, paid on-chain). */
export const ADOPT_SHARE_MICRO = 2_500_000;

/**
 * Add-sheet adopt line from the current remainder: with 77¢ already toward the next cat, $2.50
 * completes 3 cats ("3 dancing cats + 27¢ toward the next").
 */
export function adoptLine(microToNext: number): string {
  const have = MICRO - Math.min(MICRO, Math.max(0, microToNext));
  const after = (have % MICRO) + ADOPT_SHARE_MICRO;
  const n = Math.floor(after / MICRO);
  const rest = Math.floor((after % MICRO) / 10_000);
  return `$2.50 goes to the shelter on-chain: ${plural(n, 'dancing cat', 'dancing cats')}${rest ? ` + ${rest}¢ toward the next` : ''}.`;
}

/**
 * Line under the counter: says where the numbers come from and how fresh they are. After a failed
 * live read it never says "live": it says when the last good read was.
 */
export function sourceLine(s: Pick<PayoutSnapshot, 'origin' | 'stale' | 'asOf'> & { fetchFailed?: boolean; delayedChains?: readonly string[] }): string {
  if (s.origin === 'snapshot' || s.fetchFailed) return `as of ${formatAsOf(s.asOf)} · public on-chain payouts`;
  // A lagging chain index is not the viewer's concern (no "delayed" / "catching up" wording).
  return 'live · public on-chain payouts';
}

/** The empty-floor hook (SPEC.md "States"). */
export function hookLine(cats: number): string {
  if (cats === 0) return 'The floor is empty. Add the first cat.';
  if (cats < 30) return 'Fill the dance floor.';
  if (cats < 2000) return 'No sleep. Just grind.';
  return 'A sea of cats. Keep it growing.';
}

export function shoutFor(cat: RaveCat): string {
  const p = cat.payout;
  if (!p) return `Cat #${cat.index + 1} just landed!`;
  return `Cat #${cat.index + 1} just landed! Thanks to ${SOURCE_LABEL[p.source]} on ${chainShort(p.chainId)}`;
}

export interface CatCardText {
  title: string;
  amount: string;
  meta: string;
  extra: string[];
  href: string | null;
}

/** Cat card body. `siblings`: how many cats this payout's tx made (a $5 gift = 5). */
/** Token amount as money: at least two decimals ("0.1" → "0.10", "5" → "5.00", "0.012345" kept). */
export function moneyText(amount: string): string {
  const [whole, frac = ''] = amount.split('.');
  return `${whole}.${frac.padEnd(2, '0')}`;
}

/** "Oct 16" in UTC (the card's short date). */
export function formatDay(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "a 5.00", "an 8.00", "an 11.00". */
const article = (money: string) => (/^(8|11\.|18\.)/.test(money) ? 'an' : 'a');

/**
 * Cat card body. Every cat is worth exactly $1.00; the card says what that dollar was made of and
 * which payout completed it, never the completing payout as if it were the cat's value.
 * `siblings`: how many cats this payout's tx made (a $5 gift = 5).
 */
export function catCard(cat: RaveCat, siblings = 1): CatCardText {
  const title = `Cat #${(cat.index + 1).toLocaleString('en-US')}`;
  if (!cat.payout && cat.order && !cat.demo) {
    // A paid Moon Rave order's cat, dancing before its payout reaches the index.
    return {
      title,
      amount: siblings > 1 ? `1 of ${siblings} cats from a $${siblings} Moon Rave gift` : 'A $1 Moon Rave gift',
      meta: 'Paid ✓ Token Tails pays it to Pink Paw on-chain',
      extra: [],
      href: null,
    };
  }
  if (!cat.payout) {
    return { title, amount: 'Demo cat', meta: 'Not a real payout (DEMO mode)', extra: [], href: null };
  }
  const p = cat.payout;
  const money = `${moneyText(p.amountText)} ${p.symbol}`;
  const kind = SOURCE_LABEL[p.source].replace(/^an? /, '');
  const day = formatDay(cat.completedAt || p.timestamp);
  const chain = chainShort(p.chainId);
  if (siblings > 1) {
    // A gift over $1: one of the cats it made (its dollar may also hold earlier small payouts).
    return {
      title,
      amount: `1 of ${siblings} cats from ${article(money)} ${money} ${kind}`,
      meta: `${chain} · ${day}`,
      extra: [],
      href: p.explorerTxUrl,
    };
  }
  const n = Math.max(1, cat.contributors);
  return {
    title,
    amount: `$1.00 from ${plural(n, 'payout', 'payouts')}`,
    meta: n > 1 ? `completed by ${money} (${kind}, ${chain}, ${day})` : `${article(money)} ${money} ${kind} (${chain}, ${day})`,
    extra: [],
    href: p.explorerTxUrl,
  };
}

/** Share text (Web Share API / clipboard). */
export function shareText(cats: number): string {
  if (cats === 0) return 'The moon rave floor is empty. Add the first cat for the Pink Paw shelter:';
  return `${plural(cats, 'cat is', 'cats are')} dancing for the Pink Paw shelter. Add one:`;
}
