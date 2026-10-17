/**
 * "Import my cat from /yourcat" (GDD 6.1 Phase 2): `GET /yourcat/me` (the player's own /yourcat cat, read with the
 * accesstoken header; no AI call) gives a family ('YELLOW', label 'Ginger') and the pixel portrait URL. The family
 * becomes the toon coat here: pattern, three coat colours (RGB565) and eyes. Shape, cosmetics and name stay.
 */
import { rgb565, type Pattern, type YourcatImport } from '../types';

interface Coat {
  pattern: Pattern;
  base: number;
  secondary: number;
  tertiary: number;
  eyes: number;
}

const coat = (pattern: Pattern, base: number, secondary: number, tertiary: number, eyes: number): Coat => ({
  pattern,
  base: rgb565(base),
  secondary: rgb565(secondary),
  tertiary: rgb565(tertiary),
  eyes,
});

/** The 21 playable /yourcat families (backend/src/yourcat/family.ts) as toon coats. */
export const FAMILY_COATS: Readonly<Record<string, Coat>> = {
  BLACK: coat('solid', 0x2a2628, 0x1a1718, 0x3a3436, 0),
  GREY: coat('solid', 0x8d8f96, 0x63656c, 0xd9d9dc, 1),
  PINKIE: coat('bicolor', 0xf2d4d2, 0xc98d8c, 0xfff4f2, 2),
  SIAMESE: coat('colorpoint', 0xeadfcf, 0x5a4434, 0xf6f0e6, 2),
  YELLOW: coat('tabby', 0xe39a4f, 0xb46a2c, 0xf7e3c8, 0),
  WHITE: coat('solid', 0xf4efe7, 0xd8d0c4, 0xffffff, 2),
  MAINE: coat('tabby', 0x7a5a3e, 0x3e2c1e, 0xd9c2a2, 1),
  OREO: coat('tuxedo', 0x2e2a2c, 0xf4efe7, 0xf4efe7, 1),
  MIST: coat('tabby', 0xa9adb6, 0x6d717b, 0xe8e9ec, 2),
  FOLD: coat('solid', 0xb8b2aa, 0x8a847c, 0xe6e1da, 3),
  OBSIDIAN: coat('solid', 0x1c1a24, 0x0f0e14, 0x2c2a38, 5),
  SAVANHAN: coat('tabby', 0xd8b06a, 0x5a3e1e, 0xf3e4c4, 1),
  BALINESE: coat('colorpoint', 0xf1e7d8, 0x8a6a52, 0xfbf6ee, 2),
  OBI: coat('bicolor', 0xf4efe7, 0x3a3436, 0xf4efe7, 0),
  OLIVE: coat('tortie', 0x3a2e26, 0xc0742e, 0x6b4a2e, 1),
  PICKLES: coat('calico', 0xf4efe7, 0xd9822f, 0x2e2a2c, 1),
  RASCAL: coat('bicolor', 0xe39a4f, 0xf4efe7, 0xf7e3c8, 0),
  SABLE: coat('solid', 0x5a4030, 0x3a281c, 0x7a5a44, 3),
  FICUS: coat('tabby', 0x8a8064, 0x4e4636, 0xd8d0b4, 1),
  MERLOT: coat('solid', 0x6a3a3a, 0x4a2424, 0x8a5656, 3),
  TROUFAS: coat('tortie', 0x2e2a2c, 0xd9822f, 0xe8c08a, 0),
};

/** A /yourcat view (`GET /yourcat/me` item) as an import, or null when the family is unknown. */
export function importFromYourcat(item: unknown): YourcatImport | null {
  if (!item || typeof item !== 'object') return null;
  const v = item as Record<string, unknown>;
  const family = typeof v.family === 'string' ? v.family.toUpperCase() : '';
  const c = FAMILY_COATS[family];
  if (!c) return null;
  const avatar = v.avatar && typeof v.avatar === 'object' ? (v.avatar as Record<string, unknown>) : null;
  const url = avatar && avatar.status === 'ready' && typeof avatar.url === 'string' && /^https:\/\//.test(avatar.url) ? avatar.url : null;
  const named = v.named === true && typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 24) : undefined;
  return {
    spec: { pattern: c.pattern, base: c.base, secondary: c.secondary, tertiary: c.tertiary, eyes: c.eyes },
    ...(named ? { name: named } : {}),
    familyLabel: typeof v.familyLabel === 'string' ? v.familyLabel.slice(0, 24) : family,
    avatarUrl: url,
  };
}
