/**
 * FLAGDATA: buyer countries for Moon Rave cats (flags, the country picker and the countries leaderboard).
 *
 * Contract (shared with the backend, checkout, crowd and HUD lanes):
 *  - A country is an ISO 3166-1 alpha-2 code, upper case (`'LT'`), or null (unknown).
 *    Kosovo `XK` is accepted (Cloudflare reports it). Cloudflare's `XX` (unknown) and `T1` (Tor) are not
 *    countries and read as null, as does anything not in the list below.
 *  - The backend sets an order's `country` from the request IP (`cf-ipcountry`) at checkout; when the IP
 *    gives none, the buyer's pick from the Add-a-cat sheet (`body.country`) is used. `/rave/cats` rows and
 *    `GET /rave/orders/:id` carry `country: string | null`.
 *  - Payouts with no rave order (treats, gifts, history) have no country: their cats hold no flag.
 *
 * Display: names come from `Intl.DisplayNames` (English) with the code as fallback. `flagEmoji` is fine in
 * DOM text on macOS, iOS and Android, but Windows shows two letters instead, so canvas / three.js surfaces
 * should use `drawFlag`, which paints a small simplified flag from `FLAG_DESIGNS` (falls back to a neutral
 * two-letter tag for countries without a design).
 */

// =============================================================================================
// Codes and names
// =============================================================================================

/** Every assigned ISO 3166-1 alpha-2 code, plus XK (Kosovo). */
const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW';

export const COUNTRY_CODES: readonly string[] = Object.freeze(CODES.split(' '));
const CODE_SET = new Set(COUNTRY_CODES);

/** A checked country code (`' lt '` → `'LT'`), or null for unknown / `XX` / `T1` / anything else. */
export function cleanCountry(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.trim().toUpperCase();
  return CODE_SET.has(c) ? c : null;
}

/** Names Intl gets wrong or long-winded for a small flag label. */
const NAME_OVERRIDES: Record<string, string> = {
  XK: 'Kosovo',
  US: 'United States',
  GB: 'United Kingdom',
  KR: 'South Korea',
  KP: 'North Korea',
  RU: 'Russia',
  TW: 'Taiwan',
  HK: 'Hong Kong',
  MO: 'Macao',
  PS: 'Palestine',
  CD: 'DR Congo',
  CG: 'Congo',
};

let displayNames: { of(code: string): string | undefined } | null | undefined;
function intlNames() {
  if (displayNames !== undefined) return displayNames;
  try {
    displayNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }) : null;
  } catch {
    displayNames = null;
  }
  return displayNames;
}

const nameCache = new Map<string, string>();

/** English name of a country (`'LT'` → `'Lithuania'`); the code itself when Intl has no name; '' for null. */
export function countryName(code: string | null | undefined): string {
  const c = cleanCountry(code);
  if (!c) return '';
  const hit = nameCache.get(c);
  if (hit) return hit;
  let name = NAME_OVERRIDES[c];
  if (!name) {
    try {
      name = intlNames()?.of(c) || c;
    } catch {
      name = c;
    }
  }
  nameCache.set(c, name);
  return name;
}

/** Regional-indicator emoji (`'LT'` → 🇱🇹), '' for null. DOM text only (Windows shows letters). */
export function flagEmoji(code: string | null | undefined): string {
  const c = cleanCountry(code);
  if (!c) return '';
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

/**
 * Options for the Add-a-cat country picker, sorted by name. `first` codes (for example the
 * browser-locale guess from `guessCountryFromLocale`) go on top. Excludes uninhabited territories.
 */
export function countryOptions(first: readonly string[] = []): CountryOption[] {
  const skip = new Set(['AQ', 'BV', 'HM', 'GS', 'TF', 'UM', 'IO']);
  const top = [...new Set(first.map(cleanCountry).filter((c): c is string => !!c))];
  const rest = COUNTRY_CODES.filter((c) => !skip.has(c) && !top.includes(c));
  const opt = (code: string): CountryOption => ({ code, name: countryName(code), flag: flagEmoji(code) });
  return [...top.map(opt), ...rest.map(opt).sort((a, b) => a.name.localeCompare(b.name, 'en'))];
}

/**
 * A pre-selection for the picker from browser languages (`'lt-LT'` → `'LT'`, `'en-GB'` → `'GB'`).
 * Only a default for the select; the buyer still confirms it. Null when no language has a region.
 */
export function guessCountryFromLocale(languages: readonly string[] | null | undefined): string | null {
  for (const lang of languages ?? []) {
    if (typeof lang !== 'string') continue;
    const m = /^[a-z]{2,3}(?:-[A-Za-z]{4})?-([A-Za-z]{2})\b/i.exec(lang.trim());
    const c = m ? cleanCountry(m[1]) : null;
    if (c) return c;
  }
  return null;
}

// =============================================================================================
// Leaderboard
// =============================================================================================

export interface CountryRow {
  code: string;
  name: string;
  flag: string;
  /** Cats bought from this country (paid, arriving or landed). */
  cats: number;
  /** Of those, cats whose payout is already in the feed (real, counted cats). */
  landed: number;
  orders: number;
  /** 1-based; ties share a rank. */
  rank: number;
}

export interface CountryBoard {
  rows: CountryRow[];
  /** Number of countries with at least one cat. */
  countries: number;
  /** Cats over all rows (excludes unknown). */
  totalCats: number;
  /** Rave cats whose order has no country (older orders, no IP and no pick). */
  unknownCats: number;  /** Built from DEMO cats (`?cats=N`); every surface must say DEMO. */
  demo?: boolean;
}

export interface CountryEntry {
  country: string | null | undefined;
  cats: number;
  /** The order's payout is in the feed. */
  landed?: boolean;
}

/** Cats per country, most cats first (then most orders, then name). */
export function countryLeaderboard(entries: Iterable<CountryEntry>): CountryBoard {
  const by = new Map<string, { cats: number; landed: number; orders: number }>();
  let unknownCats = 0;
  for (const e of entries) {
    const cats = Number.isInteger(e.cats) && e.cats > 0 ? e.cats : 0;
    if (!cats) continue;
    const c = cleanCountry(e.country);
    if (!c) {
      unknownCats += cats;
      continue;
    }
    const row = by.get(c) ?? { cats: 0, landed: 0, orders: 0 };
    row.cats += cats;
    row.orders += 1;
    if (e.landed) row.landed += cats;
    by.set(c, row);
  }
  const rows: CountryRow[] = [...by].map(([code, r]) => ({ code, name: countryName(code), flag: flagEmoji(code), ...r, rank: 0 }));
  rows.sort((a, b) => b.cats - a.cats || b.orders - a.orders || a.name.localeCompare(b.name, 'en'));
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].cats === r.cats ? rows[i - 1].rank : i + 1;
  });
  return { rows, countries: rows.length, totalCats: rows.reduce((s, r) => s + r.cats, 0), unknownCats };
}

// =============================================================================================
// Small canvas flags (for the crowd's flag texture atlas and the leaderboard on Windows)
// =============================================================================================

/**
 * A simplified flag, readable at ~24 px. Stripes fill the field; the extras are painted on top in
 * this order: band, triangle, canton, cross, plus, diamond, disc.
 */
export interface FlagDesign {
  /** 'h' = horizontal stripes (top to bottom), 'v' = vertical (hoist to fly). */
  dir: 'h' | 'v';
  colors: string[];
  /** Relative stripe sizes (default equal). */
  weights?: number[];
  /** Vertical band at the hoist (AE). */
  band?: { color: string; w: number };
  /** Triangle from the hoist (CZ, PH, CU). `w` = how far it reaches, as a share of the width. */
  triangle?: { color: string; w: number };
  /** Top-left rectangle (US, GR, MY, CL, TW). */
  canton?: { color: string; w: number; h: number };
  /** Off-centre Nordic cross. */
  cross?: { color: string; inner?: string };
  /** Diagonal cross, drawn under `plus` (GB): `inner` is the thin band on top. */
  saltire?: { color: string; inner?: string };
  /** Centred cross (CH, GE, GB). */
  plus?: { color: string; inner?: string; size?: number };
  /** Rhombus (BR). */
  diamond?: { color: string };
  /** Disc / emblem stand-in: centre x, y as a share of w, h; r as a share of h. */
  disc?: { color: string; x?: number; y?: number; r?: number; lower?: string };
  /** Four short dark bars near the corners (KR trigrams), so KR never reads as JP. */
  corners?: string;
}

const h = (...colors: string[]): FlagDesign => ({ dir: 'h', colors });
const v = (...colors: string[]): FlagDesign => ({ dir: 'v', colors });
const alt = (n: number, a: string, b: string) => Array.from({ length: n }, (_, i) => (i % 2 ? b : a));
const NORDIC = (field: string, color: string, inner?: string): FlagDesign => ({ ...h(field), cross: { color, inner } });

export const FLAG_DESIGNS: Readonly<Record<string, FlagDesign>> = Object.freeze({
  // Europe
  LT: h('#FDB913', '#006A44', '#C1272D'),
  LV: { ...h('#9E3039', '#FFFFFF', '#9E3039'), weights: [2, 1, 2] },
  EE: h('#0072CE', '#000000', '#FFFFFF'),
  DE: h('#000000', '#DD0000', '#FFCE00'),
  NL: h('#AE1C28', '#FFFFFF', '#21468B'),
  LU: h('#ED2939', '#FFFFFF', '#00A1DE'),
  AT: h('#ED2939', '#FFFFFF', '#ED2939'),
  PL: h('#FFFFFF', '#DC143C'),
  UA: h('#0057B7', '#FFD700'),
  RU: h('#FFFFFF', '#0039A6', '#D52B1E'),
  BY: { ...h('#C8313E', '#4AA657'), weights: [2, 1] },
  BG: h('#FFFFFF', '#00966E', '#D62612'),
  HU: h('#CD2A3E', '#FFFFFF', '#436F4D'),
  SK: h('#FFFFFF', '#0B4EA2', '#EE1C25'),
  SI: h('#FFFFFF', '#005DA4', '#ED1C24'),
  HR: h('#FF0000', '#FFFFFF', '#171796'),
  RS: h('#C6363C', '#0C4076', '#FFFFFF'),
  ES: { ...h('#AA151B', '#F1BF00', '#AA151B'), weights: [1, 2, 1] },
  FR: v('#002395', '#FFFFFF', '#ED2939'),
  IT: v('#009246', '#FFFFFF', '#CE2B37'),
  IE: v('#169B62', '#FFFFFF', '#FF883E'),
  BE: v('#000000', '#FDDA24', '#EF3340'),
  RO: v('#002B7F', '#FCD116', '#CE1126'),
  MD: v('#0046AE', '#FFD200', '#CC092F'),
  PT: { ...v('#006600', '#FF0000'), weights: [2, 3], disc: { color: '#FFE000', x: 0.4, r: 0.18 } },
  GR: { ...h(...alt(9, '#0D5EAF', '#FFFFFF')), canton: { color: '#0D5EAF', w: 0.37, h: 5 / 9 } },
  CZ: { ...h('#FFFFFF', '#D7141A'), triangle: { color: '#11457E', w: 0.5 } },
  CH: { ...h('#DA291C'), plus: { color: '#FFFFFF', size: 0.6 } },
  GB: { ...h('#012169'), saltire: { color: '#FFFFFF', inner: '#C8102E' }, plus: { color: '#FFFFFF', inner: '#C8102E', size: 1 } },
  DK: NORDIC('#C8102E', '#FFFFFF'),
  SE: NORDIC('#006AA7', '#FECC00'),
  NO: NORDIC('#BA0C2F', '#FFFFFF', '#00205B'),
  FI: NORDIC('#FFFFFF', '#002F6C'),
  IS: NORDIC('#02529C', '#FFFFFF', '#DC1E35'),
  GE: { ...h('#FFFFFF'), plus: { color: '#FF0000', size: 1 } },
  AM: h('#D90012', '#0033A0', '#F2A800'),
  AZ: h('#00B5E2', '#EF3340', '#509E2F'),
  TR: { ...h('#E30A17'), disc: { color: '#FFFFFF', x: 0.4, r: 0.25 } },
  MC: h('#CE1126', '#FFFFFF'),
  // Americas
  US: { ...h(...alt(13, '#B22234', '#FFFFFF')), canton: { color: '#3C3B6E', w: 0.4, h: 7 / 13 } },
  CA: { ...v('#D80621', '#FFFFFF', '#D80621'), weights: [1, 2, 1], disc: { color: '#D80621', r: 0.22 } },
  MX: { ...v('#006847', '#FFFFFF', '#CE1126'), disc: { color: '#8C5A2B', r: 0.14 } },
  BR: { ...h('#009C3B'), diamond: { color: '#FFDF00' }, disc: { color: '#002776', r: 0.22 } },
  AR: { ...h('#74ACDF', '#FFFFFF', '#74ACDF'), disc: { color: '#F6B40E', r: 0.1 } },
  CL: { ...h('#FFFFFF', '#D52B1E'), canton: { color: '#0039A6', w: 1 / 3, h: 0.5 } },
  CO: { ...h('#FCD116', '#003893', '#CE1126'), weights: [2, 1, 1] },
  EC: { ...h('#FFD100', '#0072CE', '#EF3340'), weights: [2, 1, 1] },
  VE: h('#FCE300', '#00247D', '#CF142B'),
  PE: v('#D91023', '#FFFFFF', '#D91023'),
  BO: h('#D52B1E', '#F9E300', '#007934'),
  PY: h('#D52B1E', '#FFFFFF', '#0038A8'),
  UY: { ...h(...alt(9, '#FFFFFF', '#0038A8')), canton: { color: '#FFFFFF', w: 0.33, h: 5 / 9 }, disc: { color: '#FCD116', x: 0.165, y: 0.28, r: 0.14 } },
  CR: { ...h('#002B7F', '#FFFFFF', '#CE1126', '#FFFFFF', '#002B7F'), weights: [1, 1, 2, 1, 1] },
  CU: { ...h('#002A8F', '#FFFFFF', '#002A8F', '#FFFFFF', '#002A8F'), triangle: { color: '#CF142B', w: 0.43 } },
  // Asia and Oceania
  JP: { ...h('#FFFFFF'), disc: { color: '#BC002D', r: 0.3 } },
  KR: { ...h('#FFFFFF'), disc: { color: '#CD2E3A', r: 0.25, lower: '#0047A0' }, corners: '#000000' },
  CN: { ...h('#DE2910'), disc: { color: '#FFDE00', x: 0.17, y: 0.27, r: 0.15 } },
  VN: { ...h('#DA251D'), disc: { color: '#FFFF00', r: 0.28 } },
  HK: { ...h('#DE2910'), disc: { color: '#FFFFFF', r: 0.28 } },
  TW: { ...h('#FE0000'), canton: { color: '#000095', w: 0.5, h: 0.5 }, disc: { color: '#FFFFFF', x: 0.25, y: 0.25, r: 0.13 } },
  IN: { ...h('#FF9933', '#FFFFFF', '#138808'), disc: { color: '#000080', r: 0.12 } },
  PK: { ...v('#FFFFFF', '#01411C'), weights: [1, 3], disc: { color: '#FFFFFF', x: 0.62, r: 0.25 } },
  BD: { ...h('#006A4E'), disc: { color: '#F42A41', x: 0.45, r: 0.3 } },
  ID: h('#FF0000', '#FFFFFF'),
  PH: { ...h('#0038A8', '#CE1126'), triangle: { color: '#FFFFFF', w: 0.43 } },
  TH: { ...h('#A51931', '#F4F5F8', '#2D2A4A', '#F4F5F8', '#A51931'), weights: [1, 1, 2, 1, 1] },
  MY: { ...h(...alt(14, '#CC0001', '#FFFFFF')), canton: { color: '#010066', w: 0.5, h: 0.57 }, disc: { color: '#FFCC00', x: 0.25, y: 0.28, r: 0.15 } },
  SG: { ...h('#EF3340', '#FFFFFF'), disc: { color: '#FFFFFF', x: 0.2, y: 0.25, r: 0.14 } },
  KZ: { ...h('#00AFCA'), disc: { color: '#FEC50C', r: 0.2 } },
  UZ: h('#0099B5', '#FFFFFF', '#1EB53A'),
  IL: { ...h('#FFFFFF', '#0038B8', '#FFFFFF', '#0038B8', '#FFFFFF'), weights: [1, 1, 4, 1, 1], disc: { color: '#0038B8', r: 0.15 } },
  AE: { ...h('#00732F', '#FFFFFF', '#000000'), band: { color: '#FF0000', w: 0.25 } },
  SA: { ...h('#006C35'), disc: { color: '#FFFFFF', r: 0.1 } },
  AU: { ...h('#012169'), canton: { color: '#012169', w: 0.5, h: 0.5 }, plus: { color: '#FFFFFF', inner: '#C8102E', size: 0.5 }, disc: { color: '#FFFFFF', x: 0.75, y: 0.55, r: 0.1 } },
  NZ: { ...h('#012169'), disc: { color: '#C8102E', x: 0.75, y: 0.5, r: 0.1 } },
  // Africa and Middle East
  EG: h('#CE1126', '#FFFFFF', '#000000'),
  NG: v('#008751', '#FFFFFF', '#008751'),
  GH: { ...h('#CE1126', '#FCD116', '#006B3F'), disc: { color: '#000000', r: 0.12 } },
  KE: { ...h('#000000', '#FFFFFF', '#BB0000', '#FFFFFF', '#006600'), weights: [3, 1, 3, 1, 3] },
  ZA: { ...h('#DE3831', '#FFFFFF', '#007A4D', '#FFFFFF', '#002395'), weights: [5, 1, 3, 1, 5], triangle: { color: '#000000', w: 0.35 } },
  MA: { ...h('#C1272D'), disc: { color: '#006233', r: 0.16 } },
  DZ: { ...v('#006233', '#FFFFFF'), disc: { color: '#D21034', r: 0.22 } },
  TN: { ...h('#E70013'), disc: { color: '#FFFFFF', r: 0.3 } },
});

/** The simplified design for a country, or null (draw the neutral tag / hold no flag). */
export function flagDesign(code: string | null | undefined): FlagDesign | null {
  const c = cleanCountry(code);
  return c ? (FLAG_DESIGNS[c] ?? null) : null;
}

/** The subset of CanvasRenderingContext2D `drawFlag` uses. */
export interface FlagCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
}

/** Neutral tag colours for countries without a design. */
export const NEUTRAL_FLAG = { field: '#2B1B4A', text: '#FFFFFF' } as const;

/**
 * Paints a small flag into (x, y, w, h). Countries without a design get a neutral tag with the
 * two-letter code. Returns 'design' | 'code' | 'none' (null / unknown country: nothing drawn).
 */
export function drawFlag(ctx: FlagCtx, code: string | null | undefined, x: number, y: number, w: number, hgt: number): 'design' | 'code' | 'none' {
  const c = cleanCountry(code);
  if (!c) return 'none';
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, hgt);
  ctx.clip();
  const d = FLAG_DESIGNS[c];
  if (!d) {
    ctx.fillStyle = NEUTRAL_FLAG.field;
    ctx.fillRect(x, y, w, hgt);
    ctx.fillStyle = NEUTRAL_FLAG.text;
    ctx.font = `bold ${Math.round(hgt * 0.6)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c, x + w / 2, y + hgt / 2 + hgt * 0.04);
    ctx.restore();
    return 'code';
  }
  // Stripes.
  const weights = d.weights && d.weights.length === d.colors.length ? d.weights : d.colors.map(() => 1);
  const sum = weights.reduce((s, n) => s + n, 0) || 1;
  const span = d.dir === 'h' ? hgt : w;
  let at = 0;
  d.colors.forEach((color, i) => {
    const size = (weights[i] / sum) * span;
    ctx.fillStyle = color;
    // +0.5 px overlap hides seams between stripes.
    if (d.dir === 'h') ctx.fillRect(x, y + at, w, size + 0.5);
    else ctx.fillRect(x + at, y, size + 0.5, hgt);
    at += size;
  });
  if (d.band) {
    ctx.fillStyle = d.band.color;
    ctx.fillRect(x, y, w * d.band.w, hgt);
  }
  if (d.triangle) {
    ctx.fillStyle = d.triangle.color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w * d.triangle.w, y + hgt / 2);
    ctx.lineTo(x, y + hgt);
    ctx.closePath();
    ctx.fill();
  }
  if (d.canton) {
    ctx.fillStyle = d.canton.color;
    ctx.fillRect(x, y, w * d.canton.w, hgt * d.canton.h);
  }
  if (d.cross) {
    const t = hgt * 0.24;
    const cx = x + w * 0.36;
    const cy = y + hgt / 2;
    ctx.fillStyle = d.cross.color;
    ctx.fillRect(cx - t / 2, y, t, hgt);
    ctx.fillRect(x, cy - t / 2, w, t);
    if (d.cross.inner) {
      const ti = t * 0.5;
      ctx.fillStyle = d.cross.inner;
      ctx.fillRect(cx - ti / 2, y, ti, hgt);
      ctx.fillRect(x, cy - ti / 2, w, ti);
    }
  }
  if (d.saltire) {
    // Two diagonal bands as quads (FlagCtx has no stroke); the flag clip trims the ends.
    const band = (e: number, color: string) => {
      ctx.fillStyle = color;
      for (const [x0, x1] of [[x, x + w], [x + w, x]]) {
        ctx.beginPath();
        ctx.moveTo(x0 - e, y);
        ctx.lineTo(x0 + e, y);
        ctx.lineTo(x1 + e, y + hgt);
        ctx.lineTo(x1 - e, y + hgt);
        ctx.closePath();
        ctx.fill();
      }
    };
    band(w * 0.11, d.saltire.color);
    if (d.saltire.inner) band(w * 0.04, d.saltire.inner);
  }
  if (d.plus) {
    // `size` 1 = full-width bars (GB, GE); < 1 = a free-standing cross (CH). In a canton (AU) it stays there.
    const size = d.plus.size ?? 1;
    const area = d.canton ? { x, y, w: w * d.canton.w, h: hgt * d.canton.h } : { x, y, w, h: hgt };
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;
    const len = size >= 1 ? Math.max(area.w, area.h) : area.h * size;
    const t = area.h * (size >= 1 ? 0.3 : 0.18);
    const paint = (color: string, th: number) => {
      ctx.fillStyle = color;
      const lw = size >= 1 ? area.w : len;
      const lh = size >= 1 ? area.h : len;
      ctx.fillRect(cx - lw / 2, cy - th / 2, lw, th);
      ctx.fillRect(cx - th / 2, cy - lh / 2, th, lh);
    };
    paint(d.plus.color, t);
    if (d.plus.inner) paint(d.plus.inner, t * 0.55);
  }
  if (d.diamond) {
    const mx = w * 0.08;
    const my = hgt * 0.12;
    ctx.fillStyle = d.diamond.color;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + my);
    ctx.lineTo(x + w - mx, y + hgt / 2);
    ctx.lineTo(x + w / 2, y + hgt - my);
    ctx.lineTo(x + mx, y + hgt / 2);
    ctx.closePath();
    ctx.fill();
  }
  if (d.disc) {
    ctx.fillStyle = d.disc.color;
    ctx.beginPath();
    const cx = x + w * (d.disc.x ?? 0.5);
    const cy = y + hgt * (d.disc.y ?? 0.5);
    const r = hgt * (d.disc.r ?? 0.2);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (d.disc.lower) {
      ctx.fillStyle = d.disc.lower;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI);
      ctx.fill();
    }
  }
  if (d.corners) {
    ctx.fillStyle = d.corners;
    const bw = w * 0.13;
    const bh = hgt * 0.16;
    for (const [fx, fy] of [[0.1, 0.12], [0.77, 0.12], [0.1, 0.72], [0.77, 0.72]]) ctx.fillRect(x + w * fx, y + hgt * fy, bw, bh);
  }
  ctx.restore();
  return 'design';
}

// =============================================================================================
// IP country (for the picker: hidden when the server detected one)
// =============================================================================================

/** `GET /rave/geo` → `{ country: 'LT' | null }` (backend reads `cf-ipcountry`; `Cache-Control: private, no-store`). */
export const RAVE_GEO_PATH = '/rave/geo';

/**
 * The country the backend sees for this viewer's IP, or null (no API, no header, XX / T1, error, timeout).
 * Null means: show the country picker in the Add-a-cat sheet. Never rejects.
 */
export async function fetchGeoCountry(
  api: string | null,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
  timeoutMs = 4_000,
): Promise<string | null> {
  if (!api) return null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(`${api.replace(/\/+$/, '')}${RAVE_GEO_PATH}`, { signal: ctrl?.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    return body && typeof body === 'object' ? cleanCountry((body as Record<string, unknown>).country) : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
