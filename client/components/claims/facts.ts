import { FACT_IDS, FACTS, FactId, PublicFact } from "@/lib/facts.generated";

/** A public registry entry by id, or null when the id is not (or no longer) public. */
export function publicFact(id: string): PublicFact | null {
  return (FACTS as Record<string, PublicFact | undefined>)[id] ?? null;
}

/** Every public entry, in registry order. /impact lists all of them. */
export function allPublicFacts(): PublicFact[] {
  return FACT_IDS.map((id) => FACTS[id]);
}

export type FactValues = Partial<
  Record<"n" | "amount" | "state", string | number>
>;

/**
 * The words to show for an entry: `appDisplay` in app builds when it has one, with the live
 * placeholders (`{n}`, `{amount}`, `{state}`) filled in. An unfilled placeholder yields null, so a
 * live figure the snapshot does not have is never shown as "{n} players".
 */
export function factText(
  fact: PublicFact,
  values: FactValues = {},
  isApp = false
): string | null {
  const template = (isApp && fact.appDisplay) || fact.display;
  let missing = false;
  const text = template.replace(
    /\{(n|amount|state)\}/g,
    (_, key: keyof FactValues) => {
      const v = values[key];
      if (v === undefined || v === null || v === "") {
        missing = true;
        return "";
      }
      return typeof v === "number" ? v.toLocaleString("en-US") : String(v);
    }
  );
  if (missing) return null;
  // "{n} partner countries" with n = 1 reads "1 partner country": the noun right after {n}, or
  // after one modifier word, loses its plural ending. Templates name plain plurals only.
  return values.n === 1 ? singularAfterOne(text) : text;
}

function singularAfterOne(text: string): string {
  return text.replace(/\b1 ((?:[a-z]+ )?)([a-z]+?)(ies|s)\b/, (_m, lead: string, stem: string, ending: string) =>
    `1 ${lead}${stem}${ending === "ies" ? "y" : ""}`
  );
}

/** "2026", "2026-04", "2026-04-17" or an ISO timestamp, as the last instant it can mean. */
export function parseFactDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(value);
  if (m) {
    const year = Number(m[1]);
    if (!m[2]) return new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    const month = Number(m[2]) - 1;
    if (!m[3]) return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
    return new Date(Date.UTC(year, month, Number(m[3]), 23, 59, 59));
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

const DAY_MS = 86_400_000;

/**
 * Whether an entry is past its `maxAgeDays` (the STALE chip). Static entries age from `checkedAt`;
 * live entries age from the snapshot date they were read from (`liveAsOf`), and a live entry with
 * no snapshot date is stale. Entries with `maxAgeDays: null` (SEI-era history) never go stale.
 */
export function isStale(
  fact: PublicFact,
  now: Date,
  liveAsOf?: string | null
): boolean {
  if (fact.maxAgeDays === null || fact.maxAgeDays === undefined) return false;
  const reference =
    fact.status === "live"
      ? parseFactDate(liveAsOf ?? null)
      : parseFactDate(fact.checkedAt);
  if (!reference) return true;
  return now.getTime() - reference.getTime() > fact.maxAgeDays * DAY_MS;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "1 Oct 2026", "Apr 2026" or "2026", matching the precision of the source date. UTC. */
export function formatFactDate(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(value);
  if (m) {
    if (!m[2]) return m[1];
    const month = MONTHS[Number(m[2]) - 1];
    return m[3] ? `${Number(m[3])} ${month} ${m[1]}` : `${month} ${m[1]}`;
  }
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** True when the words already carry their date, e.g. "180K+ on X (Sep 2026)". */
export function textHasDate(text: string): boolean {
  return /\((?:[^)]*\b)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* \d{4}|\(\d{4}\)/.test(
    text
  );
}

/**
 * Splits "540K+ registered players, all time (Apr 2026, company-reported)" into the figure and the
 * rest, for stat cards. Text that does not start with a figure comes back whole as `rest`.
 */
export function splitFigure(text: string): {
  figure: string | null;
  rest: string;
} {
  const m = /^([$€£]?\d[\d.,]*[KMB]?\+?)\s+(.*)$/.exec(text);
  return m ? { figure: m[1], rest: m[2] } : { figure: null, rest: text };
}

export type { FactId, PublicFact };

/**
 * Check-only API mirrors (a script reads them) and the public page a reader should open instead.
 * The registry should list the public page itself (request to 2c for F-011); this keeps a mirror
 * from ever showing as the source of a claim.
 */
const MIRROR_HOSTS: Record<string, string> = {
  "api.fxtwitter.com": "x.com",
  "api.vxtwitter.com": "x.com",
};

/** The URL to show as a claim's source: http(s) only, mirrors mapped to the public page. */
export function publicSourceUrl(
  url: string | null | undefined
): { href: string; host: string } | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const mapped = MIRROR_HOSTS[parsed.host.toLowerCase()];
  if (mapped) {
    parsed = new URL(`https://${mapped}${parsed.pathname}`);
  }
  return { href: parsed.toString(), host: parsed.host };
}

/**
 * App-build words (R10): the same list as tools/copy-lint/lib/rules.mjs `APP_WORDS`. A registry
 * entry with one of these in its app wording is web only.
 */
const APP_WORDS: RegExp[] = [
  /\bUSDC\b/,
  /\b0x[0-9a-fA-F]{6,}/,
  /\b(?:block|chain|tx)[\s-]?explorers?\b|\b(?:on|in|the|an?|via)\s+explorers?\b|\bexplorers?\s+(?:links?|pages?|url)\b|\b(?:etherscan|arcscan|blockscout|stellar\.expert|stellarchain)\b/i,
  /\bwallets?\b/i,
  /\b(?:Stellar|Soroban|SEI|Ethereum|Solana|SKALE|Polygon|Mantle|Arbitrum|Monad|Mezo|Avalanche)\b|\bArc\b(?!\w)/,
  /\bon-?chain\b/i,
];

/** Whether words are safe for an app build (no USDC, hash, explorer, wallet or chain words). */
export function appSafeText(text: string): boolean {
  return !APP_WORDS.some((re) => re.test(text));
}

/** Whether an entry can show in an app build: its app wording (or display) has no R10 words. */
export function shownInApp(fact: PublicFact): boolean {
  return appSafeText((fact.appDisplay || fact.display).replace(/\{\w+\}/g, ""));
}
