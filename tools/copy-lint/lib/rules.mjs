// Copy lint rules R1 to R12 (docs/CLAIMS.md; plan F11, G5, G11).
//
// Each rule gets one copy unit and the file context, and returns zero or more messages.
// Context: { facts: Map<id, entry>, surface, toneExempt, appScope, near: { ids, fiction, badFiction } }

export const RULES = {
  R1: 'Real-world numbers cite a fact id',
  R2: 'Real-world impact claims cite a claim id or are marked fiction',
  R3: 'Token Tails is the subject of money verbs',
  R4: 'Tense matches the cited claim',
  R5: 'Cited ids exist, may be shown, and list this surface',
  R6: 'No giver counts',
  R7: 'Goals cite their C- entry (reachability is checked by fund facts build)',
  R8: 'No Tails-to-money rate (/Tails per/i is banned everywhere)',
  R9: 'Rescue tone: no token or speculation words (G5)',
  R10: 'App builds: no USDC, 0x hashes, explorer, wallet, chain names or ON-CHAIN',
  R11: 'SEI-era figures say SEI',
  R12: 'Company-reported figures say so, and cited numbers carry their date',
};

const BRAND = /\bToken[\s_-]*Tails\b|\btokentails\b/gi;
// "App Check token", "guest token", "x-guest-token": sign-in tokens, not the G5 speculation word.
const AUTH_TOKEN = /\b(?:app check|guest|access|id|auth|refresh|firebase|bearer|session|csrf|x-guest|reset|verification)[\s-]?tokens?\b/gi;

// ---------- vocabularies ----------

const REAL_NOUN = /\breal\b(?!-)|\bshelters?\b|\bstrays?\b|\bvets?\b|\bveterinar\w*|\bsurger(?:y|ies)\b|\bdonations?\b|\bcharit(?:y|ies)\b|\banimal[- ]welfare\b|\brescue (?:operations|centers?|centres?|groups?|organi[sz]ations?)\b|\b(?:cats?|dogs?|pets?|animals?) in need\b/i;
const IMPACT_VERB = /\b(?:fund(?:s|ed|ing)?|donat(?:e|es|ed|ing)|pa(?:y|ys|id|ying)|send(?:s|ing)?|sent|rout(?:e|es|ed|ing)|feed(?:s|ing)?|fed|sav(?:e|es|ed|ing)|help(?:s|ed|ing)?|support(?:s|ed|ing)?|giv(?:e|es|ing)|gave|rescu(?:e|es|ed|ing)|go(?:es)? to)\b/i;
const MONEY_VERB = /\b(?:fund(?:s|ed|ing)?|donat(?:e|es|ed|ing)|pa(?:ys|id|ying)|pay|sends|sending|sent|rout(?:e|es|ed|ing)|feeds|feeding|fed)\b/i;
const BAD_SUBJECT = /\b(?:you|your|every|each|heists?|cards?|visits?|shares?|games?|runs?|plays?|purchases?|players?|taps?|clicks?|points|Tails|levels?|wins?|scores?)\b/i;
const GOOD_SUBJECT = /\bToken\s*Tails\b|\bwe\b/i;
const PRESENT_MONEY = /\b(?:sends|funds|pays|feeds|donates|goes to|routes)\b/i;
const PAST_MONEY = /\b(?:sent|paid|funded|donated|routed|fed)\b/i;
const FUTURE_MARK = /\b(?:will|soon|opens?|once|when|after|until|from \d|starting)\b/i;

// R1: a magnitude (540K+, 800+, 181,010) or a strongly real-world noun after a number. The last
// group is the noun, which the cited entry's unit must match.
const MAGNITUDE = /(?:^|[^\w.#])(\d[\d,.]*\s*[KkMm]\+?|\d+\+|\d{1,3}(?:,\d{3})+)\s*(?:registered\s+|active\s+|monthly\s+|weekly\s+)?(players?|users?|followers?|wallets?|transactions?|downloads?|installs?|strays?|cats?|shelters?|countries|partners?|rescues?|meals?|surger(?:y|ies)|donations?|visitors?|members?|holders?|creators?|influencers?|people|animals?)\b/i;
const HARD_METRIC = /(?:^|[^\w.#])(\d[\d,.]*)\s*(followers?|wallets?|transactions?|downloads?|installs?|strays?|visitors?|(?:influencer\s+)?cats(?=\s+(?:saved|helped|rescued|onboarded))|partner\s+countries|countries|shelters(?= helped))\b/i;

// Nouns that count the same thing, so "540K+ registered users" may cite a "players" entry.
const UNIT_GROUPS = [
  ['player', 'user', 'member', 'people'],
  ['cat', 'stray', 'animal', 'rescue', 'influencer'],
  ['country', 'partner country'],
];

function singular(word) {
  const w = String(word).toLowerCase().replace(/\s+/g, ' ').replace(/^influencer /, '').trim();
  if (w === 'people') return w;
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
  return w.replace(/s$/, '');
}

/** Whether a registry unit ("players", "cats") counts what the copy's noun names. */
export function unitMatches(noun, unit) {
  if (!unit) return false;
  const a = singular(noun);
  const b = singular(unit);
  if (a === b) return true;
  return UNIT_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

// R6: giver counts.
// The count is a number ("1,204 donors") or a placeholder: JSX `{n}` flattens to "{…}" and a template
// span `${n}` to "{n}", and a real giver count almost always comes from a variable.
const COUNT = String.raw`(?:\b\d[\d,.]*\s*[KkMm]?\+?|\{[^}]*\})`;
const GIVERS = [
  new RegExp(String.raw`${COUNT}\s+(?:givers?|donors?|backers?|supporters?|contributors?)\b`, 'i'),
  new RegExp(String.raw`${COUNT}\s+(?:people|players|users|rescuers|fans)\s+(?:have\s+)?(?:gave|given|donated|chipped in|sent|pledged|helped)\b`, 'i'),
];

// R7: a goal with a money amount.
const GOAL = /\bgoals?\b/i;
const MONEY_AMOUNT = /[$€£]\s?\d|\b\d[\d,.]*\s?(?:USDC|USD|EUR|dollars|euros)\b/i;

// R8: banned everywhere.
const RATES = [
  { re: /Tails per\b/i, why: '"Tails per" is banned: Tails have no cash value' },
  { re: /\b\d[\d,.]*\s*Tails\s*(?:=|≈|~|per|for|is worth|are worth)\s*[$€£]?\s*\d/i, why: 'a Tails-to-money rate' },
  { re: /[$€£]\s*\d[\d.,]*\s*(?:=|≈|~|per|for|buys|gets)\s*\d[\d,]*\s*Tails\b/i, why: 'a money-to-Tails rate' },
  { re: /\b\d[\d.,]*\s*(?:USDC|USD|EUR|dollars?|euros?|cents?)\s*(?:=|≈|~|per|for|buys|gets)\s*\d[\d,]*\s*Tails\b/i, why: 'a money-to-Tails rate' },
];

// R9: G5 tone regex (plan F11), after removing the brand name.
const TONE = /\$TAILS|\bairdrops?\b|\bTGE\b|\blisting\b|\bMNT\b|\ballocations?\b|\btokens?\b/i;

// R10: app-build words. The registry schema (funding/framework/lib/facts/schema.mjs, in the private
// funding checkout) keeps the same list for registry displays on app surfaces; test/registry.test.mjs
// fails when they differ, and skips that check when funding/ is absent.
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

const DATE_MARK = /\b(?:19|20)\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\b|\{[^}]*(?:asOf|date|Date)[^}]*\}/;

function sentences(text) {
  return text.split(/(?<=[.!?;:])\s+|\s[·•|]\s/);
}

// ---------- rules ----------

export function checkUnit(u, ctx) {
  const out = [];
  const add = (rule, message) => out.push({ rule, message });
  const text = u.text;
  const plain = text.replace(BRAND, ' ');
  const ids = ctx.near.ids;
  const cited = ids.map((id) => ctx.facts.get(id)).filter(Boolean);
  // R2 is cleared by any claim id or a fiction marker. R1 (a real-world number) needs a cited F-, L-
  // or C- entry that counts the same thing: a fiction marker never hides a real number.
  const claimRules = !u.grouped; // grouped props are checked once, as their object
  const wordRules = u.kind !== 'object'; // an object's props are already checked one by one
  // Short units ("1 USDC = 100 Tails") get R8, R9 and R10 (`spaced` is false only for callers that
  // build units by hand; then only R8 reads them).
  const vocab = wordRules && (!u.short || u.spaced !== false);

  // R9 tone (every copy unit, outside legacy and the Vault). Auth tokens are not crypto tokens.
  if (!ctx.toneExempt && vocab) {
    const m = TONE.exec(plain.replace(AUTH_TOKEN, ' '));
    if (m) add('R9', `"${m[0]}" is speculation vocabulary; Tails are rescue points (G5 copy map, shared/copy.ts)`);
  }

  // R8 banned everywhere (every string, short or not).
  if (wordRules) for (const { re, why } of RATES) if (re.test(text)) { add('R8', why); break; }

  // R10 app builds.
  if (ctx.appScope && !u.webOnly && vocab) {
    for (const { re, what } of APP_WORDS) {
      const m = re.exec(plain);
      if (m) { add('R10', `app builds must not show ${what}: "${m[0]}". Branch it on isApp or use the F7.2 app labels`); break; }
    }
  }

  // Short strings ("100 Tails = $1") get the word rules only: they are too short to carry a claim.
  if (!claimRules || u.short) return out;

  // R1 numbers.
  const num = MAGNITUDE.exec(plain) || HARD_METRIC.exec(plain);
  if (num) {
    const what = num[0].trim();
    const countable = cited.filter((f) => /^[FLC]-/.test(f.id));
    if (!countable.length) {
      add('R1', `"${what}" is a real-world number with no fact id within 3 lines (cite it: data-claim="F-###" or // claim: F-###; a claim:fiction marker does not cover numbers)`);
    } else if (!countable.some((f) => unitMatches(num[2], f.unit))) {
      add('R1', `"${what}" counts ${num[2].toLowerCase()}, but the cited ${countable.map((f) => `${f.id} (${f.unit || 'no unit'})`).join(', ')} count${countable.length === 1 ? 's' : ''} something else; cite the entry for this number`);
    }
  }

  // R2 real-world impact.
  const noun = REAL_NOUN.exec(plain);
  const verb = IMPACT_VERB.exec(plain);
  if (noun && verb && !(ids.length > 0 || ctx.near.fiction)) add('R2', `"${noun[0]}" + "${verb[0]}" is a real-world impact claim with no claim id within 3 lines (cite one, or mark it // claim:fiction <reason>)`);

  // R3 subject of money verbs: the words before the verb, in the same sentence. Whether the copy is
  // about the real world is read from the whole unit ("Shelter treats: every heist funds them.").
  const realWorld = REAL_NOUN.test(plain) || /\b(?:Pink Paw|treats?|shelters?|rescues?|cats?)\b/i.test(plain);
  for (const s of realWorld ? sentences(text) : []) {
    const m = MONEY_VERB.exec(s);
    if (!m) continue;
    const before = s.slice(0, m.index);
    if (GOOD_SUBJECT.test(before)) continue;
    const bad = BAD_SUBJECT.exec(before.replace(BRAND, ' '));
    if (bad) {
      add('R3', `"${bad[0]} … ${m[0]}": money verbs take Token Tails as the subject ("Token Tails sends…", not "${bad[0]} ${m[0]}")`);
      break;
    }
  }

  // R4 tense.
  for (const f of cited) {
    if (f.tense === 'future' && (PRESENT_MONEY.test(plain) || PAST_MONEY.test(plain)) && !FUTURE_MARK.test(plain)) {
      add('R4', `${f.id} is future tense (not live yet); say it opens soon, not that money moves now`);
      break;
    }
  }

  // R6 giver counts.
  for (const re of GIVERS) if (re.test(plain)) { add('R6', 'no giver counts: show what Token Tails sent, never how many people gave'); break; }

  // R7 goals.
  if (GOAL.test(plain) && MONEY_AMOUNT.test(plain) && !cited.some((f) => f.id.startsWith('C-') && f.goal)) {
    add('R7', 'a money goal must cite its C- entry (fund facts build --check proves it is reachable at the cap)');
  }

  // R11 SEI history.
  for (const f of cited) if (f.status === 'sei-era' && !/\bSEI\b/.test(text)) { add('R11', `${f.id} is SEI-era history: the copy must say SEI`); break; }

  // R12 labels and dates.
  if (/\d/.test(plain)) {
    for (const f of cited) {
      if (f.status === 'company-reported' && !/company[- ]reported/i.test(text)) { add('R12', `${f.id} is company-reported: say so next to the number (decision #73)`); break; }
      if (f.id.startsWith('F-') && f.asOf && !DATE_MARK.test(text)) { add('R12', `${f.id} needs its as-of date next to the number (${f.asOf})`); break; }
    }
  }
  return out;
}

/** R5 for one cited id at a line. */
export function checkCitation(id, ctx) {
  const f = ctx.facts.get(id);
  if (!f) return [{ rule: 'R5', message: `${id} is not in the facts registry (facts.json)` }];
  if (f.status === 'unverified' || f.status === 'retired') return [{ rule: 'R5', message: `${id} is ${f.status}: it can't be shown publicly (add a source and verify it, or remove the copy)` }];
  if (ctx.surface && !f.surfaces.includes(ctx.surface)) return [{ rule: 'R5', message: `${id} does not list the "${ctx.surface}" surface in facts.json` }];
  return [];
}
