// facts.json schema rules (plan F7.1, G11). Zero dependencies.
//
// validateRegistry(registry, { root, exists }) -> { problems: string[], warnings: string[] }
// Problems fail `fund facts build` and `--check`; warnings are printed only.

export const STATUSES = ['verified', 'company-reported', 'sei-era', 'live', 'unverified', 'retired'];
/** Statuses that may be shown to the public. `unverified` and `retired` never have surfaces. */
export const PUBLIC_STATUSES = ['verified', 'company-reported', 'sei-era', 'live'];
export const SURFACES = ['landing', 'game', 'heist', 'impact', 'shelter-payouts', 'store'];
export const TENSES = ['past', 'present', 'future'];
export const CHAINS = ['sei', 'stellar', 'arc', 'skale'];
export const FAMILIES = { F: 'fact', P: 'product claim', C: 'campaign or config', L: 'live metric' };

const ID = /^(?:[FPC]-\d{3}|L-[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const KEY = /^[a-z][a-z0-9_]*$/;
// 2026-09-23 | 2026-09 | 2026 | 2025–26 (the FACTS.md date styles verify.mjs parses)
const LOOSE_DATE = /^(?:\d{4}-\d{2}-\d{2}|\d{4}-\d{2}|\d{4}|\d{4}\s*[–—-]\s*(?:\d{2}|\d{4}))$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const WALLET = /^0x[0-9a-fA-F]{40}$/;

const REQUIRED = ['id', 'claim', 'value', 'unit', 'display', 'source', 'asOf', 'checkedAt', 'status', 'maxAgeDays', 'surfaces', 'tense'];
const OPTIONAL = ['chain', 'live', 'key', 'note', 'goal', 'campaign', 'config', 'evidence', 'effectiveAt', 'appDisplay', 'short', 'recordsOnRequest'];

/** Surfaces that ship in the Capacitor app build (the Heist included: it is in the app export). */
export const APP_SURFACES = ['game', 'heist', 'store'];

// App-build words (claims rule R10). Kept in step with APP_WORDS in tools/copy-lint/lib/rules.mjs;
// tools/copy-lint/test/registry.test.mjs fails when the two lists differ.
export const APP_WORDS = [
  { re: /\bUSDC\b/, what: 'USDC (show a USD equivalent with its FX date)' },
  { re: /\b0x[0-9a-fA-F]{6,}/, what: 'a 0x hash' },
  // "Explorer Tier" (a mystery-box name) is not a block explorer: plain "explorer" counts only after
  // on/in/the/an or before link/page/url.
  { re: /\b(?:block|chain|tx)[\s-]?explorers?\b|\b(?:on|in|the|an?|via)\s+explorers?\b|\bexplorers?\s+(?:links?|pages?|url)\b|\b(?:etherscan|arcscan|blockscout|stellar\.expert|stellarchain)\b/i, what: 'an explorer' },
  { re: /\bwallets?\b/i, what: 'wallet' },
  { re: /\b(?:Stellar|Soroban|SEI|Ethereum|Solana|SKALE|Polygon|Mantle|Arbitrum|Monad|Mezo|Avalanche)\b|\bArc\b(?!\w)/, what: 'a chain name' },
  { re: /\bon-?chain\b/i, what: '"ON-CHAIN" (use HELD BY TOKEN TAILS / HELD BY SHELTER)' },
];

/** The first app-build word in `text`, as { what, word }, or null. */
export function appWord(text) {
  const plain = String(text).replace(/\bToken[\s_-]*Tails\b|\btokentails\b/gi, ' ');
  for (const { re, what } of APP_WORDS) {
    const m = re.exec(plain);
    if (m) return { what, word: m[0] };
  }
  return null;
}

// ---------- personal data (the build refuses these anywhere in the registry) ----------

const PII = [
  { kind: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/ },
  // +370 600 00000, +1 (415) 555-0100, 00370 60000000; also tel: links.
  { kind: 'phone', re: /(?:\+|\b00)\d{1,3}[\s().-]*(?:\d[\s().-]*){6,13}\d\b|\btel:\s*\+?\d/i },
  // Local formats: (415) 555-0100, 415.555.0100; Lithuanian mobile 8 600 12345 / 860012345.
  { kind: 'phone', re: /(?<![\w,.])\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w,])/ },
  { kind: 'phone', re: /(?<![\w,.])8[\s-]?6\d{2}[\s-]?\d{5}(?![\w,])/ },
  // LT12 1000 0111 0100 1000, DE89370400440532013000 (country, check digits, 11-30 alphanumerics)
  { kind: 'IBAN', re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b/ },
  // Any case once spaces are removed ("lt12 1000 0111 0100 1000"), when the mod-97 check passes.
  { kind: 'IBAN', test: (s) => ibanCandidates(s).some(ibanValid) },
];

/** Spaced or compact IBAN-shaped runs in any case, spaces removed. */
function ibanCandidates(s) {
  const out = [];
  for (const m of String(s).matchAll(/(?<![A-Za-z0-9])[A-Za-z]{2}\d{2}(?:[ ]?[A-Za-z0-9]){11,30}(?![A-Za-z0-9])/g)) out.push(m[0].replace(/ /g, ''));
  return out;
}

/** ISO 13616 mod-97 check (the rearranged number mod 97 is 1). */
export function ibanValid(iban) {
  const s = iban.toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  let rem = 0;
  for (const ch of s.slice(4) + s.slice(0, 4)) {
    const v = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

/** Every string in a JSON value, with its dotted path. */
export function* strings(value, path = '') {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (let i = 0; i < value.length; i++) yield* strings(value[i], `${path}[${i}]`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
}

/** [{ kind, path }] for each string that looks like an email, phone number or IBAN. */
export function findPersonalData(value) {
  const hits = [];
  for (const [path, s] of strings(value)) {
    for (const { kind, re, test } of PII) {
      if ((re ? re.test(s) : test(s)) && !hits.some((h) => h.kind === kind && h.path === path)) hits.push({ kind, path });
    }
  }
  return hits;
}

// ---------- dates ----------

/** End of the period a loose date names, as a UTC Date; null when unparseable. */
export function endOfDate(s) {
  s = String(s ?? '').trim();
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59Z`);
  if ((m = /^(\d{4})-(\d{2})$/.exec(s))) return new Date(Date.UTC(+m[1], +m[2], 0, 23, 59, 59));
  if ((m = /^(\d{4})\s*[–—-]\s*(\d{2}|\d{4})$/.exec(s))) {
    const y = m[2].length === 2 ? 2000 + +m[2] : +m[2];
    return new Date(Date.UTC(y, 11, 31, 23, 59, 59));
  }
  if ((m = /^(\d{4})$/.exec(s))) return new Date(Date.UTC(+m[1], 11, 31, 23, 59, 59));
  return null;
}

/** Whole days from ISO day a to ISO day b, both inclusive (2026-10-02..2026-10-02 is 1). */
export function inclusiveDays(a, b) {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86400000) + 1;
}

export function family(id) {
  return String(id).charAt(0);
}

// ---------- validation ----------

export function validateRegistry(registry, { exists = () => true } = {}) {
  const problems = [];
  const warnings = [];
  if (!registry || typeof registry !== 'object' || !Array.isArray(registry.facts)) {
    return { problems: ['facts.json must be an object with a "facts" array'], warnings };
  }
  const seen = new Set();
  const keys = new Map();
  for (const [i, f] of registry.facts.entries()) {
    const at = f && typeof f.id === 'string' ? f.id : `facts[${i}]`;
    const bad = (msg) => problems.push(`${at}: ${msg}`);
    if (!f || typeof f !== 'object' || Array.isArray(f)) { bad('must be an object'); continue; }

    for (const k of REQUIRED) if (!(k in f)) bad(`missing "${k}"`);
    for (const k of Object.keys(f)) if (!REQUIRED.includes(k) && !OPTIONAL.includes(k)) bad(`unknown field "${k}"`);

    if (typeof f.id !== 'string' || !ID.test(f.id)) bad('id must be F-###, P-###, C-### or L-<slug>');
    else if (seen.has(f.id)) bad('duplicate id');
    else seen.add(f.id);
    if (f.key !== undefined) {
      if (typeof f.key !== 'string' || !KEY.test(f.key)) bad('key must be snake_case');
      else if (keys.has(f.key)) bad(`key "${f.key}" is also used by ${keys.get(f.key)}`);
      else keys.set(f.key, f.id);
    }

    if (typeof f.claim !== 'string' || !f.claim.trim()) bad('claim must be a non-empty string');
    if (typeof f.source !== 'string' || !f.source.trim()) bad('source must be a non-empty string');
    for (const k of ['claim', 'source', 'display', 'unit']) {
      if (typeof f[k] === 'string' && /[|\n\r]/.test(f[k])) bad(`${k} must not contain "|" or a line break (it becomes a FACTS.md table cell)`);
    }
    if (typeof f.value === 'string' && /[|\n\r]/.test(f.value)) bad('value must not contain "|" or a line break');
    if (!(f.value === null || typeof f.value === 'string' || (typeof f.value === 'number' && Number.isFinite(f.value)))) bad('value must be a number, a string or null');
    if (!(f.unit === null || typeof f.unit === 'string')) bad('unit must be a string or null');
    if (!(f.display === null || typeof f.display === 'string')) bad('display must be a string or null');
    if (f.appDisplay !== undefined && (typeof f.appDisplay !== 'string' || !f.appDisplay.trim() || /[|\n\r]/.test(f.appDisplay))) bad('appDisplay must be a non-empty one-line string');
    if (f.short !== undefined && (typeof f.short !== 'string' || !f.short.trim() || /[|\n\r]/.test(f.short))) bad('short must be a non-empty one-line string');
    if (f.recordsOnRequest !== undefined && f.recordsOnRequest !== true) bad('recordsOnRequest is opt-in: true or absent');

    if (!STATUSES.includes(f.status)) bad(`status must be one of ${STATUSES.join(', ')}`);
    if (!TENSES.includes(f.tense)) bad(`tense must be one of ${TENSES.join(', ')}`);
    if (f.chain !== undefined && !CHAINS.includes(f.chain)) bad(`chain must be one of ${CHAINS.join(', ')}`);

    if (!(f.asOf === null || (typeof f.asOf === 'string' && LOOSE_DATE.test(f.asOf)))) bad('asOf must be a date (YYYY-MM-DD, YYYY-MM, YYYY or YYYY–YY) or null');
    if (typeof f.checkedAt !== 'string' || !LOOSE_DATE.test(f.checkedAt)) bad('checkedAt must be a date (YYYY-MM-DD, YYYY-MM, YYYY or YYYY–YY)');
    if (!(f.maxAgeDays === null || (Number.isInteger(f.maxAgeDays) && f.maxAgeDays > 0))) bad('maxAgeDays must be a positive integer or null');

    // Surfaces: the heart of the schema. Unverified and retired entries never reach the public.
    if (!Array.isArray(f.surfaces)) bad('surfaces must be an array');
    else {
      for (const s of f.surfaces) if (!SURFACES.includes(s)) bad(`unknown surface "${s}" (one of ${SURFACES.join(', ')})`);
      if (new Set(f.surfaces).size !== f.surfaces.length) bad('surfaces has duplicates');
      if ((f.status === 'unverified' || f.status === 'retired') && f.surfaces.length) bad(`${f.status} entries never have surfaces`);
      if (f.surfaces.length) {
        if (typeof f.display !== 'string' || !f.display.trim()) bad('a surfaced entry needs display text');
        if (f.maxAgeDays === null && f.status !== 'sei-era') bad('a surfaced entry needs maxAgeDays (only sei-era history never goes stale)');
        // App surfaces (the Capacitor build, the Heist included) never show chain or money words (R10).
        const onApp = f.surfaces.filter((s) => APP_SURFACES.includes(s));
        if (onApp.length) {
          const shown = typeof f.appDisplay === 'string' ? f.appDisplay : f.display;
          const hit = typeof shown === 'string' ? appWord(shown) : null;
          if (hit) bad(`${typeof f.appDisplay === 'string' ? 'appDisplay' : 'display'} is shown on app surface(s) ${onApp.join(', ')} but uses ${hit.what}: "${hit.word}"; add an appDisplay without it (claims rule R10)`);
          const shortHit = typeof f.short === 'string' ? appWord(f.short) : null;
          if (shortHit) bad(`short is shown on app surface(s) ${onApp.join(', ')} but uses ${shortHit.what}: "${shortHit.word}" (claims rule R10)`);
        }
      } else {
        if (f.appDisplay !== undefined) bad('appDisplay is only for surfaced entries');
        if (f.short !== undefined) bad('short is only for surfaced entries');
        if (f.recordsOnRequest !== undefined) bad('recordsOnRequest is only for surfaced entries');
      }
    }

    // Status-specific rules.
    const fam = typeof f.id === 'string' ? family(f.id) : '';
    if (f.status === 'sei-era') {
      if (f.chain !== 'sei') bad('sei-era entries need chain "sei"');
      if (f.tense !== 'past') bad('sei-era entries are history: tense "past"');
      if (typeof f.display === 'string' && !/\bSEI\b/.test(f.display)) bad('sei-era display must name SEI (claims rule R11)');
    }
    if (f.status === 'company-reported' && typeof f.display === 'string' && !/company-reported/i.test(f.display)) {
      bad('company-reported display must say "company-reported" (decision #73, claims rule R12)');
    }
    if (f.status === 'live') {
      if (fam !== 'L') bad('only L- entries are live');
      if (!f.live || typeof f.live.endpoint !== 'string' || typeof f.live.path !== 'string') bad('live entries need live: { endpoint, path }');
    } else if (f.live !== undefined) bad('live is only for status "live"');
    if (fam === 'L' && f.status !== 'live' && f.status !== 'retired') bad('L- entries are live (or retired)');
    if (f.status === 'retired' && f.maxAgeDays !== null) bad('retired entries have maxAgeDays null');
    if (f.value === null && f.status !== 'live' && f.status !== 'unverified' && f.status !== 'retired') bad('value can be null only while live, unverified or retired');
    if (f.tense === 'future' && typeof f.display === 'string' && /\b(?:sent|paid|funded|donated|saved)\b/i.test(f.display)) {
      bad('future-tense display must not say the money already moved (claims rule R4)');
    }

    // Product claims backed by a spec (decision #75).
    if (f.evidence !== undefined) {
      if (!f.evidence || typeof f.evidence.spec !== 'string') bad('evidence needs { spec }');
      else if (f.status === 'verified' && !exists(f.evidence.spec)) bad(`status verified needs its spec ${f.evidence.spec}, which does not exist`);
      else if (!exists(f.evidence.spec) && f.status !== 'unverified') bad(`spec ${f.evidence.spec} does not exist yet: keep the entry unverified`);
    }

    // Goals: checked for shape here, for reachability against the configured cap in build.mjs.
    if (f.goal !== undefined) {
      if (fam !== 'C') bad('only C- entries have a goal');
      const g = f.goal || {};
      if (!ISO_DAY.test(g.startDate || '') || !ISO_DAY.test(g.endDate || '')) bad('goal needs startDate and endDate (YYYY-MM-DD)');
      else if (inclusiveDays(g.startDate, g.endDate) < 1) bad('goal endDate is before startDate');
      if (!g.cap || typeof g.cap.file !== 'string' || typeof g.cap.const !== 'string' || !Number.isInteger(g.cap.decimals)) bad('goal needs cap: { file, const, decimals }');
      if (g.shareBps !== undefined && !(Number.isInteger(g.shareBps) && g.shareBps > 0 && g.shareBps <= 10000)) bad('goal shareBps must be an integer from 1 to 10000 (the share of the daily budget the shelter receives)');
      if (typeof f.value !== 'string' || !/^\d+(?:\.\d{1,6})?$/.test(f.value)) bad('a goal value is a decimal string such as "90"');
    }
    if (f.campaign !== undefined) {
      if (!f.goal) bad('campaign needs a goal');
      const c = f.campaign || {};
      if (typeof c.name !== 'string' || !c.name || typeof c.chainId !== 'number' || !c.shelter || typeof c.shelter.name !== 'string') bad('campaign needs { name, chainId, fromBlock, shelter: { name, wallet, handover } }');
      else {
        const wallet = c.shelter.wallet ?? null;
        const fromBlock = c.fromBlock ?? null;
        // parseCampaign (client/components/shelter-payouts/campaign.ts) turns a malformed wallet into
        // null without a word, so a typo would quietly stop the page counting.
        if (wallet !== null && !(typeof wallet === 'string' && WALLET.test(wallet))) bad('campaign.shelter.wallet must be null or a 0x address with 40 hex digits (the payouts page silently ignores anything else)');
        if (fromBlock !== null && !(Number.isInteger(fromBlock) && fromBlock >= 0)) bad('campaign.fromBlock must be null or a block number (an integer of 0 or more)');
        // campaignProgress counts from fromBlock, not startDate: a wallet without a fromBlock counts
        // every payout ever made to it, including ones before the goal started.
        if (wallet !== null && fromBlock === null) bad(`campaign.shelter.wallet is set but fromBlock is null, so the payouts page would count every payout ever made to that wallet, including ones before startDate${f.goal?.startDate ? ` (${f.goal.startDate})` : ''}. Set fromBlock to the first block on or after startDate, or set the wallet to null until it is known`);
      }
    }
    if (f.config !== undefined) {
      if (fam !== 'C') bad('only C- entries mirror a config value');
      const c = f.config || {};
      if (typeof c.file !== 'string' || typeof c.const !== 'string' || !Number.isInteger(c.decimals)) bad('config needs { file, const, decimals }');
    }
    if (f.effectiveAt !== undefined && !(f.effectiveAt === null || ISO_DAY.test(f.effectiveAt))) bad('effectiveAt must be YYYY-MM-DD or null');
  }

  for (const { kind, path } of findPersonalData(registry)) problems.push(`personal data refused: ${kind} pattern at ${path}`);

  const campaigns = registry.facts.filter((f) => f && f.campaign);
  if (campaigns.length > 1) problems.push(`only one entry may generate campaign.json (found ${campaigns.map((f) => f.id).join(', ')})`);
  return { problems, warnings };
}
