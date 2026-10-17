/**
 * HUD copy for the v5 mechanics (GDD 3.5 twists, 4.3-4.5). Owned by W2-UI-RUN; the shell's copy.ts stays as is.
 * Plain strings only, so tests and the clip pass can read them without a DOM.
 */
import { ROOM_EVENT_NAMES, type RoutineDef } from '../../types';

export type Pronoun = 'he' | 'she';

/** Pronoun of a routine for the HUD lines ("she can see you in the mirror"). Unknown personas read "he". */
export function pronounOf(r: Pick<RoutineDef, 'persona' | 'kind' | 'name'> | null | undefined): Pronoun {
  if (!r) return 'he';
  if (r.kind === 'napper') return 'she';
  switch (r.persona) {
    case 'skincare-sis':
    case 'napper':
    case 'grandma':
    case 'wfh-worker':
    case 'party-host':
      return 'she';
    default:
      return /\b(sis|grandma|mom|aunt|her)\b/i.test(r.name ?? '') ? 'she' : 'he';
  }
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Briefing icon per persona (the chef emoji was shown for every human). */
const PERSONA_ICONS: Record<string, string> = {
  'chef-dad': '🧑‍🍳',
  'couch-potato': '🛋️',
  'skincare-sis': '💆‍♀️',
  'wfh-worker': '💻',
  'party-host': '🥳',
  napper: '😴',
  grandma: '👵',
  caterer: '🤵',
};

/** The written turn warning per cue (a template "turns on the ${cue}" read "turns on the you're on mute"). */
const CUE_LINES: Record<string, string> = {
  'stove timer': 'turns when the stove timer dings',
  'TV jingle': 'looks up at the TV jingle',
  'mirror hum': 'turns when the humming stops (and the mirror sees behind her)',
  "you're on mute": 'looks up after “you’re on mute”',
  'party horn': 'turns at the party horn',
  'snore stops': 'wakes up when the snoring stops: keep the noise down',
  'teacup clink': 'turns after a teacup clink',
  'tray clatter': 'turns at a tray clatter',
  'cork pop': 'turns at a cork pop',
};

export interface HumanLine {
  icon: string;
  /** "Chef Dad", "Two caterers" */
  name: string;
  /** "turns when the stove timer dings" */
  warning: string;
}

type HumanRef = Pick<RoutineDef, 'persona' | 'kind' | 'name' | 'cue'>;

/** Briefing line for the room's human(s) (pure; tested). */
export function humanLine(r: HumanRef, r2?: HumanRef | null): HumanLine {
  const icon = PERSONA_ICONS[r.persona ?? ''] ?? (r.kind === 'napper' ? '😴' : '🧍');
  const warn = (x: HumanRef): string => CUE_LINES[x.cue] ?? `watch for the ${x.cue}`;
  if (!r2) return { icon, name: r.name, warning: warn(r) };
  const same = !!r.persona && r.persona === r2.persona;
  const name = same ? `Two ${r.persona === 'caterer' ? 'caterers' : `${r.name}s`}` : `${r.name} and ${r2.name}`;
  const w1 = warn(r);
  const w2 = warn(r2);
  return { icon: same ? `${icon}${icon}` : `${icon}${PERSONA_ICONS[r2.persona ?? ''] ?? '🧍'}`, name, warning: w1 === w2 ? w1.replace(/^(\w+)s\b/, '$1') : `one ${w1}, the other ${w2}` };
}

export const HUD_COPY = {
  // crime stickers (GDD 4.4 v5 mechanics)
  framed: 'FRAMED THE ROOMBA +300',
  slide: 'WHEEE',
  pullCloth: 'YANK!',
  pullCable: 'YANK!',
  topple: 'TIMBER!',
  stack: (items: number, noun: string) => `x${items} ${noun}!`,
  wish: (name: string) => `${name} is thrilled +500`,
  box: 'If I fits, I sits',
  onCamera: '+50% ON CAMERA',
  wake: (p: Pronoun) => `${p === 'she' ? "SHE'S" : "HE'S"} AWAKE!`,
  target: '🎯 MUST-WRECK +1,000',
  stash: '🛏️ STASHED +500',
  // cues
  mirror: (p: Pronoun) => `🪞 ${p} can see you in the mirror`,
  mirrorSeen: (p: Pronoun) => `🪞 ${cap(p)} saw you in the mirror!`,
  mirrorGlint: (p: Pronoun) => `✨ ${cap(p)}'s checking the mirror. Freeze!`,
  rec: 'REC',
  recHint: '📹 crashes on camera +50%',
  noiseLabel: 'Zzz',
  noiseStir: (p: Pronoun) => `😴 Shh! ${cap(p)}'s stirring. Sneak!`,
  noiseFrozen: '🔕 too loud to hear you',
  look: (p: Pronoun) => `👀 ${cap(p)} is looking. Freeze!`,
  frozenSafe: (p: Pronoun) => `😼 Frozen... ${p} can't tell`,
  freezePrompt: (p: Pronoun) => `${cap(p)} turns! Let go and freeze`,
  spotted: '🙀 SPOTTED! Freeze!',
  // QA round 3 coaching (own slot under the event banner)
  frameIt: (p: Pronoun) => `🤖 Let ${p === 'she' ? 'her' : 'him'} turn: the Roomba takes the blame`,
  redPawed: '🐾 Red-pawed! Freezing by the mess looks guilty',
  bothLook: '👀 Both looking. Freeze!',
  secondTurn: '❓ the other one is turning',
  shared: 'one meter for both',
  ghostReplayOnly: 'replay only (older version)',
  ghostAhead: 'you lead',
  ghostDone: 'done',
} as const;

/**
 * The 12 room events (ROOM_EVENT_NAMES order): banner tagline under "NAME n seconds". `{p}` is the human's pronoun.
 */
export const EVENT_TAGLINES: readonly string[] = [
  "{p}'s at the door", // 0 doorbell / delivery
  'tea first, cat later', // 1 kettle
  "{p}'s on the phone", // 2 phone call
  "{p}'s grabbing snacks", // 3 ad break
  'eyes on the oven', // 4 oven ding
  'lights off!', // 5 surprise
  "{p}'s not snoozing it", // 6 alarm
  'all eyes on the toast', // 7 speeches
  'hugs at the door', // 8 guests
  'sign here, please', // 9 courier
  "{p}'s tipping the driver", // 10 pizza
  "{p}'s unmuting", // 11 you're on mute
];

export interface EventBannerText {
  /** "SURPRISE! 6 seconds" */
  title: string;
  /** "ALARM! he's not snoozing it" (name + tagline: the aria label) */
  sub: string;
  /** "he's not snoozing it" (the banner's second line; the title already names the event) */
  tag: string;
}

/** Banner copy for room event `kind` (0..11) with `ticksLeft` of the window (pure; tested). */
export function eventBannerText(kind: number, ticksLeft: number, p: Pronoun = 'he', tickHz = 30): EventBannerText {
  const k = kind >= 0 && kind < ROOM_EVENT_NAMES.length ? kind | 0 : 0;
  const name = ROOM_EVENT_NAMES[k];
  const s = Math.max(1, Math.ceil(ticksLeft / tickHz));
  const tag = (EVENT_TAGLINES[k] ?? '').replace('{p}', p);
  return { title: `${name} ${s} second${s === 1 ? '' : 's'}`, sub: `${name} ${tag}`, tag };
}

/** Plural noun for a stack's pieces from its prop name ("Plate stack" → "PLATES"). */
export function stackNoun(propName: string): string {
  const n = propName.toLowerCase();
  const nouns: readonly [string, string][] = [
    ['plate', 'PLATES'], ['book', 'BOOKS'], ['towel', 'TOWELS'], ['cup', 'CUPS'], ['mug', 'MUGS'],
    ['champagne', 'GLASSES'], ['glass', 'GLASSES'], ['bowl', 'BOWLS'], ['gift', 'GIFTS'], ['present', 'GIFTS'],
    ['snack', 'SNACKS'], ['box', 'BOXES'], ['cake', 'TIERS'],
  ];
  for (const [k, v] of nouns) if (n.includes(k)) return v;
  return 'PIECES';
}
