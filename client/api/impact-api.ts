import BASELINE from "../public/impact/snapshot.json";
import { apiUrl } from "./api";

/*
 * The public impact snapshot (plan F7.3). Client copy of the shape in
 * backend/src/impact/impact-public.ts; GET /impact, the CDN mirror impact/impact.json and the
 * bundled baseline public/impact/snapshot.json all serve it. Amounts are integer strings in
 * 18-decimal units, per symbol. There are no mixed-currency sums.
 */

export type ChainSource = "ok" | "error" | "not-deployed" | "idle";
export type RailState = "not-deployed" | "paused" | "live" | "exhausted";
export type Custody = "held-by-token-tails" | "handed-over";
// "wallet": public gifts through the DonateRouter; "match": Token Tails' 1:1 match of them.
export type PayoutBucket = "heist" | "page" | "paws" | "x402" | "direct" | "wallet" | "match";

export interface PublicShelter {
  slug: string;
  name: string;
  countryCode: string | null;
  partnerStatus: "active" | "past" | "prospect" | null;
  role: "partner" | "house" | null;
  handoverStatus: Custody | null;
  publicWallet: string | null;
}

/**
 * A published shelter outcome (plan G4 `ShelterOutcome`): type, date, amount, the animal's name
 * only, and an optional payout link. The backend lists none yet; unknown rows are dropped.
 */
export interface PublicOutcome {
  id: string;
  type: string;
  date: string;
  animalName: string | null;
  amountWei: string | null;
  symbol: string | null;
  /** Money evidence tier id (components/claims/tiers.ts), when the outcome carries money. */
  tier: string | null;
  payoutTxHash: string | null;
}

/** One month of the purchase pledge (plan G4): pledged versus paid, per currency. */
export interface PledgeRow {
  month: string;
  symbol: string;
  pledgedWei: string;
  paidWei: string;
}

export interface PublicImpact {
  _v: number;
  bucket: string;
  generatedAt: string;
  asOf: { chain: string | null; mongo: string | null };
  sources: { chain: ChainSource; mongo: "ok" | "error" };
  money: {
    custody: Custody;
    bySymbol: Record<string, string>;
    byBucket: Partial<Record<PayoutBucket, Record<string, string>>>;
    eventCount: number;
    lastTxHash: string | null;
  };
  chain: {
    chainId: number;
    contract: string | null;
    fromBlock: number | null;
    lastScannedBlock: number | null;
  };
  players: { registeredAllTime: number | null; active30d: number | null };
  heists: { verified: number | null };
  shelters: {
    total: number;
    partners: number;
    countries: string[];
    items: PublicShelter[];
  };
  rescueCats: { total: number; adopted: number };
  outcomes: { published: number; items: PublicOutcome[] };
  rail: {
    state: RailState;
    chainId: number;
    splitAddress: string | null;
    amountWei: string;
    dailyBudgetWei: string;
    giftsPerDayCap: number;
    treatsLeftToday: number;
    resetsAt: string;
  };
  treats: {
    confirmedCount: number;
    onTheirWayCount: number;
    totalConfirmedWei: string;
  };
  pledges: { status: string; rows: PledgeRow[] };
  pawSettlements: {
    count: number;
    latest: unknown | null;
    /**
     * Whether the nightly settlement sends money (`PAWS_SETTLEMENT_ENABLED`). False on older
     * snapshots: then no surface says a paw pays a treat tonight.
     */
    sendEnabled: boolean;
  };
  rescueGoals: { open: number; items: unknown[] };
  /** Only on the bundled baseline: when `scripts/snapshot-impact.mjs` wrote it, and from where. */
  _baseline?: { stampedAt: string; from: string };
}

/** Where a snapshot came from, in fallback order. */
export type ImpactSource = "cdn" | "api" | "baseline";

export interface ImpactResult {
  impact: PublicImpact;
  source: ImpactSource;
}

export const IMPACT_SNAPSHOT_VERSION = 1;

/** Per-source timeout (plan G11: 3 s abort). */
export const IMPACT_TIMEOUT_MS = 3000;

/**
 * The CDN mirror the backend writes after each hourly snapshot (`IMPACT_CDN_OBJECT_KEY`,
 * `impact/impact.json` at the bucket root, `max-age=300`). `NEXT_PUBLIC_IMPACT_URL` overrides it.
 * The mirror is not uploaded yet (deferred), so every caller falls back to the API and then to the
 * bundled baseline.
 */
export function impactCdnUrl(): string {
  return (
    process.env.NEXT_PUBLIC_IMPACT_URL ||
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/impact/impact.json"
  );
}

export function impactApiUrl(): string | null {
  const base = apiUrl || process.env.NEXT_PUBLIC_BE_URL;
  return base ? `${String(base).replace(/\/+$/, "")}/impact` : null;
}

/** Path of the committed baseline under `public/`. */
export const IMPACT_BASELINE_PATH = "/impact/snapshot.json";

// Snapshot fields are read defensively one by one below; `any` keeps that readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isObj = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, d: number | null = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const str = (v: unknown, d: string | null = null) =>
  typeof v === "string" ? v : d;
const amounts = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (isObj(v)) {
    for (const [k, a] of Object.entries(v)) {
      if (typeof a === "string" && /^\d+$/.test(a)) out[k] = a;
    }
  }
  return out;
};
const RAIL_STATES: RailState[] = [
  "not-deployed",
  "paused",
  "live",
  "exhausted",
];
const CHAIN_SOURCES: ChainSource[] = ["ok", "error", "not-deployed", "idle"];
const INT = /^\d+$/;
/** EVM transaction hash; anything else (bad or tampered snapshot) becomes null. */
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
/** EVM address. */
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const txHash = (v: unknown): string | null =>
  typeof v === "string" && TX_HASH.test(v) ? v : null;
export const evmAddress = (v: unknown): string | null =>
  typeof v === "string" && ADDRESS.test(v) ? v : null;
const dated = (v: unknown) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;

function outcomeRow(v: unknown, i: number): PublicOutcome | null {
  if (!isObj(v)) return null;
  const date = dated(v.date);
  const type = str(v.type);
  if (!date || !type) return null;
  const amountWei =
    typeof v.amountWei === "string" && INT.test(v.amountWei)
      ? v.amountWei
      : null;
  return {
    id: String(v.id || `${date}-${i}`),
    type,
    date,
    animalName: str(v.animalName),
    amountWei,
    symbol: amountWei ? str(v.symbol) : null,
    tier: str(v.tier),
    payoutTxHash: txHash(v.payoutTxHash),
  };
}

function pledgeRow(v: unknown): PledgeRow | null {
  if (!isObj(v)) return null;
  const month = str(v.month);
  const symbol = str(v.symbol);
  if (!month || !/^\d{4}-\d{2}$/.test(month) || !symbol) return null;
  const pledgedWei = str(v.pledgedWei, "0") as string;
  const paidWei = str(v.paidWei, "0") as string;
  if (!INT.test(pledgedWei) || !INT.test(paidWei)) return null;
  return { month, symbol, pledgedWei, paidWei };
}

/**
 * Checks the version and fills every field the UI reads with a safe value, so a partial or older
 * snapshot never crashes a surface. Returns null for anything that is not a v1 snapshot.
 */
export function normalizeImpact(raw: unknown): PublicImpact | null {
  if (!isObj(raw) || raw._v !== IMPACT_SNAPSHOT_VERSION) return null;
  const generatedAt = str(raw.generatedAt);
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) return null;
  const money = isObj(raw.money) ? raw.money : {};
  const byBucket: PublicImpact["money"]["byBucket"] = {};
  if (isObj(money.byBucket)) {
    for (const [k, v] of Object.entries(money.byBucket)) {
      byBucket[k as PayoutBucket] = amounts(v);
    }
  }
  const chain = isObj(raw.chain) ? raw.chain : {};
  const players = isObj(raw.players) ? raw.players : {};
  const shelters = isObj(raw.shelters) ? raw.shelters : {};
  const rail = isObj(raw.rail) ? raw.rail : {};
  const treats = isObj(raw.treats) ? raw.treats : {};
  const asOf = isObj(raw.asOf) ? raw.asOf : {};
  const sources = isObj(raw.sources) ? raw.sources : {};
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const items: PublicShelter[] = list(shelters.items)
    .filter(isObj)
    .map((s) => ({
      slug: String(s.slug || ""),
      name: String(s.name || ""),
      countryCode:
        typeof s.countryCode === "string" && /^[A-Z]{2}$/.test(s.countryCode)
          ? s.countryCode
          : null,
      partnerStatus: (["active", "past", "prospect"].includes(s.partnerStatus)
        ? s.partnerStatus
        : null) as PublicShelter["partnerStatus"],
      role: (["partner", "house"].includes(s.role)
        ? s.role
        : null) as PublicShelter["role"],
      handoverStatus: (["held-by-token-tails", "handed-over"].includes(
        s.handoverStatus
      )
        ? s.handoverStatus
        : null) as Custody | null,
      publicWallet: evmAddress(s.publicWallet),
    }));
  const section = (v: unknown) => (isObj(v) ? v : {});
  const out: PublicImpact = {
    _v: IMPACT_SNAPSHOT_VERSION,
    bucket: str(raw.bucket, "") as string,
    generatedAt,
    asOf: { chain: str(asOf.chain), mongo: str(asOf.mongo) },
    sources: {
      chain: CHAIN_SOURCES.includes(sources.chain) ? sources.chain : "error",
      mongo: sources.mongo === "ok" ? "ok" : "error",
    },
    money: {
      custody:
        money.custody === "handed-over" ? "handed-over" : "held-by-token-tails",
      bySymbol: amounts(money.bySymbol),
      byBucket,
      eventCount: num(money.eventCount) as number,
      lastTxHash: txHash(money.lastTxHash),
    },
    chain: {
      chainId: num(chain.chainId) as number,
      contract: evmAddress(chain.contract),
      fromBlock: num(chain.fromBlock, null),
      lastScannedBlock: num(chain.lastScannedBlock, null),
    },
    players: {
      registeredAllTime: num(players.registeredAllTime, null),
      active30d: num(players.active30d, null),
    },
    heists: { verified: num(section(raw.heists).verified, null) },
    shelters: {
      total: num(shelters.total) as number,
      partners: num(shelters.partners) as number,
      countries: list(shelters.countries).filter(
        (c): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c)
      ),
      items,
    },
    rescueCats: {
      total: num(section(raw.rescueCats).total) as number,
      adopted: num(section(raw.rescueCats).adopted) as number,
    },
    outcomes: {
      published: num(section(raw.outcomes).published) as number,
      items: list(section(raw.outcomes).items)
        .map(outcomeRow)
        .filter((o): o is PublicOutcome => !!o)
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    },
    rail: {
      state: RAIL_STATES.includes(rail.state) ? rail.state : "not-deployed",
      chainId: num(rail.chainId) as number,
      splitAddress: evmAddress(rail.splitAddress),
      amountWei: str(rail.amountWei, "0") as string,
      dailyBudgetWei: str(rail.dailyBudgetWei, "0") as string,
      giftsPerDayCap: num(rail.giftsPerDayCap) as number,
      treatsLeftToday: num(rail.treatsLeftToday) as number,
      resetsAt: str(rail.resetsAt, "") as string,
    },
    treats: {
      confirmedCount: num(treats.confirmedCount) as number,
      onTheirWayCount: num(treats.onTheirWayCount) as number,
      totalConfirmedWei: str(treats.totalConfirmedWei, "0") as string,
    },
    pledges: {
      status: str(section(raw.pledges).status, "not-started") as string,
      rows: list(section(raw.pledges).rows)
        .map(pledgeRow)
        .filter((r): r is PledgeRow => !!r)
        .sort((a, b) => b.month.localeCompare(a.month)),
    },
    pawSettlements: {
      count: num(section(raw.pawSettlements).count) as number,
      latest: section(raw.pawSettlements).latest ?? null,
      sendEnabled: section(raw.pawSettlements).sendEnabled === true,
    },
    rescueGoals: {
      open: num(section(raw.rescueGoals).open) as number,
      items: list(section(raw.rescueGoals).items),
    },
  };
  if (isObj(raw._baseline)) {
    out._baseline = {
      stampedAt: String(raw._baseline.stampedAt || ""),
      from: String(raw._baseline.from || ""),
    };
  }
  return out;
}

/** Sources that answered 429, and until when they are skipped. Never retried before that. */
const rateLimitedUntil = new Map<string, number>();
const DEFAULT_429_BACKOFF_MS = 5 * 60_000;

/** For tests. */
export function resetImpactRateLimits() {
  rateLimitedUntil.clear();
}

export interface LoadImpactOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Aborts every request; the promise then rejects with the abort reason. */
  signal?: AbortSignal;
  /** Remote sources in order. Default: CDN, then API. */
  sources?: { source: Exclude<ImpactSource, "baseline">; url: string | null }[];
  /** Used when every remote source fails. */
  baseline?: unknown;
  now?: () => number;
}

async function fetchOne(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  outer: AbortSignal | undefined,
  now: () => number
): Promise<PublicImpact | null> {
  const until = rateLimitedUntil.get(url);
  if (until && until > now()) return null;
  if (outer?.aborted) {
    throw outer.reason ?? new DOMException("Aborted", "AbortError");
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  outer?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers?.get?.("retry-after"));
      rateLimitedUntil.set(
        url,
        now() +
          (Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : DEFAULT_429_BACKOFF_MS)
      );
      return null;
    }
    if (!res.ok) return null;
    return normalizeImpact(await res.json());
  } catch (error) {
    if (outer?.aborted) throw error;
    return null;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  }
}

/**
 * The fallback chain (plan G11): CDN impact.json, then GET /impact, then the bundled baseline.
 * Each remote source gets one try with a 3 s abort; a 429 is never retried (the source is skipped
 * until its Retry-After, default 5 min). Returns null only when there is no usable baseline either.
 */
export async function loadImpact(
  options: LoadImpactOptions = {}
): Promise<ImpactResult | null> {
  const fetchImpl =
    options.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  const timeoutMs = options.timeoutMs ?? IMPACT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const sources = options.sources ?? [
    { source: "cdn" as const, url: impactCdnUrl() },
    { source: "api" as const, url: impactApiUrl() },
  ];
  if (fetchImpl) {
    for (const { source, url } of sources) {
      if (!url) continue;
      const impact = await fetchOne(
        url,
        fetchImpl,
        timeoutMs,
        options.signal,
        now
      );
      if (impact) return { impact, source };
    }
  }
  const baseline = usableBaseline(options.baseline);
  return baseline ? { impact: baseline, source: "baseline" } : null;
}

/** A host that is a developer's own machine (the snapshot script's default source). */
export function isDevHost(host: string | null | undefined): boolean {
  const h = String(host || "")
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    /^127\./.test(h) ||
    h === "::1" ||
    h === "0.0.0.0"
  );
}

/** Whether a bundled baseline was written from a local dev backend (its numbers are not public). */
export function isDevBaseline(
  impact: PublicImpact | null | undefined
): boolean {
  return !!impact?._baseline && isDevHost(impact._baseline.from);
}

/**
 * The bundled baseline, normalised. A production build never shows a baseline written from a
 * local dev backend: those are a developer's database numbers, not public ones. Dev and test
 * builds keep it, so the page can be worked on offline.
 */
function usableBaseline(raw: unknown): PublicImpact | null {
  const impact = normalizeImpact(raw);
  if (!impact) return null;
  if (isDevBaseline(impact) && process.env.NODE_ENV === "production")
    return null;
  return impact;
}

/**
 * One reading of the shelter rail state for every surface (landing, AboutUsModal, /impact), so a
 * paused rail never reads "opens soon" in one place and "live" in another.
 * - `not-deployed`: no rail contract yet, treats open soon.
 * - `paused`: the rail exists but treats are paused.
 * - `live`: treats can be sent now. `exhausted`: live, today's budget is used up.
 */
export type RailCopyState = "soon" | "paused" | "open" | "exhausted";
export function railCopyState(
  state: RailState | null | undefined
): RailCopyState {
  switch (state) {
    case "live":
      return "open";
    case "exhausted":
      return "exhausted";
    case "paused":
      return "paused";
    default:
      return "soon";
  }
}

// The words for each rail state live in components/claims/rail-copy.ts (copy-lint scans them).

/** Whether a rail contract exists at all (deployed, in any state). */
export function railIsDeployed(state: RailState | null | undefined): boolean {
  return railCopyState(state) !== "soon";
}

/** USD-pegged symbols; the app build shows these as a USD equivalent (F7.2). */
export const USD_PEGGED = ["USDC", "USDT", "USD"];

/** `"1230000000000000000"` (18 decimals) to `"1.23"`. Integer maths, no float drift. */
export function formatUnits18(amount: string, decimals = 2): string {
  if (!/^\d+$/.test(amount || "")) return "0.00";
  const padded = amount.padStart(19, "0");
  const whole = padded.slice(0, -18).replace(/^0+(?=\d)/, "");
  const frac = padded.slice(-18);
  // Round half up at `decimals`.
  const scaled = BigInt(whole + frac.slice(0, decimals));
  const next = Number(frac[decimals] || "0");
  const rounded = scaled + (next >= 5 ? BigInt(1) : BigInt(0));
  const s = rounded.toString().padStart(decimals + 1, "0");
  const intPart = s.slice(0, -decimals) || "0";
  return `${Number(intPart).toLocaleString("en-US")}.${s.slice(-decimals)}`;
}

export function isZeroAmount(amount: string | undefined): boolean {
  return !amount || /^0*$/.test(amount);
}

/** The snapshot's own date for figures of one family (chain money or Mongo counts). */
export function impactAsOf(
  impact: PublicImpact,
  family: "chain" | "mongo" = "mongo"
): string {
  return impact.asOf[family] || impact.generatedAt;
}

/** The committed baseline (public/impact/snapshot.json), normalised. */
export function baselineImpact(): ImpactResult | null {
  const impact = usableBaseline(BASELINE);
  return impact ? { impact, source: "baseline" } : null;
}

/**
 * For getStaticProps (plan 2.13 row 30, F7.6): web builds read the CDN impact.json, then the API,
 * then the baseline; app builds (static export) read the committed baseline only, so the export
 * never depends on the network and the page says how old its numbers are.
 */
export async function loadImpactForPage(
  isApp: boolean
): Promise<ImpactResult | null> {
  if (isApp) return baselineImpact();
  return loadImpact({ baseline: BASELINE });
}

export const IMPACT_API = {
  loadImpact,
  normalizeImpact,
  loadImpactForPage,
  baselineImpact,
};

// ---------- GET /impact/me and GET /shelter/donate/status (task 5e, plan G4 "Client") ----------

/** Why an account is not (yet) eligible. Client copy of `EligibilityReason` (backend/src/impact/eligibility.ts). */
export type EligibilityReason =
  | "guest"
  | "email-unverified"
  | "account-too-new"
  | "no-saved-game"
  | "not-enough-games"
  | "not-enough-runs";

export interface Eligibility {
  eligible: boolean;
  reason: EligibilityReason | null;
  /** When a time-based requirement will be met, if that is the only thing missing. */
  eligibleAt: string | null;
}

/** Today's daily paw (plan F7.5, G4). Client copy of `PawsMe` (backend/src/impact/paws.service.ts). */
export interface PawsToday {
  /** The UTC day the runs count for, `YYYY-MM-DD`. */
  day: string;
  qualifyingRuns: number;
  runsNeeded: number;
  remaining: number;
  /** Two spaced scoring runs today and the account passes the settlement check. */
  earned: boolean;
  /** The account part of the policy (age, verified email); runs are `remaining`. */
  eligibility: Eligibility;
  /** 00:30 UTC after `day`, when Token Tails settles the day's paws. */
  settlesAt: string;
  message: string;
}

export interface PawSettlementSummary {
  day: string;
  status: string;
  pawCount: number;
}

export interface ImpactMe {
  treats: {
    confirmedCount: number;
    onTheirWayCount: number;
    totalConfirmedWei: string;
    lastConfirmedAt: string | null;
  };
  /** The instant treat policy (registered, verified, 24 h, one saved game). */
  instantTreat: Eligibility;
  paws: {
    today: PawsToday;
    lifetime: number;
    latestSettlement: PawSettlementSummary | null;
    hasProof: boolean;
  } | null;
}

const REASONS: EligibilityReason[] = [
  "guest",
  "email-unverified",
  "account-too-new",
  "no-saved-game",
  "not-enough-games",
  "not-enough-runs",
];

function eligibilityOf(v: unknown): Eligibility {
  if (!isObj(v)) return { eligible: false, reason: null, eligibleAt: null };
  return {
    eligible: v.eligible === true,
    reason: REASONS.includes(v.reason) ? v.reason : null,
    eligibleAt: dated(v.eligibleAt),
  };
}

const count = (v: unknown) => Math.max(0, Math.floor(num(v) as number));

/** Fills every field the lobby and end-of-run panels read with a safe value; null for garbage. */
export function normalizeImpactMe(raw: unknown): ImpactMe | null {
  if (!isObj(raw)) return null;
  const treats = isObj(raw.treats) ? raw.treats : {};
  let paws: ImpactMe["paws"] = null;
  if (isObj(raw.paws) && isObj(raw.paws.today)) {
    const t = raw.paws.today;
    const day = str(t.day);
    const settlesAt = dated(t.settlesAt);
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && settlesAt) {
      const runsNeeded = Math.max(1, count(t.runsNeeded) || 2);
      const qualifyingRuns = Math.min(runsNeeded, count(t.qualifyingRuns));
      const remaining = Math.max(0, runsNeeded - qualifyingRuns);
      const eligibility = eligibilityOf(t.eligibility);
      const latest = isObj(raw.paws.latestSettlement)
        ? raw.paws.latestSettlement
        : null;
      paws = {
        today: {
          day,
          qualifyingRuns,
          runsNeeded,
          remaining,
          // Never trust `earned` without the parts that make it true.
          earned: t.earned === true && remaining === 0 && eligibility.eligible,
          eligibility,
          settlesAt,
          message: str(t.message, "") as string,
        },
        lifetime: count(raw.paws.lifetime),
        latestSettlement:
          latest && str(latest.day)
            ? {
                day: String(latest.day),
                status: String(latest.status || ""),
                pawCount: count(latest.pawCount),
              }
            : null,
        hasProof: isObj(raw.paws.proof),
      };
    }
  }
  return {
    treats: {
      confirmedCount: count(treats.confirmedCount),
      onTheirWayCount: count(treats.onTheirWayCount),
      totalConfirmedWei:
        typeof treats.totalConfirmedWei === "string" &&
        INT.test(treats.totalConfirmedWei)
          ? treats.totalConfirmedWei
          : "0",
      lastConfirmedAt: dated(treats.lastConfirmedAt),
    },
    instantTreat: eligibilityOf(raw.instantTreat),
    paws,
  };
}

export interface ImpactMeOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** The `fb`-prefixed Firebase token. */
  token: string;
  timeoutMs?: number;
}

/**
 * `GET /impact/me` for a registered account (guests get 403 GUEST_FORBIDDEN, so callers never ask
 * for one). Null on any failure: the surfaces then show progress copy, never a paw claim.
 */
export async function fetchImpactMe({
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
  signal,
  token,
  timeoutMs = IMPACT_TIMEOUT_MS,
}: ImpactMeOptions): Promise<ImpactMe | null> {
  const base = impactApiUrl();
  if (!fetchImpl || !base || !token) return null;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/me`, {
      signal: controller.signal,
      headers: { accept: "application/json", accesstoken: token },
    });
    if (!res.ok) return null;
    return normalizeImpactMe(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** The public treat rail (`GET /shelter/donate/status`, plan F7.4), as the client reads it. */
export interface DonateRail {
  enabled: boolean;
  state: RailState;
  treatsLeftToday: number;
  resetsAt: string | null;
}

export function normalizeDonateRail(raw: unknown): DonateRail | null {
  if (!isObj(raw)) return null;
  const state: RailState = RAIL_STATES.includes(raw.railState)
    ? raw.railState
    : raw.enabled === true
    ? "live"
    : "not-deployed";
  return {
    enabled: raw.enabled === true,
    state,
    treatsLeftToday: count(raw.treatsLeftToday),
    resetsAt: dated(raw.resetsAt),
  };
}

/** Whether the instant treat CTA may show: the rail is live with treats left today (G4). */
export function treatRailOpen(rail: DonateRail | null): boolean {
  return !!rail && rail.enabled && rail.state === "live" && rail.treatsLeftToday > 0;
}

export async function fetchDonateRail(
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<DonateRail | null> {
  const fetchImpl =
    options.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  const base = apiUrl || process.env.NEXT_PUBLIC_BE_URL;
  if (!fetchImpl || !base) return null;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? IMPACT_TIMEOUT_MS
  );
  try {
    const res = await fetchImpl(
      `${String(base).replace(/\/+$/, "")}/shelter/donate/status`,
      { signal: controller.signal, headers: { accept: "application/json" } }
    );
    if (!res.ok) return null;
    return normalizeDonateRail(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
