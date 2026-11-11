/**
 * Party social lines (docs/plans/moba/MULTIPLAYER.md §7 M2-M3, D8): the quick-chat wheel lines and emotes of a match.
 * Enumerated: the `social` frame carries an id, never text. The counts are pinned by `SOCIAL_COUNT` in
 * src/net/proto.ts (the relay drops any other id); tests/unit/social.test.ts keeps them equal. Render only: nothing
 * here reaches the sim. D8 as amended by docs/plans/moba/MATCH-CHAT.md: typed team chat exists in a match only through
 * PROTO 6 `chat.say`, only for a team whose every human is a registered 16+ account, and only after the server filter;
 * everyone else (under 16, unknown age, guests) sees phrases only.
 */
import { SOCIAL_COUNT, type SocialKind } from '../net/proto';
import { PING_KINDS } from './pings';
import { PING_TEXT } from '../ui/pingText';

/** The 8 quick-chat lines, in wire id order. Rail-short (≤ 12 characters). */
export const CHAT_LINES: readonly string[] = Object.freeze(['Nice!', 'On my way', 'Help me', 'Group up', 'Back off', 'Push', 'Thanks', 'GG']);

export interface EmoteDef {
  /** The word on the button and the rail ("Mira: Wave"). */
  label: string;
  /** The hero pose (render/chars/motion.ts emote names). */
  pose: 'wave' | 'cheer';
  /** One glyph floated over the hero for 2 s. */
  glyph: string;
  color: number;
}

/** The 4 emotes, in wire id order: shown over the sender's hero for 2 s. */
export const EMOTES: readonly EmoteDef[] = Object.freeze([
  { label: 'Wave', pose: 'wave', glyph: '👋', color: 0xffd166 },
  { label: 'Cheer', pose: 'cheer', glyph: '🎉', color: 0xff7a9a },
  { label: 'Love', pose: 'cheer', glyph: '💖', color: 0xff6fb1 },
  { label: 'Laugh', pose: 'wave', glyph: '😹', color: 0x7fd4ff },
]);

/** How long an emote shows over the hero (ms). */
export const EMOTE_MS = 2000;

/** The text of a social message on the rail ("On my way", "Wave", "Go here"); '' for an unknown id. */
export function socialText(kind: SocialKind, id: number): string {
  if (!Number.isInteger(id) || id < 0 || id >= SOCIAL_COUNT[kind]) return '';
  if (kind === 'chat') return CHAT_LINES[id] ?? '';
  if (kind === 'emote') return EMOTES[id]?.label ?? '';
  return PING_TEXT[PING_KINDS[id]]?.label ?? '';
}

/** The rail line of a teammate's social ("Mira: On my way"), cut for a 28-character phone line. */
export function socialLine(name: string, kind: SocialKind, id: number): string {
  const text = socialText(kind, id);
  if (!text) return '';
  const room = Math.max(4, 28 - text.length - 2);
  const who = name.length > room ? `${name.slice(0, room - 1)}…` : name;
  return `${who}: ${text}`;
}
