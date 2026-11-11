/**
 * Friends chat vocabulary (docs/plans/moba/CHAT-AVATARS.md §2.3): the 24 quick phrases, the 8 stickers, the limits and
 * the avatar wire shape. The wire carries ids only for phrases and stickers, so everyone (under 16, unknown age, guests)
 * can say these. Free text exists only in a thread where every participant is 16+, and the server filters it.
 *
 * A copy of `shared/chat.ts` (synced into backend/src/shared-contracts/chat.ts); tests/unit/chat-phrases.test.ts
 * deep-compares the two. Never reorder: stored messages carry the id.
 */

export type ChatScope = 'dm' | 'party' | 'team';

export interface ChatPhrase {
  id: number;
  text: string;
  scopes: readonly ChatScope[];
}

const DM: readonly ChatScope[] = ['dm'];
const DP: readonly ChatScope[] = ['dm', 'party'];
const DPT: readonly ChatScope[] = ['dm', 'party', 'team'];
const PT: readonly ChatScope[] = ['party', 'team'];

export const CHAT_PHRASES: readonly ChatPhrase[] = [
  { id: 0, text: 'Wanna play?', scopes: DM },
  { id: 1, text: 'Join my party!', scopes: DM },
  { id: 2, text: 'On my way! 🐾', scopes: DP },
  { id: 3, text: 'Be right back', scopes: DP },
  { id: 4, text: 'One more match?', scopes: DP },
  { id: 5, text: 'GG, well played!', scopes: DPT },
  { id: 6, text: 'Thanks!', scopes: DPT },
  { id: 7, text: 'Nice moves!', scopes: DPT },
  { id: 8, text: 'Good night! 🌙', scopes: DM },
  { id: 9, text: 'Sorry!', scopes: DPT },
  { id: 10, text: "Can't play now", scopes: DM },
  { id: 11, text: 'Add me back?', scopes: DM },
  { id: 12, text: 'Ready!', scopes: PT },
  { id: 13, text: 'Wait a sec', scopes: PT },
  { id: 14, text: "I'll tank", scopes: PT },
  { id: 15, text: "I'll support", scopes: PT },
  { id: 16, text: "I'll take mid", scopes: PT },
  { id: 17, text: 'Any role is fine', scopes: PT },
  { id: 18, text: 'Nice pick!', scopes: PT },
  { id: 19, text: "Let's win this!", scopes: PT },
  { id: 20, text: 'Cats rule! 😼', scopes: DPT },
  { id: 21, text: 'Dogs drool 🐶', scopes: DPT },
  { id: 22, text: 'Paws up, team!', scopes: PT },
  { id: 23, text: 'Tail high, try again', scopes: DPT },
];

export const CHAT_STICKERS: readonly string[] = ['🐾', '💖', '😹', '😾', '🐟', '🦴', '💤', '👑'];

/** Phrases a scope may use, in id order. */
export const phrasesFor = (scope: ChatScope): readonly ChatPhrase[] => CHAT_PHRASES.filter((p) => p.scopes.includes(scope));

/** The text of a phrase or sticker body; '' for an unknown id. */
export function chatBodyText(k: 'q' | 's', id: number): string {
  if (!Number.isInteger(id) || id < 0) return '';
  return k === 'q' ? (CHAT_PHRASES[id]?.text ?? '') : (CHAT_STICKERS[id] ?? '');
}

/** A thread preview as the server sends it (`[q:5]`, `[s:2]` or text) as display text. */
export function previewText(preview: string): string {
  const m = /^\[([qs]):(\d{1,3})\]$/.exec(preview);
  return m ? chatBodyText(m[1] as 'q' | 's', Number(m[2])) : preview;
}

/** The subset of shared CHAT_LIMITS the client mirrors. */
export const CHAT_LIMITS_CLIENT = Object.freeze({ textMax: 120, counterFrom: 100, pollMs: 4000, historyPage: 30, rawMax: 240 });

export const CHAT_REPORT_KINDS = ['harass', 'sexual', 'contact', 'spam', 'other'] as const;
export type ChatReportKind = (typeof CHAT_REPORT_KINDS)[number];
export const CHAT_REPORT_LABELS: Readonly<Record<ChatReportKind, string>> = Object.freeze({
  harass: 'Mean or bullying',
  sexual: 'Sexual or creepy',
  contact: 'Asking for contact info',
  spam: 'Spam',
  other: 'Something else',
});

export type ChatTier = 'text' | 'quick';

/** A player's avatar on the wire (shared/chat.ts AvatarView). */
export interface AvatarView {
  i: string;
  img?: string;
  f?: string;
  t?: string;
  r?: string;
}

export const AVATAR_ICON_RE = /^(h:[a-z][a-z0-9]{0,23}|c:[a-f0-9]{24}|i:[a-z0-9._-]{1,48})$/;
export const AVATAR_IMG_RE = /^https:\/\/tokentails-nfts\.fra1\.cdn\.digitaloceanspaces\.com\/[A-Za-z0-9._~\/%-]{1,250}$/;

export function isAvatarView(v: unknown): v is AvatarView {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.i !== 'string' || !AVATAR_ICON_RE.test(o.i)) return false;
  if (o.img !== undefined && (typeof o.img !== 'string' || !AVATAR_IMG_RE.test(o.img))) return false;
  if (o.f !== undefined && (typeof o.f !== 'string' || !/^frame\.[a-z0-9._-]{1,48}$/.test(o.f))) return false;
  if (o.t !== undefined && (typeof o.t !== 'string' || !/^title\.[a-z0-9._-]{1,48}$/.test(o.t))) return false;
  if (o.r !== undefined && (typeof o.r !== 'string' || !/^[a-z0-9_-]{1,24}$/.test(o.r))) return false;
  return true;
}

/** Error codes of the chat routes and the relay, as one short line for the composer (never the matched token). */
export function chatErrorText(code: string | null | undefined, why?: string | null, until?: string | null): string {
  const when = (iso?: string | null) => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(t) ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  };
  switch (code) {
    case 'PAWLEGENDS_CHAT_REJECTED':
    case 'chat_rejected':
      if (why === 'words') return "That message can't be sent: keep it kind";
      if (why === 'link') return "That message can't be sent: no links or apps";
      if (why === 'charset') return "That message can't be sent: letters, numbers and emoji only";
      return "That message can't be sent: no contact details";
    case 'PAWLEGENDS_CHAT_RATE':
    case 'chat_rate':
      return 'Slow down a little';
    case 'PAWLEGENDS_CHAT_COOLDOWN':
    case 'chat_cooldown':
      return 'Text chat is paused for a few minutes. Quick chat still works';
    case 'PAWLEGENDS_CHAT_MUTED':
    case 'chat_muted':
      return until ? `Chat is paused until ${when(until)}` : 'Chat is paused';
    case 'PAWLEGENDS_CHAT_TOO_LONG':
    case 'chat_too_long':
      return 'Keep it under 120 characters';
    case 'PAWLEGENDS_CHAT_QUICK_ONLY':
    case 'chat_quick_only':
      return 'Quick chat only here';
    case 'PAWLEGENDS_CHAT_UNAVAILABLE':
    case 'chat_unavailable':
      return 'Chat is not available';
    case 'chat_phase':
      return 'Chat opens again after the match';
    default:
      return "Couldn't send. Try again";
  }
}
