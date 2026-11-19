/**
 * The avatar wire shape (shared/chat.ts AvatarView), split out of data/chatPhrases.ts (which re-exports it) so the
 * first-load avatar (ui/avatar.ts) does not pull the whole chat vocabulary in.
 */
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
