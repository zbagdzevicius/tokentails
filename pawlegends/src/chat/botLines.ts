/**
 * The bot chatter phrase bank (docs/plans/moba/MATCH-CHAT.md §5.9): ordinary match talk only, picked by category. Bots
 * never generate text: every line a bot sends is one of these base lines, dressed by the persona's habits (casing,
 * punctuation, elongation, an emoji, at most one typo) and then filtered like a human's.
 *
 * Every line has a stable `lid` (the cross-match memory names it; APPEND ONLY, never renumber), a category, an optional
 * side (cats-vs-dogs flavour), an optional `q` (the in-match phrase id sent instead when a recipient is quick tier;
 * a line without one is dropped for quick tiers), an optional `tag` (objective kind, reaction intent, follow group;
 * `shutdown` praise only follows a shutdown, a `two` death only a death with 2+ enemies close) and an optional common `tok` (gg, ty, gj, b, omw, nice, lol: exempt from the lid memory, MATCH-CHAT §5.8).
 *
 * Tokens: `{who}` (a human teammate's first name word), `{lane}` (the bot's lane word; skipped when unknown).
 *
 * tests/unit/bot-lines.test.ts is the bank lint (§5.9): the filter, ≤ 40 characters, no `?` or `@`, digits only in
 * "1 hp" and "2 sec", no banned topic word, flavour ≤ 8% and side-tagged, ≥ 6 lines per category.
 *
 * Pure, no imports: vendored verbatim into backend/src/vendor/pawlegends-chat (TypeScript 4.8 compatible).
 */

export type BotCategory =
  | 'start'
  | 'start_all'
  | 'fb_ours'
  | 'fb_theirs'
  | 'death'
  | 'praise'
  | 'thanks'
  | 'tower_ours'
  | 'tower_lost'
  | 'obj_ours'
  | 'obj_go'
  | 'kaboom'
  | 'cannon_hurt'
  | 'cannon_go'
  | 'close'
  | 'back'
  | 'omw'
  | 'comeback'
  | 'last_push'
  | 'gg_win'
  | 'gg_lose'
  | 'gg_all'
  | 'reaction'
  | 'follow';

/** Very common tokens people say every match: exempt from the lid memory, but their surface must vary (§5.8). */
export const COMMON_TOKENS = ['gg', 'ty', 'gj', 'b', 'omw', 'nice', 'lol'] as const;
export type CommonToken = (typeof COMMON_TOKENS)[number];

export interface BotLine {
  lid: string;
  cat: BotCategory;
  text: string;
  /** The in-match phrase id (shared/chat.ts 24–39) a quick-tier channel gets instead; none = dropped there. */
  q?: number;
  side?: 'cat' | 'dog';
  /** Objective kind (pudding / grizzlechop), reaction intent (thanks / praise / gg / lol), follow group. */
  tag?: string;
  tok?: CommonToken;
}

type Spec = string | [string, { q?: number; side?: 'cat' | 'dog'; tag?: string }];

const TOKS: readonly string[] = COMMON_TOKENS;

function group(cat: BotCategory, prefix: string, specs: readonly Spec[]): BotLine[] {
  return specs.map((s, i) => {
    const [text, o] = typeof s === 'string' ? [s, {}] : s;
    const line: BotLine = { lid: `${prefix}${String(i + 1).padStart(2, '0')}`, cat, text };
    if (o.q !== undefined) line.q = o.q;
    if (o.side) line.side = o.side;
    if (o.tag) line.tag = o.tag;
    if (TOKS.indexOf(text) !== -1) line.tok = text as CommonToken;
    return line;
  });
}

const CAT = { side: 'cat' as const };
const DOG = { side: 'dog' as const };

export const BOT_LINES: readonly BotLine[] = [
  ...group('start', 'st', [
    ['gl hf', { q: 24 }],
    ['glhf', { q: 24 }],
    ['gl', { q: 24 }],
    'gl all',
    ['hf', { q: 24 }],
    'lets go',
    'lets win this',
    'ok lets do this',
    'hi',
    'hey',
    'yo',
    'o/',
    'hello',
    'gl team',
    'lets have fun',
    'go go',
    'ready',
    '🐾',
    'ok gl',
    'gl gl',
    'we got this',
    'lets gooo',
    ['cats > dogs', CAT],
    ['meow 😼', CAT],
    ['dogs > cats', DOG],
    ['woof', DOG],
    'time to win',
    ['for the tree', CAT],
    ['good boys only', DOG],
    'hey team',
    'gl have fun',
  ]),
  ...group('start_all', 'sa', [
    ['gl hf', { q: 24 }],
    ['glhf', { q: 24 }],
    ['hf', { q: 24 }],
    ['gl', { q: 24 }],
    ['gl all', { q: 24 }],
    ['gl hf all', { q: 24 }],
  ]),
  ...group('fb_ours', 'fo', [
    ['nice', { q: 28 }],
    'nice one',
    'first blood lets go',
    'first blood!',
    'gj',
    'gj gj',
    'lets gooo',
    'clean',
    '😹',
    'good start',
    'big',
    "ok we're up",
    'nice nice',
    'love it',
    '👏',
    'great start',
  ]),
  ...group('fb_theirs', 'ft', [
    'rip',
    'unlucky',
    'its ok',
    'all good',
    'np we got this',
    ['careful', { q: 33 }],
    "they're aggressive",
    'ok careful now',
    'dw',
    'happens',
    '😬',
    'shake it off',
  ]),
  ...group('death', 'de', [
    'rip',
    'oops',
    ['my bad', { q: 30 }],
    'mb',
    ['sry', { q: 30 }],
    ['sorry', { q: 30 }],
    'ouch',
    'ugh',
    'didnt see that',
    'that came out of nowhere',
    'that hurt',
    'rip me',
    ['they were two', { tag: 'two' }],
    'careful {lane}',
    ['two there', { tag: 'two' }],
    'got caught',
    '💀',
    'welp',
    'ok that was bad',
    'misclick',
  ]),
  ...group('praise', 'pr', [
    ['nice', { q: 28 }],
    ['wp', { q: 27 }],
    'gj',
    'sick',
    'clean',
    'wow',
    'big play',
    'omg nice',
    'insane',
    'beast',
    'carry us',
    '👏',
    '😼',
    'nice {who}',
    'ok thats nice',
    'love that',
    'so good',
    'good stuff',
    'that was cool',
    'well done',
    'teach me',
    ['nice shutdown', { tag: 'shutdown' }],
    ['bounty gone lol', { tag: 'shutdown' }],
    ['well played', { q: 39 }],
  ]),
  ...group('thanks', 'th', [['ty', { q: 29 }], ['thx', { q: 29 }], 'ty for help', 'good help', ['thanks', { q: 29 }], '❤', 'nice assist']),
  ...group('tower_ours', 'to', ['tower down', 'nice push', 'next one', 'keep going', 'push push', 'gj team', 'one more', '🐾🐾']),
  ...group('tower_lost', 'tl', ['tower lost', 'def', 'defend', ['careful', { q: 33 }], ['group', { q: 34 }], 'lets group', 'cant lose next one', 'ugh tower']),
  ...group('obj_ours', 'ob', [
    ['pudding!', { tag: 'pudding' }],
    ['got pudding', { tag: 'pudding' }],
    ['pudding secured', { tag: 'pudding' }],
    ['nice pudding', { tag: 'pudding' }],
    ['grizzlechop down', { tag: 'grizzlechop' }],
    ['grizz down', { tag: 'grizzlechop' }],
    'nice take',
    'gj team',
    ['nice', { q: 28 }],
  ]),
  ...group('obj_go', 'og', [
    ['pudding up', { tag: 'pudding' }],
    ['omw pudding', { tag: 'pudding' }],
    ['going pudding', { tag: 'pudding' }],
    ['grizz up', { tag: 'grizzlechop' }],
    ['going grizz', { tag: 'grizzlechop' }],
    ['group', { q: 34 }],
    'objective up',
    'lets take it',
  ]),
  ...group('kaboom', 'kb', ['KABOOM', 'kaboom lol', 'BOOM', 'boom 😹', 'that cannon tho', 'one shot lol', 'cannon op', 'did you see that', 'ka-boom']),
  ...group('cannon_hurt', 'ch', ['watch the cannon', ['careful cannon', { q: 33 }], 'that cannon again', 'ouch cannon', 'cannon hurts', 'dodge the cannon']),
  ...group('cannon_go', 'cg', ['cannon soon', 'cannon up', 'going cannon', ['get cannon', { q: 36 }], 'cannon time', 'omw cannon']),
  ...group('close', 'cl', [['close one', { q: 35 }], 'that was close', '1 hp lol', 'phew', 'almost died', '😅', 'so close', 'lucky', 'barely']),
  ...group('back', 'bk', [['b', { q: 32 }], ['back', { q: 32 }], 'going back', 'low', 'need heal', 'brb base']),
  ...group('omw', 'om', [['omw', { q: 31 }], 'otw', 'coming', ['on my way', { q: 31 }], '2 sec', 'coming!']),
  ...group('comeback', 'cb', ['not over', 'we can still do this', 'still in it', 'dont give up', 'we got this', 'lets turn it']),
  ...group('last_push', 'lp', ['ok last push', 'all in', 'lets end', 'now or never', 'last push', 'lets finish']),
  ...group('gg_win', 'gw', [
    ['gg', { q: 25 }],
    ['gg wp', { q: 26 }],
    ['ggwp', { q: 26 }],
    'ggs',
    'gg!',
    ['wp all', { q: 27 }],
    'nice game',
    'gg team',
    'that was fun',
    ['gg 😼', CAT],
    ['gg 🐶', DOG],
    ['good game', { q: 39 }],
    'close one gg',
  ]),
  ...group('gg_lose', 'gl', [['gg', { q: 25 }], 'ggs', ['gg wp', { q: 26 }], 'unlucky', 'gg next time', 'close game', ['wp', { q: 27 }], 'they were good', 'gg 😿']),
  ...group('gg_all', 'ga', [['gg', { q: 25 }], ['gg wp', { q: 26 }], ['wp', { q: 27 }], ['well played', { q: 39 }], ['ggwp', { q: 26 }], ['ggs', { q: 25 }]]),
  ...group('reaction', 're', [
    ['np', { tag: 'thanks' }],
    ['yw', { tag: 'thanks' }],
    ['👍', { tag: 'thanks' }],
    ['ty', { tag: 'praise', q: 29 }],
    ['thx', { tag: 'praise', q: 29 }],
    ['😼', { tag: 'praise' }],
    ['lol', { tag: 'lol', q: 37 }],
    ['😹', { tag: 'lol', q: 37 }],
    ['gg', { tag: 'gg', q: 25 }],
    ['no worries', { tag: 'thanks' }],
    ['haha', { tag: 'lol' }],
    ['ggs', { tag: 'gg', q: 25 }],
  ]),
  ...group('follow', 'fw', [
    ['that was clean', { tag: 'hype' }],
    ['so good', { tag: 'hype' }],
    ['love it', { tag: 'hype' }],
    ['huge', { tag: 'hype' }],
    ['keep it up', { tag: 'hype' }],
    ['ok lets go', { tag: 'hype' }],
    ['next time', { tag: 'down' }],
    ['all good', { tag: 'down' }],
    ['my fault', { tag: 'self' }],
    ['careful now', { tag: 'down' }],
    ['ok', { tag: 'down' }],
    ['lets fix it', { tag: 'down' }],
  ]),
];

/** The bank by category (built once). */
export const LINES_BY_CAT: Readonly<Record<BotCategory, readonly BotLine[]>> = (() => {
  const out = {} as Record<BotCategory, BotLine[]>;
  for (const l of BOT_LINES) (out[l.cat] ??= []).push(l);
  return out;
})();

/** Which follow group a category's split second part comes from (chatty personas only). */
export const FOLLOW_OF: Readonly<Partial<Record<BotCategory, string>>> = {
  fb_ours: 'hype',
  praise: 'hype',
  kaboom: 'hype',
  tower_ours: 'hype',
  close: 'hype',
  death: 'down',
  fb_theirs: 'down',
  tower_lost: 'down',
};

/**
 * Words no bot line may contain (§5.9): spending, contact, personal, identity and toxic topics. Checked per word on a
 * lowercased, letter-folded skeleton by the lint test (and nothing in the bank needs them).
 */
export const BANNED_WORDS: readonly string[] = [
  'buy',
  'shop',
  'store',
  'skin',
  'skins',
  'pass',
  'pay',
  'price',
  'treat',
  'treats',
  'gem',
  'gems',
  'premium',
  'purchase',
  'card',
  'wallet',
  'crypto',
  'nft',
  'add',
  'friend',
  'friends',
  'dm',
  'discord',
  'insta',
  'instagram',
  'snap',
  'snapchat',
  'tiktok',
  'age',
  'old',
  'where',
  'live',
  'school',
  'real',
  'human',
  'bot',
  'bots',
  'ez',
  'noob',
  'trash',
  'report',
  'uninstall',
  'pirkti',
  'parduotuve',
  'mokek',
  'draugas',
  'botas',
  'zmogus',
  'metai',
];
/** Banned substrings (multi-word or symbol topics). */
export const BANNED_SUBSTRINGS: readonly string[] = ['message me', '$', '€', '?', '@'];
