/**
 * The live card skins by skin id (`cat.<rosterCatId>`, or `cat.f.<catalogId>` for a featured cat shown as a preview
 * or on a showcase bot). A leaf module (type imports only), so render/cosmetics.ts can read it without importing the
 * registry that builds the skins. Render only: never sim input.
 */
import type { CoatSpec, EyeSpec } from '../chars/chibi';
import type { CatTier, Element } from '../../meta/roster';

export const SKIN_PREFIX = 'cat.';
export const FEATURED_SKIN_PREFIX = 'cat.f.';

export interface CatSkin {
  id: string;
  catId: string;
  name: string;
  element: Element;
  /** The cat's own tier, counted only for the adopt / redeem / portrait / starter origins (else Common). */
  tierRung: CatTier;
  /** Finished matches wearing this skin. */
  bond: number;
  /** max(tierRung, bond rung): what the rarity ladder shows. */
  rung: CatTier;
  family?: string;
  variant?: string;
  /** Card art (GIF, DOM only). */
  art?: string;
  /** Sprite sheet URL (allowlisted CDN). */
  sprite?: string;
  coat: CoatSpec;
  eyes: EyeSpec;
  earInner: number;
  nose: number;
  /** A variant's accessory colour (Clem's bow), when the probe found one. */
  accent?: number;
  /** Palette revision: bumps when a probe finishes (part of the look key, so geometry rebuilds). */
  rev: number;
  /** Where the palette came from. */
  source: 'family' | 'probe' | 'breed' | 'element';
  fromPack?: boolean;
  /** Not owned: a featured cat (preview, showcase bot). */
  featured?: boolean;
  catalogId?: string;
  /** Roster order (newest last), for the carousel's "newest" tiebreak. */
  order: number;
}

const skins = new Map<string, CatSkin>();

export const isCardSkinId = (id: string | null | undefined): id is string => typeof id === 'string' && id.startsWith(SKIN_PREFIX);
export const skinIdOf = (catId: string): string => `${SKIN_PREFIX}${catId}`;
export const getSkin = (id: string | null | undefined): CatSkin | null => (id ? (skins.get(id) ?? null) : null);
export const skinRev = (id: string): number => skins.get(id)?.rev ?? 0;

/** Replace every skin (owned and featured) at once. */
export function putSkins(list: readonly CatSkin[], keep: (s: CatSkin) => boolean = () => false): void {
  for (const [id, s] of skins) if (!keep(s)) skins.delete(id);
  for (const s of list) skins.set(s.id, s);
}

export const putSkin = (s: CatSkin): void => void skins.set(s.id, s);

export const allSkins = (): CatSkin[] => [...skins.values()];

/** Tests only. */
export const clearSkins = (): void => skins.clear();
