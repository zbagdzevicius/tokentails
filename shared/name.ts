/**
 * Cat name rules for Meet your cat, renames and moderation (plan G3, decisions #22 and #23).
 *
 * `normalizeCatName` is the one check. The backend runs it on every name it stores
 * (`POST /user/starter`, `PUT /cat/:id/name`, `PUT /cat/:id/name/moderate`); the client and the CMS
 * run the same code for inline validation. The only input the backend adds is `reserved`: the names
 * of the real shelter cats featured right now, which the client gets from
 * `GET /blessing/featured/names` and passes in the same way. With that list, a name the form accepts
 * is not refused by the API; without it (the list could not be loaded, or the featured set changed
 * since), the API can still answer NAME_RESERVED for one of those few names.
 *
 * Rules, in order:
 *   1. NFKC, smart apostrophes and dashes to ASCII, invisible characters removed, spaces collapsed.
 *   2. Latin letters (with diacritics, so Lithuanian works), digits 0-9, and single spaces,
 *      apostrophes or hyphens between them. At least one letter. Anything else is NAME_CHARS:
 *      decision #23 keeps the charset Latin only for now, which also stops Cyrillic look-alikes.
 *      A Latin letter that does not fold to a-z (`ƒ`, `ŧ`, `ƀ`, `ǀ`, ...) is NAME_CHARS too: it
 *      would vanish from the folded skeleton the word lists are matched on (3c review).
 *   3. 2 to 16 characters (NAME_TOO_SHORT, NAME_TOO_LONG).
 *   4. English and Lithuanian profanity, matched on a folded skeleton (lowercase, no accents, leet
 *      digits as letters, separators removed) is NAME_BLOCKED. A letter written n times in a listed
 *      word matches n or more times in the name, so `Fuuuck` and `Booob` are caught while `Bob`
 *      (one `o`, not two) and `As` (one `s`) are not.
 *   5. Reserved names (staff, brand, system words, and the real shelter cats passed in `reserved`)
 *      are NAME_RESERVED.
 *
 * Framework-free and TypeScript 4.8 compatible. No `u` regex flag and no `\p{}` classes, because
 * the client compiles for ES5. Edit here, then run `node scripts/sync-contracts.mjs`.
 */
import { ErrorCode } from './errors';

export const CAT_NAME_MIN_LENGTH = 2;
/** One free rename per this many days (decision #22). Names are frozen once the cat is minted. */
export const CAT_RENAME_COOLDOWN_DAYS = 30;
export const CAT_NAME_MAX_LENGTH = 16;
/** Raw input longer than this is refused before any work is done on it. */
const RAW_INPUT_LIMIT = 64;

export type CatNameErrorCode =
    | typeof ErrorCode.NAME_TOO_SHORT
    | typeof ErrorCode.NAME_TOO_LONG
    | typeof ErrorCode.NAME_CHARS
    | typeof ErrorCode.NAME_RESERVED
    | typeof ErrorCode.NAME_BLOCKED;

export type CatNameResult = { ok: true; name: string } | { ok: false; code: CatNameErrorCode };

export interface ICatNameOptions {
    /**
     * Extra reserved names, compared on the folded skeleton. The backend passes the names of the
     * real shelter cats it features, so a starter cannot pose as one of them.
     */
    reserved?: ReadonlyArray<string>;
}

/** Player-facing message for each error code. */
export const CAT_NAME_MESSAGES: Readonly<Record<CatNameErrorCode, string>> = {
    NAME_TOO_SHORT: `Use at least ${CAT_NAME_MIN_LENGTH} characters.`,
    NAME_TOO_LONG: `Use at most ${CAT_NAME_MAX_LENGTH} characters.`,
    NAME_CHARS: 'Use letters, numbers, spaces, apostrophes or hyphens.',
    NAME_RESERVED: 'That name is taken. Try another one.',
    NAME_BLOCKED: 'Please choose a kinder name.',
};

// Latin letters: ASCII, Latin-1 Supplement (without the multiplication and division signs), Latin
// Extended-A and -B, and Latin Extended Additional.
const LATIN_LETTER = 'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF';
const LETTER_RE = new RegExp('[' + LATIN_LETTER + ']');
const ALLOWED_RE = new RegExp('^[' + LATIN_LETTER + "0-9' -]+$");
// A word is letters or digits; words are joined by exactly one space, apostrophe or hyphen.
const SHAPE_RE = new RegExp('^[' + LATIN_LETTER + "0-9]+(?:[' -][" + LATIN_LETTER + '0-9]+)*$');

const APOSTROPHES_RE = /[\u2018\u2019\u201A\u201B\u2032\u02BC\u02B9\u00B4`]/g;
const DASHES_RE = /[\u2010\u2011\u2012\u2013\u2014\u2212\uFE63\uFF0D]/g;
// Zero-width characters, soft hyphen, word joiners, BOM and bidi controls.
const INVISIBLE_RE = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;
const SPACES_RE = /[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g;
const COMBINING_RE = /[\u0300-\u036F]/g;

const LEET: Readonly<Record<string, string>> = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '8': 'b',
    '9': 'g',
    '@': 'a',
    $: 's',
    '!': 'i',
    '|': 'i',
};

// Letters that do not decompose under NFD.
const FOLD_LETTERS: Readonly<Record<string, string>> = {
    '\u00DF': 'ss',
    '\u00E6': 'ae',
    '\u0153': 'oe',
    '\u00F8': 'o',
    '\u0142': 'l',
    '\u0111': 'd',
    '\u00F0': 'd',
    '\u00FE': 'th',
    '\u0131': 'i',
    '\u0127': 'h',
};

const codePointLength = (value: string) => value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '_').length;

/** Lowercase, accents and leet removed, everything but a-z and 0-9 dropped. Used for matching only. */
export function foldCatName(value: string): string {
    const lower = String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .normalize('NFD')
        .replace(COMBINING_RE, '');
    let out = '';
    for (let i = 0; i < lower.length; i += 1) {
        const ch = lower.charAt(i);
        const mapped = LEET[ch] || FOLD_LETTERS[ch] || ch;
        out += mapped;
    }
    return out.replace(/[^a-z0-9]/g, '');
}

/**
 * Regex source for a folded word in which a run of n copies of a letter matches n or more copies:
 * `ass` -> `as{2,}`, `boob` -> `bo{2,}b`. Stretched spellings (`Fuuuck`, `Booob`) still match, and a
 * shorter spelling never does (`Bob` is not `boob`). Folded words are only a-z and 0-9, so nothing
 * needs escaping.
 */
function runPattern(word: string): string {
    let out = '';
    let i = 0;
    while (i < word.length) {
        let j = i;
        while (j < word.length && word.charAt(j) === word.charAt(i)) {
            j += 1;
        }
        out += word.charAt(i) + '{' + (j - i) + ',}';
        i = j;
    }
    return out;
}

/** One regex for a list of folded words: anchored as a whole word, as a word prefix, or anywhere. */
function wordsRegex(words: ReadonlyArray<string>, mode: 'whole' | 'prefix' | 'anywhere'): RegExp {
    const alternatives = words.map(runPattern).join('|');
    if (mode === 'whole') {
        return new RegExp('^(?:' + alternatives + ')$');
    }
    return new RegExp((mode === 'prefix' ? '^' : '') + '(?:' + alternatives + ')');
}

/*
 * Reserved: the whole folded name, compared exactly (no stretching, so `Rot` is not `root` and
 * `Nul` is not `null`). Starter breed names (Scout, Pinkie, ...) are NOT reserved: they are the
 * defaults and a player may keep them.
 */
const RESERVED_EXACT = [
    'admin',
    'administrator',
    'mod',
    'mods',
    'moderator',
    'staff',
    'support',
    'help',
    'helpdesk',
    'official',
    'system',
    'root',
    'owner',
    'founder',
    'team',
    'bot',
    'null',
    'undefined',
    'guest',
    'anonymous',
    'anon',
    'deleted',
    'unknown',
    'test',
    'tokentails',
    'tt',
    'pinkpaw',
    'catfluencer',
    'catfluencers',
    'shelter',
    'rescue',
];
/*
 * Staff impersonation. `admin` is reserved as a word of its own (`Cat Admin`, `Admin 2`), or glued to
 * a staff prefix (`TTAdmin`, `ModAdmin`, `OfficialAdmin`), never inside another word (`Badminton`).
 */
const RESERVED_ADMIN_RE = new RegExp(
    '^(?:tt|tokentails?|mod|mods|official|team|staff|site|sys|super|head|real|the)?' +
        runPattern('admin') +
        '(?:istrator|s)?[0-9]*$'
);
// Reserved anywhere inside the folded name, so `Official Cat` or `TokenTails Cat` are caught too.
// Only words no ordinary name contains.
const RESERVED_ANYWHERE_RE = wordsRegex(['moderator', 'tokentail', 'official', 'pinkpaw', 'catfluencer'], 'anywhere');

/*
 * Blocked words, in three groups to avoid the Scunthorpe problem:
 * - anywhere in the folded name: words that are never part of a harmless name;
 * - at the start of a word: `cunt` (Cunty) and `rapist`, but not inside one (Scunthorpe, Therapist);
 * - whole words only: short words that are often part of harmless names (cock in Peacock, ass in
 *   Cassie, rape in Grape, cum in Cucumber, shit in Shiitake, fuk in Fukuoka, nazi in Nazira).
 * The whole folded name also counts as a word, so spaced-out letters (`A S S`) are caught.
 *
 * Decision (3c review): `pussy` stays blocked anywhere, so `Pussycat` is refused. The game is for
 * all ages (App Store 1.2) and the word is ambiguous out of context; moderators cannot override it.
 */
const BLOCKED_ANYWHERE = [
    // English
    'fuck',
    'bitch',
    'nigger',
    'nigga',
    'faggot',
    'whore',
    'slut',
    'pussy',
    'penis',
    'vagina',
    'porn',
    'dildo',
    'asshole',
    'bastard',
    'retard',
    'hitler',
    'twat',
    'blowjob',
    'jizz',
    'wanker',
    'motherf',
    // Compounds whose parts are whole-word-only below (3c review). Not `shit` as a prefix: Shiitake.
    'dickhead',
    'cocksuck',
    'shitface',
    'cumshot',
    'jackass',
    'dumbass',
    'sexcat',
    'fukyou',
    // Drugs (plan G8 removes drug cues; real featured cat names are screened with this list too)
    'viagra',
    // Lithuanian (and the Russian loans common in Lithuanian slang)
    'bybis',
    'pizd',
    'pyzd',
    'kurva',
    'nachui',
    'nahui',
    'nahuj',
    'pidar',
    'pydar',
    'pimpal',
    'kekse',
    'dulkin',
    'chuj',
    'blyat',
    'bliat',
    // Added in the 3c review (accepted before): Lithuanian slurs and the Polish loan.
    'pyder',
    'pederast',
    'byby',
    'kurw',
    'pedofil',
    'pedophil',
];
const BLOCKED_PREFIXES = ['cunt', 'rapist'];
const BLOCKED_WORDS = [
    // English
    'shit',
    'shits',
    'shitty',
    'shithead',
    'bullshit',
    'fuk',
    'fuker',
    'fukin',
    'fuking',
    'phuck',
    'phuk',
    'fvck',
    'fvk',
    'nazi',
    'nazis',
    'ass',
    'arse',
    'anal',
    'anus',
    'cock',
    'dick',
    'cum',
    'sex',
    'sexy',
    'tit',
    'tits',
    'titty',
    'titties',
    'boob',
    'boobs',
    'boobie',
    'boobies',
    'rape',
    'fag',
    'wank',
    'kkk',
    'milf',
    'horny',
    'nude',
    'nudes',
    'meth',
    'cocaine',
    'heroin',
    // Lithuanian
    'sudas',
    'subine',
    'sikna',
    'debilas',
    'lochas',
    'suka',
    'blet',
    'bled',
    'huj',
    // Added in the 3c review. Whole words only, so Niger, Nigeria, Negroni and Pedro stay accepted.
    'nigeris',
    'nigere',
    'nigerai',
    'negras',
    'negre',
    'negrai',
    'negro',
    'negroes',
    // Abbreviated or borrowed (3c review)
    'fck',
    'fcking',
    'kunt',
    'hore',
    'pedo',
    'heil',
];

const BLOCKED_ANYWHERE_RE = wordsRegex(BLOCKED_ANYWHERE, 'anywhere');
const BLOCKED_PREFIX_RE = wordsRegex(BLOCKED_PREFIXES, 'prefix');
const BLOCKED_WORD_RE = wordsRegex(BLOCKED_WORDS, 'whole');
const RESERVED_EXACT_SET: Record<string, true> = {};
for (const word of RESERVED_EXACT) {
    RESERVED_EXACT_SET[word] = true;
}

/** The folded words of a name, plus the whole folded name as one more word. */
function foldedWords(name: string): string[] {
    const words = name.split(/[' -]+/).map(foldCatName);
    words.push(foldCatName(name));
    return words.filter(word => !!word);
}

function isBlocked(name: string): boolean {
    if (BLOCKED_ANYWHERE_RE.test(foldCatName(name))) {
        return true;
    }
    return foldedWords(name).some(word => BLOCKED_WORD_RE.test(word) || BLOCKED_PREFIX_RE.test(word));
}

function isReserved(name: string, extra: ReadonlyArray<string>): boolean {
    const folded = foldCatName(name);
    if (RESERVED_EXACT_SET[folded] || RESERVED_ANYWHERE_RE.test(folded)) {
        return true;
    }
    if (foldedWords(name).some(word => RESERVED_ADMIN_RE.test(word))) {
        return true;
    }
    for (const reserved of extra) {
        const other = foldCatName(reserved);
        if (other && other === folded) {
            return true;
        }
    }
    return false;
}

/**
 * True when the name contains a blocked word (rule 4), whatever its characters. The backend uses it
 * to keep real shelter cats with an unsuitable name out of the all-ages Meet your cat screen.
 */
export function isBlockedCatName(input: unknown): boolean {
    return typeof input === 'string' && isBlocked(clean(input.slice(0, RAW_INPUT_LIMIT * 4)));
}

/** True when a Latin letter of the name has no a-z skeleton, so the word lists cannot see it. */
function hasUnfoldableLetter(name: string): boolean {
    for (let i = 0; i < name.length; i += 1) {
        const ch = name.charAt(i);
        if (LETTER_RE.test(ch) && !foldCatName(ch)) {
            return true;
        }
    }
    return false;
}

/** Cleans the raw input; the result is what gets stored when it passes. */
function clean(input: string): string {
    return input
        .normalize('NFKC')
        .replace(INVISIBLE_RE, '')
        .replace(APOSTROPHES_RE, "'")
        .replace(DASHES_RE, '-')
        .replace(SPACES_RE, ' ')
        .replace(/^ +| +$/g, '');
}

/**
 * Validates and normalises a cat name. Returns `{ok: true, name}` with the name to store, or
 * `{ok: false, code}` with one of the NAME_* error codes. Never throws.
 */
export function normalizeCatName(input: unknown, options: ICatNameOptions = {}): CatNameResult {
    if (typeof input !== 'string') {
        return { ok: false, code: ErrorCode.NAME_TOO_SHORT };
    }
    if (input.length > RAW_INPUT_LIMIT) {
        return { ok: false, code: ErrorCode.NAME_TOO_LONG };
    }
    const name = clean(input);
    if (!name) {
        return { ok: false, code: ErrorCode.NAME_TOO_SHORT };
    }
    if (!ALLOWED_RE.test(name) || !LETTER_RE.test(name) || hasUnfoldableLetter(name)) {
        return { ok: false, code: ErrorCode.NAME_CHARS };
    }
    const length = codePointLength(name);
    if (length < CAT_NAME_MIN_LENGTH) {
        return { ok: false, code: ErrorCode.NAME_TOO_SHORT };
    }
    if (length > CAT_NAME_MAX_LENGTH) {
        return { ok: false, code: ErrorCode.NAME_TOO_LONG };
    }
    if (!SHAPE_RE.test(name)) {
        // Allowed characters, wrong shape: `--`, `' '`, or a name that starts or ends with one.
        return { ok: false, code: ErrorCode.NAME_CHARS };
    }
    if (isBlocked(name)) {
        return { ok: false, code: ErrorCode.NAME_BLOCKED };
    }
    if (isReserved(name, options.reserved || [])) {
        return { ok: false, code: ErrorCode.NAME_RESERVED };
    }
    return { ok: true, name };
}

/*
 * Name reports (App Store guideline 1.2): the vocabulary shared by the backend schema
 * (`name_reports`), PUT /cat/:id/name/moderate and the CMS moderation page.
 */
export const NAME_REPORT_REASONS = ['offensive', 'impersonation', 'personal-info', 'other'] as const;
export type NameReportReason = typeof NAME_REPORT_REASONS[number];

export const NAME_REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const;
export type NameReportStatus = typeof NAME_REPORT_STATUSES[number];

export const NAME_MODERATION_ACTIONS = ['reset', 'rename', 'dismiss'] as const;
export type NameModerationAction = typeof NAME_MODERATION_ACTIONS[number];

export const NAME_REPORT_NOTE_LIMIT = 200;

/** True when two names would read as the same name (case, accents and spacing ignored). */
export function sameCatName(a: string, b: string): boolean {
    return foldCatName(a) === foldCatName(b);
}

export interface ICatNameVector {
    input: string;
    /** `ok`, or the error code. */
    expect: 'ok' | CatNameErrorCode;
    /** The stored name when `expect` is `ok` (defaults to `input`). */
    name?: string;
    /** Extra reserved names for this case. */
    reserved?: string[];
}

/**
 * Shared test vectors. The backend spec and the client test both run every one of them, so the two
 * copies can never disagree (G3 acceptance: 60+ vectors).
 */
export const CAT_NAME_VECTORS: ReadonlyArray<ICatNameVector> = [
    // Accepted
    { input: 'Luna', expect: 'ok' },
    { input: 'Scout', expect: 'ok' },
    { input: 'Pinkie', expect: 'ok' },
    { input: 'Mr Whiskers', expect: 'ok' },
    { input: "O'Malley", expect: 'ok' },
    { input: 'O\u2019Malley', expect: 'ok', name: "O'Malley" },
    { input: 'Žvaigždutė', expect: 'ok' },
    { input: 'Rūta', expect: 'ok' },
    { input: 'Kęstutis', expect: 'ok' },
    { input: 'Ąžuolas', expect: 'ok' },
    { input: 'Šaltinėlis', expect: 'ok' },
    { input: 'Zoë', expect: 'ok' },
    { input: 'Renée', expect: 'ok' },
    { input: 'Façade', expect: 'ok' },
    { input: 'Smørrebrød', expect: 'ok' },
    { input: 'Jean-Luc', expect: 'ok' },
    { input: 'Jean\u2013Luc', expect: 'ok', name: 'Jean-Luc' },
    { input: 'R2D2', expect: 'ok' },
    { input: 'Agent 007', expect: 'ok' },
    { input: 'Al', expect: 'ok' },
    { input: 'Bo', expect: 'ok' },
    { input: 'Nimbus', expect: 'ok' },
    { input: 'Sixteen Chars Ok', expect: 'ok' },
    { input: '  Luna  ', expect: 'ok', name: 'Luna' },
    { input: 'Mr   Whiskers', expect: 'ok', name: 'Mr Whiskers' },
    { input: 'Lu\u200Bna', expect: 'ok', name: 'Luna' },
    { input: '\uFF2C\uFF55\uFF4E\uFF41', expect: 'ok', name: 'Luna' },
    { input: 'Cassie', expect: 'ok' },
    { input: 'Peacock', expect: 'ok' },
    { input: 'Grape', expect: 'ok' },
    { input: 'Cucumber', expect: 'ok' },
    { input: 'Dickens', expect: 'ok' },
    { input: 'Swanky', expect: 'ok' },
    { input: 'Sussex', expect: 'ok' },
    { input: 'Modesty', expect: 'ok' },
    { input: 'Teacup', expect: 'ok' },
    { input: 'Kalė', expect: 'ok' },
    { input: 'Luna', expect: 'ok', reserved: ['Mila', 'Pupa'] },
    // A listed word matches only with at least as many repeats as it is written with (3c review)
    { input: 'Bob', expect: 'ok' },
    { input: 'Bobs', expect: 'ok' },
    { input: 'Mr Bob', expect: 'ok' },
    { input: 'Bob Marley', expect: 'ok' },
    { input: 'As', expect: 'ok' },
    { input: 'Rot', expect: 'ok' },
    { input: 'Nul', expect: 'ok' },
    { input: 'Staf', expect: 'ok' },
    { input: 'Suport', expect: 'ok' },
    { input: 'Milla', expect: 'ok', reserved: ['Mila'] },
    // Short words inside harmless names (3c review)
    { input: 'Shiitake', expect: 'ok' },
    { input: 'Fukuoka', expect: 'ok' },
    { input: 'Nazira', expect: 'ok' },
    { input: 'Scunthorpe', expect: 'ok' },
    { input: 'Fu Kitty', expect: 'ok' },
    { input: 'Badminton', expect: 'ok' },
    { input: 'Medutis', expect: 'ok' },
    { input: 'Saulė', expect: 'ok' },
    { input: 'Titan', expect: 'ok' },
    { input: 'Niger', expect: 'ok' },
    { input: 'Therapist', expect: 'ok' },
    // Too short / too long
    { input: '', expect: 'NAME_TOO_SHORT' },
    { input: '   ', expect: 'NAME_TOO_SHORT' },
    { input: 'A', expect: 'NAME_TOO_SHORT' },
    { input: 'Ž', expect: 'NAME_TOO_SHORT' },
    { input: 'Seventeen chars x', expect: 'NAME_TOO_LONG' },
    { input: 'Supercalifragilistic', expect: 'NAME_TOO_LONG' },
    { input: 'x'.repeat(100), expect: 'NAME_TOO_LONG' },
    // Characters
    { input: '\u0430dmin', expect: 'NAME_CHARS' },
    { input: 'Мурка', expect: 'NAME_CHARS' },
    { input: 'Γάτα', expect: 'NAME_CHARS' },
    { input: '猫ちゃん', expect: 'NAME_CHARS' },
    { input: 'Luna 🐱', expect: 'NAME_CHARS' },
    { input: '<script>', expect: 'NAME_CHARS' },
    { input: 'Luna!', expect: 'NAME_CHARS' },
    { input: 'luna@cats', expect: 'NAME_CHARS' },
    { input: 'Tom_Cat', expect: 'NAME_CHARS' },
    { input: '12345', expect: 'NAME_CHARS' },
    { input: "'Luna", expect: 'NAME_CHARS' },
    { input: 'Luna-', expect: 'NAME_CHARS' },
    { input: 'Lu--na', expect: 'NAME_CHARS' },
    { input: 'Lu\u0000na', expect: 'NAME_CHARS' },
    { input: 'Lu\u00D7na', expect: 'NAME_CHARS' },
    // Latin letters with no a-z skeleton would hide a blocked or reserved word (3c review)
    { input: '\u0192uck', expect: 'NAME_CHARS' },
    { input: 'Bi\u0167ch', expect: 'NAME_CHARS' },
    { input: '\u0180itch', expect: 'NAME_CHARS' },
    { input: 'Adm\u01C0n', expect: 'NAME_CHARS' },
    { input: 'Lu\u019Ana', expect: 'NAME_CHARS' },
    // Latin Extended-B letters that do decompose stay accepted (Romanian, Vietnamese)
    { input: '\u0218tefan', expect: 'ok' },
    { input: 'Ph\u01B0\u01A1ng', expect: 'ok' },
    // Reserved
    { input: 'Admin', expect: 'NAME_RESERVED' },
    { input: 'ADMIN', expect: 'NAME_RESERVED' },
    { input: 'Âdmïn', expect: 'NAME_RESERVED' },
    { input: '4dm1n', expect: 'NAME_RESERVED' },
    { input: 'TT Admin 2', expect: 'NAME_RESERVED' },
    { input: 'Cat Admin', expect: 'NAME_RESERVED' },
    { input: 'TTAdmin', expect: 'NAME_RESERVED' },
    { input: 'Admins', expect: 'NAME_RESERVED' },
    { input: 'Moderator', expect: 'NAME_RESERVED' },
    { input: 'Token Tails', expect: 'NAME_RESERVED' },
    { input: 'TokenTails Cat', expect: 'NAME_RESERVED' },
    { input: 'Official Cat', expect: 'NAME_RESERVED' },
    { input: 'Support', expect: 'NAME_RESERVED' },
    { input: 'Pink Paw', expect: 'NAME_RESERVED' },
    { input: 'null', expect: 'NAME_RESERVED' },
    { input: 'Guest', expect: 'NAME_RESERVED' },
    { input: 'Mila', expect: 'NAME_RESERVED', reserved: ['Mila', 'Pupa'] },
    { input: 'MILA', expect: 'NAME_RESERVED', reserved: ['Mila'] },
    { input: 'Pūpa', expect: 'NAME_RESERVED', reserved: ['Pupa'] },
    // Blocked (English)
    { input: 'Fuck', expect: 'NAME_BLOCKED' },
    { input: 'Fuuuck', expect: 'NAME_BLOCKED' },
    { input: 'F u c k', expect: 'NAME_BLOCKED' },
    { input: 'Sh1t', expect: 'NAME_BLOCKED' },
    { input: 'Bitchy', expect: 'NAME_BLOCKED' },
    { input: 'B1tch', expect: 'NAME_BLOCKED' },
    { input: 'Ass', expect: 'NAME_BLOCKED' },
    { input: 'Big Ass', expect: 'NAME_BLOCKED' },
    { input: 'Dick', expect: 'NAME_BLOCKED' },
    { input: 'Hitler', expect: 'NAME_BLOCKED' },
    { input: 'Pussy Cat', expect: 'NAME_BLOCKED' },
    { input: 'Assshole', expect: 'NAME_BLOCKED' },
    { input: 'Booob', expect: 'NAME_BLOCKED' },
    { input: 'Boobie', expect: 'NAME_BLOCKED' },
    { input: 'Titty', expect: 'NAME_BLOCKED' },
    { input: 'Phuck', expect: 'NAME_BLOCKED' },
    { input: 'Fvck', expect: 'NAME_BLOCKED' },
    { input: 'Sexy', expect: 'NAME_BLOCKED' },
    { input: 'Shitty', expect: 'NAME_BLOCKED' },
    { input: 'S h i t', expect: 'NAME_BLOCKED' },
    { input: 'Fuk', expect: 'NAME_BLOCKED' },
    { input: 'Nazi', expect: 'NAME_BLOCKED' },
    { input: 'Cunty', expect: 'NAME_BLOCKED' },
    { input: 'Pussycat', expect: 'NAME_BLOCKED' },
    { input: 'Dickhead', expect: 'NAME_BLOCKED' },
    { input: 'Cocksucker', expect: 'NAME_BLOCKED' },
    { input: 'Shitface', expect: 'NAME_BLOCKED' },
    { input: 'Jackass', expect: 'NAME_BLOCKED' },
    { input: 'Dumbass', expect: 'NAME_BLOCKED' },
    { input: 'Cumshot', expect: 'NAME_BLOCKED' },
    { input: 'Sexcat', expect: 'NAME_BLOCKED' },
    { input: 'Fukyou', expect: 'NAME_BLOCKED' },
    { input: 'VIagra', expect: 'NAME_BLOCKED' },
    { input: 'Jack', expect: 'ok' },
    { input: 'Cockatoo', expect: 'ok' },
    // Blocked (Lithuanian)
    { input: 'Bybis', expect: 'NAME_BLOCKED' },
    { input: 'Šūdas', expect: 'NAME_BLOCKED' },
    { input: 'Kurva', expect: 'NAME_BLOCKED' },
    { input: 'Pyzda', expect: 'NAME_BLOCKED' },
    { input: 'Subinė', expect: 'NAME_BLOCKED' },
    { input: 'Šikna', expect: 'NAME_BLOCKED' },
    { input: 'Kekšė', expect: 'NAME_BLOCKED' },
    { input: 'Eik Nachui', expect: 'NAME_BLOCKED' },
    { input: 'Pidaras', expect: 'NAME_BLOCKED' },
    { input: 'Debilas', expect: 'NAME_BLOCKED' },
    // 3c review: accepted before, blocked now
    { input: 'Pyderas', expect: 'NAME_BLOCKED' },
    { input: 'Pyderastas', expect: 'NAME_BLOCKED' },
    { input: 'Pederastas', expect: 'NAME_BLOCKED' },
    { input: 'Bybys', expect: 'NAME_BLOCKED' },
    { input: 'Nigeris', expect: 'NAME_BLOCKED' },
    { input: 'Negras', expect: 'NAME_BLOCKED' },
    { input: 'Kurwa', expect: 'NAME_BLOCKED' },
    { input: 'Kurw1x', expect: 'NAME_BLOCKED' },
    { input: 'Fck', expect: 'NAME_BLOCKED' },
    { input: 'Kunt', expect: 'NAME_BLOCKED' },
    { input: 'Hore', expect: 'NAME_BLOCKED' },
    { input: 'Pedo', expect: 'NAME_BLOCKED' },
    { input: 'Pedofilas', expect: 'NAME_BLOCKED' },
    { input: 'Heil', expect: 'NAME_BLOCKED' },
    // ... and the harmless names next to those stems stay accepted
    { input: 'Negroni', expect: 'ok' },
    { input: 'Pedro', expect: 'ok' },
    { input: 'Nigeria', expect: 'ok' },
    { input: 'Heidi', expect: 'ok' },
    { input: 'Horace', expect: 'ok' },
    { input: 'Kuntz Cat', expect: 'ok' },
];
