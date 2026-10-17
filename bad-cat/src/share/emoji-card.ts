/**
 * Emoji text card for group chats (GDD 7.2). Spoiler-free: one emoji per ~8 s bucket.
 *
 *   BAD CAT DAILY #18 🍳
 *   🐾💥💥🙀🧊💥🤖💥🎯
 *   chaos 8,420 · ×6 combo · seen 0×
 *   🟢 PERFECT CRIME · Agent of Chaos
 *   tokentails.com/badcat/d/18
 */
import { CUDDLE_TICKS, propKind, seenText, type PlayableRoom, type RunResult, type StampId } from '../types';

export const BUCKET_TICKS = 240; // ~8 s
export const EMOJI = {
  sneak: '🐾',
  crash: '💥',
  seen: '🙀',
  froze: '🧊',
  framed: '🤖',
  target: '🎯',
  caught: '😾',
} as const;

/** Bucket priority: the best story beat wins. */
const PRIORITY: readonly (keyof typeof EMOJI)[] = ['caught', 'target', 'framed', 'froze', 'seen', 'crash', 'sneak'];

export const STAMP_LINE: Record<StampId, string> = {
  perfect: '🟢 PERFECT CRIME',
  clean: '🟡 CLEAN-ISH',
  caught: '🔴 CAUGHT',
};

const SHELL_EMOJI: Record<string, string> = { kitchen: '🍳', 'living room': '🛋️', bathroom: '🛁', bedroom: '🛏️', 'home office': '💻' };

/** 8420 -> "8,420" (locale-independent). */
export function formatThousands(n: number): string {
  const neg = n < 0;
  const s = String(Math.floor(Math.abs(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return neg ? `-${out}` : out;
}

/** One emoji per BUCKET_TICKS bucket of the run, from the event log. */
export function emojiTimeline(r: RunResult, play?: PlayableRoom): string {
  const ticks = Math.max(1, r.ticks);
  const n = Math.max(1, Math.ceil(ticks / BUCKET_TICKS));
  const flags: Set<keyof typeof EMOJI>[] = Array.from({ length: n }, () => new Set());
  const at = (tick: number) => flags[Math.min(n - 1, Math.max(0, Math.floor(tick / BUCKET_TICKS)))];
  let lastSeen = -1_000_000;
  let caughtTick = -1;
  for (const e of r.events) if (e.t === 'caught') caughtTick = e.tick;
  for (const e of r.events) {
    switch (e.t) {
      case 'break':
      case 'spill':
      case 'land':
      case 'hit': {
        const kind = play?.room.props[e.prop]?.kind;
        const def = kind !== undefined ? propKind(kind) : undefined;
        if (!def || def.base > 0 || e.points > 0) at(e.tick).add('crash');
        break;
      }
      case 'target':
        at(e.tick).add('target');
        break;
      case 'framed':
        at(e.tick).add('framed');
        break;
      case 'seen':
        at(e.tick).add('seen');
        lastSeen = e.tick;
        break;
      case 'loaf':
        if (e.tick - lastSeen <= 60 && (caughtTick < 0 || caughtTick > e.tick + CUDDLE_TICKS)) at(e.tick).add('froze');
        break;
      case 'caught':
        at(e.tick).add('caught');
        break;
      default:
        break;
    }
  }
  let line = '';
  for (const f of flags) {
    let pick: keyof typeof EMOJI = 'sneak';
    for (const p of PRIORITY) {
      if (f.has(p)) {
        pick = p;
        break;
      }
    }
    line += EMOJI[pick];
  }
  return line;
}

export interface EmojiCardOptions {
  /** Short URL root, e.g. 'tokentails.com/badcat'. */
  shortUrl: string;
  /** Overrides the link line (e.g. a dare link). */
  link?: string;
}

/** Day number for links and titles; pre-launch preview days (<= 0) have none (never "#-30", never "/d/-30"). */
function shareDay(play: PlayableRoom): number | undefined {
  const raw = play.dayNo ?? Number(play.room.title?.match(/#(\d+)/)?.[1] ?? NaN);
  return Number.isFinite(raw) && Math.trunc(raw) >= 1 ? Math.trunc(raw) : undefined;
}

export function cardLink(play: PlayableRoom, shortUrl: string): string {
  const root = shortUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (play.room.id === 'glass') return `${root}/glass`;
  const day = shareDay(play);
  return day ? `${root}/d/${day}` : root;
}

export function cardTitle(play: PlayableRoom): string {
  const shell = play.shell?.name || 'Room';
  const icon = SHELL_EMOJI[shell.toLowerCase()] ?? '🏠';
  if (play.room.id === 'glass') return `BAD CAT DAILY · The Glass 🍷`;
  const day = shareDay(play);
  return day ? `BAD CAT DAILY #${day} ${icon}` : `BAD CAT DAILY · ${shell} ${icon}`;
}

/** The five-line card text. */
export function emojiCard(r: RunResult, play: PlayableRoom, opts: EmojiCardOptions): string {
  const timeline = r.timeline && r.timeline.trim() ? r.timeline.trim() : emojiTimeline(r, play);
  return [
    cardTitle(play),
    timeline,
    `chaos ${formatThousands(r.score)} · ×${r.maxCombo} combo · ${seenText(r.seenCount, r.stamp)}`,
    `${STAMP_LINE[r.stamp] ?? STAMP_LINE.clean} · ${r.rank}`,
    opts.link ?? cardLink(play, opts.shortUrl),
  ].join('\n');
}
