/** UI strings and pure formatting helpers (GDD 4.5, 7.2, 7.3, 8). */
import { CAUGHT_RANK, RANKS, ROOM_EVENT_NAMES, TICK_HZ, rankMin, seenText, type SimEvent, type StampId } from '../types';
import { crimeDef } from '../progress';

export { seenText };

export const COPY = {
  title: 'Bad Cat Daily',
  tagline: 'Be a bad cat.',
  loading: 'Sharpening claws…',
  inAppBanner: 'Open in Safari/Chrome for the best clip',
  pickerTitle: 'Which room did you see?',
  archiveTitle: 'Replay a room',
  glassLabel: 'The Glass',
  glassSub: 'The wine glass from the clips. Always open.',
  tapToStart: 'Tap to start',
  pressToStart: 'Tap or press Space to start',
  practice: 'PRACTICE',
  ranked: 'RANKED',
  ftue: 'FIRST HEIST · 40 s',
  mustWreck: 'Must-Wreck',
  ftuePrompts: {
    move: 'Drag to run',
    moveKeys: 'WASD / arrows to run',
    jump: (seat: string) => `Jump on the ${seat}: push into it, or tap JUMP`,
    jumpKeys: (seat: string) => `Jump on the ${seat}: walk into it or press Space`,
    swat: 'SWAT!',
    swatKeys: 'SWAT! Press J (or click)',
    freeze: 'He turns! Let go and freeze',
    sneak: 'Drag just a little to sneak (quieter)',
    sneakKeys: 'Shift = sneak (quieter)',
  },
  lastCall: 'LAST CALL ×2',
  frozenSafe: "😼 Frozen... he can't tell",
  cantReach: '🪑 Hop on a chair first',
  cantReachHigh: '🪑 One level at a time: hop up first',
  paused: 'Paused',
  pausedRotate: 'Your phone turned sideways. Ready when you are.',
  tapToResume: 'Tap to continue',
  clickToResume: 'Continue (Esc)',
  contextLost: 'Restoring graphics…',
  quitRun: 'Leave run',
  restart: 'Restart (R)',
  shareClip: 'Share clip',
  postClip: 'Post clip',
  clipRendering: 'Making your clip…',
  clipError: 'Clip interrupted. Tap to retry',
  dare: 'Dare a friend',
  dareSoon: 'Dare a friend (soon)',
  resultCard: 'Save the result card',
  dareCopied: 'Link copied. Send it to a friend',
  playAgain: 'Play again',
  practiceAgain: 'Practice again',
  playRanked: "Play today's ranked run",
  copyChat: 'Copy for the group chat',
  copied: 'Copied!',
  done: 'Done',
  inAppShare: 'Open in Safari/Chrome to save your clip',
  inAppSteps: 'Tap ••• then “Open in browser”. Your run travels in the link.',
  copyHandoff: 'Copy link',
  savedToast: 'Saved. Post it to TikTok',
  longPress: 'Long-press the video to save it',
  readyRanked: (n: number, label?: string) => `Your ranked run for ${label ?? kitchenLabel(n)} is ready`,
  rankedDone: 'Ranked run done today. Practice is unlimited.',
  presale: 'Founding pre-sale',
  presaleSub: 'Support Bad Cat Daily and the Pink Paw shelter cats',
  offerTitle: 'Love being bad?',
  offerBody: 'Founding members get the Club when it opens, and the shelter gets a share of every sale.',
  notNow: 'Not now',
  settings: 'Settings',
  archive: 'Past rooms',
  myCat: 'My cat',
  back: 'Back',
  sound: 'Sound',
  reduceMotion: 'Reduce motion',
  showPhoto: "Show my cat's photo in clips",
  noPhotoYet: '(no photo yet: add one in My cat)',
  controlsHelp:
    'Controls: drag on the left to move, SWAT and JUMP on the right. Desktop: WASD or arrow keys to move, Shift to sneak, Space to jump, J or left click to swat, K to grab, Esc to pause.',
  storageBlocked: 'Saved in this browser only',
  rotate: 'Turn your phone upright to play',
  noRenderer: 'This browser cannot draw the 3D room. The run still counts.',
} as const;

export const STAMP_LABEL: Record<StampId, string> = {
  perfect: 'PERFECT CRIME',
  clean: 'CLEAN-ISH',
  caught: 'CAUGHT',
};
export const STAMP_DOT: Record<StampId, string> = { perfect: '🟢', clean: '🟡', caught: '🔴' };

/** Emoji per prop kind (briefing target icons). */
const PROP_EMOJI: Record<number, string> = {
  1: '🍷', 2: '☕', 3: '🍽️', 4: '🍎', 5: '🥚', 6: '🎂', 7: '💐', 8: '🪴', 9: '💡', 10: '📺', 11: '💻', 12: '🧻', 13: '🧴', 14: '🧺', 15: '📚',
  16: '🎄', 17: '🎄', 18: '🥿', 19: '🧦', 20: '🤖', 21: '🥫', 22: '🍿', 23: '🧶', 24: '🦆', 25: '🪥', 26: '🖊️', 27: '🥤', 28: '🎈', 29: '🎀',
  30: '🎁', 31: '🥣', 32: '🕯️', 33: '🧺', 34: '⏰', 35: '💍', 36: '🍪', 37: '🌾', 38: '🥣', 39: '🧈', 40: '🎲', 41: '🍟', 42: '🎮', 43: '🎲',
  44: '🕯️', 45: '🫙', 46: '🛁', 47: '🍲', 48: '🥧', 49: '🦃', 50: '🍗', 51: '📦', 52: '🫧', 53: '🧾', 54: '📦', 55: '🥂', 56: '💐', 57: '📱',
  58: '🥛', 59: '🛏️', 60: '🔮', 61: '🎁', 62: '🍾', 63: '🛍️',
};
export function propEmoji(kind: number): string {
  // FULL build kinds 16..63: the Rap Sheet catalog has an icon for every crime-worthy prop
  return crimeDef(`kind-${kind}`)?.icon ?? PROP_EMOJI[kind] ?? '❓';
}

export function formatScore(n: number): string {
  const v = Math.max(0, Math.floor(n));
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Rank title; `pct` is the room's PlayableRoom.rankPct (titles per room, review round 1). */
export function rankFor(score: number, caught = false, pct = 100, mins?: readonly number[]): string {
  if (caught) return CAUGHT_RANK;
  let t = RANKS[0].title;
  RANKS.forEach((r, i) => {
    if (score >= rankMin(i, pct, mins)) t = r.title;
  });
  return t;
}

/** Seconds left, rounded up, as "0:42". */
export function formatClock(ticksLeft: number): string {
  const s = Math.max(0, Math.ceil(ticksLeft / TICK_HZ));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function eventBanner(kind: number, ticksLeft: number): string {
  const name = ROOM_EVENT_NAMES[kind] ?? ROOM_EVENT_NAMES[0];
  const s = Math.max(1, Math.ceil(ticksLeft / TICK_HZ));
  return `${name} ${s} second${s === 1 ? '' : 's'}`;
}

/**
 * Spoiler-free timeline (GDD 7.2): one emoji per ~8 s bucket. Priority in a bucket:
 * 😾 caught > 🎯 target > 🙀 seen > 💥 break > 🐾 sneak.
 */
export function emojiTimeline(events: readonly SimEvent[], ticks: number, bucketTicks = 8 * TICK_HZ): string {
  const n = Math.max(1, Math.ceil(Math.max(1, ticks) / bucketTicks));
  const rank = new Array<number>(n).fill(0);
  const glyph = ['🐾', '💥', '🙀', '🎯', '😾'];
  for (const e of events) {
    const b = Math.min(n - 1, Math.max(0, Math.floor(e.tick / bucketTicks)));
    let r = 0;
    if (e.t === 'caught') r = 4;
    else if (e.t === 'target') r = 3;
    else if (e.t === 'seen') r = 2;
    else if (e.t === 'break' || e.t === 'spill' || e.t === 'land' || e.t === 'hit') r = 1;
    if (r > rank[b]) rank[b] = r;
  }
  return rank.map((r) => glyph[r]).join('');
}

/** "#18", or "Preview" for pre-launch days (dayNo <= 0): a negative day number never reaches the player. */
export function dayTag(dayNo: number | undefined): string {
  const n = Math.trunc(dayNo ?? 1);
  return n < 1 ? 'Preview' : `#${n}`;
}

/** Preview days stay out of share URLs and file names. */
export function isShareableDay(dayNo: number | undefined): dayNo is number {
  return dayNo !== undefined && Math.trunc(dayNo) >= 1;
}

/** "Kitchen #18", or "today's Kitchen" for pre-launch days (dayNo <= 0; round 3: "Preview" repeated everywhere). */
export function kitchenLabel(dayNo: number): string {
  return dayNo < 1 ? "today's Kitchen" : `Kitchen #${dayNo}`;
}

export function roomLabel(glass: boolean, dayNo?: number, title?: string): string {
  if (glass) return title ?? 'The Glass';
  return title ?? kitchenLabel(dayNo ?? 1);
}

/** Share-sheet text that goes with the clip. */
export function shareText(catName: string, glass: boolean, dayNo: number | undefined, link: string, label?: string): string {
  const where = glass ? 'The Glass' : label ?? kitchenLabel(dayNo ?? 1);
  return `${catName || 'My cat'} vs. ${where}. Can your cat do worse? ${link}`;
}
